#!/usr/bin/env node
/**
 * Drive the procurement lifecycle through the API the browser uses.
 *
 * scripts/check-procurement.sql proves the engine and the policies from inside
 * Postgres. This one signs in as the seeded role accounts and goes through
 * Kong and PostgREST, so it also covers the JWT path, the RPC signatures the
 * client calls, and RLS as the `authenticated` role really sees it.
 *
 * Creates one case and deletes it again. Safe against a live local stack.
 *
 * Usage: npm run check:procurement:api
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "docker", ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^['"]|['"]$/g,"")]; })
);
const BASE = env.SUPABASE_PUBLIC_URL || "http://localhost:8000";
const ANON = env.ANON_KEY;
const PW = env.SEED_DEFAULT_PASSWORD || "ChangeMe!2026";

async function signIn(email) {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${email}: ${JSON.stringify(body)}`);
  return { token: body.access_token, userId: body.user.id, email };
}

const H = (s) => ({ apikey: ANON, Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" });

async function api(s, path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { ...H(s), ...(init.headers||{}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method||"GET"} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (s, fn, args) => api(s, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args ?? {}) });

const ok = (label) => console.log(`  ok   ${label}`);
const info = (label, v) => console.log(`       ${label}: ${v}`);
function assert(condition, label) {
  if (!condition) {
    console.error(`  FAIL ${label}`);
    process.exitCode = 1;
    throw new Error(label);
  }
  ok(label);
}

const requester = await signIn("requester@jyoma.ai");
const finance   = await signIn("finance@jyoma.ai");
const head      = await signIn("head@jyoma.ai");
const payments  = await signIn("payments@jyoma.ai");
console.log("signed in as 4 roles");

// permissions RPC — what AuthProvider calls on load
const perms = await rpc(requester, "procurement_my_permissions");
info("requester permissions", perms.map(p => p.permission).sort().join(", "));

// departments lookup
const depts = await api(requester, "procurement_lookups?select=id,name&kind=eq.department&order=sort_order");
ok(`lookups readable (${depts.length} departments)`);

// open a case
const [created] = await api(requester, "procurement_cases", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    title: "Vector network analyser, 20 GHz, RF laboratory",
    department_id: depts[0].id,
    estimated_cost: 4250000,
    requester_id: requester.userId,
    created_by: requester.userId,
  }),
});
ok(`case opened ${created.case_no} at ${created.stage}`);

const caseId = created.id;

// available actions at draft
let actions = await rpc(requester, "procurement_available_actions", { _case_id: caseId });
info("actions at draft", actions.map(a => a.code).join(", "));

await rpc(requester, "procurement_record_decision", { _case_id: caseId, _action_code: "draft.submit" });
let after = await rpc(requester, "procurement_record_decision", { _case_id: caseId, _action_code: "mpr.submit" });
after = Array.isArray(after) ? after[0] : after;
assert(after.stage === "finance", `raised to ${after.stage} — "${after.status_label}"`);

// requester cannot clear the budget
try {
  await rpc(requester, "procurement_record_decision", {
    _case_id: caseId, _action_code: "finance.clear", _remarks: "trying it on",
  });
  console.log("  FAIL requester cleared a budget");
  process.exit(1);
} catch (e) {
  ok("requester blocked from finance.clear");
}

// finance sees it in the worklist
const worklist = await rpc(finance, "procurement_my_worklist");
assert(worklist.some(c => c.id === caseId),
  `finance worklist carries the case (${worklist.length} case(s) waiting on finance)`);

// payments desk cannot see it yet
const paymentsSees = await api(payments, `procurement_cases?select=id&id=eq.${caseId}`);
assert(paymentsSees.length === 0, "payments desk cannot see a case still at tender");

// finance sends it back, requester answers, finance clears it
let moved = await rpc(finance, "procurement_record_decision", {
  _case_id: caseId, _action_code: "finance.return",
  _remarks: "Attach the cost estimate and the make/model comparison.",
});
moved = Array.isArray(moved) ? moved[0] : moved;
assert(moved.stage === "mpr", `sent back to ${moved.stage} — "${moved.status_label}"`);

const thread = await api(requester, `procurement_clarifications?select=kind,body,from_stage,to_stage&case_id=eq.${caseId}`);
assert(thread.length === 1 && thread[0].kind === "send_back",
  `send-back opened a thread: "${thread[0]?.body.slice(0, 40)}…"`);

await rpc(requester, "procurement_record_decision", { _case_id: caseId, _action_code: "mpr.submit" });
moved = await rpc(finance, "procurement_record_decision", {
  _case_id: caseId, _action_code: "finance.clear", _remarks: "Budget head has headroom for FY.",
});
moved = Array.isArray(moved) ? moved[0] : moved;
assert(moved.stage === "tender", `cleared to ${moved.stage} — "${moved.status_label}"`);

// oversight: reads, cannot act
const headSees = await api(head, `procurement_cases?select=case_no&id=eq.${caseId}`);
const headActions = await rpc(head, "procurement_available_actions", { _case_id: caseId });
assert(headSees.length === 1 && headActions.length === 0,
  "purchase head reads the case and is offered no action");

// the trail
const events = await api(requester, `procurement_case_events?select=stage,summary&case_id=eq.${caseId}&order=created_at`);
console.log("\n  trail:");
for (const e of events) console.log(`    ${e.stage.padEnd(8)} ${e.summary}`);

// clean up the demo case
const admin = await signIn("admin@jyoma.ai");
await api(admin, `procurement_cases?id=eq.${caseId}`, { method: "DELETE" });
console.log(`\ncleaned up ${created.case_no}`);
console.log("check-procurement-api: OK");
