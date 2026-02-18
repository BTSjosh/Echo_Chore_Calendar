import { useMemo, useRef, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import AdminUpload from './AdminUpload'
import SummaryDashboard from './SummaryDashboard'
import ChoreEditor from './editor/ChoreEditor'
import './App.css'

import {
  toDateOnly,
  getDateKey,
  parseDateKey,
  getStartOfWeek,
  getEndOfWeek,
  getNext4Days,
  getStartOfMonth,
  getEndOfMonth,
} from './utils/dates'

import {
  HOUSEHOLD,
  TABS,
  isDueOnDate,
  getDueDatesInRange,
  getAssignedMembers,
  isChoreComplete,
} from './utils/chores'

import useKeepAlive from './hooks/useKeepAlive'
import useChoreState from './hooks/useChoreState'
import useMidnightRollover from './hooks/useMidnightRollover'
import useChoreSync from './hooks/useChoreSync'
import ChoreCard from './components/ChoreCard'
import AssigneePickerModal from './components/AssigneePickerModal'
import PostponeSelectorModal from './components/PostponeSelectorModal'

import type { Chore, DisplayChore, TabName } from './types'

function ChoreApp() {
  const [activeTab, setActiveTab] = useState<TabName>("Today");
  const [selectedMember, setSelectedMember] = useState("All");
  const [postponeTarget, setPostponeTarget] = useState<{ subject: string; fromDate: string } | null>(null);
  const [assigneePicker, setAssigneePicker] = useState<string | null>(null);
  const [expandedChore, setExpandedChore] = useState<string | null>(null);
  const assigneeCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const choreState = useChoreState();
  const {
    chores,
    postponedOverrides,
    dirtyRef,
    toggleCompleted,
    toggleMemberCompleted,
    postponeToDate,
    completeLateOverdue,
    abandonOverdue,
    processRemoteData,
    autoPostponeUndone,
  } = choreState;

  const { currentDate, setCurrentDate } = useMidnightRollover(autoPostponeUndone);
  const { isReloading, handleReloadData } = useChoreSync(processRemoteData, dirtyRef);

  useKeepAlive();

  const todayKey = useMemo(() => getDateKey(currentDate), [currentDate]);
  const postponeDates = useMemo(
    () => getNext4Days(currentDate),
    [currentDate]
  );

  const visibleChores = useMemo(() => {
    const today = toDateOnly(currentDate);
    let filtered: DisplayChore[] = [];

    const isPostponedFrom = (subject: string, dateKey: string) =>
      postponedOverrides.some(
        (override) => override.subject === subject && override.fromDate === dateKey
      );

    const isOverrideDueOn = (subject: string, dateKey: string) =>
      postponedOverrides.some(
        (override) => override.subject === subject && override.toDate === dateKey
      );

    const isDateKeyInRange = (dateKey: string, start: Date, end: Date) => {
      const date = parseDateKey(dateKey);
      if (!date) return false;
      return date >= start && date <= end;
    };

    const getDueDatesWithOverrides = (chore: Chore, start: Date, end: Date) => {
      const dueDates = getDueDatesInRange(chore, start, end);
      const nextDates = dueDates.filter(
        (date) => !isPostponedFrom(chore.subject, getDateKey(date))
      );

      postponedOverrides.forEach((override) => {
        if (override.subject !== chore.subject) return;
        if (!isDateKeyInRange(override.toDate, start, end)) return;
        const overrideDate = parseDateKey(override.toDate);
        if (!overrideDate) return;
        const overrideKey = getDateKey(overrideDate);
        if (!nextDates.some((date) => getDateKey(date) === overrideKey)) {
          nextDates.push(overrideDate);
        }
      });

      return nextDates;
    };

    const isDueYesterday = (chore: Chore) => {
      const yesterday = toDateOnly(new Date(today));
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = getDateKey(yesterday);
      if (isPostponedFrom(chore.subject, yesterdayKey)) {
        return false;
      }
      if (isOverrideDueOn(chore.subject, yesterdayKey)) {
        return true;
      }
      return isDueOnDate(chore, yesterday);
    };

    if (activeTab === "Yesterday") {
      filtered = chores.filter((chore) => isDueYesterday(chore));
    } else if (activeTab === "Today") {
      // Instance-aware logic: produce separate overdue and normal cards
      for (const chore of chores) {
        // Find overdue overrides targeting today (fromDate < todayKey)
        const overdueOverrides = postponedOverrides.filter(
          (o) => o.subject === chore.subject && o.toDate === todayKey && o.fromDate < todayKey
        );
        // Pick the earliest fromDate
        const earliestOverdue = overdueOverrides.length > 0
          ? overdueOverrides.reduce((earliest, o) => o.fromDate < earliest.fromDate ? o : earliest)
          : null;

        if (earliestOverdue) {
          const originalDate = parseDateKey(earliestOverdue.fromDate);
          const overdueAssignees = originalDate
            ? getAssignedMembers(chore, originalDate)
            : getAssignedMembers(chore, today);
          filtered.push({
            ...chore,
            _instanceType: 'overdue',
            _originalDueDate: earliestOverdue.fromDate,
            _overdueAssignees: overdueAssignees,
          });
        }

        // Check if chore is normally due today AND not postponed FROM today
        const normallyDueToday = isDueOnDate(chore, today) && !isPostponedFrom(chore.subject, todayKey);
        if (normallyDueToday) {
          filtered.push({
            ...chore,
            _instanceType: 'normal',
          });
        }
      }
    } else if (activeTab === "This Week") {
      const start = getStartOfWeek(today);
      const end = getEndOfWeek(today);
      filtered = chores.filter(
        (chore) => getDueDatesWithOverrides(chore, start, end).length > 0
      );
    } else if (activeTab === "This Month") {
      const start = getStartOfMonth(today);
      const end = getEndOfMonth(today);
      filtered = chores.filter(
        (chore) => getDueDatesWithOverrides(chore, start, end).length > 0
      );
    } else {
      filtered = chores;
    }

    if (selectedMember !== "All") {
      filtered = filtered.filter((chore) => {
        if (chore._instanceType === 'overdue' && chore._overdueAssignees) {
          return chore._overdueAssignees.includes(selectedMember);
        }
        return getAssignedMembers(chore, currentDate).includes(selectedMember);
      });
    }

    filtered = [...filtered].sort((a, b) => {
      // Overdue cards always sort before normal cards
      if (a._instanceType === 'overdue' && b._instanceType !== 'overdue') return -1;
      if (a._instanceType !== 'overdue' && b._instanceType === 'overdue') return 1;
      const aDone = isChoreComplete(a, getAssignedMembers(a, currentDate), currentDate);
      const bDone = isChoreComplete(b, getAssignedMembers(b, currentDate), currentDate);
      if (aDone === bDone) return 0;
      return aDone ? 1 : -1;
    });

    return filtered;
  }, [activeTab, chores, currentDate, selectedMember, postponedOverrides, todayKey]);

  const overdueCount = useMemo(() => {
    return visibleChores.filter((c) => c._instanceType === 'overdue').length;
  }, [visibleChores]);

  const handleCompleteLateOverdue = (subject: string, fromDate: string) => {
    completeLateOverdue(subject, fromDate);
  };

  const handleAbandonOverdue = (subject: string, fromDate: string) => {
    abandonOverdue(subject, fromDate);
  };

  const handleToggleCompleted = (subject: string) => {
    toggleCompleted(subject, currentDate);
  };

  const handleToggleMemberCompleted = (subject: string, member: string) => {
    const shouldAutoClose = toggleMemberCompleted(subject, member, currentDate);

    if (shouldAutoClose) {
      if (assigneeCloseTimeoutRef.current) {
        clearTimeout(assigneeCloseTimeoutRef.current);
      }
      assigneeCloseTimeoutRef.current = setTimeout(() => {
        setAssigneePicker(null);
        assigneeCloseTimeoutRef.current = null;
      }, 1000);
    }
  };

  const toggleDescription = (subject: string) => {
    setExpandedChore((prev) => (prev === subject ? null : subject));
  };

  const openPostponeSelector = (subject: string, fromDate?: string) => {
    setPostponeTarget({ subject, fromDate: fromDate ?? todayKey });
  };

  const closePostponeSelector = () => {
    setPostponeTarget(null);
  };

  const openAssigneePicker = (subject: string) => {
    if (assigneeCloseTimeoutRef.current) {
      clearTimeout(assigneeCloseTimeoutRef.current);
      assigneeCloseTimeoutRef.current = null;
    }
    setAssigneePicker(subject);
  };

  const closeAssigneePicker = () => {
    if (assigneeCloseTimeoutRef.current) {
      clearTimeout(assigneeCloseTimeoutRef.current);
      assigneeCloseTimeoutRef.current = null;
    }
    setAssigneePicker(null);
  };

  const handlePostponeToDate = (subject: string, date: Date) => {
    postponeToDate(subject, postponeTarget?.fromDate ?? todayKey, getDateKey(date));
    setExpandedChore(null);
    setCurrentDate(new Date());
    setPostponeTarget(null);
  };

  // Build a key for each visible chore using instanceType to disambiguate
  const choreKey = (chore: DisplayChore) => {
    if (chore._instanceType === 'overdue') return `${chore.subject}-overdue`;
    return chore.subject;
  };

  return (
    <div className="min-h-screen bg-[#121212] text-slate-100">
      <div className="mx-auto w-full px-6 py-8 2xl:px-12">
          <main className="w-full min-h-0" style={{ minHeight: 'calc(100dvh - 4rem)', paddingBottom: '8rem', WebkitOverflowScrolling: 'touch', overflow: 'auto' }}>
            <header className="mb-8 flex flex-col gap-5 sticky top-0 z-30 bg-[#121212] bg-opacity-95 backdrop-blur-md" style={{ WebkitBackdropFilter: 'blur(8px)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-5xl sm:text-6xl font-semibold text-slate-100">
                Plimmer Chore Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href="#/stats"
                className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-6 py-2.5 text-lg font-semibold min-w-[9rem] text-slate-100 hover:bg-slate-800 hover:border-slate-600 shadow transition"
              >
                Stats
              </a>
              <a
                href="#/admin"
                className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-6 py-2.5 text-lg font-semibold min-w-[9rem] text-slate-100 hover:bg-slate-800 hover:border-slate-600 shadow transition"
              >
                Settings
              </a>
              <button
                type="button"
                onClick={handleReloadData}
                disabled={isReloading}
                className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-6 py-2.5 text-lg font-semibold min-w-[9rem] text-slate-100 hover:bg-slate-800 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed shadow transition"
                title="Refresh chores from cloud"
              >
                {isReloading ? '\u21BB Refreshing...' : '\u21BB Refresh'}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={
                    "rounded-full px-6 py-2.5 text-lg font-semibold transition " +
                    (isActive
                      ? "bg-green-500 text-slate-950 shadow"
                      : "bg-[#353E43] text-slate-200 shadow-sm hover:bg-slate-800")
                  }
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mr-2">Filter:</span>
            {["All", ...HOUSEHOLD].map((member) => {
              const isActive = selectedMember === member;
              return (
                <button
                  key={member}
                  type="button"
                  onClick={() => setSelectedMember(member)}
                  className={
                    "rounded-full px-6 py-2.5 text-lg font-semibold transition min-w-[11rem] " +
                    (isActive
                      ? "bg-green-500 text-slate-950 shadow"
                      : "bg-[#353E43] text-slate-200 shadow-sm hover:bg-slate-800")
                  }
                >
                  {member}
                </button>
              );
            })}
          </div>
          <div className="rounded-2xl bg-green-500/10 border border-green-500/30 px-6 py-3 w-fit">
            <p className="text-2xl font-bold text-slate-100">
              {(() => {
                if (activeTab === "Yesterday") {
                  const yesterday = new Date(currentDate);
                  yesterday.setDate(yesterday.getDate() - 1);
                  return yesterday.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  });
                } else if (activeTab === "Today") {
                  return currentDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  });
                } else if (activeTab === "This Week") {
                  const weekStart = getStartOfWeek(currentDate);
                  const weekEnd = getEndOfWeek(currentDate);
                  return `${weekStart.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })} - ${weekEnd.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}`;
                } else if (activeTab === "This Month") {
                  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                  return `${monthStart.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })} - ${monthEnd.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })}`;
                }
              })()}
            </p>
          </div>
            </header>

            {activeTab === "Today" && overdueCount > 0 && (
              <div className="mb-6 rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 w-fit">
                <p className="text-lg font-semibold text-red-400">
                  ⚠ {overdueCount} overdue chore{overdueCount !== 1 ? 's' : ''} from previous days
                </p>
              </div>
            )}

            <div className="space-y-6">
              {visibleChores.map((chore) => (
                  <ChoreCard
                    key={choreKey(chore)}
                    chore={chore}
                    currentDate={currentDate}
                    expandedChore={expandedChore}
                    activeTab={activeTab}
                    originalDueDate={chore._originalDueDate}
                    overdueAssignees={chore._overdueAssignees}
                    instanceType={chore._instanceType}
                    onToggleDescription={toggleDescription}
                    onToggleCompleted={handleToggleCompleted}
                    onCompleteLateOverdue={handleCompleteLateOverdue}
                    onAbandonOverdue={handleAbandonOverdue}
                    onOpenPostponeSelector={openPostponeSelector}
                    onOpenAssigneePicker={openAssigneePicker}
                  />
              ))}
            </div>
          </main>
      </div>

      {assigneePicker && (
        <AssigneePickerModal
          chores={chores}
          assigneePicker={assigneePicker}
          currentDate={currentDate}
          onToggleMemberCompleted={handleToggleMemberCompleted}
          onClose={closeAssigneePicker}
        />
      )}

      {postponeTarget && (
        <PostponeSelectorModal
          postponeDates={postponeDates}
          postponeTarget={postponeTarget.subject}
          onPostponeToDate={handlePostponeToDate}
          onClose={closePostponeSelector}
        />
      )}

    {/* Hidden iframe to keep Silk open */}
    <iframe
      src="https://dagammla.gitlab.io/keep-silk-open/iframe.html"
      style={{ display: 'none' }}
      title="Keep Alive"
    />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<ChoreApp />} />
      <Route path="/admin" element={<AdminUpload />} />
      <Route path="/stats" element={<SummaryDashboard />} />
      <Route path="/editor" element={<ChoreEditor />} />
    </Routes>
  );
}

export default App;
