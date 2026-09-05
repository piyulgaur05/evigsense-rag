import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Chart colours, picked once and validated rather than eyeballed.
 *
 * Two series is the most any chart here carries, so the categorical set is two
 * hues: the product's own blue, and an ochre far enough from it to survive
 * protanopia and tritanopia (worst adjacent pair ΔE 26.5 in dark, 30.2 in
 * light — well above the 8 floor). Magnitude charts use the blue alone, since
 * a single series needs identity from its title, not from colour.
 *
 * The signal cyan is deliberately absent: index.css reserves it for values the
 * machine derived, and a bar chart of case counts is not that.
 */
export type ChartPalette = {
  series: [string, string];
  magnitude: string;
  track: string;
  grid: string;
  axis: string;
  breach: string;
  surface: string;
};

const LIGHT: ChartPalette = {
  series: ["#0f45b3", "#cf6d17"],
  magnitude: "#0f45b3",
  track: "#d9dce3",
  grid: "#e4e7ec",
  axis: "#5e6778",
  breach: "#c62828",
  surface: "#fdfdfc",
};

const DARK: ChartPalette = {
  series: ["#3d84f5", "#ca7616"],
  magnitude: "#3d84f5",
  track: "#252c3d",
  grid: "#1e2534",
  axis: "#8a93a6",
  breach: "#ef5350",
  surface: "#111622",
};

export function useChartPalette(): ChartPalette {
  const { resolvedTheme } = useTheme();
  // next-themes resolves on the client only; render light until it does, so
  // the first paint is not a flash of dark bars on a light card.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && resolvedTheme === "dark" ? DARK : LIGHT;
}
