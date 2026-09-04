import type { Components } from "react-markdown";
import { MermaidDiagram, looksLikeMermaid } from "./MermaidDiagram";

/** Flattens a React child tree to plain text (code blocks arrive nested). */
export function childText(node: unknown): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childText).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? childText(props.children) : "";
}

/**
 * Renders Mermaid as a diagram wherever Markdown is displayed.
 *
 * Diagrams reach us two ways: a ```mermaid fence written by the assistant, and
 * a raw <pre> of Mermaid source emitted by OCR. Both arrive here as <pre>, so
 * one handler covers both. Anything else keeps normal code-block behaviour,
 * scrollable rather than bleeding off the page.
 */
export const mermaidComponents: Components = {
  pre: ({ children, ...props }) => {
    const text = childText(children);
    if (looksLikeMermaid(text)) return <MermaidDiagram source={text} />;
    return (
      <pre className="not-prose my-4 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed" {...props}>
        {children}
      </pre>
    );
  },
};
