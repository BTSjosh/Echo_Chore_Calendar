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

export interface AnalyticsResult {
  personCompletion: PersonCompletionStat[];
  choreCompletion: ChoreCompletionStat[];
  postponeFrequency: PostponeStat[];
  timeOfDay: TimeOfDayBucket[];
  punctuality: PunctualityStat[];
  totalEvents: number;
  rangeLabel: string;
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
  const completed = new Map<string, number>();
  const uncompleted = new Map<string, number>();

  for (const e of events) {
    if (e.action === 'completed') {
      completed.set(e.choreSubject, (completed.get(e.choreSubject) ?? 0) + 1);
    } else if (e.action === 'uncompleted') {
      uncompleted.set(e.choreSubject, (uncompleted.get(e.choreSubject) ?? 0) + 1);
    }
  }

  const subjects = new Set([...completed.keys(), ...uncompleted.keys()]);
  return [...subjects]
    .map((choreSubject) => {
      const c = completed.get(choreSubject) ?? 0;
      const u = uncompleted.get(choreSubject) ?? 0;
      const total = c + u;
      return { choreSubject, completed: c, total, rate: total > 0 ? c / total : 0 };
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
    totalEvents: events.length,
    rangeLabel: formatRangeLabel(period, range),
  };
};
