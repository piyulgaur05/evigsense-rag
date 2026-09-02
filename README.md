# Spark Start Genie (EVIGSENSE)

Document management, RAG assistant, OCR, translation, and signing — **fully self-hosted** via
self-hosted Supabase, a private vLLM chat endpoint, local LM Studio, and Chandra OCR.
Everything except the chat LLM runs on your machine.

## Prerequisites

- **Node.js 18+** and npm
- **Docker Desktop** (for self-hosted Supabase)
- **Chat LLM endpoint** — a remote OpenAI-compatible server (vLLM) reached over ngrok:
  `CHAT_BASE_URL=https://evigsense.ngrok.dev/v1`, `CHAT_MODEL=Qwen/Qwen3.5-35B-A3B`.
  Serves the RAG assistant, summaries, metadata extraction, and auto-tagging.
  **32k context window** — oversized retrieval context comes back as a `400`.
- **LM Studio** with these models loaded (everything except chat):
  - Dedicated translator (e.g. `google/gemma-4-e4b`) — set id in `LMSTUDIO_TRANSLATE_MODEL`
  - Embedding model (e.g. `text-embedding-qwen3-embedding-0.6b` or `bge-m3`, both 1024 dims) — set id in `LMSTUDIO_EMBED_MODEL`
  - Chandra VLM for OCR (e.g. `chandra-ocr-2`) — set id in `OCR_MODEL`, or run Chandra native server
  - `LMSTUDIO_CHAT_MODEL` is now only the **fallback** for LM Studio-bound roles that have no explicit model

> The values in `LMSTUDIO_*` / `OCR_MODEL` must match the **exact** model ids LM Studio
> exposes at <http://localhost:1234/v1/models>, and `CHAT_MODEL` must match what
> `CHAT_BASE_URL/models` reports (it is case-sensitive). After changing any of them, run
> `docker compose up -d --force-recreate functions` so the edge runtime picks them up —
> the dispatcher logs the resolved endpoint per role at boot.
- Optional: Whisper model in LM Studio for audio (`AUDIO_BACKEND=whisper`)

## Run the stack

### 1. Start LM Studio

1. Open LM Studio → Local Server → start server on port **1234**
2. Load your embedding, translator, and OCR (Chandra) models — the chat model runs remotely
3. Note each model id and set them in `docker/.env`

Verify the remote chat endpoint is up:

```sh
curl -s https://evigsense.ngrok.dev/v1/models
```

### 2. Start self-hosted Supabase

```sh
cd docker
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, LMSTUDIO_* model ids, INTERNAL_FUNCTION_SECRET
docker compose up -d
```

Wait for Postgres (port **54322**), then apply migrations **and seed the default
users** in one step:

```sh
npm run bootstrap
```

That runs `scripts/bootstrap.ps1`: it waits for the db container, applies every
migration through `docker exec` (no host `psql` needed), then runs
`scripts/seed-users.mjs`. On Git Bash / WSL / Linux use the shell equivalent,
which also seeds at the end:

```sh
POSTGRES_PASSWORD=your-password ./scripts/apply-migrations.sh
```

#### Stuck on "name resolution failed" when uploading?

The `storage`, `realtime`, or `functions` container can be stuck in a restart loop after a first-time setup against the supabase/postgres base image (storage's role-creation migration aborts when `anon` / `authenticated` / `service_role` already exist, so it never grants schema access). Run the recovery script once:

```powershell
# Windows (PowerShell)
docker\scripts\fix-stack.ps1
```

It drops and rebuilds the `storage` + `_realtime` schemas, lets storage re-migrate cleanly, regrants schema/table privileges to the JWT roles, and recreates buckets + RLS policies. Safe to re-run.

#### `ingest-logs` returns 500 / `application_logs` table missing?

If the bootstrap migration was applied partially the `application_logs` table can be missing while everything else is present. Apply the recovery script from inside the db container and tell PostgREST to reload its schema cache:

```powershell
docker cp scripts/create-application-logs.sql spark-start-genie-offline-db-1:/tmp/create-application-logs.sql
docker exec spark-start-genie-offline-db-1 psql -U postgres -d postgres -f /tmp/create-application-logs.sql
docker exec spark-start-genie-offline-db-1 psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
```

#### Edge Functions read empty env vars (`supabaseUrl is required`, embedding/OCR fall back to defaults)?

`supabase/functions/main/index.ts` must forward host env vars into the worker
isolate via `envVars: Object.entries(Deno.env.toObject())`. If you upgrade
`supabase/functions/main` from an older snapshot make sure this is in place,
otherwise every function will see `Deno.env.get(...) === undefined`.

**Services:**

| Service | URL |
|---------|-----|
| API (Kong) | http://localhost:8000 |
| Studio | http://localhost:54323 |
| Postgres | localhost:54322 |

### 3. Sign in with a seeded user

`npm run bootstrap` (or `npm run seed:users` on its own) creates one account per
`app_role` — no Studio clicking required:

| Email | Role | Can reach `/admin` |
|-------|------|--------------------|
| `admin@jyoma.ai` | `admin` | yes |
| `moderator@jyoma.ai` | `moderator` | no |
| `user@jyoma.ai` | `user` | no |

All three share `SEED_DEFAULT_PASSWORD` from `docker/.env` (default
`ChangeMe!2026`). **Change it before exposing the stack to anyone else.**

The script is idempotent — re-running it leaves existing users alone and only
tops up missing role grants. Knobs in `docker/.env`:

| Variable | Purpose |
|----------|---------|
| `SEED_DEFAULT_USERS` | `true` to seed; anything else skips entirely |
| `SEED_DEFAULT_PASSWORD` | Shared password for the seeded accounts |
| `SEED_USERS` | Optional override: `email:role,email:role` |

It goes through the GoTrue admin API with `SERVICE_ROLE_KEY`, which is what lets
it bypass the admin-only RLS policy on `user_roles` — the reason a fresh stack
could not previously create its own first admin. As a guard it refuses to seed
the default password against a non-localhost `SUPABASE_PUBLIC_URL` unless you
set `SEED_ALLOW_REMOTE=true`.

> Note: `moderator` is a valid role in the `app_role` enum but nothing in the UI
> keys off it yet, so that account currently behaves like `user`.

If Studio shows **"API error happened while trying to communicate with the server"**, `JWT_SECRET` and `ANON_KEY` / `SERVICE_ROLE_KEY` are out of sync. Regenerate keys and restart Kong + Studio:

```sh
cd docker
node scripts/generate-jwt-keys.mjs "$JWT_SECRET"   # copy output into docker/.env and docker/volumes/api/kong.yml
docker compose up -d --force-recreate kong studio auth
```

### 4. Re-embed existing documents (after dim migration)

If upgrading from cloud OpenAI 1536-dim embeddings:

```sh
psql "postgresql://postgres:YOUR_PASSWORD@localhost:54322/postgres" -f scripts/requeue-documents-for-reembed.sql
```

Then trigger queue processing from the Documents page or invoke `process-queue`.

### 5. Start the frontend

```sh
cp .env.example .env   # already points at localhost:8000
npm install
npm run dev
```

Open http://localhost:8080 → sign in with your local admin user.

## Environment variables

See [.env.example](.env.example) for the full list. Key knobs:

Inference is resolved **per role** (`chat`, `translate`, `embed`, `ocr`, `audio`) in
`supabase/functions/_shared/ai.ts`. Each role reads `<ROLE>_BASE_URL` / `<ROLE>_API_KEY` /
`<ROLE>_MODEL` and falls back to the `LMSTUDIO_*` values, so unsetting the `CHAT_*` vars
puts everything back on LM Studio.

| Variable | Purpose |
|----------|---------|
| `CHAT_BASE_URL` | Remote chat LLM endpoint (`https://evigsense.ngrok.dev/v1`) |
| `CHAT_MODEL` | Remote chat model id (`Qwen/Qwen3.5-35B-A3B`) |
| `CHAT_API_KEY` | Bearer token for the chat endpoint (unused by this vLLM server) |
| `LMSTUDIO_BASE_URL` | Default endpoint for all other roles (`http://host.docker.internal:1234/v1`) |
| `LMSTUDIO_CHAT_MODEL` | Fallback model for LM Studio-bound roles with no explicit model |
| `TRANSLATE_BASE_URL` / `EMBED_BASE_URL` / `OCR_BASE_URL` | Optional per-role endpoint overrides |
| `LMSTUDIO_TRANSLATE_MODEL` | Optional dedicated translator for markdown translation (falls back to `LMSTUDIO_CHAT_MODEL`) |
| `EMBED_BASE_URL` / `EMBED_MODEL` | Embedding endpoint + model (`Qwen/Qwen3-VL-Embedding-2B` on vLLM) |
| `EMBED_DIMENSIONS` | MRL truncation width sent as OpenAI `dimensions`. Leave empty for LM Studio |
| `EMBEDDING_DIM` | Must match `EMBED_DIMENSIONS` and the `vector(N)` column (default `1024`) |
| `RERANK_BASE_URL` / `RERANK_MODEL` | Cross-encoder rerank. Empty `RERANK_MODEL` disables it |
| `RERANK_CANDIDATES` / `RERANK_TOP_K` | Pool pulled from pgvector (50) then kept after rerank (8) |
| `LMSTUDIO_EMBED_MODEL` | Legacy fallback when `EMBED_MODEL` is unset |
| `OCR_BACKEND` | `lmstudio` (VLM) or `chandra-native` |
| `OCR_MODEL` | Chandra model id in LM Studio |
| `CHANDRA_BASE_URL` | Native Chandra server URL (if `OCR_BACKEND=chandra-native`) |
| `AUDIO_BACKEND` | `disabled` (default) or `whisper` |

## Architecture

```
Browser → Kong :8000 → GoTrue / PostgREST / Storage / Realtime / Edge Functions
                              ↓
                         Postgres + pgvector
Edge Functions → vLLM :8101  Qwen3.5-35B-A3B         (chat: assistant, summary, metadata, tags)
              → vLLM :8102  chandra-ocr-2           (OCR, images via chat completions)
              → vLLM :8103  Qwen3-VL-Embedding-2B   (embeddings, MRL -> 1024)
              → vLLM :8104  Qwen3-VL-Reranker-2B    (optional rerank stage)
              → LM Studio :1234                     (translation + Whisper)

All four vLLM servers run on one DGX Spark via docker-compose.models.yml.
```

## Model servers on a CUDA host (x86_64)

`docker/docker-compose.vllm.yml` runs the two roles LM Studio cannot serve, and
joins the app's compose project so edge functions reach them by service name:

| Port | Role | Model | Route the app calls |
|------|------|-------|---------------------|
| 8103 | embed | `Qwen/Qwen3-VL-Embedding-2B` | `POST /v1/embeddings` |
| 8104 | rerank | `Qwen/Qwen3-VL-Reranker-2B` | `POST /v1/rerank` |

Chat, translation and OCR stay on LM Studio. Fetch the reranker chat template
once (it ships in the Qwen repo, not with the weights), then start:

```sh
curl -fsSL -o docker/volumes/vllm/reranker_template.jinja   https://raw.githubusercontent.com/QwenLM/Qwen3-VL-Embedding/main/examples/reranker_template.jinja

docker compose --env-file .env -f docker-compose.yml -f docker-compose.vllm.yml up -d
```

**VRAM:** unlike the Spark's unified pool, `--gpu-memory-utilization` here is a
fraction of dedicated VRAM, and the two services add up. **Measured on an 8 GB
RTX 4070 Laptop:** even at fp8, `vllm-embed` alone needs fraction ~0.70 (~5.2 GB)
to start reliably — weights, CUDA graph capture, and KV cache all count against
the budget. A same-size reranker needs a comparable budget, so **the two cannot
be resident together on an 8 GB card**; starting `vllm-rerank` while `vllm-embed`
already holds its ~5 GB fails with "No available memory for the cache blocks."
On this class of card, run `up -d vllm-embed` alone and leave `RERANK_MODEL`
empty — reranking is optional and `rag-assistant` falls back to vector-order
retrieval automatically if the rerank call fails. A 16 GB+ card fits both at
fp8; 24 GB+ fits both at bf16 (`VLLM_QUANTIZATION=`).

The `VLLM_CUDA_*_MEM` vars are deliberately separate from the Spark's
`VLLM_*_MEM`: those are fractions of a 119 GB unified pool, so reusing `0.08`
here would request 0.6 GB on an 8 GB card and vLLM would refuse to start.

## Model servers on DGX Spark

`docker/docker-compose.models.yml` runs all four model roles as vLLM servers on a
DGX Spark (GB10 / Grace Blackwell, `sm_121a`, arm64):

| Port | Role | Model | App variable |
|------|------|-------|--------------|
| 8101 | chat | `Qwen/Qwen3.5-35B-A3B` | `CHAT_BASE_URL` |
| 8102 | ocr | `datalab-to/chandra-ocr-2` | `OCR_BASE_URL` |
| 8103 | embed | `Qwen/Qwen3-VL-Embedding-2B` | `EMBED_BASE_URL` |
| 8104 | rerank | `Qwen/Qwen3-VL-Reranker-2B` | `RERANK_BASE_URL` |

### Before the first start

The reranker needs a chat template that ships with the Qwen3-VL-Embedding repo
rather than with the weights. Without it `vllm-rerank` exits immediately:

```sh
curl -fsSL -o docker/volumes/vllm/qwen3_vl_reranker.jinja   https://raw.githubusercontent.com/QwenLM/Qwen3-VL-Embedding/main/examples/qwen3_vl_reranker.jinja
```

### Start

```sh
# Models only (Spark serving a stack that runs elsewhere)
docker compose --env-file .env -f docker-compose.models.yml up -d

# Or everything on the Spark, sharing one network
docker compose --env-file .env -f docker-compose.yml -f docker-compose.models.yml up -d
```

Then point the app at them — service names when co-located, `<spark-host>:81xx`
when remote. Both forms are written out in `docker/.env.example`.

### Memory is the binding constraint

Spark has **one ~119.7 GiB unified pool** shared by the OS, page cache, model
weights and KV cache — there is no separate VRAM. Every
`--gpu-memory-utilization` is a fraction of that *whole* pool and the four
services **add up**:

| Service | `*_MEM` | Approx. |
|---------|---------|---------|
| chat | 0.45 | ~54 GiB |
| ocr | 0.15 | ~18 GiB |
| embed | 0.08 | ~10 GiB |
| rerank | 0.08 | ~10 GiB |
| **total** | **0.76** | **~92 GiB**, ~28 GiB headroom |

Raise one and you must lower another. Two further notes:

- Services start **sequentially** via `depends_on: service_healthy`. Four models
  warming up at once spikes allocation well above steady state and OOMs the box.
  First boot is slow because weights download; later boots reuse the `hf-cache`
  volume.
- **Prefer NVFP4 weights on Blackwell.** It reduces memory pressure more than any
  other single change, which is what buys you room to run four models at once.
  Set `CHAT_MODEL_ID` to an NVFP4 build if one is published for your chat model.
- If Spark reports memory pressure despite apparently free capacity, drop the
  page cache: `sudo sh -c 'sync; echo 3 > /proc/sys/vm/drop_caches'`.

### Image choice

`VLLM_IMAGE` defaults to NVIDIA's NGC build (`nvcr.io/nvidia/vllm:26.05-py3`),
which is the supported path. It must be an **arm64 image built for `sm_121a`** —
stock x86 vLLM images will not run. Community GB10 builds track vLLM `main` more
closely if you need a newer feature; pin a digest rather than a moving tag.

## Embeddings and reranking (Qwen3-VL on vLLM)

Retrieval uses **Qwen3-VL-Embedding-2B**, a multimodal embedding model: it embeds
text *and* page images into one space, which matters for scanned documents where
OCR is lossy. It emits a **single dense vector**, so the existing pgvector cosine
search and `search_documents_by_embedding` work unchanged — no multi-vector
rework of the kind ColPali-style models would require.

The model is natively 2048-dim and supports Matryoshka output from 64 to 2048.
`EMBED_DIMENSIONS=1024` truncates it to match the `vector(1024)` column, so
`EMBEDDING_DIM` and `EMBED_DIMENSIONS` must always agree. Changing either one
means migrating the column and re-embedding every document.

> **Serve it with vLLM (>= 0.14.0). LM Studio cannot do this — verified.**
> LM Studio types the GGUF as `vlm` rather than `embeddings`, so `/v1/embeddings`
> will not use it. Worse, that route **ignores the `model` field entirely**: a
> deliberately bogus model name returns byte-identical vectors to whatever
> embedder happens to be loaded. Asking for Qwen3-VL there silently gives you a
> different model's output.
>
> `embed()` therefore treats a width mismatch as **fatal** rather than a warning —
> vectors from an unknown embedding space poison the index in ways that are very
> hard to diagnose later. `dimensions` is likewise a vLLM-only parameter.

LM Studio remains fine for chat, translation and OCR, where the `model` field is
honoured normally. Reranking has no LM Studio path at all: `POST /v1/rerank`
answers `"Unexpected endpoint or method"`.

Once the endpoint is up:

```sh
# docker/.env
EMBED_BASE_URL=http://your-vllm-host:8000/v1
EMBED_MODEL=Qwen/Qwen3-VL-Embedding-2B
EMBED_DIMENSIONS=1024
```

Reranking is **opt-in**. Leave `RERANK_MODEL` empty and the pipeline skips it
entirely. With it set, `rag-assistant` pulls `RERANK_CANDIDATES` (50) chunks from
pgvector, scores them with the cross-encoder, and keeps `RERANK_TOP_K` (8):

```sh
RERANK_BASE_URL=http://your-vllm-host:8001/v1
RERANK_MODEL=Qwen/Qwen3-VL-Reranker-2B
```

A reranker that is down or slow is non-fatal — retrieval logs a warning and
falls back to vector ordering. Note `Qwen3-VL-Reranker` supports neither
quantization nor MRL, so it has no LM Studio path at all.

After changing any of these, reload the edge runtime and check the boot log,
which prints the resolved endpoint per role and warns if an HF-style model id is
pointed at LM Studio:

```sh
docker compose --project-directory docker -f docker/docker-compose.yml up -d --force-recreate functions
```

## Development (Supabase CLI alternative)

If you prefer the Supabase CLI instead of raw Docker:

```sh
npx supabase start
npx supabase db reset   # applies migrations
npx supabase functions serve
```

Copy LM Studio env vars into `supabase/.env.local` for edge functions.

## What changed from cloud

- **OpenRouter** → LM Studio (`supabase/functions/_shared/ai.ts`)
- **Single LM Studio endpoint** → per-role endpoints; chat now runs on remote vLLM (`Qwen/Qwen3.5-35B-A3B`), everything else stays local
- **Paddle OCR + OCR.space** → Chandra (`supabase/functions/_shared/ocr.ts`)
- **Embeddings** → 1024-dim bge-m3 (migration `20260524000000_embedding_dim_1024.sql`)
- **Supabase cloud** → self-hosted Docker stack in `docker/`

## Build

```sh
npm run build
npm run preview
```
