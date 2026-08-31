/**
 * Renders translated Markdown to a standalone, styled HTML document.
 *
 * Two consumers:
 *  - PDF export (browser print dialog) — pass `printOnLoad: true`
 *  - Collabora .docx seeding — LibreOffice imports HTML natively, so this is
 *    the bridge from the Markdown pipeline to an office document.
 */

export interface BuildHtmlOptions {
  /** Document title, shown in <title> and the page header. */
  title: string;
  /** Small line under the title (e.g. "Translated to English · <date>"). */
  subtitle?: string;
  /** Append a script that waits for images then opens the print dialog. */
  printOnLoad?: boolean;
}

const escapeText = (s: string) => s.replace(/[<>&]/g, "");

const DOCUMENT_CSS = `
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; line-height: 1.55; font-size: 12pt; }
  h1,h2,h3,h4 { page-break-after: avoid; margin-top: 1.2em; }
  h1 { font-size: 22pt; border-bottom: 1px solid #ddd; padding-bottom: .2em; }
  h2 { font-size: 17pt; }
  h3 { font-size: 14pt; }
  p, li { orphans: 3; widows: 3; }
  pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-wrap: break-word; white-space: pre-wrap; font-size: 10pt; page-break-inside: avoid; }
  code { background: #f6f8fa; padding: 1px 4px; border-radius: 3px; font-size: 10pt; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; vertical-align: top; font-size: 11pt; }
  th { background: #f3f4f6; }
  img { max-width: 100%; height: auto; page-break-inside: avoid; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: .25em 1em; color: #555; }
  a { color: #1d4ed8; text-decoration: none; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 1.5em 0; }
  header { margin-bottom: 1.5em; padding-bottom: .5em; border-bottom: 1px solid #eee; }
  header .title { font-size: 16pt; font-weight: 600; }
  header .meta { font-size: 10pt; color: #666; margin-top: 4px; }
`;

// Waits for images before printing so they aren't blank in the PDF.
const PRINT_SCRIPT = `
  (function(){
    var imgs = Array.from(document.images);
    var pending = imgs.filter(function(i){ return !i.complete; });
    if (pending.length === 0) { setTimeout(function(){ window.focus(); window.print(); }, 200); return; }
    var done = 0;
    pending.forEach(function(img){
      var fin = function(){ done++; if (done === pending.length) { setTimeout(function(){ window.focus(); window.print(); }, 200); } };
      img.addEventListener('load', fin);
      img.addEventListener('error', fin);
    });
  })();
`;

/** Converts Markdown to a full styled HTML document string. */
export async function buildTranslatedHtml(
  markdown: string,
  options: BuildHtmlOptions,
): Promise<string> {
  const [{ renderToStaticMarkup }, { default: ReactMarkdown }, { default: remarkGfm }, { default: rehypeRaw }] =
    await Promise.all([
      import("react-dom/server"),
      import("react-markdown"),
      import("remark-gfm"),
      import("rehype-raw"),
    ]);

  const { createElement } = await import("react");
  const body = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeRaw] }, markdown),
  );

  const title = escapeText(options.title);
  const subtitle = options.subtitle ? escapeText(options.subtitle) : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>${DOCUMENT_CSS}</style></head><body>
<header>
  <div class="title">${title}</div>
  ${subtitle ? `<div class="meta">${subtitle}</div>` : ""}
</header>
${body}
${options.printOnLoad ? `<script>${PRINT_SCRIPT}</script>` : ""}
</body></html>`;
}
