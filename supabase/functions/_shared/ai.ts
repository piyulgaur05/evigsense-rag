/**
 * Shared OpenAI-compatible inference client.
 *
 * Inference is split across backends by ROLE:
 *   - chat      -> remote vLLM (CHAT_BASE_URL), e.g. https://evigsense.ngrok.dev/v1
 *   - embed     -> vLLM (Qwen3-VL-Embedding-2B), or LM Studio
 *   - rerank    -> vLLM (Qwen3-VL-Reranker-2B); optional, skipped when unset
 *   - ocr       -> LM Studio (Chandra VLM)
 *   - translate -> LM Studio (dedicated small translator)
 *   - audio     -> LM Studio (Whisper), disabled by default
 *
 * Every role defaults to LMSTUDIO_BASE_URL / LMSTUDIO_API_KEY, so a deployment
 * that sets none of the per-role vars behaves exactly like the old
 * single-endpoint setup. Override a role with <PREFIX>_BASE_URL /
 * <PREFIX>_API_KEY / <PREFIX>_MODEL.
 */

export type AiRole = "chat" | "translate" | "embed" | "rerank" | "ocr" | "audio";

const ROLE_PREFIX: Record<AiRole, string> = {
  chat: "CHAT",
  translate: "TRANSLATE",
  embed: "EMBED",
  rerank: "RERANK",
  ocr: "OCR",
  audio: "WHISPER",
};

/** docker-compose passes unset vars through as "" — treat blank as unset. */
function env(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : undefined;
}

const stripTrailingSlash = (u: string) => u.replace(/\/+$/, "");

/** LM Studio is the shared default endpoint for every role. */
export function getLmStudioBaseUrl(): string {
  return stripTrailingSlash(env("LMSTUDIO_BASE_URL") ?? "http://host.docker.internal:1234/v1");
}

export function getLmStudioApiKey(): string {
  return env("LMSTUDIO_API_KEY") ?? "lm-studio";
}

/** Chat model id as served by LM Studio (the fallback for LM Studio-bound roles). */
function getLmStudioChatModel(): string {
  return env("LMSTUDIO_CHAT_MODEL") ?? "local-chat";
}

export interface AiEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function baseUrlFor(role: AiRole): string {
  return stripTrailingSlash(env(`${ROLE_PREFIX[role]}_BASE_URL`) ?? getLmStudioBaseUrl());
}

/**
 * Resolves the endpoint + model for a role.
 *
 * The model fallback is endpoint-aware on purpose: with chat pointed at a remote
 * vLLM, blindly inheriting the chat model id would send e.g.
 * `Qwen/Qwen3.5-35B-A3B` to LM Studio (or `chandra-ocr-2` to vLLM). A role only
 * inherits the chat model when it resolves to the same base URL as chat.
 */
export function getEndpoint(role: AiRole): AiEndpoint {
  const prefix = ROLE_PREFIX[role];
  const baseUrl = baseUrlFor(role);
  const apiKey = env(`${prefix}_API_KEY`) ?? getLmStudioApiKey();

  const explicit = env(`${prefix}_MODEL`) ?? env(`LMSTUDIO_${prefix}_MODEL`);
  if (explicit) return { baseUrl, apiKey, model: explicit };

  const model = baseUrl === baseUrlFor("chat")
    ? (env("CHAT_MODEL") ?? getLmStudioChatModel())
    : getLmStudioChatModel();

  return { baseUrl, apiKey, model };
}

export function getChatModel(): string {
  return getEndpoint("chat").model;
}

export function getTranslateModel(): string {
  return getEndpoint("translate").model;
}

export function getEmbedModel(): string {
  return env("EMBED_MODEL") ?? env("LMSTUDIO_EMBED_MODEL") ?? "bge-m3";
}

export function getRerankModel(): string {
  return env("RERANK_MODEL") ?? "";
}

/** Reranking is opt-in: with no model configured the pipeline skips it. */
export function isRerankEnabled(): boolean {
  return getRerankModel().length > 0;
}

/**
 * MRL truncation width sent as the OpenAI `dimensions` parameter.
 * Qwen3-VL-Embedding-2B is natively 2048-dim and supports Matryoshka output
 * from 64 to 2048, so we ask for 1024 to match the vector(1024) column.
 * Left unset the parameter is omitted entirely, since servers that do not
 * implement MRL (LM Studio) reject the unknown field.
 */
export function getEmbedDimensions(): number | undefined {
  const raw = env("EMBED_DIMENSIONS");
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function getEmbeddingDim(): number {
  const dim = parseInt(env("EMBEDDING_DIM") ?? "1024", 10);
  return Number.isFinite(dim) ? dim : 1024;
}

let configLogged = false;

/**
 * Logs the resolved endpoint/model per role once at boot. The edge runtime only
 * sees env vars that `main/index.ts` explicitly forwards into the worker isolate;
 * when that breaks, every role silently falls back to the LM Studio defaults.
 * With two backends in play that is otherwise near-impossible to notice.
 */
export function logAiConfig(): void {
  if (configLogged) return;
  configLogged = true;
  const roles: AiRole[] = ["chat", "translate", "embed", "rerank", "ocr", "audio"];
  for (const role of roles) {
    if (role === "rerank" && !isRerankEnabled()) {
      console.log(`[ai] rerank    -> disabled (set RERANK_MODEL to enable)`);
      continue;
    }
    const ep = getEndpoint(role);
    let model = ep.model;
    if (role === "embed") {
      const dims = getEmbedDimensions();
      model = getEmbedModel() + (dims ? `, dimensions=${dims}` : "");
    }
    console.log(`[ai] ${role.padEnd(9)} -> ${ep.baseUrl} (model=${model})`);
  }

  // A HuggingFace-style repo id ("Qwen/Qwen3-VL-Embedding-2B") pointed at
  // LM Studio is always a misconfiguration: LM Studio uses its own short ids.
  // Without this the failure surfaces much later as an opaque 400.
  for (const role of ["embed", "rerank"] as AiRole[]) {
    if (role === "rerank" && !isRerankEnabled()) continue;
    const ep = getEndpoint(role);
    const model = role === "embed" ? getEmbedModel() : getRerankModel();
    if (model.includes("/") && ep.baseUrl === getLmStudioBaseUrl()) {
      console.warn(
        `[ai] ${role.toUpperCase()}_MODEL="${model}" looks like a vLLM/HF repo id but ` +
          `${ROLE_PREFIX[role]}_BASE_URL is unset, so it resolves to LM Studio ` +
          `(${ep.baseUrl}). Set ${ROLE_PREFIX[role]}_BASE_URL to the vLLM endpoint.`,
      );
    }
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface ChatOptions {
  /** Which backend to route to. Defaults to "chat" (the remote LLM). */
  role?: AiRole;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
  signal?: AbortSignal;
  /** OpenAI-compatible: "low" | "medium" | "high". Forwarded as-is to the backend. */
  reasoning_effort?: "low" | "medium" | "high";
  /** Extra body params to pass through (e.g. backend-specific knobs). */
  extra?: Record<string, unknown>;
}

/**
 * Removes `<think>...</think>` (and common variants) blocks that some
 * reasoning models emit inline in the assistant message content. Qwen3 in
 * particular streams a chain-of-thought into `content` before the actual
 * answer when "thinking" mode is on.
 */
export function stripThinkTags(text: string): string {
  if (!text) return text;
  let out = text;
  // Closed think blocks: <think>...</think>, <thinking>...</thinking>, <reasoning>...</reasoning>
  out = out.replace(/<\s*(think|thinking|reasoning)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // Unclosed leading think block (model never emitted the close tag)
  out = out.replace(/^[\s\S]*?<\s*\/\s*(think|thinking|reasoning)\s*>/i, "");
  // Stray opening tag with no close: drop everything from the tag on
  out = out.replace(/<\s*(think|thinking|reasoning)\b[^>]*>[\s\S]*$/i, "");
  return out.trim();
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<Response> {
  const ep = getEndpoint(options.role ?? "chat");
  const body: Record<string, unknown> = {
    model: options.model ?? ep.model,
    messages,
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
  if (options.response_format) body.response_format = options.response_format;
  if (options.reasoning_effort) body.reasoning_effort = options.reasoning_effort;
  if (options.extra) Object.assign(body, options.extra);

  return fetch(`${ep.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ep.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
}

export async function chatCompletionText(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const role = options.role ?? "chat";
  const ep = getEndpoint(role);
  const model = options.model ?? ep.model;
  // Two backends are in play at once, so an unattributed error is unusable:
  // always name the endpoint and model that actually failed.
  const where = `role=${role}, endpoint=${ep.baseUrl}, model=${model}`;

  const res = await chat(messages, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat completion failed (${res.status}) [${where}]: ${err}`);
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  const message = choice?.message ?? {};
  const rawContent: string = typeof message.content === "string" ? message.content : "";
  const content = stripThinkTags(rawContent);
  const finishReason: string | undefined = choice?.finish_reason;
  const usage = data?.usage ?? {};
  const completionTokens: number | undefined = usage.completion_tokens;
  const reasoningTokens: number | undefined = usage.completion_tokens_details?.reasoning_tokens;

  if (content.trim().length > 0) return content;

  // Some reasoning models (chandra-ocr-2 in LM Studio thinking mode, or vLLM
  // with a reasoning parser enabled) emit the actual answer into
  // `reasoning_content` and leave `content` blank, especially when the token
  // budget is too small. Fall back to it if it looks like a useful payload
  // rather than throwing.
  const reasoningContent: string = stripThinkTags(
    typeof message.reasoning_content === "string" ? message.reasoning_content : "",
  );
  if (reasoningContent.trim().length > 0) {
    console.warn(
      `[ai] Empty content; falling back to reasoning_content [${where}] ` +
        `(finish_reason=${finishReason ?? "?"}, completion_tokens=${completionTokens ?? "?"}, ` +
        `reasoning_tokens=${reasoningTokens ?? "?"}). Consider raising max_tokens or ` +
        `using a non-reasoning model.`,
    );
    return reasoningContent;
  }

  throw new Error(
    `Empty chat response [${where}] (finish_reason=${finishReason ?? "?"}, ` +
      `completion_tokens=${completionTokens ?? "?"}, reasoning_tokens=${reasoningTokens ?? "?"}). ` +
      `If using a reasoning model, raise max_tokens or set a non-reasoning model.`,
  );
}

export async function embed(input: string, retries = 3): Promise<number[]> {
  const ep = getEndpoint("embed");
  const model = getEmbedModel();
  const expectedDim = getEmbeddingDim();
  const dimensions = getEmbedDimensions();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${ep.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ep.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input,
          // MRL truncation for Qwen3-VL-Embedding (2048 native -> 1024 here).
          // Omitted unless EMBED_DIMENSIONS is set: LM Studio rejects it.
          ...(dimensions ? { dimensions } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        throw new Error(
          `Embedding failed: ${response.status} [endpoint=${ep.baseUrl}, model=${model}] - ${error}`,
        );
      }

      const data = await response.json();
      const vector = data?.data?.[0]?.embedding;
      if (!Array.isArray(vector)) {
        throw new Error("Invalid embedding response structure");
      }

      // Client-side Matryoshka truncation. Servers without MRL support (LM
      // Studio / llama.cpp) ignore or reject the `dimensions` parameter and
      // hand back the model's native width -- 2048 for Qwen3-VL-Embedding,
      // which neither fits vector(1024) nor can be HNSW-indexed (pgvector caps
      // that at 2000). Truncating and re-normalizing here is exactly what MRL
      // prescribes, so the result matches what the server would have returned.
      if (vector.length > expectedDim) {
        const head = vector.slice(0, expectedDim) as number[];
        let norm = 0;
        for (const x of head) norm += x * x;
        norm = Math.sqrt(norm);
        if (norm > 0) for (let i = 0; i < head.length; i++) head[i] /= norm;
        console.log(`[ai] MRL-truncated embedding ${vector.length} -> ${expectedDim}`);
        return head;
      }

      // Fatal, not a warning. LM Studio's /v1/embeddings ignores the `model`
      // field entirely -- a bogus name returns whatever embedding model happens
      // to be loaded -- so a short vector means we silently got the wrong model.
      // Storing those would poison the index with vectors from a different
      // space, which is far worse than failing the request.
      if (vector.length !== expectedDim) {
        throw new Error(
          `Embedding width ${vector.length} != EMBEDDING_DIM ${expectedDim} ` +
            `[endpoint=${ep.baseUrl}, requested model=${model}]. The server likely ` +
            `served a different model than requested. Refusing to store vectors ` +
            `from an unknown embedding space.`,
        );
      }
      return vector;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  throw new Error("Failed to generate embedding after retries");
}

export interface RerankHit {
  /** Index into the `documents` array that was passed in. */
  index: number;
  score: number;
}

/**
 * Cross-encoder reranking over the vector-search candidates.
 *
 * Targets the Jina/Cohere-compatible `/rerank` route that vLLM exposes for
 * scoring models (Qwen3-VL-Reranker-2B). Returns hits ordered best-first.
 *
 * Callers should treat a throw as non-fatal and fall back to vector order --
 * a reranker being down should degrade result quality, not break retrieval.
 */
export async function rerank(
  query: string,
  documents: string[],
  options: { topN?: number; signal?: AbortSignal } = {},
): Promise<RerankHit[]> {
  if (documents.length === 0) return [];

  const ep = getEndpoint("rerank");
  const model = getRerankModel();
  if (!model) throw new Error("RERANK_MODEL is not set");

  const body: Record<string, unknown> = { model, query, documents };
  if (options.topN !== undefined) body.top_n = options.topN;

  const res = await fetch(`${ep.baseUrl}/rerank`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ep.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    throw new Error(
      `Rerank failed (${res.status}) [endpoint=${ep.baseUrl}, model=${model}]: ${await res.text()}`,
    );
  }

  const data = await res.json();
  const rows = Array.isArray(data?.results) ? data.results : data?.data;
  if (!Array.isArray(rows)) {
    throw new Error("Rerank response had no results array");
  }

  return rows
    .map((r: Record<string, unknown>) => ({
      index: Number(r.index),
      // vLLM reports relevance_score; other servers use score.
      score: Number(r.relevance_score ?? r.score ?? 0),
    }))
    .filter((h: RerankHit) => Number.isInteger(h.index) && h.index >= 0 && h.index < documents.length)
    .sort((a: RerankHit, b: RerankHit) => b.score - a.score);
}

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string,
): Promise<string> {
  const backend = env("AUDIO_BACKEND") ?? "disabled";

  if (backend === "disabled") {
    throw new Error(
      "Audio transcription is disabled (AUDIO_BACKEND=disabled). " +
        "Load a Whisper model in LM Studio and set AUDIO_BACKEND=whisper.",
    );
  }

  if (backend === "whisper") {
    const ep = getEndpoint("audio");
    // The transcriptions path below appends an explicit /v1.
    const whisperBase = ep.baseUrl.replace(/\/v1\/?$/, "");
    const model = env("WHISPER_MODEL") ?? "whisper-1";

    const binary = Uint8Array.from(atob(base64Audio), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new Blob([binary], { type: mimeType }), "audio.bin");
    form.append("model", model);

    const res = await fetch(`${whisperBase}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ep.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Whisper transcription failed (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    const text = data?.text?.trim();
    if (!text) throw new Error("Whisper returned empty transcription");
    return text;
  }

  throw new Error(`Unknown AUDIO_BACKEND: ${backend}`);
}
