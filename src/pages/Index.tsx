import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  AudioLines,
  FileSignature,
  Languages,
  MessagesSquare,
  PanelsTopLeft,
  Tags,
} from "lucide-react";
import { WORKFLOW_STEPS } from "@/features/procurement/lib/portals";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CitationTrace } from "@/components/landing/CitationTrace";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";

const perimeter = [
  { label: "model", value: "qwen3.5-35b · vllm + lm studio" },
  { label: "index", value: "postgres + pgvector · your machine" },
  { label: "egress", value: "self-hosted endpoints only" },
];

/** A real sequence, which is why these are numbered. */
const pipeline = [
  {
    step: "01",
    title: "Ingest",
    body: "PDFs, Office files, images, audio and video go into a processing queue.",
    produces: "document",
  },
  {
    step: "02",
    title: "Read",
    body: "OCR turns scanned pages into Markdown, keeping tables and layout intact.",
    produces: "markdown",
  },
  {
    step: "03",
    title: "Index",
    body: "Text is split into chunks and embedded by the model running on your machine.",
    produces: "vectors",
  },
  {
    step: "04",
    title: "Answer",
    body: "Questions match against chunks. Every answer carries the page it came from.",
    produces: "citation",
  },
];

const capabilities = [
  {
    icon: MessagesSquare,
    title: "Ask across everything",
    body: "One question, answered from your whole library, with the source page and a relevance score attached to each claim.",
  },
  {
    icon: PanelsTopLeft,
    title: "Read alongside the answer",
    body: "Open a single document and chat beside it. Click a citation and the viewer jumps to that page.",
  },
  {
    icon: Languages,
    title: "Translate a document",
    body: "Turn a scan into Markdown, translate it to English, Russian or French, and compare the two side by side.",
  },
  {
    icon: AudioLines,
    title: "Transcribe recordings",
    body: "Audio and video are transcribed on upload, then searched and cited like any other document.",
  },
  {
    icon: FileSignature,
    title: "Collect signatures",
    body: "Send a signing request, capture a drawn or typed signature, and append a signature page to the PDF.",
  },
  {
    icon: Tags,
    title: "Keep it organised",
    body: "Metadata fields, templates and taxonomies, plus rules that tag and file documents as they arrive.",
  },
];

const governance = [
  { term: "Roles", detail: "Admin, contributor and reader, enforced in the database." },
  { term: "Sensitivity", detail: "Per-document levels that control who can open what." },
  { term: "Folders", detail: "Access granted per folder, inherited by everything inside." },
  { term: "Audit log", detail: "Every view, edit, download and signature, recorded." },
];

const Index = () => {
  const navigate = useNavigate();
  // getSession() reads the cached session with no network round trip, so hold
  // the first paint until it resolves. Rendering first made signed-in users
  // watch the landing page flash before the redirect.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (data.session) navigate("/dashboard", { replace: true });
        else setChecking(false);
      })
      .catch(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  if (checking) return null;

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.08fr] lg:gap-14">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Offline document intelligence
              </p>

              <h1 className="font-display mt-5 text-[clamp(2.35rem,4.6vw,3.5rem)] text-foreground">
                Ask your archive.
                <br />
                Nothing leaves
                <br />
                the building.
              </h1>

              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                Jyoma reads your documents, answers questions about them, and shows you the page
                it read. The model runs on your hardware and the index sits in your own database.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/auth">
                    Sign in
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <a href="#pipeline">How it works</a>
                </Button>
              </div>
            </div>

            <CitationTrace />
          </div>
        </section>

        {/* Perimeter */}
        <section className="border-y border-border bg-ink text-ink-foreground">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
              <div>
                <h2 className="font-display text-[clamp(1.7rem,3.2vw,2.4rem)]">
                  There is no cloud tier.
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-ink-foreground/70">
                  Every document, every embedding and every answer stays inside your network.
                  Nothing is sent to an external model provider, because there is no external
                  model provider to send it to.
                </p>
              </div>

              <dl className="self-center divide-y divide-white/10 border-y border-white/10">
                {perimeter.map((row) => (
                  <div key={row.label} className="flex items-baseline gap-6 py-4">
                    <dt className="w-20 shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
                      {row.label}
                    </dt>
                    <dd className="font-mono text-[13px] text-ink-foreground/90">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section id="pipeline" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <h2 className="font-display max-w-lg text-[clamp(1.8rem,3.6vw,2.6rem)] text-foreground">
              What happens to a document
            </h2>
            <p className="mt-4 max-w-md text-[15px] text-muted-foreground">
              Four steps, in order, each producing something the next one needs.
            </p>

            <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {pipeline.map((s) => (
                <li key={s.step} className="flex flex-col bg-card p-6">
                  <span className="font-mono text-[11px] tracking-[0.16em] text-signal">
                    {s.step}
                  </span>
                  <h3 className="font-display mt-3 text-xl text-foreground">{s.title}</h3>
                  <p className="mt-2.5 flex-1 text-[14px] leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                  <p className="mt-5 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
                    produces <span className="text-foreground">{s.produces}</span>
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="scroll-mt-20 border-t border-border bg-muted/30">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <h2 className="font-display max-w-xl text-[clamp(1.8rem,3.6vw,2.6rem)] text-foreground">
              What you can do with it
            </h2>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((c) => (
                <div
                  key={c.title}
                  className="rounded-lg border border-border bg-card p-6 shadow-paper transition-shadow duration-200 hover:shadow-lift"
                >
                  <c.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                  <h3 className="mt-4 text-[15px] font-semibold text-foreground">{c.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Governance */}
        <section id="governance" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-16">
              <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] text-foreground">
                Who saw what, and when
              </h2>

              <dl className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
                {governance.map((g) => (
                  <div key={g.term}>
                    <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
                      {g.term}
                    </dt>
                    <dd className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                      {g.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Procurement portal — the second way in. Deliberately its own band:
            different people, different sign-in, different product. */}
        <section id="procurement" className="scroll-mt-20 border-t border-border bg-ink text-ink-foreground">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,28rem)_1fr] lg:gap-16">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
                  procurement portal
                </p>
                <h2 className="font-display mt-5 text-[clamp(1.8rem,3.6vw,2.6rem)]">
                  A separate desk for buying things.
                </h2>
                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-foreground/70">
                  Requisition, budget clearance, tender, evaluation, committee, negotiation,
                  order, receipt, payment. Ten desks and one case file, with every decision
                  signed, timed and attributed.
                </p>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-foreground/70">
                  It runs on the same machine, the same database and the same document pipeline —
                  anything filed against a case is read, indexed and answerable like everything
                  else in the archive.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg">
                    <Link to="/procurement/sign-in">
                      Enter the procurement portal
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
                <p className="mt-4 font-mono text-[11px] text-ink-foreground/50">
                  separate sign-in · role decides the desk
                </p>
              </div>

              <ol className="grid gap-px self-start overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2">
                {WORKFLOW_STEPS.map((step) => (
                  <li key={step.step} className="bg-ink px-5 py-4">
                    <span className="font-mono text-[11px] tabular-nums text-signal">
                      {String(step.step).padStart(2, "0")}
                    </span>
                    <p className="mt-1.5 text-[14px] text-ink-foreground">{step.name}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-foreground/55">
                      {step.role}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Close */}
        <section className="border-t border-border bg-muted/30">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-16 sm:flex-row sm:items-center sm:px-8">
            <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] text-foreground">
              Open your archive.
            </h2>
            <div className="flex flex-wrap gap-3 sm:ml-auto">
              <Button asChild size="lg" variant="outline">
                <Link to="/procurement/sign-in">Procurement portal</Link>
              </Button>
              <Button asChild size="lg">
                <Link to="/auth">
                  Sign in
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
};

export default Index;
