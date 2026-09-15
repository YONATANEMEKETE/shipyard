import { format, isSameWeek, isToday, isYesterday } from 'date-fns';

/**
 * Date bucketing for activity rows — shared by the Activity page's feed and the
 * dashboard rail's timeline, so the two never drift into different vocabularies
 * for the same event.
 *
 * The Activity Log page was specified with four buckets; the dashboard frame
 * only illustrates Today / Yesterday, which are a subset of these.
 */

/** Group buckets, in render order. */
export const ACTIVITY_BUCKETS = [
  'today',
  'yesterday',
  'week',
  'earlier',
] as const;

export type ActivityBucket = (typeof ACTIVITY_BUCKETS)[number];

export const ACTIVITY_BUCKET_LABEL: Record<ActivityBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  earlier: 'Earlier',
};

export function activityBucketOf(iso: string): ActivityBucket {
  const date = new Date(iso);
  if (isToday(date)) return 'today';
  if (isYesterday(date)) return 'yesterday';
  // Monday-start weeks, matching the workspace's cycle weeks.
  if (isSameWeek(date, new Date(), { weekStartsOn: 1 })) return 'week';
  return 'earlier';
}

/**
 * Time shown at a row's trailing edge. Only today/yesterday carry their day in
 * the group header, so the looser buckets have to name the day themselves —
 * otherwise "This week" and "Earlier" rows stack up as a run of bare clock
 * times with no way to tell which day each landed on.
 */
export function activityTimeOf(iso: string, bucket: ActivityBucket): string {
  const date = new Date(iso);
  if (bucket === 'today' || bucket === 'yesterday')
    return format(date, 'HH:mm');
  if (bucket === 'week') return format(date, 'EEE HH:mm');
  return format(date, 'MMM d');
}

/**
 * One pass per bucket, in fixed order. Callers pass rows already newest-first
 * (the API's only order), so filtering preserves the ordering inside a group.
 */
export function groupByActivityBucket<T extends { createdAt: string }>(
  items: T[],
): { bucket: ActivityBucket; rows: T[] }[] {
  return ACTIVITY_BUCKETS.map((bucket) => ({
    bucket,
    rows: items.filter((item) => activityBucketOf(item.createdAt) === bucket),
  })).filter((group) => group.rows.length > 0);
}
