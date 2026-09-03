# DGX Spark Handover

**Branch:** `fix/vllm-model` (commit `d052938`) — everything below is committed.
**Compose project:** `jyoma-ai-offline`
**Written:** 2026-09-03, from the Windows dev box (RTX 4070 Laptop, 8 GB).

---

## 1. Status at a glance

| Role | Model | State | Verified how |
|------|-------|-------|--------------|
| chat | `google/gemma-4-e4b` (LM Studio) | ✅ working | Real completion returned "PONG" |
| translate | `google/gemma-4-e4b` (LM Studio) | ✅ working | Real RU→EN completion |
| embed | `Qwen/Qwen3-VL-Embedding-2B` (vLLM :8103) | ✅ working | End-to-end via `embed()`: `dim=1024 norm=1.0000` |
| rerank | `Qwen/Qwen3-VL-Reranker-2B` (vLLM :8104) | ⚠️ **never started** | Blocked by 8 GB VRAM — config is correct, untested |
| ocr | `chandra-ocr-2` (LM Studio) | ⚠️ **broken for PDFs** | Fails on scanned PDFs — see §5.1 |

**App state:** 72/72 migrations applied. 3 seeded users. `rag-assistant` returns HTTP 200.
Document chat works end-to-end *except* that scanned PDFs have no real text to search.

**Logins:** `admin@jyoma.ai` / `moderator@jyoma.ai` / `user@jyoma.ai` — password `ChangeMe!2026`.

---

## 2. What the Spark changes

The whole point of moving: this box has 8 GB VRAM, which forced compromises the Spark removes.

- **All four models can run at once.** On 8 GB, embed alone needed `--gpu-memory-utilization 0.70`
  (~5.2 GB), leaving nothing for rerank. Spark's ~119.7 GB unified pool makes the defaults in
  `docker-compose.models.yml` (chat 0.45 / ocr 0.15 / embed 0.08 / rerank 0.08 = **0.76 total**,
  ~28 GB headroom) comfortable.
- **Chat moves off LM Studio** back to a real `Qwen3.5-35B-A3B` on vLLM.
- **OCR moves to `datalab-to/chandra-ocr-2` on vLLM**, which may fix §5.1 for free — vLLM's
  chat-completions endpoint is less strict than LM Studio's about `image_url` payloads. **Test this,
  don't assume it.**
- **LM Studio is no longer needed at all** once all four are on vLLM.

---

## 3. Steps to run on the Spark

### 3.1 Prerequisites

```bash
git clone <repo> && cd evigsense-rag && git checkout fix/vllm-model
```

**Fetch the reranker chat template — it is gitignored and will NOT be in your clone.**
`vllm-rerank` exits immediately at startup without it:

```bash
mkdir -p docker/volumes/vllm
curl -fsSL -o docker/volumes/vllm/reranker_template.jinja \
  https://raw.githubusercontent.com/QwenLM/Qwen3-VL-Embedding/main/examples/reranker_template.jinja
```

### 3.2 Edit `docker/.env`

It is **git-tracked**, so it arrives with the dev-box values. Change these:

```bash
# Point every role at the Spark's vLLM containers (service names, same compose project)
CHAT_BASE_URL=http://vllm-chat:8000/v1
CHAT_MODEL=Qwen/Qwen3.5-35B-A3B
CHAT_API_KEY=not-needed

OCR_BASE_URL=http://vllm-ocr:8000/v1
OCR_MODEL=chandra-ocr-2

EMBED_BASE_URL=http://vllm-embed:8000/v1
RERANK_BASE_URL=http://vllm-rerank:8000/v1

# Translation currently rides LM Studio's gemma. Either move it to the Spark chat model:
TRANSLATE_BASE_URL=http://vllm-chat:8000/v1
TRANSLATE_MODEL=Qwen/Qwen3.5-35B-A3B
# ...or keep a small dedicated translator if you stand one up.

# Leave EMBED_DIMENSIONS EMPTY. vLLM's pooler has no Matryoshka dims configured and
# 400s on the `dimensions` request param; embed() truncates 2048→1024 client-side.
EMBED_DIMENSIONS=

# These are 8GB-card values and are IGNORED by docker-compose.models.yml. Harmless, but
# they are not what the Spark uses — the Spark file reads VLLM_*_MEM, not VLLM_CUDA_*_MEM.
# VLLM_CUDA_EMBED_MEM=0.70  etc.
```

Also confirm `VLLM_IMAGE` is an **arm64 / `sm_121a`** build. Default is
`nvcr.io/nvidia/vllm:26.05-py3`. Stock x86 vLLM images will not run on GB10.

> ⚠️ `docker/.env` contains `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` and
> `SEED_DEFAULT_PASSWORD`, and it is committed to git. Rotate them if this repo is
> ever shared beyond the team.

### 3.3 Bring it up

```bash
cd docker

# Models first — they take longest (weights download on first boot)
docker compose --env-file .env -f docker-compose.models.yml up -d

# Then the app stack, sharing one project/network
docker compose --env-file .env -f docker-compose.yml -f docker-compose.models.yml up -d
```

Services start **sequentially** (`depends_on: service_healthy`) on purpose — four models warming
up at once spikes allocation far above steady state.

### 3.4 Migrations + users

```bash
# Linux/Spark — the bash runner (needs psql on host)
POSTGRES_PASSWORD=<your-password> ./scripts/apply-migrations.sh
```

Both runners keep a ledger in `public.schema_migrations` and apply each file at most once.
On a DB that already has schema, they auto-baseline everything up to the consolidated migration
rather than re-running it. `scripts/bootstrap.ps1` is the Windows equivalent (runs psql inside
the container, no host psql needed) — not useful on the Spark.

Seeding runs automatically at the end and creates the three users.

### 3.5 Verify

```bash
# Per-role routing — the single most useful check
docker logs jyoma-edge-functions 2>&1 | grep '^\[ai\]'
```

Expect all six roles pointing at `vllm-*` service names. This log also **warns** if a
HuggingFace-style model id is pointed at LM Studio (a guard added after that exact mistake).

```bash
# Each server answers
curl -s localhost:8101/v1/models   # chat
curl -s localhost:8102/v1/models   # ocr
curl -s localhost:8103/v1/models   # embed
curl -s -X POST localhost:8104/v1/rerank -H 'Content-Type: application/json' \
  -d '{"model":"Qwen/Qwen3-VL-Reranker-2B","query":"q","documents":["a","b"],"top_n":2}'
```

```sql
-- App data sanity
select count(*) from public.schema_migrations;                    -- expect 72
select u.email, r.role from auth.users u
  join public.user_roles r on r.user_id = u.id order by u.email;  -- expect 3 rows
select count(*), vector_dims(embedding) from public.document_embeddings group by 2;
```

Then upload a scanned PDF through the UI and open document chat.

---

## 4. Reranker — first real test happens on the Spark

It has **never successfully run.** The config, client code, and compose service are all written
and validated as far as possible without hardware:

- `rerank()` in `_shared/ai.ts` — tested against a mock server (score ordering, out-of-range index
  rejection, correct request shape).
- `rag-assistant` pulls `RERANK_CANDIDATES=50` from pgvector, reranks, keeps `RERANK_TOP_K=8`.
- Reranking is **opt-in**: blank `RERANK_MODEL` skips it entirely, and a failed rerank call logs a
  warning and falls back to vector ordering rather than breaking the answer.

What was never exercised: the `hf_overrides` scoring-head swap, the chat template, and whether
vLLM's `/v1/rerank` response shape matches what `rerank()` parses. **Watch `vllm-rerank` logs on
first boot.**

---

## 5. Open issues

### 5.1 Scanned-PDF OCR is broken (highest priority)

`extract-document-text` calls `ocrPdf()` with **raw PDF bytes**. `ocrViaLmStudio()` wraps them into
an `image_url` data URI and posts to chat-completions. LM Studio rejects it:

```
Chat completion failed (400) [role=ocr, model=chandra-ocr-2]:
{"error":"'url' field must be a base64 encoded image."}
```

The document then stores a placeholder instead of text:
`[Scanned PDF detected. Automatic OCR failed...]` — so RAG has nothing real to retrieve.

Nothing rasterizes PDF pages server-side. That conversion only exists **client-side** in
`src/lib/pdfToImages.ts`, used by the Translation Markdown page (which does work).

Three ways out, in order of expected effort:

1. **Try vLLM-served Chandra first.** Moving OCR to `vllm-ocr` may accept the payload where
   LM Studio didn't. Costs nothing to test — do this before writing code.
2. **Native Chandra server.** `OCR_BACKEND=chandra-native` + `CHANDRA_BASE_URL` already exist and
   route to a `POST /ocr` endpoint that takes raw PDFs directly. `CHANDRA_BASE_URL` is set to
   `http://host.docker.internal:8001` but **nothing has ever been running there** (connection
   refused). Would need standing the server up.
3. **Rasterize server-side** in the Deno edge function — no canvas/pdfjs readily available there,
   so this is the real engineering option if 1 and 2 fail.

### 5.2 Translation still on LM Studio

`LMSTUDIO_TRANSLATE_MODEL=google/gemma-4-e4b`. If you want LM Studio gone entirely, set
`TRANSLATE_BASE_URL` / `TRANSLATE_MODEL` (§3.2). Note `translate-markdown` has Qwen3-specific
tuning baked in (`/no_think` prefix + `chat_template_kwargs: {enable_thinking: false}`) which is
inert on gemma but *correct* for a Qwen chat model.

### 5.3 `main` is 6 commits behind

`fix/vllm-model` has not been merged. Includes the Collabora work and the Jyoma rebrand.

### 5.4 Frontend role enforcement is thin

`src/pages/Admin.tsx` is the only role check in the client; routes in `App.tsx` are unguarded and
the Admin nav link shows for everyone. The seeded `moderator` behaves like `user`. Also
`create-user` assigns **no role** — users added via `/admin` land with zero roles.

---

## 6. Traps already hit — don't re-debug these

Each of these cost real time here. All are fixed in the committed code; listed so the symptoms are
recognisable if they resurface.

| Symptom | Cause | Fix (already applied) |
|---|---|---|
| `vllm: error: unrecognized arguments: -lc exec vllm serve...` | Image bakes `ENTRYPOINT ["vllm","serve"]`; `command:` only overrides CMD, so both concatenate | `entrypoint: []` in both compose files |
| Container serves fine but never goes healthy; `depends_on` hangs forever | Healthcheck used `python`, image only has `python3` (exit 127, retried silently) | `python3` in healthcheck |
| `No available memory for the cache blocks` / `Available KV cache memory: -1.31 GiB` | `--gpu-memory-utilization` budget must cover weights **+ CUDA graph capture + KV cache**, not just weights | Raise the fraction; on Spark the defaults are already generous |
| `operator does not exist: extensions.vector <=> extensions.vector` | `search_documents_by_embedding` had `SET search_path TO 'public'`, but pgvector installs into `extensions` in self-hosted Supabase | Migration `20260902000000_fix_vector_search_path.sql` |
| `Model does not support Matryoshka embeddings; dimensions must be unset` | vLLM pooler has no MRL dims configured, rejects the `dimensions` param | Leave `EMBED_DIMENSIONS` blank; `embed()` truncates 2048→1024 client-side and re-normalizes |
| Upload stuck at "Extracting text…" forever | `process-queue` cold-boot import of `esm.sh/@supabase/supabase-js` failed transiently; **nothing retries a stuck queue row** | Manual re-trigger (below). No automatic sweeper exists — worth adding |
| Migrations abort on second run | Runner had no ledger and re-applied all 71 files; 160 `CREATE POLICY` / 23 `CREATE TRIGGER` were unguarded | Ledger + `DROP ... IF EXISTS` guards |
| Renaming compose `name:` silently orphans the DB | Volumes are named per-project; renaming creates a fresh empty DB | Keep `name:` consistent across **both** compose files |

**Manually re-trigger a stuck queue row:**

```bash
curl -X POST http://localhost:8000/functions/v1/process-queue \
  -H "apikey: $ANON_KEY" -H "x-internal-secret: $INTERNAL_FUNCTION_SECRET"
```

---

## 7. Architecture reference

Inference resolves **per role** in `supabase/functions/_shared/ai.ts`. Each role reads
`<ROLE>_BASE_URL` / `<ROLE>_API_KEY` / `<ROLE>_MODEL`, falling back to the `LMSTUDIO_*` values —
so unsetting the per-role vars reverts everything to a single LM Studio endpoint.

Roles: `chat`, `translate`, `embed`, `rerank`, `ocr`, `audio`.

Model fallback is **endpoint-aware on purpose**: a role only inherits the chat model if it resolves
to the same base URL as chat. Without that, pointing chat at a remote vLLM would send
`Qwen/Qwen3.5-35B-A3B` to LM Studio for OCR.

```
Edge Functions → vLLM :8101  Qwen3.5-35B-A3B        (chat, summary, metadata, tags)
               → vLLM :8102  chandra-ocr-2          (OCR via chat-completions + image_url)
               → vLLM :8103  Qwen3-VL-Embedding-2B  (embeddings, 2048→1024 client-side MRL)
               → vLLM :8104  Qwen3-VL-Reranker-2B   (optional rerank stage)
```

**Files that matter:**

| Path | What |
|---|---|
| `supabase/functions/_shared/ai.ts` | Per-role endpoint resolution, `chat`/`embed`/`rerank`, boot-time config log |
| `supabase/functions/_shared/ocr.ts` | OCR backends (`lmstudio` VLM vs `chandra-native`) |
| `supabase/functions/rag-assistant/index.ts` | Retrieval + rerank + answer |
| `docker/docker-compose.models.yml` | **Spark**: all four vLLM servers, arm64/sm_121a |
| `docker/docker-compose.vllm.yml` | x86 CUDA: embed + rerank only (dev-box file) |
| `scripts/seed-users.mjs` | Idempotent user seeding via GoTrue admin API |
| `scripts/bootstrap.ps1` | Windows: ledgered migrations + seed |
| `scripts/apply-migrations.sh` | Linux/Spark equivalent |

`OCR_BACKEND=lmstudio` is a **misleading name** — it means "a VLM over `/v1/chat/completions`" and
works against any OpenAI-compatible server, vLLM included. Only use `chandra-native` for Chandra's
own non-OpenAI `/ocr` server.

---

## 8. Suggested order on the Spark

1. Clone, checkout `fix/vllm-model`, **fetch the jinja template** (§3.1).
2. Edit `docker/.env` per §3.2.
3. `up -d` models → watch all four reach healthy. Rerank is the risky one.
4. `up -d` app stack, run migrations + seed.
5. Check the `[ai]` boot log — all six roles on `vllm-*`.
6. Log in, upload a scanned PDF, open document chat.
7. **If OCR still fails on PDFs → §5.1.** That is the one known-broken feature.
8. Once stable, merge `fix/vllm-model` → `main`.
