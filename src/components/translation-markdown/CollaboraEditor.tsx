import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeErrorMessage";

interface CollaboraEditorProps {
  documentId: string;
  /**
   * HTML rendering of the translated markdown, used to seed the .docx the
   * first time this document is opened. Ignored once a .docx exists.
   */
  seedHtml: string;
  onReady?: () => void;
}

/**
 * Embeds Collabora Online as the editor for a translated document.
 *
 * Three URLs are in play and they resolve in different places:
 *  - VITE_COLLABORA_URL     the BROWSER loads the editor from here (localhost:9980)
 *  - VITE_WOPI_HOST_BASE    the COLLABORA CONTAINER calls the WOPI host here, so it
 *                           must be container-reachable (kong:8000), not localhost
 *  - WOPISrc                an opaque string the browser only passes through
 */
export function CollaboraEditor({ documentId, seedHtml, onReady }: CollaboraEditorProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const formRef = useRef<HTMLFormElement>(null);
  const [frameConfig, setFrameConfig] = useState<{
    action: string;
    accessToken: string;
    accessTokenTtl: string;
  } | null>(null);

  const collaboraUrl = (import.meta.env.VITE_COLLABORA_URL ?? "http://localhost:9980").replace(/\/$/, "");
  const wopiHostBase = (import.meta.env.VITE_WOPI_HOST_BASE ?? "http://kong:8000").replace(/\/$/, "");

  const setup = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      // 1. Ensure a .docx exists (no-op once seeded — re-seeding would destroy edits).
      const { data: seeded, error: seedErr } = await supabase.functions.invoke("wopi-host", {
        body: { mode: "seed", documentId, html: seedHtml },
      });
      if (seedErr) throw new Error(await edgeErrorMessage(seedErr, "Failed to prepare document"));
      if (seeded?.error) throw new Error(seeded.details || seeded.error);

      // 2. Mint a scoped, short-lived WOPI token for this document.
      const { data: minted, error: mintErr } = await supabase.functions.invoke("wopi-host", {
        body: { mode: "mint", documentId },
      });
      if (mintErr) throw new Error(await edgeErrorMessage(mintErr, "Failed to authorize editor"));
      if (minted?.error) throw new Error(minted.details || minted.error);

      // 3. Ask Collabora which URL serves the Writer editor. This goes through
      //    the edge function: Collabora serves /hosting/discovery without CORS
      //    headers, so a direct browser fetch fails with "Failed to fetch".
      const { data: discovery, error: discErr } = await supabase.functions.invoke("wopi-host", {
        body: { mode: "discover", documentId },
      });
      if (discErr) throw new Error(await edgeErrorMessage(discErr, "Collabora is not reachable"));
      if (discovery?.error) throw new Error(discovery.details || discovery.error);
      // Re-base the advertised path onto the browser-facing Collabora URL.
      const urlsrc = `${collaboraUrl}${discovery.urlsrcPath}`;

      const wopiSrc = `${wopiHostBase}/functions/v1/wopi-host/files/${documentId}`;
      const separator = urlsrc.includes("?") ? "" : "?";
      setFrameConfig({
        action: `${urlsrc}${separator}WOPISrc=${encodeURIComponent(wopiSrc)}`,
        accessToken: minted.accessToken,
        accessTokenTtl: String(minted.accessTokenTtl),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }, [documentId, seedHtml, collaboraUrl, wopiHostBase]);

  useEffect(() => {
    setup();
  }, [setup]);

  // Submit as POST rather than setting iframe src, so the access token never
  // lands in browser history.
  useEffect(() => {
    if (frameConfig && formRef.current) formRef.current.submit();
  }, [frameConfig]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.startsWith(collaboraUrl)) return;
      try {
        const msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (msg?.MessageId === "App_LoadingStatus" && msg?.Values?.Status === "Document_Loaded") {
          setStatus("ready");
          onReady?.();
        }
      } catch {
        /* non-JSON frames are not ours */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [collaboraUrl, onReady]);

  if (status === "error") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Could not open the editor</AlertTitle>
        <AlertDescription className="break-words">{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="relative w-full h-full min-h-0">
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/80 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing document…
        </div>
      )}

      {frameConfig && (
        <form
          ref={formRef}
          action={frameConfig.action}
          method="post"
          target="collabora-frame"
          className="hidden"
        >
          <input type="hidden" name="access_token" value={frameConfig.accessToken} />
          <input type="hidden" name="access_token_ttl" value={frameConfig.accessTokenTtl} />
        </form>
      )}

      <iframe
        name="collabora-frame"
        title="Collabora editor"
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
