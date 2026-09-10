import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { BlockRenderer } from "./MarkdownViewer";
import { parseMarkdownBlocks, alignBlockPairs, MdBlock } from "@/lib/markdownBlocks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Copy, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Read-only side-by-side comparison of source and translated Markdown.
 * Editing lives in Collabora (see CollaboraEditor) — the .docx is the source
 * of truth once a document has been opened there.
 */
interface SideBySideViewProps {
  leftMarkdown: string;
  rightMarkdown: string;
  leftLabel?: string;
  rightLabel?: string;
}

const TRANSLATED_OFFSET_KEY = "sbs-translated-offset";
const STEP_PX = 8;
const MIN_OFFSET = -2000;
const MAX_OFFSET = 2000;

function readStoredOffset(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  const n = stored ? parseInt(stored, 10) : NaN;
  return Number.isFinite(n) ? Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, n)) : fallback;
}

export function SideBySideView({
  leftMarkdown,
  rightMarkdown,
  leftLabel,
  rightLabel,
}: SideBySideViewProps) {
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const leftRowsRef = useRef<HTMLDivElement[]>([]);
  const rightRowsRef = useRef<HTMLDivElement[]>([]);
  // Scrolling one pane sets the other pane's scrollTop programmatically, which
  // itself fires a "scroll" event on the destination. Suppress only that echo
  // (per side) rather than a single shared flag — a shared flag also swallows
  // the *source* pane's own subsequent scroll events during fast/continuous
  // wheel scrolling, so most of the motion never reached the other side.
  const suppressRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const suppressTimer = useRef<{ left: number | null; right: number | null }>({
    left: null,
    right: null,
  });
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [translatedOffset, setTranslatedOffset] = useState<number>(() =>
    readStoredOffset(TRANSLATED_OFFSET_KEY, 0),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(TRANSLATED_OFFSET_KEY, String(translatedOffset));
    } catch {
      /* ignore */
    }
  }, [translatedOffset]);

  const leftBlocks = useMemo(() => parseMarkdownBlocks(leftMarkdown), [leftMarkdown]);
  const rightBlocks = useMemo(() => parseMarkdownBlocks(rightMarkdown), [rightMarkdown]);
  const pairs = useMemo(() => alignBlockPairs(leftBlocks, rightBlocks), [leftBlocks, rightBlocks]);

  // Only trim trailing slots left over from a longer previous block list —
  // never blank-reset the array. A blank-reset here ran on every render
  // (selection, hover, offset drag, …), and a scroll event that lands in the
  // gap between that reset (render phase) and the row refs being reattached
  // (commit phase) would see an empty array and silently no-op the sync.
  if (leftRowsRef.current.length > pairs.length) leftRowsRef.current.length = pairs.length;
  if (rightRowsRef.current.length > pairs.length) rightRowsRef.current.length = pairs.length;

  const equalizingRef = useRef(false);
  const equalizeRafRef = useRef<number | null>(null);
  const equalizeRows = useCallback(() => {
    if (equalizingRef.current) return;
    equalizingRef.current = true;
    const left = leftRowsRef.current;
    const right = rightRowsRef.current;
    const len = Math.min(left.length, right.length);
    for (let i = 0; i < len; i++) {
      const l = left[i];
      const r = right[i];
      if (!l || !r) continue;
      l.style.minHeight = "";
      r.style.minHeight = "";
    }
    for (let i = 0; i < len; i++) {
      const l = left[i];
      const r = right[i];
      if (!l || !r) continue;
      const h = Math.max(l.getBoundingClientRect().height, r.getBoundingClientRect().height);
      l.style.minHeight = `${h}px`;
      r.style.minHeight = `${h}px`;
    }
    // Release on next frame so ResizeObserver re-entries triggered by our
    // own writes are ignored, preventing layout thrash / browser freeze.
    requestAnimationFrame(() => {
      equalizingRef.current = false;
    });
  }, []);

  const scheduleEqualize = useCallback(() => {
    if (equalizeRafRef.current != null) return;
    equalizeRafRef.current = requestAnimationFrame(() => {
      equalizeRafRef.current = null;
      equalizeRows();
    });
  }, [equalizeRows]);
  useEffect(() => {
    const raf = requestAnimationFrame(equalizeRows);
    const t = window.setTimeout(equalizeRows, 200);

    const ro = new ResizeObserver(() => {
      if (equalizingRef.current) return;
      scheduleEqualize();
    });
    [...leftRowsRef.current, ...rightRowsRef.current].forEach((el) => {
      if (el) ro.observe(el);
    });

    const onImg = () => scheduleEqualize();
    const imgs: HTMLImageElement[] = [];
    [...leftRowsRef.current, ...rightRowsRef.current].forEach((row) => {
      row?.querySelectorAll("img").forEach((img) => {
        if (!img.complete) {
          imgs.push(img);
          img.addEventListener("load", onImg);
          img.addEventListener("error", onImg);
        }
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      if (equalizeRafRef.current != null) cancelAnimationFrame(equalizeRafRef.current);
      equalizeRafRef.current = null;
      window.clearTimeout(t);
      ro.disconnect();
      imgs.forEach((img) => {
        img.removeEventListener("load", onImg);
        img.removeEventListener("error", onImg);
      });
    };
  }, [leftMarkdown, rightMarkdown, equalizeRows, scheduleEqualize]);

  const suppressEcho = (side: "left" | "right", durationMs = 150) => {
    suppressRef.current[side] = true;
    if (suppressTimer.current[side] != null) window.clearTimeout(suppressTimer.current[side]!);
    suppressTimer.current[side] = window.setTimeout(() => {
      suppressRef.current[side] = false;
      suppressTimer.current[side] = null;
    }, durationMs);
  };

  const setLeftRow = (idx: number) => (el: HTMLDivElement | null) => {
    if (el) leftRowsRef.current[idx] = el;
  };
  const setRightRow = (idx: number) => (el: HTMLDivElement | null) => {
    if (el) rightRowsRef.current[idx] = el;
  };

  const findTopVisibleIndex = (rows: HTMLDivElement[], container: HTMLElement) => {
    const containerTop = container.getBoundingClientRect().top;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      if (rect.bottom > containerTop + 4) return i;
    }
    return Math.max(0, rows.length - 1);
  };

  const syncScroll = useCallback((source: "left" | "right") => {
    if (suppressRef.current[source]) return;
    const dest: "left" | "right" = source === "left" ? "right" : "left";
    const srcContainer = source === "left" ? leftScrollRef.current : rightScrollRef.current;
    const dstContainer = source === "left" ? rightScrollRef.current : leftScrollRef.current;
    const srcRows = source === "left" ? leftRowsRef.current : rightRowsRef.current;
    const dstRows = source === "left" ? rightRowsRef.current : leftRowsRef.current;
    if (!srcContainer || !dstContainer) return;

    const idx = findTopVisibleIndex(srcRows, srcContainer);
    const srcRow = srcRows[idx];
    const dstRow = dstRows[idx];
    if (!srcRow || !dstRow) return;

    const srcContRect = srcContainer.getBoundingClientRect();
    const offsetWithinViewport = srcRow.getBoundingClientRect().top - srcContRect.top;

    // Measured via getBoundingClientRect (viewport space) on both ends, not
    // dstRow.offsetTop: the translated pane's offset control wraps its rows
    // in a translateY(...) div, which becomes their offsetParent, so
    // offsetTop silently drops the pane's own scroll/padding origin and the
    // two panes drift out of alignment by roughly the applied offset.
    const dstContRect = dstContainer.getBoundingClientRect();
    const dstRowOffsetFromContentTop =
      dstContainer.scrollTop + (dstRow.getBoundingClientRect().top - dstContRect.top);
    const nextTop = Math.max(0, dstRowOffsetFromContentTop - offsetWithinViewport);
    if (Math.abs(dstContainer.scrollTop - nextTop) < 1) return;
    suppressEcho(dest);
    dstContainer.scrollTop = nextTop;
  }, []);

  useEffect(() => {
    if (leftScrollRef.current) leftScrollRef.current.scrollTop = 0;
    if (rightScrollRef.current) rightScrollRef.current.scrollTop = 0;
    setSelectedIdx(null);
  }, [leftMarkdown, rightMarkdown]);

  const handleSelect = useCallback((idx: number) => {
    setSelectedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  const handleCopyRight = useCallback(
    async (idx: number) => {
      const block = rightBlocks[idx];
      if (!block) return;
      try {
        await navigator.clipboard.writeText(block.content ?? "");
        toast({ title: "Copied", description: "Translated block copied to clipboard." });
      } catch {
        toast({ title: "Copy failed", variant: "destructive" });
      }
    },
    [rightBlocks],
  );

  const adjustOffset = (delta: number) =>
    setTranslatedOffset((v) => Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, v + delta)));

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border rounded-md bg-card">
        <span className="text-xs font-medium text-muted-foreground">
          Translated pane offset
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => adjustOffset(-STEP_PX)}
          aria-label="Move translated up"
          className="h-7 px-2"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => adjustOffset(STEP_PX)}
          aria-label="Move translated down"
          className="h-7 px-2"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground w-14 text-center">
          {translatedOffset > 0 ? `+${translatedOffset}` : translatedOffset}px
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTranslatedOffset(0)}
          className="h-7 px-2 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Reset
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-h-0">
        <Pane
          label={leftLabel}
          scrollRef={leftScrollRef}
          onScroll={() => syncScroll("left")}
        >
          <BlockGrid
            pairs={pairs}
            side="left"
            setRowRef={setLeftRow}
            selectedIdx={selectedIdx}
            hoveredIdx={hoveredIdx}
            onSelect={handleSelect}
            onHover={setHoveredIdx}
          />
        </Pane>
        <Pane
          label={rightLabel}
          scrollRef={rightScrollRef}
          onScroll={() => syncScroll("right")}
        >
          <div style={{ transform: `translateY(${translatedOffset}px)` }}>
            <BlockGrid
              pairs={pairs}
              side="right"
              setRowRef={setRightRow}
              selectedIdx={selectedIdx}
              hoveredIdx={hoveredIdx}
              onSelect={handleSelect}
              onHover={setHoveredIdx}
              onCopy={handleCopyRight}
            />
          </div>
        </Pane>
      </div>
    </div>
  );
}

function Pane({
  label,
  scrollRef,
  onScroll,
  children,
}: {
  label?: string;
  scrollRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-card min-h-0">
      {label && (
        <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          {label}
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto p-4"
      >
        {children}
      </div>
    </div>
  );
}

function BlockGrid({
  pairs,
  side,
  setRowRef,
  selectedIdx,
  hoveredIdx,
  onSelect,
  onHover,
  onCopy,
}: {
  pairs: ReturnType<typeof alignBlockPairs>;
  side: "left" | "right";
  setRowRef: (idx: number) => (el: HTMLDivElement | null) => void;
  selectedIdx: number | null;
  hoveredIdx: number | null;
  onSelect: (idx: number) => void;
  onHover: (idx: number | null) => void;
  onCopy?: (idx: number) => void;
}) {
  return (
    <div className="space-y-2">
      {pairs.map(([l, r], i) => {
        const block = side === "left" ? l : r;
        const isSelected = selectedIdx === i;
        const isHovered = hoveredIdx === i && !isSelected;
        const showActions = side === "right" && isSelected;
        return (
          <div
            key={i}
            ref={setRowRef(i)}
            data-block-index={i}
            onClick={() => onSelect(i)}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
            className={cn(
              "scroll-mt-4 rounded-md border border-transparent px-3 py-2 transition-colors relative cursor-pointer",
              isSelected &&
                "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm",
              isHovered && "border-border bg-muted/40",
            )}
          >
            {isSelected && (
              <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-primary" />
            )}
            {showActions && (
              <div
                className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border bg-background/95 px-1 py-0.5 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onCopy?.(i)}
                  aria-label="Copy block"
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copy
                </Button>
              </div>
            )}
            <BlockRenderer block={block} />
          </div>
        );
      })}
    </div>
  );
}
