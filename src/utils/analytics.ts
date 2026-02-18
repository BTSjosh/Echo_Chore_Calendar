import type { HistoryEvent } from '../types';
import { getStartOfWeek, getEndOfWeek, getStartOfMonth, getEndOfMonth } from './dates';

export type Period = 'week' | 'month' | 'all';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PersonCompletionStat {
  member: string;
  completed: number;
  total: number;
  rate: number;
}

export interface ChoreCompletionStat {
  choreSubject: string;
  completed: number;
  late: number;
  abandoned: number;
  postponed: number;
  total: number;
  rate: number;
}

export interface PostponeStat {
  choreSubject: string;
  postponeCount: number;
}

export type TimeBucket = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export interface TimeOfDayBucket {
  label: TimeBucket;
  range: string;
  count: number;
}

export interface PunctualityStat {
  member: string;
  averageDaysOffset: number;
  sampleCount: number;
}

export interface MissedPatternStat {
  choreSubject: string;
  missedCount: number;
  windowSize: number;
  windowLabel: string;
}

export interface ExecutiveSummary {
  totalCompleted: number;   // completed + completed_late
  totalOnTime: number;      // action === 'completed'
  totalLate: number;        // action === 'completed_late'
  totalAbandoned: number;   // action === 'abandoned'
  totalPostponed: number;   // 'postponed' + 'auto_postponed'
  overallRate: number;      // totalCompleted / (totalCompleted + totalAbandoned)
  onTimePct: number;        // totalOnTime / totalCompleted
}

export interface WeeklyBucket {
  weekLabel: string;  // "Jan 12" — Monday of that week
  weekStart: string;  // ISO date YYYY-MM-DD
  completed: number;  // on-time
  late: number;
  abandoned: number;
  postponed: number;
}

export interface AnalyticsResult {
  personCompletion: PersonCompletionStat[];
  choreCompletion: ChoreCompletionStat[];
  postponeFrequency: PostponeStat[];
  timeOfDay: TimeOfDayBucket[];
  punctuality: PunctualityStat[];
  missedPatterns: MissedPatternStat[];
  totalEvents: number;
  rangeLabel: string;
  executiveSummary: ExecutiveSummary;
  weeklyTrend: WeeklyBucket[];  // always 8 weeks, computed from allEvents
}

export const buildDateRange = (period: Period, referenceDate: Date): DateRange | null => {
  if (period === 'all') return null;
  if (period === 'week') {
    return { start: getStartOfWeek(referenceDate), end: getEndOfWeek(referenceDate) };
  }
  return { start: getStartOfMonth(referenceDate), end: getEndOfMonth(referenceDate) };
};

export const filterByRange = (events: HistoryEvent[], range: DateRange | null): HistoryEvent[] => {
  if (!range) return events;
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return events.filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    return ts >= startMs && ts <= endMs;
  });
};

export const computePersonCompletion = (events: HistoryEvent[], household: string[]): PersonCompletionStat[] => {
  const completed = new Map<string, number>();
  const uncompleted = new Map<string, number>();

  for (const member of household) {
    completed.set(member, 0);
    uncompleted.set(member, 0);
  }

  for (const e of events) {
    if (e.action === 'completed') {
      for (const m of e.members) {
        completed.set(m, (completed.get(m) ?? 0) + 1);
      }
    } else if (e.action === 'uncompleted') {
      for (const m of e.members) {
        uncompleted.set(m, (uncompleted.get(m) ?? 0) + 1);
      }
    }
  }

  return household
    .map((member) => {
      const c = completed.get(member) ?? 0;
      const u = uncompleted.get(member) ?? 0;
      const total = c + u;
      return { member, completed: c, total, rate: total > 0 ? c / total : 0 };
    })
    .sort((a, b) => b.rate - a.rate);
};

export const computeChoreCompletion = (events: HistoryEvent[]): ChoreCompletionStat[] => {
  const completedMap = new Map<string, number>();
  const lateMap = new Map<string, number>();
  const abandonedMap = new Map<string, number>();
  const postponedMap = new Map<string, number>();

  for (const e of events) {
    if (e.action === 'completed') {
      completedMap.set(e.choreSubject, (completedMap.get(e.choreSubject) ?? 0) + 1);
    } else if (e.action === 'completed_late') {
      lateMap.set(e.choreSubject, (lateMap.get(e.choreSubject) ?? 0) + 1);
    } else if (e.action === 'abandoned') {
      abandonedMap.set(e.choreSubject, (abandonedMap.get(e.choreSubject) ?? 0) + 1);
    } else if (e.action === 'postponed' || e.action === 'auto_postponed') {
      postponedMap.set(e.choreSubject, (postponedMap.get(e.choreSubject) ?? 0) + 1);
    }
  }

  const subjects = new Set([
    ...completedMap.keys(),
    ...lateMap.keys(),
    ...abandonedMap.keys(),
    ...postponedMap.keys(),
  ]);

  return [...subjects]
    .map((choreSubject) => {
      const c = completedMap.get(choreSubject) ?? 0;
      const l = lateMap.get(choreSubject) ?? 0;
      const a = abandonedMap.get(choreSubject) ?? 0;
      const p = postponedMap.get(choreSubject) ?? 0;
      const totalDone = c + l;
      const total = totalDone + a;
      return {
        choreSubject,
        completed: c,
        late: l,
        abandoned: a,
        postponed: p,
        total,
        rate: total > 0 ? totalDone / total : 0,
      };
    })
    .sort((a, b) => a.rate - b.rate);
};

export const computePostponeFrequency = (events: HistoryEvent[]): PostponeStat[] => {
  const counts = new Map<string, number>();

  for (const e of events) {
    if (e.action === 'postponed' || e.action === 'auto_postponed') {
      counts.set(e.choreSubject, (counts.get(e.choreSubject) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([choreSubject, postponeCount]) => ({ choreSubject, postponeCount }))
    .sort((a, b) => b.postponeCount - a.postponeCount);
};

const BUCKETS: { label: TimeBucket; range: string; minHour: number; maxHour: number }[] = [
  { label: 'Night', range: '12am–6am', minHour: 0, maxHour: 5 },
  { label: 'Morning', range: '6am–12pm', minHour: 6, maxHour: 11 },
  { label: 'Afternoon', range: '12pm–6pm', minHour: 12, maxHour: 17 },
  { label: 'Evening', range: '6pm–12am', minHour: 18, maxHour: 23 },
];

export const computeTimeOfDay = (events: HistoryEvent[]): TimeOfDayBucket[] => {
  const counts: Record<TimeBucket, number> = { Night: 0, Morning: 0, Afternoon: 0, Evening: 0 };

  for (const e of events) {
    if (e.action !== 'completed') continue;
    const hour = new Date(e.timestamp).getHours();
    for (const bucket of BUCKETS) {
      if (hour >= bucket.minHour && hour <= bucket.maxHour) {
        counts[bucket.label]++;
        break;
      }
    }
  }

  return BUCKETS.map((b) => ({ label: b.label, range: b.range, count: counts[b.label] }));
};

export const computePunctuality = (events: HistoryEvent[], household: string[]): PunctualityStat[] => {
  const offsets = new Map<string, number[]>();
  for (const member of household) {
    offsets.set(member, []);
  }

  for (const e of events) {
    if (e.action !== 'completed' || !e.dueDate) continue;
    const completedDate = new Date(e.timestamp);
    const dueDate = new Date(e.dueDate + 'T00:00:00');
    const diffDays = Math.round((completedDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    for (const m of e.members) {
      const arr = offsets.get(m);
      if (arr) arr.push(diffDays);
    }
  }

  return household
    .filter((member) => (offsets.get(member)?.length ?? 0) > 0)
    .map((member) => {
      const arr = offsets.get(member)!;
      const avg = arr.reduce((sum, v) => sum + v, 0) / arr.length;
      return { member, averageDaysOffset: Math.round(avg * 10) / 10, sampleCount: arr.length };
    })
    .sort((a, b) => a.averageDaysOffset - b.averageDaysOffset);
};

export const computeMissedPatterns = (allEvents: HistoryEvent[]): MissedPatternStat[] => {
  const WINDOW_WEEKS = 4;
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - WINDOW_WEEKS * 7);
  const cutoffMs = cutoff.getTime();

  const weekCounts = new Map<string, Set<number>>();

  for (const e of allEvents) {
    if (e.action !== 'auto_postponed') continue;
    const ts = new Date(e.timestamp).getTime();
    if (ts < cutoffMs) continue;
    const weekNum = Math.floor((ts - cutoffMs) / (7 * 24 * 60 * 60 * 1000));
    let weeks = weekCounts.get(e.choreSubject);
    if (!weeks) {
      weeks = new Set();
      weekCounts.set(e.choreSubject, weeks);
    }
    weeks.add(weekNum);
  }

  return [...weekCounts.entries()]
    .filter(([, weeks]) => weeks.size >= 2)
    .map(([choreSubject, weeks]) => ({
      choreSubject,
      missedCount: weeks.size,
      windowSize: WINDOW_WEEKS,
      windowLabel: `last ${WINDOW_WEEKS} weeks`,
    }))
    .sort((a, b) => b.missedCount - a.missedCount);
};

export const computeExecutiveSummary = (events: HistoryEvent[]): ExecutiveSummary => {
  let totalOnTime = 0;
  let totalLate = 0;
  let totalAbandoned = 0;
  let totalPostponed = 0;

  for (const e of events) {
    if (e.action === 'completed') totalOnTime++;
    else if (e.action === 'completed_late') totalLate++;
    else if (e.action === 'abandoned') totalAbandoned++;
    else if (e.action === 'postponed' || e.action === 'auto_postponed') totalPostponed++;
  }

  const totalCompleted = totalOnTime + totalLate;
  const overallRate = totalCompleted + totalAbandoned > 0
    ? totalCompleted / (totalCompleted + totalAbandoned)
    : 0;
  const onTimePct = totalCompleted > 0 ? totalOnTime / totalCompleted : 0;

  return { totalCompleted, totalOnTime, totalLate, totalAbandoned, totalPostponed, overallRate, onTimePct };
};

const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10);

export const computeWeeklyTrend = (allEvents: HistoryEvent[], weeks: number = 8): WeeklyBucket[] => {
  const now = new Date();
  // Find Monday of current week
  const thisMonday = getStartOfWeek(now);

  // Build bucket array: oldest-first
  const buckets: WeeklyBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - i * 7);
    const weekLabel = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    buckets.push({
      weekLabel,
      weekStart: toIsoDate(monday),
      completed: 0,
      late: 0,
      abandoned: 0,
      postponed: 0,
    });
  }

  // Build a map from weekStart -> bucket index for O(1) lookup
  const bucketIndex = new Map<string, number>();
  for (let i = 0; i < buckets.length; i++) {
    bucketIndex.set(buckets[i].weekStart, i);
  }

  const earliestMs = new Date(buckets[0].weekStart + 'T00:00:00').getTime();

  for (const e of allEvents) {
    const ts = new Date(e.timestamp).getTime();
    if (ts < earliestMs) continue;

    const eventDate = new Date(e.timestamp);
    const eventMonday = getStartOfWeek(eventDate);
    const key = toIsoDate(eventMonday);
    const idx = bucketIndex.get(key);
    if (idx === undefined) continue;

    const bucket = buckets[idx];
    if (e.action === 'completed') bucket.completed++;
    else if (e.action === 'completed_late') bucket.late++;
    else if (e.action === 'abandoned') bucket.abandoned++;
    else if (e.action === 'postponed' || e.action === 'auto_postponed') bucket.postponed++;
  }

  return buckets;
};

const formatRangeLabel = (period: Period, range: DateRange | null): string => {
  if (!range) return 'All Time';
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (period === 'week') return `Week of ${fmt(range.start)} – ${fmt(range.end)}`;
  return range.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const computeAnalytics = (
  allEvents: HistoryEvent[],
  period: Period,
  household: string[],
  referenceDate: Date = new Date(),
): AnalyticsResult => {
  const range = buildDateRange(period, referenceDate);
  const events = filterByRange(allEvents, range);

  return {
    personCompletion: computePersonCompletion(events, household),
    choreCompletion: computeChoreCompletion(events),
    postponeFrequency: computePostponeFrequency(events),
    timeOfDay: computeTimeOfDay(events),
    punctuality: computePunctuality(events, household),
    missedPatterns: computeMissedPatterns(allEvents),
    totalEvents: events.length,
    rangeLabel: formatRangeLabel(period, range),
    executiveSummary: computeExecutiveSummary(events),
    weeklyTrend: computeWeeklyTrend(allEvents, 8),
  };
};
