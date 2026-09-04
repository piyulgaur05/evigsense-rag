#!/usr/bin/env node
/**
 * Seed default users, one per app_role ('admin' | 'moderator' | 'user').
 *
 * Solves the bootstrap chicken-and-egg: every programmatic path to creating a
 * user or granting a role already requires an existing admin (the create-user
 * edge function checks user_roles; the user_roles RLS insert policy requires
 * has_role(auth.uid(),'admin')). This script uses the service-role key, which
 * bypasses both, so a fresh stack ends up with working logins without any
 * Studio clicking.
 *
 * Goes through Kong -> GoTrue admin API rather than INSERTing into auth.users
 * directly, so it never depends on GoTrue's internal schema.
 *
 * Idempotent: safe to re-run. Existing users are left alone but still have
 * their role ensured.
 *
 * Usage: node scripts/seed-users.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PASSWORD = "ChangeMe!2026";

const DEFAULT_USERS = [
  { email: "admin@jyoma.ai", role: "admin" },
  { email: "moderator@jyoma.ai", role: "moderator" },
  { email: "user@jyoma.ai", role: "user" },
];

const VALID_ROLES = new Set(["admin", "moderator", "user"]);

/** Minimal KEY=VALUE reader so docker/.env works without exporting anything. */
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// process.env wins, then docker/.env, then the repo root .env.
const fileEnv = {
  ...readEnvFile(path.join(ROOT, ".env")),
  ...readEnvFile(path.join(ROOT, "docker", ".env")),
};
const cfg = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;

function parseUserSpec(spec) {
  return spec
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.lastIndexOf(":");
      if (idx === -1) {
        throw new Error(`Bad SEED_USERS entry "${entry}" — expected email:role`);
      }
      const email = entry.slice(0, idx).trim();
      const role = entry.slice(idx + 1).trim();
      if (!email || !VALID_ROLES.has(role)) {
        throw new Error(
          `Bad SEED_USERS entry "${entry}" — role must be one of ${[...VALID_ROLES].join(", ")}`,
        );
      }
      return { email, role };
    });
}

async function waitForAuth(base, headers, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/auth/v1/health`, { headers });
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `GoTrue not reachable at ${base}/auth/v1/health after ${timeoutMs / 1000}s (${lastErr}). ` +
      `Is the stack up? docker compose --project-directory docker -f docker/docker-compose.yml up -d`,
  );
}

/** GoTrue paginates; walk every page so the email map is complete. */
async function listAllUsers(base, headers) {
  const byEmail = new Map();
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!res.ok) {
      throw new Error(`Listing users failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    const users = Array.isArray(data?.users) ? data.users : [];
    for (const u of users) {
      if (u?.email) byEmail.set(u.email.toLowerCase(), u.id);
    }
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
      // handle_new_user() reads this to populate profiles.display_name.
      user_metadata: { display_name: email.split("@")[0] },
    }),
  });
  if (!res.ok) {
    throw new Error(`Creating ${email} failed (${res.status}): ${await res.text()}`);
  }
  const user = await res.json();
  if (!user?.id) throw new Error(`Creating ${email} returned no id`);
  return user.id;
}

function missingSchemaError(body) {
  return (
    body.includes("42P01") ||
    (body.includes("user_roles") && body.includes("does not exist"))
  );
}

async function hasRole(base, headers, userId, role) {
  const url = `${base}/rest/v1/user_roles?select=role&user_id=eq.${userId}&role=eq.${role}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    if (missingSchemaError(body)) {
      throw new Error(
        'Schema is missing (relation "public.user_roles" does not exist). Apply migrations first: npm run migrate',
      );
    }
    throw new Error(`Checking role for ${userId} failed (${res.status}): ${body}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function grantRole(base, headers, userId, role) {
  const res = await fetch(`${base}/rest/v1/user_roles`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      // UNIQUE(user_id, role) — swallow the duplicate instead of erroring.
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({ user_id: userId, role }),
  });
  if (!res.ok) {
    throw new Error(`Granting ${role} to ${userId} failed (${res.status}): ${await res.text()}`);
  }
}

async function main() {
  const gate = (cfg("SEED_DEFAULT_USERS", "true") || "").toLowerCase();
  if (gate !== "true") {
    console.log(`[seed-users] SEED_DEFAULT_USERS=${gate || "(empty)"} — skipped.`);
    return;
  }

  const base = cfg("SUPABASE_PUBLIC_URL", "http://localhost:8000").replace(/\/+$/, "");
  const serviceKey = cfg("SERVICE_ROLE_KEY");
  const password = cfg("SEED_DEFAULT_PASSWORD", DEFAULT_PASSWORD);
  const users = cfg("SEED_USERS") ? parseUserSpec(cfg("SEED_USERS")) : DEFAULT_USERS;

  if (!serviceKey) {
    throw new Error(
      "SERVICE_ROLE_KEY not found. Set it in docker/.env (or the environment) — " +
        "it is what lets this script bypass the admin-only RLS policy on user_roles.",
    );
  }

  // Well-known credentials on a non-local host are an explicit opt-in.
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base);
  if (password === DEFAULT_PASSWORD && !isLocal && cfg("SEED_ALLOW_REMOTE", "false") !== "true") {
    throw new Error(
      `Refusing to seed well-known credentials against a non-local host (${base}).\n` +
        `Set SEED_DEFAULT_PASSWORD to something private, or SEED_ALLOW_REMOTE=true if you really mean it.`,
    );
  }

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  console.log(`[seed-users] Target: ${base}`);
  await waitForAuth(base, headers);

  const existing = await listAllUsers(base, headers);
  const summary = [];

  for (const { email, role } of users) {
    const key = email.toLowerCase();
    let userId = existing.get(key);
    let userState;

    if (userId) {
      userState = "already existed";
    } else {
      userId = await createUser(base, headers, email, password);
      existing.set(key, userId);
      userState = "created";
    }

    const already = await hasRole(base, headers, userId, role);
    if (!already) await grantRole(base, headers, userId, role);

    summary.push({
      email,
      role,
      user: userState,
      grant: already ? "role already present" : "role granted",
    });
  }

  console.log("");
  console.table(summary);

  const created = summary.filter((s) => s.user === "created");
  const site = cfg("SITE_URL", "http://localhost:8080").replace(/\/+$/, "");
  console.log("");
  console.log("  Sign in at " + site + "/auth");
  for (const { email, role } of users) {
    console.log(`    ${email}  (${role})`);
  }
  console.log(`    password: ${password}`);
  if (created.length > 0) {
    console.log("  Change this password before exposing the stack.");
  }
  console.log("");
  console.log("[seed-users] Done.");
}

main().catch((err) => {
  console.error(`[seed-users] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
