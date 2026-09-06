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

// finance.clear is flagged requires_signature. A one-pixel PNG stands in for
// the drawn mark: the engine checks that an image is there, not that it looks
// like anybody's hand.
const SIGNATURE = { signature: { image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", kind: "drawn" } };

const requester = await signIn("requester@jyoma.ai");
const finance   = await signIn("finance@jyoma.ai");
const head      = await signIn("head@jyoma.ai");
const payments  = await signIn("payments@jyoma.ai");
const tenderer  = await signIn("tender@jyoma.ai");
const tecChair  = await signIn("tec.chair@jyoma.ai");
const tecMember = await signIn("tec.member@jyoma.ai");
console.log("signed in as 5 roles");

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

// The requisition guard: an incomplete requisition cannot reach finance.
const gapsBefore = await rpc(requester, "procurement_requisition_gaps", { _case_id: caseId });
assert(gapsBefore.length > 0, `requisition reports ${gapsBefore.length} gap(s) before it is filled in`);
try {
  await rpc(requester, "procurement_record_decision", { _case_id: caseId, _action_code: "mpr.submit" });
  console.log("  FAIL an incomplete requisition reached finance");
  process.exit(1);
} catch {
  ok("incomplete requisition blocked by the stage guard");
}

// Fill it in: the requisition record, then an itemised bill of quantities.
const units = await api(requester, "procurement_lookups?select=id,name&kind=eq.unit&order=sort_order");
const ledger = await rpc(requester, "procurement_budget_ledger");
await api(requester, "procurement_requisitions?on_conflict=case_id", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({
    case_id: caseId,
    justification: "Replaces the 2011 analyser withdrawn from service.",
    required_by: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    budget_head_id: ledger[0]?.id ?? null,
    cost_source: "boq",
    created_by: requester.userId,
  }),
});
await api(requester, "procurement_boq_lines", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify([
    { case_id: caseId, line_no: 1, item_name: "Vector network analyser, 20 GHz",
      quantity: 1, unit: units[0]?.name ?? "Nos.", estimated_rate: 4000000, created_by: requester.userId },
    { case_id: caseId, line_no: 2, item_name: "Calibration kit, 3.5 mm",
      quantity: 2, unit: units[0]?.name ?? "Nos.", estimated_rate: 125000, created_by: requester.userId },
  ]),
});

// The case value follows the bill rather than anything the client typed.
const [priced] = await api(requester, `procurement_cases?select=estimated_cost&id=eq.${caseId}`);
assert(Number(priced.estimated_cost) === 4250000,
  `case value derived from the bill of quantities (${priced.estimated_cost})`);

// Documents are deliberately not a gap: the checklist lists only what stops
// the case, and a requisition for a service may have nothing to attach.
const gapsAfter = await rpc(requester, "procurement_requisition_gaps", { _case_id: caseId });
assert(gapsAfter.length === 0,
  `nothing blocks the requisition once it is filled in (${gapsAfter.join("; ") || "no gaps"})`);

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
  _payload: SIGNATURE,
});
moved = Array.isArray(moved) ? moved[0] : moved;
assert(moved.stage === "tender", `cleared to ${moved.stage} — "${moved.status_label}"`);


// ===== the tender desk =====

const [vendorA, vendorB] = await api(tenderer, "procurement_vendors?select=id,name&active=eq.true&order=name&limit=2");
assert(Boolean(vendorA && vendorB), `the vendor register is readable (${vendorA?.name}, ${vendorB?.name})`);

const [tender] = await api(tenderer, "procurement_tenders?on_conflict=case_id", {
  method: "POST",
  headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  body: JSON.stringify({
    case_id: caseId, reference_no: "NIT/API/001", mode: "gem",
    bid_end_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    created_by: tenderer.userId,
  }),
});
assert(tender.status === "draft", `tender opened at "${tender.status}"`);

// The mode obliges a portal number, and the gap list says so before the button
// is pressed rather than after.
let gaps = await rpc(tenderer, "procurement_tender_gaps", { _case_id: caseId });
assert(gaps.includes("The number the portal gave this tender"),
  "a GeM tender with no portal number is flagged");

let refused = false;
try { await rpc(tenderer, "procurement_record_decision", { _case_id: caseId, _action_code: "tender.to_tec" }); }
catch { refused = true; }
assert(refused, "an unfloated tender with no bids cannot reach the committee");

await api(tenderer, `procurement_tenders?case_id=eq.${caseId}`, {
  method: "PATCH", body: JSON.stringify({ portal_reference: "GEM/2026/B/994211" }),
});

await rpc(tenderer, "procurement_float_tender", { _case_id: caseId, _remarks: "Floated on GeM." });
const [floated] = await api(tenderer, `procurement_tenders?select=status,notice_snapshot,notice_issued_at,floated_at&case_id=eq.${caseId}`);
assert(floated.status === "bidding_open", `floating opened bidding ("${floated.status}")`);
assert(Boolean(floated.notice_snapshot?.reference_no), "floating froze the notice");
assert(Array.isArray(floated.notice_snapshot.items), `the notice carries the bill (${floated.notice_snapshot.items.length} line(s))`);

// The published bill is closed to ordinary writes from here.
let billShut = false;
try {
  await api(tenderer, "procurement_tender_items", {
    method: "POST",
    body: JSON.stringify({ tender_id: tender.id, line_no: 90, item_name: "Slipped in", quantity: 1 }),
  });
} catch { billShut = true; }
assert(billShut, "the published bill refuses ordinary writes once floated");

// Editing the tender afterwards must not rewrite what went out.
await api(tenderer, `procurement_tenders?case_id=eq.${caseId}`, {
  method: "PATCH", body: JSON.stringify({ eligibility: "Changed after the notice went out" }),
});
const [reread] = await api(tenderer, `procurement_tenders?select=notice_snapshot&case_id=eq.${caseId}`);
assert(JSON.stringify(reread.notice_snapshot) === JSON.stringify(floated.notice_snapshot),
  "editing the tender leaves the issued notice alone");

// return=representation on purpose: the record-a-bid modal stages the firm's
// certificates and needs the new row's id back to attach them to. A policy that
// permitted the write but not the read-back would leave the files nowhere to go.
const recorded = await api(tenderer, "procurement_bidders", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify([
    { tender_id: tender.id, case_id: caseId, vendor_id: vendorA.id, bid_amount: 1795000, gst_pct: 18, created_by: tenderer.userId },
    { tender_id: tender.id, case_id: caseId, vendor_id: vendorB.id, bid_amount: 1840000, gst_pct: 18, created_by: tenderer.userId },
  ]),
});
assert(recorded.length === 2 && recorded.every((r) => Boolean(r.id)),
  "recording a bid returns its id, so its papers have somewhere to go");

const roster = await api(tenderer, `procurement_bidders?select=bid_amount,bid_amount_gross&case_id=eq.${caseId}&order=bid_amount`);
assert(roster.length === 2 && Number(roster[0].bid_amount_gross) === 2118100,
  `two bids recorded, tax worked out by the database (${roster[0].bid_amount_gross})`);

// Close bidding explicitly here so the roster lock can be tested. The hand-off
// closes it too, and the SQL check proves that path; both have to work, because
// shutting the roster early while chasing a missing amount is a real thing to
// want and must not be the only way through.
await rpc(tenderer, "procurement_close_bidding", { _case_id: caseId, _remarks: "Two bids received." });

let rosterShut = false;
try {
  await api(tenderer, "procurement_bidders", {
    method: "POST",
    body: JSON.stringify({ tender_id: tender.id, case_id: caseId, vendor_id: vendorA.id, bid_amount: 1, created_by: tenderer.userId }),
  });
} catch { rosterShut = true; }
assert(rosterShut, "the roster closes when bidding does");

// ===== a bid's own papers =====

const bidderRows = await api(tenderer, `procurement_bidders?select=id,vendor_id&case_id=eq.${caseId}&order=bid_amount`);
const [firstBid, secondBid] = bidderRows;

// Stands in for the ingest pipeline. What is under test is the attribution and
// the retrieval scope, not the OCR.
const filed = [];
for (const [bid, name] of [[firstBid, "Vendor A certificates"], [secondBid, "Vendor B certificates"]]) {
  const [doc] = await api(tenderer, "documents", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      title: name, original_filename: `${name}.pdf`,
      storage_path: `${tenderer.userId}/${crypto.randomUUID()}.pdf`,
      mime_type: "application/pdf", created_by: tenderer.userId, status: "active",
    }),
  });
  await api(tenderer, "procurement_case_documents", {
    method: "POST",
    body: JSON.stringify({
      case_id: caseId, document_id: doc.id, stage: "tender",
      doc_type: "Bid / vendor response", bidder_id: bid.id, uploaded_by: tenderer.userId,
    }),
  });
  filed.push(doc.id);
}

const submissions = await rpc(tenderer, "procurement_bid_submissions", { _case_id: caseId });
assert(submissions.length === 2 && submissions.every(r => Number(r.document_count) === 1),
  `each bid carries its own papers (${submissions.map(r => `${r.vendor_name}:${r.document_count}`).join(", ")})`);
assert(submissions.every(r => Number(r.indexed_count) === 1),
  "an active document counts as read");

// The whole point of the attribution: one firm's certificate must not answer
// for another. Nothing is embedded here, so this asserts the scope filter
// rather than a retrieval result — that a bidder-scoped search cannot reach
// beyond that bidder is the property worth pinning.
const scoped = await api(tenderer, `procurement_case_documents?select=document_id&case_id=eq.${caseId}&bidder_id=eq.${firstBid.id}`);
assert(scoped.length === 1 && scoped[0].document_id === filed[0],
  "a bidder's papers are exactly their own");

const requesterWrites = await api(requester, `procurement_tenders?case_id=eq.${caseId}`, {
  method: "PATCH", headers: { Prefer: "return=representation" },
  body: JSON.stringify({ reference_no: "NIT/FORGED/001" }),
});
assert((requesterWrites ?? []).length === 0, "a requester's write to the tender matches nothing");

gaps = await rpc(tenderer, "procurement_tender_gaps", { _case_id: caseId });
assert(gaps.length === 0, "nothing left outstanding on the tender");

let unsigned = false;
try { await rpc(tenderer, "procurement_record_decision", { _case_id: caseId, _action_code: "tender.to_tec" }); }
catch { unsigned = true; }
assert(unsigned, "handing a bid set to the committee has to be signed");

// A refusal has to say what is missing. Told only "not ready", from an action
// bar, after signing, the officer cannot tell the button from a broken one --
// which is exactly how this was reported.
await api(tenderer, `procurement_tenders?case_id=eq.${caseId}`, {
  method: "PATCH", body: JSON.stringify({ reference_no: "" }),
});
let refusal = "";
try { await rpc(tenderer, "procurement_record_decision", { _case_id: caseId, _action_code: "tender.to_tec", _payload: SIGNATURE }); }
catch (e) { refusal = String(e.message ?? e); }
assert(refusal.includes("still needs") && refusal.includes("reference number"),
  "a refused decision names the gaps");
await api(tenderer, `procurement_tenders?case_id=eq.${caseId}`, {
  method: "PATCH", body: JSON.stringify({ reference_no: "NIT/API/001" }),
});

moved = await rpc(tenderer, "procurement_record_decision", {
  _case_id: caseId, _action_code: "tender.to_tec", _payload: SIGNATURE,
});
moved = Array.isArray(moved) ? moved[0] : moved;
assert(moved.stage === "tec", `handed to ${moved.stage} — "${moved.status_label}"`);

const [signed] = await api(tenderer, `procurement_case_signatures?select=action_code,stage&case_id=eq.${caseId}&action_code=eq.tender.to_tec`);
assert(Boolean(signed), "the hand-off left a signature on the case");

const [finalTender] = await api(tenderer, `procurement_tenders?select=status,bidding_closed_at&case_id=eq.${caseId}`);
assert(finalTender.status === "bidding_closed" && Boolean(finalTender.bidding_closed_at),
  "bidding is closed once the case has left the desk");

// ===== the technical evaluation committee =====

const checklist = await api(tecChair, `procurement_tec_checklist?select=item_key&case_id=eq.${caseId}`);
assert(checklist.length === 4, "the tec checklist was seeded the moment the case arrived");

const evalBidderId = firstBid.id;

// No signature required for a member's own reading: it does not move the
// case, only the chair's separate qualification call and tec.recommend do,
// and that action already carries its own required signature below.
const evaluation = await rpc(tecMember, "procurement_submit_tec_evaluation", {
  _bidder_id: evalBidderId, _score: 82, _compliance_status: "compliant", _qualified: true,
  _remarks: "Looks solid.", _signature: null,
});
assert(Boolean(evaluation?.submitted_at) && evaluation.signature_id === null,
  "a member submitted a technical reading with no signature at all");

let memberBlocked = false;
try {
  await rpc(tecMember, "procurement_set_bidder_qualification", { _bidder_id: evalBidderId, _qualified: true, _note: "test" });
} catch { memberBlocked = true; }
assert(memberBlocked, "a member cannot make the chair's final qualification call");

await rpc(tecChair, "procurement_set_bidder_qualification", {
  _bidder_id: evalBidderId, _qualified: true, _note: "Meets all criteria.",
});

// a direct client write to the same column matches no policy and does nothing
await api(tecChair, `procurement_bidders?id=eq.${evalBidderId}`, {
  method: "PATCH", body: JSON.stringify({ tec_qualified: false }),
});
const [afterDirectWrite] = await api(tecChair, `procurement_bidders?select=tec_qualified&id=eq.${evalBidderId}`);
assert(afterDirectWrite.tec_qualified === true,
  "the chair's qualification call stands; a direct client write cannot override it");

const tecGaps = await rpc(tecChair, "procurement_tec_gaps", { _case_id: caseId });
assert(tecGaps.length === 0, "nothing left outstanding for tec.recommend once a bidder is qualified");

const consensus = await rpc(tecChair, "procurement_tec_case_consensus", { _case_id: caseId });
const [firstConsensus] = consensus.filter((row) => row.bidder_id === evalBidderId);
assert(firstConsensus?.member_count === 1 && Number(firstConsensus?.qualified_pct) === 100,
  "the consensus reads the one signed member reading back correctly");

// Chair-only actions also check is_procurement_committee_chair(), which reads
// a constituted committee -- nothing in the UI offers a way to constitute one
// by hand, so without the auto-seed the chair would hold tec.chair, have
// qualified a bidder, and still see an empty action bar.
const tecActions = await rpc(tecChair, "procurement_available_actions", { _case_id: caseId });
assert(tecActions.some((a) => a.code === "tec.recommend"),
  "the tec committee constituted itself, so the chair sees tec.recommend");

// the AI suggestion table: written only through its function, never directly.
// The edge function itself (tec-ai-evaluate) needs a live model round trip and
// is exercised by hand, not in this fast-running probe.
let requesterBlockedAi = false;
try {
  await rpc(requester, "procurement_record_tec_ai_suggestion", {
    _bidder_id: evalBidderId, _score: 50, _compliance_status: "pending",
    _qualified: null, _summary: null, _evidence: [], _model: "test",
  });
} catch { requesterBlockedAi = true; }
assert(requesterBlockedAi, "a requester cannot record an AI suggestion");

let directInsertBlocked = false;
try {
  await api(tecMember, "procurement_tec_ai_suggestions", {
    method: "POST", body: JSON.stringify({ bidder_id: evalBidderId, score: 99 }),
  });
} catch { directInsertBlocked = true; }
assert(directInsertBlocked, "procurement_tec_ai_suggestions has no write policy for a direct insert");

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
