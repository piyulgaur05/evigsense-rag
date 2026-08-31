import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  FileSignature,
  FileText,
  FolderTree,
  Languages,
  MessagesSquare,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatusSlice = { name: string; value: number; color: string };
type TrendPoint = { date: string; questions: number };
type RecentDoc = { id: string; title: string; status: string | null; created_at: string };

const STATUS_COLORS: Record<string, string> = {
  active: "hsl(var(--chart-1))",
  draft: "hsl(var(--chart-4))",
  archived: "hsl(var(--chart-3))",
};
const STATUS_FALLBACK = "hsl(var(--chart-5))";

/** Only these routes exist. Anything else sends people to the 404. */
const quickActions = [
  { label: "Upload a file", icon: Upload, to: "/documents" },
  { label: "Ask the assistant", icon: MessagesSquare, to: "/assistant" },
  { label: "Browse files", icon: FolderTree, to: "/document-management" },
  { label: "Translate", icon: Languages, to: "/translation-markdown" },
];

const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<number | null>(null);
  const [chunks, setChunks] = useState<number | null>(null);
  const [questions, setQuestions] = useState<number | null>(null);
  const [pendingSignatures, setPendingSignatures] = useState<number | null>(null);
  const [queued, setQueued] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const [byStatus, setByStatus] = useState<StatusSlice[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [recent, setRecent] = useState<RecentDoc[]>([]);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);

    // One round of independent reads. Each is allowed to fail on its own so a
    // single missing table or policy leaves one tile blank instead of blanking
    // the page.
    const [docCount, chunkCount, statusRows, recentRows, queryRows, sigCount, queueRows] =
      await Promise.allSettled([
        supabase.from("documents").select("*", { count: "exact", head: true }),
        supabase.from("document_chunks").select("*", { count: "exact", head: true }),
        supabase.from("documents").select("status"),
        supabase
          .from("documents")
          .select("id, title, status, created_at")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase.from("analytics_queries").select("created_at").gte("created_at", since.toISOString()),
        supabase
          .from("document_signers")
          .select("*", { count: "exact", head: true })
          .or(`signer_user_id.eq.${user.id},signer_email.eq.${user.email}`)
          .eq("status", "pending"),
        supabase.from("document_processing_queue").select("status"),
      ]);

    const ok = <T,>(r: PromiseSettledResult<T>): T | null =>
      r.status === "fulfilled" ? r.value : null;

    setDocuments(ok(docCount)?.count ?? null);
    setChunks(ok(chunkCount)?.count ?? null);
    setPendingSignatures(ok(sigCount)?.count ?? null);

    // The headline count comes from the exact head query above, so it stays
    // right even when this row fetch is capped by PostgREST's row limit.
    const statuses = ok(statusRows)?.data ?? [];
    const grouped = statuses.reduce<Record<string, number>>((acc, row) => {
      const key = row.status || "draft";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    setByStatus(
      Object.entries(grouped)
        .map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value,
          color: STATUS_COLORS[name] ?? STATUS_FALLBACK,
        }))
        .sort((a, b) => b.value - a.value),
    );

    setRecent((ok(recentRows)?.data as RecentDoc[]) ?? []);

    const queries = ok(queryRows)?.data ?? [];
    setQuestions(queries.length);
    const days: TrendPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      days.push({
        date: dayLabel(day),
        questions: queries.filter(
          (q) => new Date(q.created_at).toDateString() === day.toDateString(),
        ).length,
      });
    }
    setTrend(days);

    const queue = ok(queueRows)?.data ?? [];
    setQueued(queue.filter((q) => q.status === "pending" || q.status === "processing").length);
    setFailed(queue.filter((q) => q.status === "failed").length);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        navigate("/auth", { replace: true });
        return;
      }
      try {
        await load();
      } catch (error) {
        console.error("Error loading dashboard:", error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load, navigate]);

  const statusTotal = byStatus.reduce((sum, s) => sum + s.value, 0);

  const stats = [
    { label: "Files", value: documents, note: "in your library" },
    { label: "Indexed", value: chunks, note: "chunks embedded", machine: true },
    { label: "Questions", value: questions, note: "asked this week" },
    {
      label: "Signatures",
      value: pendingSignatures,
      note: "awaiting you",
      urgent: (pendingSignatures ?? 0) > 0,
    },
  ];

  return (
    <Layout>
      <div className="px-5 py-8 sm:px-8">
        {/* Header */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-[2rem] text-foreground">Your archive</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              What is in it, what is still processing, and what needs you.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickActions.map((a) => (
              <Button key={a.to} variant="outline" size="sm" onClick={() => navigate(a.to)}>
                <a.icon className="mr-2 h-4 w-4" />
                {a.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-card p-5">
              <p
                className={cn(
                  "font-mono text-[11px] uppercase tracking-[0.16em]",
                  s.machine ? "text-signal" : "text-muted-foreground",
                )}
              >
                {s.label}
              </p>
              {loading ? (
                <Skeleton className="mt-3 h-9 w-20" />
              ) : (
                <p
                  className={cn(
                    "mt-2 font-mono text-[2rem] leading-none tabular-nums",
                    s.urgent ? "text-signal" : "text-foreground",
                  )}
                >
                  {s.value === null ? "—" : s.value.toLocaleString()}
                </p>
              )}
              <p className="mt-2 text-[13px] text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </div>

        {/* Processing band. Present only when there is something to say. */}
        {!loading && (queued !== null || failed !== null) && (
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/40 px-5 py-3.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              queue
            </span>
            {queued ? (
              <span className="font-mono text-[13px] text-foreground">
                <span className="text-signal">{queued}</span> processing
              </span>
            ) : (
              <span className="font-mono text-[13px] text-muted-foreground">nothing waiting</span>
            )}
            {!!failed && (
              <span className="font-mono text-[13px] text-destructive">{failed} failed</span>
            )}
          </div>
        )}

        {/* Charts */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-[15px] font-semibold text-foreground">Questions asked</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">The last seven days.</p>

            {loading ? (
              <Skeleton className="mt-5 h-[240px] w-full" />
            ) : (
              <div className="mt-5 h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                    <defs>
                      <linearGradient id="questionsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="hsl(var(--border))"
                      strokeDasharray="2 4"
                    />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip
                      cursor={{ stroke: "hsl(var(--border))" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="questions"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#questionsFill)"
                      dot={false}
                      activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-[15px] font-semibold text-foreground">Library status</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Files by current status.</p>

            {loading ? (
              <Skeleton className="mt-5 h-[240px] w-full" />
            ) : statusTotal === 0 ? (
              <p className="mt-8 text-[14px] text-muted-foreground">
                Nothing filed yet. Upload a document to start.
              </p>
            ) : (
              <>
                <div className="mt-5 flex h-2.5 gap-px overflow-hidden rounded-full">
                  {byStatus.map((s) => (
                    <div
                      key={s.name}
                      style={{
                        width: `${(s.value / statusTotal) * 100}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  ))}
                </div>

                <dl className="mt-5 divide-y divide-border">
                  {byStatus.map((s) => (
                    <div key={s.name} className="flex items-center gap-3 py-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <dt className="text-[14px] text-foreground">{s.name}</dt>
                      {/* Two aligned columns: the share reads as derived, the
                          count as the fact, and neither runs into the other. */}
                      <dd className="ml-auto flex items-baseline gap-4 font-mono text-[13px] tabular-nums">
                        <span className="w-9 text-right text-muted-foreground">
                          {Math.round((s.value / statusTotal) * 100)}%
                        </span>
                        <span className="w-12 text-right text-foreground">
                          {s.value.toLocaleString()}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </section>
        </div>

        {/* Recent files */}
        <section className="mt-6 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Recent files</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Your latest uploads.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/document-management")}>
              See all
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-px">
              {[0, 1, 2].map((i) => (
                <div key={i} className="px-5 py-4">
                  <Skeleton className="h-5 w-64" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="mt-3 text-[14px] text-muted-foreground">
                No files yet. Upload one and Jyoma will index it.
              </p>
              <Button className="mt-5" onClick={() => navigate("/documents")}>
                <Upload className="mr-2 h-4 w-4" />
                Upload a file
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/document-chat/${doc.id}`)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <FileText
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                    <span className="truncate text-[14px] text-foreground">{doc.title}</span>
                    <span className="ml-auto shrink-0 font-mono text-[12px] text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                    <span className="hidden shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground sm:inline">
                      {doc.status ?? "draft"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {stats.some((s) => s.urgent) && (
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-signal/40 bg-signal/10 px-5 py-4">
            <FileSignature className="h-4 w-4 shrink-0 text-foreground" strokeWidth={1.75} />
            <p className="text-[14px] text-foreground">
              {pendingSignatures} {pendingSignatures === 1 ? "file is" : "files are"} waiting for
              your signature.
            </p>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => navigate("/document-management")}
            >
              Review them
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
