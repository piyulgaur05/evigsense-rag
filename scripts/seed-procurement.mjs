#!/usr/bin/env node
/**
 * Seed one demo user per procurement role, plus the demo budget heads and
 * vendors a walkthrough needs.
 *
 * Kept apart from seed-users.mjs because that script owns the app_role
 * bootstrap (admin/moderator/user) and runs on every stack, procurement or
 * not. This one only makes sense once the procurement migrations are in.
 *
 * Same mechanics as seed-users.mjs: GoTrue admin API through Kong with the
 * service-role key, which bypasses the admin-only RLS on the role tables.
 * Idempotent — re-running leaves existing users alone and re-ensures grants.
 *
 * Usage: node scripts/seed-procurement.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PASSWORD = "ChangeMe!2026";

/** email local-part -> procurement_role. The admin also gets proc_admin below. */
const PROCUREMENT_USERS = [
  { email: "requester@jyoma.ai", role: "requester", designation: "Engineer, Stores" },
  { email: "finance@jyoma.ai", role: "finance_user", designation: "Finance Officer" },
  { email: "tender@jyoma.ai", role: "purchase_officer", designation: "Purchase Officer" },
  { email: "tec.chair@jyoma.ai", role: "tec_chairman", designation: "TEC Chairperson" },
  { email: "tec.member@jyoma.ai", role: "tec_member", designation: "TEC Member" },
  { email: "hod@jyoma.ai", role: "head_of_division", designation: "Head of Division" },
  { email: "commercial@jyoma.ai", role: "commercial_team", designation: "Commercial Officer" },
  { email: "dpc.chair@jyoma.ai", role: "dpc_chairman", designation: "DPC Chairman" },
  { email: "dpc.member@jyoma.ai", role: "dpc_member", designation: "DPC Member" },
  { email: "pnc.chair@jyoma.ai", role: "pnc_chairman", designation: "PNC Chairman" },
  { email: "pnc.member@jyoma.ai", role: "pnc_member", designation: "PNC Member" },
  { email: "approver@jyoma.ai", role: "management_approver", designation: "Approving Authority" },
  { email: "po@jyoma.ai", role: "po_officer", designation: "Purchase Order Officer" },
  { email: "payments@jyoma.ai", role: "receipt_payment_officer", designation: "Stores & Accounts" },
  { email: "head@jyoma.ai", role: "purchase_head", designation: "Purchase Head" },
];

/** The platform administrator also runs procurement. */
const ADMIN_GRANTS = [{ email: "admin@jyoma.ai", role: "proc_admin", designation: "Administrator" }];

const CURRENT_FY = (() => {
  const now = new Date();
  // Indian financial year runs April to March.
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `FY ${start}-${String(start + 1).slice(-2)}`;
})();

const BUDGET_HEADS = [
  { name: "Laboratory Equipment", allocated: 25000000, department: "Electronics & Instrumentation" },
  { name: "Workshop Machinery", allocated: 15000000, department: "Mechanical Engineering" },
];

const VENDORS = [
  { name: "Meridian Instruments Pvt Ltd", registration_id: "MIPL-0912", msme_category: "Small", email: "sales@meridian-instruments.example", phone: "+91 80 4000 1201" },
  { name: "Trident Systems India", registration_id: "TSI-4471", msme_category: "Medium", email: "bids@trident-systems.example", phone: "+91 22 6100 8890" },
  { name: "Kaveri Engineering Works", registration_id: "KEW-2038", msme_category: "Micro", email: "tenders@kaveri-works.example", phone: "+91 44 2851 3377" },
];

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

const fileEnv = {
  ...readEnvFile(path.join(ROOT, ".env")),
  ...readEnvFile(path.join(ROOT, "docker", ".env")),
};
const cfg = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;

async function listAllUsers(base, headers) {
  const byEmail = new Map();
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!res.ok) throw new Error(`Listing users failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    const users = Array.isArray(data?.users) ? data.users : [];
    for (const u of users) if (u?.email) byEmail.set(u.email.toLowerCase(), u.id);
    if (users.length < 200) break;
  }
  return byEmail;
}

async function createUser(base, headers, email, password) {
  const res = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: email.split("@")[0] },
    }),
  });
  if (!res.ok) throw new Error(`Creating ${email} failed (${res.status}): ${await res.text()}`);
  const user = await res.json();
  if (!user?.id) throw new Error(`Creating ${email} returned no id`);
  return user.id;
}

/** Thrown when PostgREST cannot see the table at all. */
class MissingTableError extends Error {}

async function rest(base, headers, pathname, init = {}) {
  const res = await fetch(`${base}/rest/v1/${pathname}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.text();
    // PostgREST answers 404 for an unknown table, sometimes with an empty body.
    if (res.status === 404 || body.includes("42P01") || body.includes("does not exist")) {
      throw new MissingTableError(`No such table for ${pathname}`);
    }
    throw new Error(`${init.method || "GET"} ${pathname} failed (${res.status}): ${body}`);
  }
  // return=minimal answers 201 with an empty body, which res.json() chokes on.
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

const insert = (base, headers, table, rows, onConflict) =>
  rest(base, headers, onConflict ? `${table}?on_conflict=${onConflict}` : table, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

/** Seed a table that a later migration slice introduces; skip until it exists. */
async function insertWhenPresent(base, headers, table, rows, onConflict) {
  try {
    await insert(base, headers, table, rows, onConflict);
    return true;
  } catch (err) {
    if (err instanceof MissingTableError) {
      console.log(`[seed-procurement] Skipped ${table} — table not present yet.`);
      return false;
    }
    throw err;
  }
}

async function main() {
  const gate = (cfg("SEED_DEFAULT_USERS", "true") || "").toLowerCase();
  if (gate !== "true") {
    console.log(`[seed-procurement] SEED_DEFAULT_USERS=${gate || "(empty)"} — skipped.`);
    return;
  }

  const base = cfg("SUPABASE_PUBLIC_URL", "http://localhost:8000").replace(/\/+$/, "");
  const serviceKey = cfg("SERVICE_ROLE_KEY");
  const password = cfg("SEED_DEFAULT_PASSWORD", DEFAULT_PASSWORD);
  if (!serviceKey) throw new Error("SERVICE_ROLE_KEY not found. Set it in docker/.env.");

  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base);
  if (password === DEFAULT_PASSWORD && !isLocal && cfg("SEED_ALLOW_REMOTE", "false") !== "true") {
    throw new Error(
      `Refusing to seed well-known credentials against a non-local host (${base}).`,
    );
  }

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  console.log(`[seed-procurement] Target: ${base}`);

  // Departments already exist from the migration seed; map name -> id so the
  // demo users and budget heads can be attached to one.
  const departments = await rest(base, headers, "procurement_lookups?select=id,name&kind=eq.department");
  const deptByName = new Map(departments.map((d) => [d.name, d.id]));
  const defaultDept = deptByName.get("Electronics & Instrumentation") ?? departments[0]?.id ?? null;

  const existing = await listAllUsers(base, headers);
  const summary = [];

  for (const { email, role, designation } of [...PROCUREMENT_USERS, ...ADMIN_GRANTS]) {
    const key = email.toLowerCase();
    let userId = existing.get(key);
    let userState = "already existed";

    if (!userId) {
      userId = await createUser(base, headers, email, password);
      existing.set(key, userId);
      userState = "created";
    }

    // Every procurement user still needs a base app_role to use the product.
    await insert(base, headers, "user_roles", [{ user_id: userId, role: "user" }], "user_id,role");
    await insert(
      base,
      headers,
      "procurement_user_roles",
      [{ user_id: userId, role, department_id: defaultDept, designation }],
      "user_id,role",
    );

    summary.push({ email, role, user: userState });
  }

  // Budget heads and vendors land with the sourcing slice; skip until then.
  await insertWhenPresent(
    base,
    headers,
    "procurement_budget_heads",
    BUDGET_HEADS.map((b) => ({
      name: b.name,
      fiscal_year: CURRENT_FY,
      allocated: b.allocated,
      department_id: deptByName.get(b.department) ?? defaultDept,
    })),
    "name,fiscal_year",
  );

  await insertWhenPresent(base, headers, "procurement_vendors", VENDORS, "name");

  console.log("");
  console.table(summary);
  console.log("");
  console.log(`  password: ${password}`);
  console.log("[seed-procurement] Done.");
}

main().catch((err) => {
  console.error(`[seed-procurement] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
