# Jyoma AI (EVIGSENSE) — working notes

Self-hosted document intelligence: Supabase (Postgres + pgvector, GoTrue, PostgREST,
Kong, Deno edge functions) behind a Vite/React front end, with OCR, translation,
RAG and a procurement portal. Everything runs locally except the chat and
embedding models.

## Reference projects — read for behaviour, never for looks

A separate EVIGSENSE codebase lives beside this repo. It is a **domain
reference only**. Nothing here imports from it, and nothing here should make a
reader think the two products came from the same company.

```
C:\Projects\Evigsense\
  Evigsense-Classic\        Angular (Nx) + NestJS. UI/apps/procurement covers the
                            same fourteen-stage purchase workflow, so it answers
                            questions about what a desk actually does.
  Service-Document-Loader\  FastAPI ingestion service — the pdf2image
                            rasterise-then-OCR approach docker/chandra-relay copies.
  Service-Embedding\        FastAPI embedding service over HuggingFace models.
```

Paths are Windows-absolute on purpose: this checkout has moved between machines,
and an earlier relative `reference/…` path in a code comment pointed at a
directory that does not exist here.

**What may be taken from it.** Domain facts — the order of the stages, what a
comparative statement is for, which entities count as master data, who signs
what, the shape of a bill of quantities. Procurement is a regulated process and
the reference encodes a working reading of it; re-deriving that from scratch
would only invent a worse one.

**What must never be taken from it.** Anything a user could recognise:

- Visual identity — colour, type, spacing, iconography, chrome, page furniture.
  This product has its own design system in `src/index.css` ("Reading Room": ink,
  paper, `--signal` cyan reserved for machine annotation). Match that, and never
  port a screenshot.
- Product or company naming, logos, wordmarks, taglines, favicons, email
  domains, and the word EVIGSENSE in user-facing copy.
- Its writing voice, microcopy, button labels, error strings, help text.
- Its component library, CSS, markup structure, or class names — no lifted
  templates, even translated from Angular to React.
- Screens copied wholesale. Two products can implement the same regulation and
  still look nothing alike; that is the intent here.

The test to apply: *could somebody who uses both products tell they came from
the same team?* If the answer is yes for anything but the underlying procurement
process, it went too far. Reference the process; build the product.

This applies to documentation too — cite the reference for a domain decision if
it helps a future reader, but do not present this product as a successor,
port, rewrite or sibling of it.

## Running it

```bash
docker compose --project-directory docker -f docker/docker-compose.yml up -d
npm run bootstrap          # migrations + default users
npm run seed:procurement   # the 16 procurement demo accounts
npm run dev                # http://localhost:8080
```

Use `npm run bootstrap`, not `npm run migrate` — the latter needs `psql` on the
host, which this machine does not have. Bootstrap runs the same ledger logic
through `docker exec` against the db container.

Migrations are tracked in `public.schema_migrations` and applied at most once.
After changing anything in `docker/.env`, recreate the edge runtime so it picks
the values up: `docker compose --env-file .env -f docker-compose.yml up -d --force-recreate functions`.

## Model endpoints

Configured in `docker/.env`, resolved per role by `supabase/functions/_shared/ai.ts`,
which logs the resolved endpoint for every role at boot (`[ai] …` lines in the
`jyoma-edge-functions` logs). Current split:

| Role | Endpoint |
|---|---|
| chat, translate | `http://vllm-chat:8000/v1` — `Qwen/Qwen3.5-35B-A3B`, 32k context |
| embed | `http://vllm-embed:8000/v1` — `Qwen/Qwen3-VL-Embedding-2B` |
| ocr | local `vllm-ocr` + `chandra-relay`, `docker/docker-compose.ocr.yml` |

Everything is on this box now. Both roles previously pointed at ngrok tunnels
(`evigsense.ngrok.dev`, `evigsense-ai-service.ngrok.app`); both went offline
(`ERR_NGROK_3200`) and took chat and document chat down with them, so they were
repointed at the local containers by service name.

Chat must stay on a Mixture-of-Experts. `Qwen3.5-35B-A3B` activates ~3B
parameters per token; a dense Llama-3.1-70B was tried here and measured ~5 tok/s,
which timed out every `translate-markdown` request at its 180 s limit.

The embedding server serves 2048-dim vectors with no Matryoshka support, so
`EMBED_DIMENSIONS` stays empty and `embed()` truncates 2048 → 1024 client-side
(L2-renormalized) to match the `vector(1024)` column.

OCR runs on an 8 GB RTX 4070 and is tuned tightly — see the "Chandra OCR on this
machine" section of README.md before changing any `VLLM_CUDA_OCR_*` value.

## Layout

- `src/features/procurement/`, `src/pages/procurement/` — the procurement portal.
  Read `PROCUREMENT.md` first; it is the full specification.
- `supabase/functions/` — edge functions. `_shared/ai.ts` is the inference client,
  `_shared/ocr.ts` the OCR backends.
- `supabase/migrations/` — schema. Data-driven workflow: stages, actions and the
  role matrix are rows, so changing the workflow is a migration, not a rewrite.
- `docker/` — the whole stack. `docker-compose.ocr.yml` is this machine's OCR pair;
  `docker-compose.vllm.yml` and `docker-compose.models.yml` are other hosts'.

## Conventions

- Database functions are `SECURITY DEFINER` with `SET search_path = public`.
- Procurement writes go through `procurement_record_decision()`; nothing sets
  `procurement_cases.stage` directly, and RLS enforces that.
- Comments explain why a thing is the way it is, especially where a simpler
  version was tried and failed. Match that density rather than annotating syntax.
- Charts use the validated palette in `features/procurement/components/charts/palette.ts`;
  the `--signal` cyan is reserved for machine-derived values.
- Required-field state is `--destructive` red and `--ok` green, always paired with
  an icon and a word — red against green is the one pair a colourblind reader
  cannot separate.
- Actions flagged `requires_signature` are enforced by the engine, not by the
  form. Read §7.3 of PROCUREMENT.md before touching `procurement_record_decision`.
- Not every recorded reading is a decision, and not every decision needs a mark.
  A committee member's own evaluation of a bid is a plain record, unsigned; the
  chair's later action that actually moves the case is what carries the
  signature. Sign the transition, not everything that feeds into it.
- A table some role must never write directly (a signed record, a generated
  suggestion) gets **no client write policy at all**, not a narrow one — the
  only way in is a `SECURITY DEFINER` function. A missing-but-intended INSERT
  policy is a bug; a table designed to have none is safe by construction.
  `procurement_tec_evaluations` and `procurement_tec_ai_suggestions` are the
  pattern to copy.
- An AI-suggested value (a score, a match, a classification) lives in its own
  table, never blended into a human's own record, and nothing that gates a
  decision ever reads it — only a human's own signed/recorded action does.
  See `procurement_tec_ai_suggestions` and PROCUREMENT.md §4.5.
- A desk meant to be fully self-service seeds its own prerequisites on arrival
  (a checklist, a committee) via a trigger on stage entry, backfilled for
  cases already there — it does not wait on an admin step nobody is offered a
  screen to perform. See `procurement_tec_seed_on_entry`.
