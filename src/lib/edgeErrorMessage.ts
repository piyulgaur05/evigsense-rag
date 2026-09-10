/**
 * supabase-js collapses any non-2xx edge function response into the useless
 * "Edge Function returned a non-2xx status code". The real cause is in the
 * response body, which is still readable through `error.context`.
 */
export async function edgeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const res = (error as { context?: Response })?.context;
  if (res && typeof res.clone === "function") {
    try {
      const body = await res.clone().json();
      const detail = body?.details ?? body?.error;
      if (detail) return String(detail);
    } catch {
      try {
        const text = (await res.clone().text()).trim();
        if (text) return text.slice(0, 500);
      } catch {
        /* body already consumed */
      }
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
