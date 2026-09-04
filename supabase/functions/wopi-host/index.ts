/**
 * WOPI host for Collabora Online, plus the md -> .docx seeding route.
 *
 * Collabora cannot send custom headers on its callbacks, so every WOPI route
 * authenticates with `?access_token=` against the `wopi_tokens` table.
 *
 * Routes (the dispatcher forwards sub-paths intact in req.url):
 *   POST /wopi-host                      { mode: "mint" | "seed", ... }  (Bearer auth)
 *   GET  /wopi-host/files/{id}           CheckFileInfo                   (access_token)
 *   GET  /wopi-host/files/{id}/contents  GetFile                         (access_token)
 *   POST /wopi-host/files/{id}/contents  PutFile                         (access_token)
 *   POST /wopi-host/files/{id}           LOCK/UNLOCK/REFRESH_LOCK/GET_LOCK via X-WOPI-Override
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wopi-override, x-wopi-lock, x-wopi-oldlock",
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TRANSLATIONS_BUCKET = "translations";
/** Edge runtime has a 256 MB isolate; keep well clear when buffering bytes. */
const MAX_DOCX_BYTES = 20 * 1024 * 1024;
const LOCK_TTL_MINUTES = 30;

function getCollaboraInternalUrl(): string {
  return (Deno.env.get("COLLABORA_INTERNAL_URL") ?? "http://collabora:9980").replace(/\/$/, "");
}

function getPostMessageOrigin(): string {
  return Deno.env.get("COLLABORA_FRAME_ANCESTORS") ?? "http://localhost:8080";
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface TokenRow {
  token: string;
  document_id: string;
  user_id: string;
  expires_at: string;
}

/** Validates ?access_token= and confirms it is scoped to this document. */
async function resolveToken(
  supabase: ReturnType<typeof admin>,
  token: string,
  documentId: string,
): Promise<TokenRow | null> {
  if (!token) return null;
  const { data, error } = await supabase
    .from("wopi_tokens")
    .select("token, document_id, user_id, expires_at")
    .eq("token", token)
    .maybeSingle<TokenRow>();
  if (error || !data) return null;
  if (data.document_id !== documentId) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

interface MarkdownRow {
  document_id: string;
  docx_storage_path: string | null;
  docx_version: number | null;
  docx_updated_at: string | null;
  wopi_lock: string | null;
  wopi_lock_expires_at: string | null;
  target_language: string | null;
}

async function loadRow(
  supabase: ReturnType<typeof admin>,
  documentId: string,
): Promise<MarkdownRow | null> {
  const { data } = await supabase
    .from("document_markdown")
    .select(
      "document_id, docx_storage_path, docx_version, docx_updated_at, wopi_lock, wopi_lock_expires_at, target_language",
    )
    .eq("document_id", documentId)
    .maybeSingle<MarkdownRow>();
  return data ?? null;
}

function lockIsLive(row: MarkdownRow): boolean {
  if (!row.wopi_lock) return false;
  if (!row.wopi_lock_expires_at) return true;
  return new Date(row.wopi_lock_expires_at).getTime() > Date.now();
}

/** Converts HTML to .docx through Collabora's convert-to endpoint. */
async function convertHtmlToDocx(html: string): Promise<Uint8Array> {
  const form = new FormData();
  form.append("data", new Blob([html], { type: "text/html" }), "source.html");

  const res = await fetch(`${getCollaboraInternalUrl()}/cool/convert-to/docx`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Collabora convert-to failed (${res.status}): ${await res.text()}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // pathname is /wopi-host[/files/{id}[/contents]]
    const seg = url.pathname.split("/").filter(Boolean);
    const isFileRoute = seg[1] === "files";
    const fileId = seg[2] ?? "";
    const isContents = seg[3] === "contents";
    const supabase = admin();

    // ---------------- Non-WOPI control routes (Bearer auth) ----------------
    if (!isFileRoute) {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      if (!token) return json({ error: "Missing auth token" }, 401);
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
      const user = userData.user;

      const body = await req.json();
      const documentId: string = body?.documentId;
      if (!documentId) return json({ error: "documentId required" }, 400);

      // --- seed: build the .docx from translated markdown (HTML supplied by
      // the client, which already renders it for PDF export) ---
      if (body?.mode === "seed") {
        const html: string = body?.html ?? "";

        const row = await loadRow(supabase, documentId);
        if (!row) return json({ error: "No translation found for this document" }, 404);

        // Reuse the existing .docx unless the caller explicitly forces a rebuild —
        // the .docx is the source of truth once created, so re-seeding destroys
        // edits. Checked BEFORE html is required: a reopen has nothing to seed
        // from and legitimately sends no html.
        if (row.docx_storage_path && !body?.force) {
          return json({ success: true, storagePath: row.docx_storage_path, reused: true });
        }

        if (!html.trim()) return json({ error: "html required to create the document" }, 400);

        const bytes = await convertHtmlToDocx(html);
        const storagePath = `${user.id}/docx/${documentId}.docx`;
        const { error: upErr } = await supabase.storage
          .from(TRANSLATIONS_BUCKET)
          .upload(storagePath, bytes, { contentType: DOCX_MIME, upsert: true });
        if (upErr) throw new Error(`Failed to store docx: ${upErr.message}`);

        const { error: dbErr } = await supabase
          .from("document_markdown")
          .update({
            docx_storage_path: storagePath,
            docx_updated_at: new Date().toISOString(),
            docx_version: (row.docx_version ?? 0) + 1,
          })
          .eq("document_id", documentId);
        if (dbErr) throw new Error(`Failed to record docx: ${dbErr.message}`);

        return json({ success: true, storagePath, reused: false, size: bytes.length });
      }

      // --- discover: proxy Collabora's /hosting/discovery ---
      // Collabora serves discovery without CORS headers, so the browser cannot
      // fetch it directly. We fetch it over the compose network instead and
      // return just the editor path; the client re-bases it onto its own
      // browser-facing Collabora URL.
      if (body?.mode === "discover") {
        const res = await fetch(`${getCollaboraInternalUrl()}/hosting/discovery`);
        if (!res.ok) throw new Error(`Collabora discovery failed (${res.status})`);
        const xml = await res.text();

        const actions = [...xml.matchAll(/<action\b[^>]*>/g)].map((m) => m[0]);
        const docxAction =
          actions.find((a) => /ext="docx"/.test(a) && /name="edit"/.test(a)) ??
          actions.find((a) => /ext="docx"/.test(a));
        const urlsrc = docxAction?.match(/urlsrc="([^"]+)"/)?.[1];
        if (!urlsrc) return json({ error: "Collabora advertised no .docx editor" }, 502);

        // Strip the origin: it is Collabora's internal address, unreachable
        // from the browser.
        const path = urlsrc.replace(/^https?:\/\/[^/]+/, "");
        return json({ success: true, urlsrcPath: path, urlsrc });
      }

      // --- mint: issue a scoped WOPI access token ---
      if (body?.mode === "mint") {
        const { data: minted, error: mintErr } = await supabase
          .from("wopi_tokens")
          .insert({ document_id: documentId, user_id: user.id })
          .select("token, expires_at")
          .single();
        if (mintErr) throw new Error(`Failed to mint token: ${mintErr.message}`);

        return json({
          success: true,
          accessToken: minted.token,
          // WOPI wants this in ms since epoch.
          accessTokenTtl: new Date(minted.expires_at).getTime(),
        });
      }

      // --- convert: render the stored .docx to another format (e.g. pdf) ---
      if (body?.mode === "convert") {
        const format: string = body?.format ?? "pdf";
        if (!/^[a-z0-9]{2,5}$/.test(format)) return json({ error: "Invalid format" }, 400);

        const row = await loadRow(supabase, documentId);
        if (!row?.docx_storage_path) return json({ error: "No docx to convert" }, 404);

        const { data: blob, error: dlErr } = await supabase.storage
          .from(TRANSLATIONS_BUCKET)
          .download(row.docx_storage_path);
        if (dlErr || !blob) throw new Error(dlErr?.message ?? "Failed to read docx");

        const form = new FormData();
        form.append("data", blob, "source.docx");
        const res = await fetch(`${getCollaboraInternalUrl()}/cool/convert-to/${format}`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(`Convert to ${format} failed (${res.status})`);

        const outBytes = new Uint8Array(await res.arrayBuffer());
        const outPath = `${user.id}/docx/${documentId}.${format}`;
        const { error: upErr } = await supabase.storage
          .from(TRANSLATIONS_BUCKET)
          .upload(outPath, outBytes, { upsert: true });
        if (upErr) throw new Error(`Failed to store ${format}: ${upErr.message}`);

        // Deliberately no signed URL here: SUPABASE_URL inside the network is
        // http://kong:8000, which the browser cannot resolve. The caller signs
        // the path with its own browser-facing client instead.
        return json({ success: true, storagePath: outPath });
      }

      return json({ error: `Unknown mode: ${body?.mode}` }, 400);
    }

    // ---------------- WOPI routes (access_token auth) ----------------
    const accessToken = url.searchParams.get("access_token") ?? "";
    const tokenRow = await resolveToken(supabase, accessToken, fileId);
    if (!tokenRow) return json({ error: "Invalid or expired access token" }, 401);

    const row = await loadRow(supabase, fileId);
    if (!row?.docx_storage_path) return json({ error: "No document to edit" }, 404);

    // --- GetFile ---
    if (req.method === "GET" && isContents) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(TRANSLATIONS_BUCKET)
        .download(row.docx_storage_path);
      if (dlErr || !blob) return json({ error: "Failed to read document" }, 500);

      const bytes = new Uint8Array(await blob.arrayBuffer());
      return new Response(bytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(bytes.length),
          "X-WOPI-ItemVersion": `v${row.docx_version ?? 0}`,
        },
      });
    }

    // --- CheckFileInfo ---
    if (req.method === "GET") {
      const { data: blob } = await supabase.storage
        .from(TRANSLATIONS_BUCKET)
        .download(row.docx_storage_path);
      const size = blob ? (await blob.arrayBuffer()).byteLength : 0;

      const { data: userInfo } = await supabase.auth.admin.getUserById(tokenRow.user_id);
      const email = userInfo?.user?.email ?? "user";

      return json({
        BaseFileName: `translation-${row.target_language ?? "document"}.docx`,
        Size: size,
        Version: `v${row.docx_version ?? 0}`,
        OwnerId: tokenRow.user_id,
        UserId: tokenRow.user_id,
        UserFriendlyName: email.split("@")[0],
        UserCanWrite: true,
        UserCanNotWriteRelative: true,
        SupportsUpdate: true,
        SupportsLocks: true,
        SupportsGetLock: true,
        PostMessageOrigin: getPostMessageOrigin(),
        EnableOwnerTermination: true,
      });
    }

    if (req.method === "POST") {
      const override = (req.headers.get("x-wopi-override") ?? "").toUpperCase();

      // --- PutFile ---
      if (isContents) {
        const incomingLock = req.headers.get("x-wopi-lock") ?? "";
        if (lockIsLive(row) && incomingLock && incomingLock !== row.wopi_lock) {
          return json({ error: "Lock mismatch" }, 409, { "X-WOPI-Lock": row.wopi_lock ?? "" });
        }

        const bytes = new Uint8Array(await req.arrayBuffer());
        if (bytes.length === 0) return json({ error: "Empty body" }, 400);
        if (bytes.length > MAX_DOCX_BYTES) {
          return json({ error: "Document too large" }, 413);
        }

        const { error: upErr } = await supabase.storage
          .from(TRANSLATIONS_BUCKET)
          .upload(row.docx_storage_path, bytes, { contentType: DOCX_MIME, upsert: true });
        if (upErr) return json({ error: `Save failed: ${upErr.message}` }, 500);

        const nextVersion = (row.docx_version ?? 0) + 1;
        await supabase
          .from("document_markdown")
          .update({ docx_version: nextVersion, docx_updated_at: new Date().toISOString() })
          .eq("document_id", fileId);

        return new Response(null, {
          status: 200,
          headers: { ...corsHeaders, "X-WOPI-ItemVersion": `v${nextVersion}` },
        });
      }

      // --- Lock operations ---
      const requestedLock = req.headers.get("x-wopi-lock") ?? "";
      const expiresAt = new Date(Date.now() + LOCK_TTL_MINUTES * 60_000).toISOString();
      const live = lockIsLive(row);

      const setLock = async (lock: string | null, expiry: string | null) => {
        await supabase
          .from("document_markdown")
          .update({ wopi_lock: lock, wopi_lock_expires_at: expiry })
          .eq("document_id", fileId);
      };

      switch (override) {
        case "GET_LOCK":
          return new Response(null, {
            status: 200,
            headers: { ...corsHeaders, "X-WOPI-Lock": live ? row.wopi_lock! : "" },
          });

        case "LOCK":
          if (live && row.wopi_lock !== requestedLock) {
            return json({ error: "Locked by another session" }, 409, {
              "X-WOPI-Lock": row.wopi_lock ?? "",
            });
          }
          await setLock(requestedLock, expiresAt);
          return new Response(null, { status: 200, headers: corsHeaders });

        case "REFRESH_LOCK":
          if (!live || row.wopi_lock !== requestedLock) {
            return json({ error: "Lock mismatch" }, 409, { "X-WOPI-Lock": row.wopi_lock ?? "" });
          }
          await setLock(requestedLock, expiresAt);
          return new Response(null, { status: 200, headers: corsHeaders });

        case "UNLOCK":
          if (live && row.wopi_lock !== requestedLock) {
            return json({ error: "Lock mismatch" }, 409, { "X-WOPI-Lock": row.wopi_lock ?? "" });
          }
          await setLock(null, null);
          return new Response(null, { status: 200, headers: corsHeaders });

        default:
          return json({ error: `Unsupported X-WOPI-Override: ${override}` }, 400);
      }
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("wopi-host error:", msg);
    return json({ error: "WOPI host error", details: msg }, 500);
  }
});
