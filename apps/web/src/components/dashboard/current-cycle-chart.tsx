'use client';

import { useMemo } from 'react';

import {
  EChartsPieChart,
  type ChartConfig,
} from '@/components/evilcharts/charts/echarts-pie-chart';
import {
  ISSUE_STATUS_META,
  ISSUE_STATUS_ORDER,
  type IssueStatusCounts,
} from '@/components/cycles/cycle-progress';

/**
 * Current Cycle ring — the hub's own donut, built on the
 * `@evilcharts/revenue-mix-echarts-pie-chart` block installed with `shadcn add`.
 *
 * Deliberately NOT the properties rail's `CycleProgressChart`: that one is a
 * 240° gauge (`startAngle: -30 → 210`) whose centre carries only the
 * percentage. This is a full 360° ring with a three-line centre — percent,
 * "12 of 21", "issues done" — per "Cycle Donut Chart" (ZqZQ3) in the dashboard
 * frame. Same slices and same tones as the rail, different chart.
 *
 * What it does share with the rail is the slicing basis and the palette: the
 * ring is the cycle's *issues grouped by status*, read from the shared
 * `ISSUE_STATUS_META`, so both cycle surfaces speak the same vocabulary and the
 * colours track the theme (the chart resolves CSS values off the DOM — see
 * `resolveColors` in echarts-chart).
 *
 * Kept in its own module so the panel can lazy-load it: `echarts` is a large
 * client-only dependency and the hub is a landing page.
 */
export function CurrentCycleChart({
  percent,
  statusCounts,
  completed,
  total,
}: {
  percent: number;
  statusCounts: IssueStatusCounts;
  completed: number;
  total: number;
}) {
  const config = useMemo(() => {
    const entries = ISSUE_STATUS_ORDER.map((status) => {
      const color = ISSUE_STATUS_META[status].chart;
      return [
        status,
        {
          label: ISSUE_STATUS_META[status].label,
          colors: { light: [color], dark: [color] },
        },
      ];
    });
    return {
      ...Object.fromEntries(entries),
      // Neutral ring for a cycle that tracks no issues at all.
      empty: {
        label: 'No issues',
        colors: { light: ['var(--ds-border)'], dark: ['var(--ds-border)'] },
      },
    } satisfies ChartConfig;
  }, []);

  // Zero-value sectors are dropped: ECharts still rounds the caps of an empty
  // sector, which leaves a stray tick on the ring.
  //
  // Reversed, like the rail: ECharts lays sectors out against the data order,
  // so reversing makes the ring run Backlog → Done the way the legend and the
  // Issues groups read.
  const data = useMemo(() => {
    const rows = ISSUE_STATUS_ORDER.filter(
      (status) => statusCounts[status] > 0,
    ).map((status) => ({ band: status, value: statusCounts[status] }));
    return rows.length > 0 ? rows.reverse() : [{ band: 'empty', value: 1 }];
  }, [statusCounts]);

  const breakdown = ISSUE_STATUS_ORDER.map(
    (status) => `${ISSUE_STATUS_META[status].label} ${statusCounts[status]}`,
  ).join(', ');

  return (
    <div
      role="img"
      aria-label={`${percent}% complete — ${completed} of ${total} issues done (${breakdown})`}
      className="relative size-32 shrink-0"
    >
      <EChartsPieChart
        data={data}
        config={config}
        dataKey="value"
        nameKey="band"
        renderer="svg"
        className="h-full w-full"
      >
        <EChartsPieChart.Pie
          // Thicker band than the rail's — 26% of the radius rather than 22%,
          // matching the cycle detail page's ring weight.
          innerRadius="70%"
          outerRadius="96%"
          paddingAngle={4}
          cornerRadius={10}
          // Full circle, clockwise from the top.
          startAngle={90}
          endAngle={-270}
        />
      </EChartsPieChart>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-mono text-2xl font-bold leading-none tracking-[-0.5px] text-foreground">
          {percent}%
        </span>
        <span className="text-[10px] font-semibold leading-none text-foreground">
          {completed} of {total}
        </span>
        <span className="text-[10px] leading-none text-ds-text-muted">
          issues done
        </span>
      </div>
    </div>
  );
}
