import { useMemo } from 'react';

import {
  toDateOnly,
  getDateKey,
  parseDateKey,
} from '../utils/dates';

import {
  isDueOnDate,
  getDueDatesInRange,
  getAssignedMembers,
  getCompletedBy,
  isChoreComplete,
  isCompletionActive,
} from '../utils/chores';

import type { Chore, DisplayChore, PostponeEntry, TabName } from '../types';

// ── helpers (pure, no hooks) ────────────────────────────────────────────────

const isPostponedFrom = (overrides: PostponeEntry[], subject: string, dateKey: string) =>
  overrides.some((o) => o.subject === subject && o.fromDate === dateKey);

const isOverrideDueOn = (overrides: PostponeEntry[], subject: string, dateKey: string) =>
  overrides.some((o) => o.subject === subject && o.toDate === dateKey);

// ── per-tab filters ─────────────────────────────────────────────────────────

function filterYesterday(chores: Chore[], yesterday: Date, overrides: PostponeEntry[]): DisplayChore[] {
  const yesterdayKey = getDateKey(yesterday);
  return chores.filter((chore) => {
    if (isOverrideDueOn(overrides, chore.subject, yesterdayKey)) return true;
    return isDueOnDate(chore, yesterday);
  });
}

function filterTomorrow(chores: Chore[], tomorrow: Date, overrides: PostponeEntry[]): DisplayChore[] {
  const tomorrowKey = getDateKey(tomorrow);
  return chores.filter((chore) => {
    if (isPostponedFrom(overrides, chore.subject, tomorrowKey)) return false;
    if (isOverrideDueOn(overrides, chore.subject, tomorrowKey)) return true;
    return isDueOnDate(chore, tomorrow);
  });
}

function filterToday(
  chores: Chore[],
  today: Date,
  todayKey: string,
  overrides: PostponeEntry[],
): DisplayChore[] {
  const filtered: DisplayChore[] = [];

  for (const chore of chores) {
    // Overdue overrides targeting today (fromDate < todayKey)
    const overdueOverrides = overrides.filter(
      (o) => o.subject === chore.subject && o.toDate === todayKey && o.fromDate < todayKey,
    );
    const earliestOverdue =
      overdueOverrides.length > 0
        ? overdueOverrides.reduce((earliest, o) =>
            o.fromDate < earliest.fromDate ? o : earliest,
          )
        : null;

    if (earliestOverdue) {
      const originalDate = parseDateKey(earliestOverdue.fromDate);
      const overdueAssignees = originalDate
        ? getAssignedMembers(chore, originalDate)
        : getAssignedMembers(chore, today);
      const isStaleOverride = originalDate && isCompletionActive(chore, originalDate);
      if (!isStaleOverride) {
        // Exclude members who already completed their part — only nag those who haven't
        const completedBy = originalDate
          ? getCompletedBy(chore, overdueAssignees, originalDate)
          : getCompletedBy(chore, overdueAssignees, today);
        const remainingAssignees = overdueAssignees.filter((m) => !completedBy.includes(m));
        // If everyone has completed (or all remaining are done), skip the overdue card
        if (remainingAssignees.length > 0) {
        filtered.push({
          ...chore,
          _instanceType: 'overdue',
          _originalDueDate: earliestOverdue.fromDate,
          _overdueAssignees: remainingAssignees,
        });
        }
      }
    }

    const normallyDueToday =
      isDueOnDate(chore, today) && !isPostponedFrom(overrides, chore.subject, todayKey);
    if (normallyDueToday) {
      filtered.push({ ...chore, _instanceType: 'normal' });
    }
  }

  return filtered;
}

function filterLookahead(
  chores: Chore[],
  today: Date,
  days: number,
  _overrides: PostponeEntry[],
): DisplayChore[] {
  // Lookahead shows the pure intended schedule — no postpone overrides.
  // Overrides are an artifact of overdue chores being auto-postponed day by day,
  // which would cause a single overdue chore to appear on every day.
  const start = today;
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  return chores.flatMap((chore) => {
    const dates = getDueDatesInRange(chore, start, end);
    return dates.map((date) => ({
      ...chore,
      _earliestDue: getDateKey(date),
    }));
  });
}

// ── sorting ─────────────────────────────────────────────────────────────────

const FREQ_ORDER: Record<string, number> = { daily: 0, weekly: 1, monthly: 2, once: 3 };

function sortChores(
  chores: DisplayChore[],
  viewDate: Date,
  isLookahead: boolean,
  useScheduled: boolean,
  today: Date,
): DisplayChore[] {
  return [...chores].sort((a, b) => {
    // Overdue cards first
    if (a._instanceType === 'overdue' && b._instanceType !== 'overdue') return -1;
    if (a._instanceType !== 'overdue' && b._instanceType === 'overdue') return 1;
    // Completed cards last (skip for lookahead)
    if (!isLookahead) {
      const aDone = isChoreComplete(a, getAssignedMembers(a, viewDate, { useScheduled, today }), viewDate);
      const bDone = isChoreComplete(b, getAssignedMembers(b, viewDate, { useScheduled, today }), viewDate);
      if (aDone !== bDone) return aDone ? 1 : -1;
    }
    // Lookahead: group by date
    if (a._earliestDue && b._earliestDue && a._earliestDue !== b._earliestDue) {
      return a._earliestDue < b._earliestDue ? -1 : 1;
    }
    // Frequency order
    const aFreq = FREQ_ORDER[a.recurrence.frequency] ?? 3;
    const bFreq = FREQ_ORDER[b.recurrence.frequency] ?? 3;
    return aFreq - bFreq;
  });
}

// ── member filter ───────────────────────────────────────────────────────────

function filterByMember(
  chores: DisplayChore[],
  member: string,
  viewDate: Date,
  useScheduled: boolean,
  today: Date,
): DisplayChore[] {
  return chores.filter((chore) => {
    if (chore._instanceType === 'overdue' && chore._overdueAssignees) {
      return chore._overdueAssignees.includes(member);
    }
    // For lookahead items, use the instance's actual due date so rotating
    // chores show the correct assignee per date (not always today's assignee).
    const effectiveDate = chore._earliestDue
      ? parseDateKey(chore._earliestDue) ?? viewDate
      : viewDate;
    const assignedList = getAssignedMembers(chore, effectiveDate, { useScheduled, today });
    if (!assignedList.includes(member)) return false;
    const completedBy = getCompletedBy(chore, assignedList, effectiveDate);
    return !completedBy.includes(member);
  });
}

// ── the hook ────────────────────────────────────────────────────────────────

export default function useVisibleChores(
  chores: Chore[],
  activeTab: TabName,
  selectedMember: string,
  postponedOverrides: PostponeEntry[],
  currentDate: Date,
) {
  const todayKey = useMemo(() => getDateKey(currentDate), [currentDate]);

  const visibleChores = useMemo(() => {
    const today = toDateOnly(currentDate);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const viewDate =
      activeTab === 'Yesterday' ? yesterday :
      activeTab === 'Tomorrow'  ? tomorrow  :
      today;

    // 1. Filter by tab
    let filtered: DisplayChore[];
    switch (activeTab) {
      case 'Yesterday':
        filtered = filterYesterday(chores, yesterday, postponedOverrides);
        break;
      case 'Tomorrow':
        filtered = filterTomorrow(chores, tomorrow, postponedOverrides);
        break;
      case 'Today':
        filtered = filterToday(chores, today, todayKey, postponedOverrides);
        break;
      case '5 Days':
        filtered = filterLookahead(chores, today, 5, postponedOverrides);
        break;
      case '30 Days':
        filtered = filterLookahead(chores, today, 30, postponedOverrides);
        break;
      default:
        filtered = chores;
    }

    const isLookahead = activeTab === '5 Days' || activeTab === '30 Days';
    const useScheduled = activeTab === 'Tomorrow' || isLookahead;

    // 2. Filter by member
    if (selectedMember !== 'All') {
      filtered = filterByMember(filtered, selectedMember, viewDate, useScheduled, today);
    }

    // 3. Sort
    filtered = sortChores(filtered, viewDate, isLookahead, useScheduled, today);

    return filtered;
  }, [activeTab, chores, currentDate, selectedMember, postponedOverrides, todayKey]);

  const overdueCount = useMemo(
    () => visibleChores.filter((c) => c._instanceType === 'overdue').length,
    [visibleChores],
  );

  return { visibleChores, overdueCount, todayKey };
}
