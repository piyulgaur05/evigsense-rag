import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { Loader2, FileText, Languages, Download, Columns, ScanText, AlertCircle, X, Check, ChevronsUpDown, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownViewer } from "@/components/translation-markdown/MarkdownViewer";
import { SideBySideView } from "@/components/translation-markdown/SideBySideView";
import { CollaboraEditor } from "@/components/translation-markdown/CollaboraEditor";
import { buildTranslatedHtml } from "@/lib/markdownToHtml";
import {
  generateOCRMarkdown,
  translateMarkdown,
  loadDocumentMarkdown,
  downloadTranslatedMarkdown,
  detectAndDescribeVisualBlocks,
} from "@/lib/translationMarkdown";

interface DocOption {
  id: string;
  title: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
}

type Status = "idle" | "running" | "done" | "error";

export default function TranslationMarkdown() {
  const [searchParams] = useSearchParams();
  const initialDocId = searchParams.get("documentId") ?? "";
  const initialAction = searchParams.get("action") ?? "";

  const [docs, setDocs] = useState<DocOption[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocId);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [targetLang, setTargetLang] = useState<string>("English");
  const [ocrMd, setOcrMd] = useState<string>("");
  const [translatedMd, setTranslatedMd] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [tab, setTab] = useState<string>("original");
  const [sideBySideOpen, setSideBySideOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorHtml, setEditorHtml] = useState<string>("");
  // Set once the document has an editable .docx — from then on the .docx is
  // the source of truth and translatedMd is only the pre-edit source.
  const [docxPath, setDocxPath] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [ocrStatus, setOcrStatus] = useState<Status>("idle");
  const [translateStatus, setTranslateStatus] = useState<Status>("idle");
  const [indexStatus, setIndexStatus] = useState<Status>("idle");
  
  const [translationProgress, setTranslationProgress] = useState<string>("");
  const [ocrProgress, setOcrProgress] = useState<string>("");
  const [ocrError, setOcrError] = useState<string>("");
  const [translateError, setTranslateError] = useState<string>("");
  const [loadingDocs, setLoadingDocs] = useState(true);
  const autoRanRef = useRef(false);

  const selectedDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId) ?? null,
    [docs, selectedDocId],
  );

  // Load documents
  useEffect(() => {
    (async () => {
      setLoadingDocs(true);
      const { data, error } = await supabase
        .from("documents")
        .select("id,title,original_filename,storage_path,mime_type")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        toast.error("Failed to load documents");
      } else {
        setDocs((data as DocOption[]) ?? []);
      }
      setLoadingDocs(false);
    })();
  }, []);

  // When document changes, reset state and load any cached markdown + signed URL
  useEffect(() => {
    setOcrMd("");
    setTranslatedMd("");
    setPdfUrl("");
    setOcrError("");
    setTranslateError("");
    setTranslationProgress("");
    setOcrStatus("idle");
    setTranslateStatus("idle");
    setDocxPath(null);
    if (!selectedDoc) return;

    (async () => {
      // Cached markdown
      try {
        const rec = await loadDocumentMarkdown(selectedDoc.id);
        if (rec?.ocr_markdown) {
          setOcrMd(rec.ocr_markdown);
          setOcrStatus("done");
        }
        if (rec?.translated_markdown) {
          setTranslatedMd(rec.translated_markdown);
          setTranslateStatus("done");
          if (rec.target_language) setTargetLang(rec.target_language);
        }
        const path = (rec as { docx_storage_path?: string | null } | null)?.docx_storage_path;
        if (path) setDocxPath(path);
      } catch (_e) {
        // ignore
      }

      // Signed URL for original (PDF preview)
      try {
        const { data } = await supabase.storage
          .from("documents")
          .createSignedUrl(selectedDoc.storage_path, 3600);
        if (data?.signedUrl) setPdfUrl(data.signedUrl);
      } catch (_e) {
        // ignore
      }
    })();
  }, [selectedDoc]);

  const handleIndexForChat = async (docId?: string, opts?: { silent?: boolean }) => {
    const id = docId ?? selectedDoc?.id;
    if (!id) return;
    setIndexStatus("running");
    try {
      const { data, error } = await supabase.functions.invoke("embed-markdown", {
        body: { documentId: id, source: "ocr" },
      });
      if (error) throw error;
      setIndexStatus("done");
      if (!opts?.silent) {
        toast.success(`Indexed for chat (${data?.chunks ?? 0} chunks). Images will appear in answers.`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setIndexStatus("error");
      if (!opts?.silent) toast.error("Indexing failed: " + msg);
      else console.error("Auto-index failed:", msg);
    }
  };

  const handleGenerateOCR = async () => {
    if (!selectedDoc) {
      toast.error("Select a document first");
      return;
    }
    setOcrStatus("running");
    setOcrError("");
    setOcrProgress("Preparing document…");
    try {
      const { markdown, imageCount } = await generateOCRMarkdown(selectedDoc.id, {
        onProgress: ({ current, total, phase }) => {
          if (phase === "preparing") setOcrProgress("Preparing document…");
          else if (phase === "rendering") setOcrProgress(`Rendering page ${current} of ${total}…`);
          else if (phase === "ocr") setOcrProgress(`Reading page ${current} of ${total}…`);
          else if (phase === "saving") setOcrProgress("Saving OCR markdown…");
        },
      });
      const enriched = detectAndDescribeVisualBlocks(markdown);
      setOcrMd(enriched);
      setOcrStatus("done");
      setOcrProgress("");
      setTab("ocr");
      toast.success(
        imageCount > 0
          ? `OCR Markdown generated (${imageCount} image${imageCount === 1 ? "" : "s"} extracted)`
          : "OCR Markdown generated",
      );
      handleIndexForChat(selectedDoc.id, { silent: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setOcrError(msg);
      setOcrStatus("error");
      setOcrProgress("");
      toast.error("OCR failed: " + msg);
    }
  };

  const handleTranslate = async () => {
    if (!selectedDoc) {
      toast.error("Select a document first");
      return;
    }
    if (!ocrMd) {
      toast.error("Generate OCR Markdown first");
      return;
    }
    setTranslateStatus("running");
    setTranslateError("");
    setTranslationProgress("");
    try {
      const md = await translateMarkdown(selectedDoc.id, targetLang, ocrMd, {
        onProgress: ({ current, total, phase }) => {
          setTranslationProgress(
            phase === "saving"
              ? "Saving translated Markdown…"
              : `Translating page ${current} of ${total}…`,
          );
        },
      });
      setTranslatedMd(md);
      setTranslateStatus("done");
      setTranslationProgress("");
      setTab("translated");
      toast.success("Translation complete");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setTranslateError(msg);
      setTranslateStatus("error");
      setTranslationProgress("");
      toast.error("Translation failed: " + msg);
    }
  };

  /** Builds the styled HTML used both to seed the .docx and to export PDF. */
  const buildHtml = async () =>
    buildTranslatedHtml(translatedMd, {
      title: selectedDoc?.title || selectedDoc?.original_filename || "Translated document",
      subtitle: `Translated to ${targetLang} · ${new Date().toLocaleString()}`,
    });

  const handleOpenEditor = async () => {
    if (!translatedMd && !docxPath) {
      toast.error("Translate the document first");
      return;
    }
    try {
      // Only needed for the first open; the seed route ignores it once a
      // .docx exists, so edits are never clobbered.
      setEditorHtml(docxPath ? "" : await buildHtml());
      setEditorOpen(true);
    } catch (e: unknown) {
      toast.error("Could not prepare document: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  /** Downloads the edited .docx when one exists, else the raw markdown. */
  const handleDownload = async () => {
    const base = selectedDoc?.title || "translated";

    if (docxPath) {
      const { data, error } = await supabase.storage
        .from("translations")
        .createSignedUrl(docxPath, 600, { download: `${base}.${targetLang}.docx` });
      if (error || !data?.signedUrl) {
        toast.error("Could not download document: " + (error?.message ?? "no URL"));
        return;
      }
      window.open(data.signedUrl, "_blank");
      return;
    }

    if (!translatedMd) {
      toast.error("Nothing to download yet");
      return;
    }
    downloadTranslatedMarkdown(`${base}.${targetLang}.md`, translatedMd);
  };

  const handleExportPdf = async () => {
    if (!translatedMd && !docxPath) {
      toast.error("Translate first to export PDF");
      return;
    }
    setExportingPdf(true);
    try {
      // Once an edited .docx exists it is the source of truth, so render the
      // PDF from it via Collabora rather than from the stale markdown.
      if (docxPath && selectedDoc) {
        const { data, error } = await supabase.functions.invoke("wopi-host", {
          body: { mode: "convert", documentId: selectedDoc.id, format: "pdf" },
        });
        if (error) throw new Error(error.message || "PDF conversion failed");
        if (data?.error) throw new Error(data.details || data.error);
        if (!data?.storagePath) throw new Error("No PDF produced");

        // Sign here rather than in the edge function: the function's
        // SUPABASE_URL is the internal kong host, unreachable from the browser.
        const base = selectedDoc.title || "translated";
        const { data: signed, error: signErr } = await supabase.storage
          .from("translations")
          .createSignedUrl(data.storagePath, 600, { download: `${base}.${targetLang}.pdf` });
        if (signErr || !signed?.signedUrl) {
          throw new Error(signErr?.message || "Could not create download link");
        }
        window.open(signed.signedUrl, "_blank");
        toast.success("PDF ready");
        return;
      }

      const doc = await buildTranslatedHtml(translatedMd, {
        title: selectedDoc?.title || selectedDoc?.original_filename || "Translated document",
        subtitle: `Translated to ${targetLang} · Exported ${new Date().toLocaleString()}`,
        printOnLoad: true,
      });
      const win = window.open("", "_blank");
      if (!win) {
        toast.error("Popup blocked — allow popups to export PDF");
        return;
      }
      win.document.open();
      win.document.write(doc);
      win.document.close();
      toast.success("Opening print dialog — choose 'Save as PDF'");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("PDF export failed: " + msg);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSideBySide = () => {
    if (!translatedMd) {
      toast.error("Translate first to view side by side");
      return;
    }
    setSideBySideOpen(true);
  };


  // Auto-run action from URL params (?action=ocr|translate|side-by-side)
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!initialAction || !selectedDoc) return;
    if (loadingDocs) return;

    if (initialAction === "side-by-side") {
      if (ocrMd && translatedMd) {
        autoRanRef.current = true;
        setSideBySideOpen(true);
      }
      return;
    }

    if (initialAction === "ocr" && ocrStatus === "idle") {
      autoRanRef.current = true;
      handleGenerateOCR();
      return;
    }

    if (initialAction === "translate") {
      if (ocrMd && translateStatus === "idle") {
        autoRanRef.current = true;
        handleTranslate();
      } else if (!ocrMd && ocrStatus === "idle") {
        // OCR not yet generated — switch to OCR tab so user can generate first
        autoRanRef.current = true;
        setTab("ocr");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc, loadingDocs, ocrMd, translatedMd, ocrStatus, translateStatus, initialAction]);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 w-full h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex items-center gap-3">
          <Languages className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Translation Markdown</h1>
            <p className="text-sm text-muted-foreground">
              Generate OCR Markdown from a document, translate it, and view side by side.
            </p>
          </div>
        </div>

        {/* Controls */}
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Document
              </label>
              <Popover open={docPickerOpen} onOpenChange={setDocPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={loadingDocs}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedDoc
                        ? selectedDoc.title || selectedDoc.original_filename
                        : loadingDocs
                          ? "Loading…"
                          : "Select a document"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Search documents…" />
                    <CommandList>
                      <CommandEmpty>No documents found.</CommandEmpty>
                      <CommandGroup>
                        {docs.map((d) => {
                          const label = d.title || d.original_filename;
                          return (
                            <CommandItem
                              key={d.id}
                              value={`${label} ${d.original_filename}`}
                              onSelect={() => {
                                setSelectedDocId(d.id);
                                setDocPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedDocId === d.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span className="truncate">{label}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="md:col-span-3">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Target language
              </label>
              <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Russian">Russian</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerateOCR} disabled={!selectedDoc || ocrStatus === "running"}>
              {ocrStatus === "running" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ScanText />
              )}
              {ocrStatus === "running" ? "Generating OCR Markdown…" : "Generate OCR Markdown"}
            </Button>
            <Button
              onClick={handleTranslate}
              disabled={!ocrMd || translateStatus === "running"}
              variant="secondary"
            >
              {translateStatus === "running" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Languages />
              )}
              {translateStatus === "running" ? "Translating document…" : "Translate Markdown"}
            </Button>
            <Button onClick={handleSideBySide} variant="outline" disabled={!translatedMd}>
              <Columns /> View Side by Side
            </Button>
            <Button
              onClick={handleOpenEditor}
              variant="secondary"
              disabled={!translatedMd && !docxPath}
            >
              <PenLine />
              {docxPath ? "Edit Document" : "Create Editable Document"}
            </Button>
            <Button
              onClick={handleDownload}
              variant="outline"
              disabled={!translatedMd && !docxPath}
            >
              <Download />
              {docxPath ? "Download Word Document" : "Download Translated Markdown"}
            </Button>
            <Button
              onClick={handleExportPdf}
              variant="outline"
              disabled={(!translatedMd && !docxPath) || exportingPdf}
            >
              {exportingPdf ? <Loader2 className="animate-spin" /> : <FileText />}
              {exportingPdf ? "Building PDF…" : "Export to PDF"}
            </Button>
          </div>

          {ocrStatus === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>OCR failed</AlertTitle>
              <AlertDescription>{ocrError}</AlertDescription>
            </Alert>
          )}
          {translateStatus === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Translation failed</AlertTitle>
              <AlertDescription>{translateError}</AlertDescription>
            </Alert>
          )}
        </Card>

        {/* Viewer */}
        <Card className="p-4 flex-1 min-h-0 flex flex-col">
          <Tabs value={tab} onValueChange={setTab} className="w-full flex-1 min-h-0 flex flex-col">
            <TabsList>
              <TabsTrigger value="original">
                <FileText className="h-4 w-4 mr-1" /> Original Document
              </TabsTrigger>
              <TabsTrigger value="ocr">OCR Markdown</TabsTrigger>
              <TabsTrigger value="translated">
                {docxPath ? "Translated (pre-edit source)" : "Translated Markdown"}
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 flex-1 min-h-0">
              <TabsContent value="original" className="h-full m-0">
                {!selectedDoc ? (
                  <EmptyState text="Select a document to begin." />
                ) : pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    title="Original document"
                    className="w-full h-full border rounded-lg bg-card"
                  />
                ) : (
                  <EmptyState text="Loading document preview…" />
                )}
              </TabsContent>

              <TabsContent value="ocr" className="h-full m-0">
                {ocrStatus === "running" ? (
                  <LoadingState text={ocrProgress || "Generating OCR Markdown…"} />
                ) : ocrMd ? (
                  <div className="h-full overflow-auto border rounded-lg bg-card p-6 md:p-8">
                    <MarkdownViewer content={ocrMd} className="max-w-4xl mx-auto" />
                  </div>
                ) : (
                  <EmptyState text='Click "Generate OCR Markdown" to extract structured Markdown from the document.' />
                )}
              </TabsContent>

              <TabsContent value="translated" className="h-full m-0">
                {translateStatus === "running" ? (
                  <LoadingState text={translationProgress || "Translating document…"} />
                ) : translatedMd ? (
                  <div className="h-full overflow-auto border rounded-lg bg-card p-6 md:p-8">
                    {docxPath && (
                      <Alert className="mb-6 max-w-4xl mx-auto">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>This is the pre-edit source</AlertTitle>
                        <AlertDescription>
                          An editable Word document exists for this translation and is now the
                          source of truth. Use “Edit Document” to see the current version — edits
                          made there are not reflected in the Markdown below.
                        </AlertDescription>
                      </Alert>
                    )}
                    <MarkdownViewer content={translatedMd} className="max-w-4xl mx-auto" />
                  </div>
                ) : (
                  <EmptyState text='Click "Translate Markdown" after generating OCR Markdown.' />
                )}
              </TabsContent>

            </div>
          </Tabs>
        </Card>
      </div>

      <Dialog open={sideBySideOpen} onOpenChange={setSideBySideOpen}>
        <DialogContent
          className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 border-0 flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
            <div className="flex items-center gap-2">
              <Columns className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">
                Side by Side — {selectedDoc?.title || selectedDoc?.original_filename || "Document"}
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSideBySideOpen(false)}>
              <X className="h-4 w-4 mr-1" /> Close
            </Button>
          </div>
          <div className="flex-1 min-h-0 p-3">
            {ocrMd && translatedMd ? (
              <SideBySideView
                leftLabel="OCR Markdown (original language)"
                rightLabel={`Translated (${targetLang})`}
                leftMarkdown={ocrMd}
                rightMarkdown={translatedMd}
              />
            ) : (
              <EmptyState text="Generate OCR and translation first to view side by side." />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          // Collabora saves on close; re-read so the docx path/version is current.
          if (!open && selectedDoc) {
            loadDocumentMarkdown(selectedDoc.id)
              .then((rec) => {
                const path = (rec as { docx_storage_path?: string | null } | null)
                  ?.docx_storage_path;
                if (path) setDocxPath(path);
              })
              .catch(() => {
                /* non-fatal */
              });
          }
        }}
      >
        <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 border-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
            <div className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">
                Edit — {selectedDoc?.title || selectedDoc?.original_filename || "Document"}
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>
              <X className="h-4 w-4 mr-1" /> Close
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            {editorOpen && selectedDoc ? (
              <CollaboraEditor documentId={selectedDoc.id} seedHtml={editorHtml} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground p-6 text-center">
      {text}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 border rounded-lg bg-card text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      {text}
    </div>
  );
}
