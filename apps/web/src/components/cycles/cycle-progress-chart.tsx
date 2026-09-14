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
 * Cycle progress gauge — the Progress Card's "chart" in the properties rail.
 *
 * Built on the `@evilcharts/reliability-score-echarts-pie-chart` block
 * installed with `shadcn add`: the same ECharts donut, re-pointed at cycle
 * data. Unlike the reliability block's fixed bands, the slices are the cycle's
 * *issues* grouped by status — Backlog / Todo / In Progress / Done, in the same
 * order and tones as the Issues page — because a cycle's progress is the mix of
 * its issues rather than a score. The completion percentage stays in the middle
 * of the ring; the ring shows what makes it up.
 *
 * Colors are CSS values, not hex: the chart resolves them off the DOM (see
 * `resolveColors` in echarts-chart), so `var(--ds-info)` and friends follow the
 * theme and stay in step with the issues list.
 *
 * Kept in its own module so the rail can lazy-load it: `echarts` is a large
 * client-only dependency and none of it is needed for the first paint.
 */
export function CycleProgressChart({
  percent,
  statusCounts,
}: {
  percent: number;
  statusCounts: IssueStatusCounts;
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
        colors: {
          light: ['var(--ds-border)'],
          dark: ['var(--ds-border)'],
        },
      },
    } satisfies ChartConfig;
  }, []);

  // Zero-value sectors are dropped: ECharts still rounds the caps of an empty
  // sector, which leaves a stray tick on the ring. A cycle tracking no issues
  // draws the neutral ring only, so the gauge never renders as a blank box.
  //
  // Reversed: ECharts lays sectors out against the data order (the reliability
  // block reverses its bands for the same reason), so reversing makes the ring
  // read Backlog → Done the way the legend and the Issues page do.
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
      aria-label={`${percent}% complete — ${breakdown}`}
      className="relative mx-auto aspect-square w-full max-w-[168px] shrink-0"
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
          innerRadius="70%"
          outerRadius="96%"
          paddingAngle={4}
          cornerRadius={10}
          startAngle={-30}
          endAngle={210}
        />
      </EChartsPieChart>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-mono text-[26px] font-bold leading-none tracking-[-0.5px] text-foreground">
          {percent}%
        </span>
      </div>
    </div>
  );
}
