import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Renders Mermaid source as an SVG diagram.
 *
 * Mermaid is imported lazily so its bundle stays out of the initial chunk and
 * is only fetched when a document actually contains a diagram. Everything is
 * bundled at build time — nothing comes from a CDN, so this still works on a
 * fully offline deployment.
 */

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => m.default);
  }
  return mermaidReady;
}

/**
 * Mermaid parses theme colors with khroma, which throws on anything that is
 * not a literal color — `hsl(var(--foreground))` included. So resolve the CSS
 * custom properties to concrete rgb() strings through the browser first.
 */
function resolveColor(expression: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = expression;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value && value !== "rgba(0, 0, 0, 0)" ? value : fallback;
}

function themeVariables() {
  return {
    background: "transparent",
    primaryColor: resolveColor("hsl(var(--muted))", "#eef1f6"),
    primaryTextColor: resolveColor("hsl(var(--foreground))", "#111827"),
    primaryBorderColor: resolveColor("hsl(var(--border))", "#c9d1dc"),
    lineColor: resolveColor("hsl(var(--muted-foreground))", "#64748b"),
    textColor: resolveColor("hsl(var(--foreground))", "#111827"),
    secondaryColor: resolveColor("hsl(var(--accent))", "#e2e8f0"),
    tertiaryColor: resolveColor("hsl(var(--card))", "#f8fafc"),
    nodeBorder: resolveColor("hsl(var(--border))", "#c9d1dc"),
    clusterBkg: "transparent",
    edgeLabelBackground: resolveColor("hsl(var(--background))", "#ffffff"),
  };
}

/**
 * OCR emits the whole graph on one line with `;` separators, which Mermaid
 * rejects. Split it back into one statement per line, but keep `;` that sit
 * inside a node label (`[...]`, `(...)`, `{...}`, or a quoted string).
 */
function normalizeSource(src: string): string {
  const text = src.trim();
  if (text.includes("\n")) return text;

  const lines: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "[" || ch === "(" || ch === "{") depth++;
    else if (ch === "]" || ch === ")" || ch === "}") depth = Math.max(0, depth - 1);

    if (ch === ";" && depth === 0) {
      lines.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) lines.push(current.trim());
  return lines.filter(Boolean).join("\n");
}

const MERMAID_HEADS =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|sankey-beta|xychart-beta|block-beta)\b/;

/** True when this text is plausibly a Mermaid diagram definition. */
export function looksLikeMermaid(text: string): boolean {
  return MERMAID_HEADS.test(text.trim());
}

export function MermaidDiagram({ source }: { source: string }) {
  const reactId = useId();
  const [svg, setSvg] = useState<string>("");
  const [failure, setFailure] = useState<string>("");
  const [showSource, setShowSource] = useState(false);
  // Bumped when the light/dark class flips, to re-render with new colors.
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((t) => t + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const code = normalizeSource(source);
    // Mermaid ids must be valid CSS selectors; useId() emits ":r0:".
    const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}-${themeTick}`;

    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "inherit",
          flowchart: { useMaxWidth: true, htmlLabels: true },
          themeVariables: themeVariables(),
        });
        return mermaid.render(renderId, code);
      })
      .then(({ svg: out }) => {
        if (!cancelled) {
          setSvg(out);
          setFailure("");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailure(e instanceof Error ? e.message : "Unknown error");
        // Mermaid leaves its measuring node behind when rendering throws.
        document.getElementById(`d${renderId}`)?.remove();
      });

    return () => {
      cancelled = true;
    };
  }, [source, reactId, themeTick]);

  if (failure) {
    // Unparseable source is still information — show it wrapped and readable
    // rather than as an unscrollable single line.
    return (
      <div className="not-prose my-4 rounded-md border border-border bg-muted/30 p-3">
        <div className="mb-1 text-xs font-semibold text-muted-foreground">
          Diagram source (could not be rendered)
        </div>
        <div className="mb-2 text-xs text-destructive/80">{failure}</div>
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/80">
          {normalizeSource(source)}
        </pre>
      </div>
    );
  }

  return (
    <div className="not-prose my-4 rounded-lg border border-border bg-card/40 p-4">
      {svg ? (
        <div
          className="flex justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
          // Mermaid output; securityLevel "strict" strips scripts and inline handlers.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="py-6 text-center text-sm text-muted-foreground">Rendering diagram…</div>
      )}

      <button
        type="button"
        onClick={() => setShowSource((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {showSource ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {showSource ? "Hide source" : "Show source"}
      </button>
      {showSource && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-xs text-foreground/80">
          {normalizeSource(source)}
        </pre>
      )}
    </div>
  );
}
