import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartPalette } from "./palette";

const AXIS_FONT = { fontSize: 11, fontFamily: "var(--font-mono, ui-monospace)" };

/** One tooltip shape for every chart, so a value reads the same everywhere. */
function ChartTooltip({
  active,
  payload,
  label,
  valueFormat,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  valueFormat?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lift">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {payload.map((item) => (
        <p key={item.name} className="mt-1 flex items-center gap-2 text-[12px] text-foreground">
          <span
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ background: item.color }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{item.name}</span>
          <span className="ml-auto font-mono tabular-nums">
            {valueFormat ? valueFormat(Number(item.value)) : String(item.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Magnitude by category — one series, so the bars carry no identity of their
 * own and need no legend. Values sit at the end of each bar rather than on an
 * axis nobody reads across.
 */
export function CategoryBars({
  data,
  valueFormat,
  height = 260,
}: {
  data: { name: string; value: number }[];
  valueFormat?: (value: number) => string;
  height?: number;
}) {
  const palette = useChartPalette();
  if (data.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Nothing to show yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke={palette.grid} />
        <XAxis type="number" domain={[0, "dataMax"]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tickLine={false}
          axisLine={false}
          tick={{ ...AXIS_FONT, fill: palette.axis }}
        />
        <Tooltip
          cursor={{ fill: palette.grid, fillOpacity: 0.4 }}
          content={<ChartTooltip valueFormat={valueFormat} />}
        />
        <Bar
          dataKey="value"
          name="Cases"
          fill={palette.magnitude}
          radius={[0, 4, 4, 0]}
          barSize={14}
        >
          <LabelList
            dataKey="value"
            position="right"
            fontSize={11}
            fill={palette.axis}
            formatter={(value: number) => (valueFormat ? valueFormat(value) : String(value))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Change over time, two series. Both are counts of the same thing, so they
 * share one axis — a second scale would let the picture say whatever the
 * scaling chose.
 */
export function FlowChart({
  data,
  height = 240,
}: {
  data: { month: string; opened: number; closed: number }[];
  height?: number;
}) {
  const palette = useChartPalette();
  if (data.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Nothing to show yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="opened-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.series[0]} stopOpacity={0.18} />
            <stop offset="100%" stopColor={palette.series[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={palette.grid} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ ...AXIS_FONT, fill: palette.axis }}
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tickLine={false}
          axisLine={false}
          tick={{ ...AXIS_FONT, fill: palette.axis }}
        />
        <Tooltip cursor={{ stroke: palette.axis, strokeWidth: 1 }} content={<ChartTooltip />} />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="square"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: palette.axis }}
        />
        <Area
          type="monotone"
          dataKey="opened"
          name="Opened"
          stroke={palette.series[0]}
          strokeWidth={2}
          fill="url(#opened-fill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: palette.surface }}
        />
        <Line
          type="monotone"
          dataKey="closed"
          name="Closed"
          stroke={palette.series[1]}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: palette.surface }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * A meter, not a chart: one measure against its own allowance. Used for budget
 * headroom and for time spent at a desk against that desk's timer.
 */
export function MeterRow({
  label,
  sublabel,
  value,
  limit,
  valueLabel,
  limitLabel,
}: {
  label: string;
  sublabel?: string;
  value: number;
  limit: number;
  valueLabel: string;
  limitLabel: string;
}) {
  const palette = useChartPalette();
  const ratio = limit > 0 ? Math.min(value / limit, 1) : 0;
  const over = limit > 0 && value > limit;

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] text-foreground">{label}</span>
        {sublabel && (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {sublabel}
          </span>
        )}
        <span className="ml-auto font-mono text-[12px] tabular-nums text-foreground">
          {valueLabel}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          of {limitLabel}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
        style={{ background: palette.track }}
        role="img"
        aria-label={`${label}: ${valueLabel} of ${limitLabel}`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(ratio * 100, value > 0 ? 2 : 0)}%`,
            background: over ? palette.breach : palette.magnitude,
          }}
        />
      </div>
    </div>
  );
}
