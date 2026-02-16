import { useMemo, useRef, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import AdminUpload from './AdminUpload'
import SummaryDashboard from './SummaryDashboard'
import './App.css'

import {
  toDateOnly,
  getDateKey,
  parseDateKey,
  getStartOfWeek,
  getEndOfWeek,
  getRemainingWeekDates,
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

import type { Chore, TabName } from './types'

function ChoreApp() {
  const [activeTab, setActiveTab] = useState<TabName>("Today");
  const [selectedMember, setSelectedMember] = useState("All");
  const [postponeTarget, setPostponeTarget] = useState<string | null>(null);
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
    processRemoteData,
    autoPostponeUndone,
  } = choreState;

  const { currentDate, setCurrentDate } = useMidnightRollover(autoPostponeUndone);
  const { isReloading, handleReloadData } = useChoreSync(processRemoteData, dirtyRef);

  useKeepAlive();

  const todayKey = useMemo(() => getDateKey(currentDate), [currentDate]);
  const remainingWeekDates = useMemo(
    () => getRemainingWeekDates(currentDate),
    [currentDate]
  );

  const visibleChores = useMemo(() => {
    const today = toDateOnly(currentDate);
    let filtered: Chore[] = [];

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

    const isDueToday = (chore: Chore) => {
      if (isPostponedFrom(chore.subject, todayKey)) {
        return false;
      }
      if (isOverrideDueOn(chore.subject, todayKey)) {
        return true;
      }
      return isDueOnDate(chore, today);
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
      filtered = chores.filter((chore) => isDueToday(chore));
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
      filtered = filtered.filter((chore) =>
        getAssignedMembers(chore, currentDate).includes(selectedMember)
      );
    }

    filtered = [...filtered].sort((a, b) => {
      const aDone = isChoreComplete(a, getAssignedMembers(a, currentDate), currentDate);
      const bDone = isChoreComplete(b, getAssignedMembers(b, currentDate), currentDate);
      if (aDone === bDone) return 0;
      return aDone ? 1 : -1;
    });

    return filtered;
  }, [activeTab, chores, currentDate, selectedMember, postponedOverrides, todayKey]);

  const overdueSubjects = useMemo(() => {
    const subjects = new Map<string, string>();
    for (const override of postponedOverrides) {
      if (override.toDate === todayKey && override.fromDate < todayKey) {
        const existing = subjects.get(override.subject);
        if (!existing || override.fromDate < existing) {
          subjects.set(override.subject, override.fromDate);
        }
      }
    }
    return subjects;
  }, [postponedOverrides, todayKey]);

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

  const openPostponeSelector = (subject: string) => {
    setPostponeTarget(subject);
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
    postponeToDate(subject, todayKey, getDateKey(date));
    setExpandedChore(null);
    setCurrentDate(new Date());
    setPostponeTarget(null);
  };

  // Build a map to count subject collisions for keys
  const subjectCount: Record<string, number> = {};
  visibleChores.forEach((chore) => {
    subjectCount[chore.subject] = (subjectCount[chore.subject] || 0) + 1;
  });

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
                href="/#/stats"
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
              >
                Stats
              </a>
              <a
                href="/#/admin"
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
              >
                Settings
              </a>
              <button
                type="button"
                onClick={handleReloadData}
                disabled={isReloading}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
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
                    "rounded-full px-4 py-1.5 text-sm font-semibold transition " +
                    (isActive
                      ? "bg-green-500 text-slate-950"
                      : "bg-[#353E43] text-slate-200 hover:bg-slate-700")
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

            {activeTab === "Today" && overdueSubjects.size > 0 && (
              <div className="mb-6 rounded-2xl bg-red-500/10 border border-red-500/30 px-6 py-3">
                <p className="text-lg font-semibold text-red-400">
                  ⚠ {overdueSubjects.size} overdue chore{overdueSubjects.size !== 1 ? 's' : ''} from previous days
                </p>
              </div>
            )}

            <div className="space-y-6">
              {visibleChores.map((chore) => {
                const key = subjectCount[chore.subject] > 1 && chore.id ? `${chore.subject}-${chore.id}` : chore.subject;
                return (
                  <ChoreCard
                    key={key}
                    chore={chore}
                    currentDate={currentDate}
                    expandedChore={expandedChore}
                    activeTab={activeTab}
                    remainingWeekDates={remainingWeekDates}
                    originalDueDate={activeTab === "Today" ? overdueSubjects.get(chore.subject) : undefined}
                    onToggleDescription={toggleDescription}
                    onToggleCompleted={handleToggleCompleted}
                    onOpenPostponeSelector={openPostponeSelector}
                    onOpenAssigneePicker={openAssigneePicker}
                  />
                );
              })}
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
          remainingWeekDates={remainingWeekDates}
          postponeTarget={postponeTarget}
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
    </Routes>
  );
}

export default App;
