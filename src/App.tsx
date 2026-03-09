import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import AdminUpload from './AdminUpload'
import SummaryDashboard from './SummaryDashboard'
import ChoreEditor from './editor/ChoreEditor'
import './App.css'

import {
  getDateKey,
  parseDateKey,
  getNext4Days,
  getLogicalNow,
} from './utils/dates'

import {
  HOUSEHOLD,
  TABS,
  getAssignedMembers,
  isChoreComplete,
} from './utils/chores'

import useChoreState from './hooks/useChoreState'
import useVisibleChores from './hooks/useVisibleChores'
import useMidnightRollover from './hooks/useMidnightRollover'
import useChoreSync from './hooks/useChoreSync'
import { fetchRemoteSnapshot } from './utils/sync'
import ChoreCard from './components/ChoreCard'
import AssigneePickerModal from './components/AssigneePickerModal'
import PostponeSelectorModal from './components/PostponeSelectorModal'

import type { DisplayChore, TabName } from './types'

// ── date header helpers ─────────────────────────────────────────────────────

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

function getTabDateLabel(activeTab: TabName, currentDate: Date): string {
  if (activeTab === 'Yesterday') {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-US', LONG_DATE);
  }
  if (activeTab === 'Today') {
    return currentDate.toLocaleDateString('en-US', LONG_DATE);
  }
  if (activeTab === 'Tomorrow') {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('en-US', LONG_DATE);
  }
  // Lookahead range
  const days = activeTab === '5 Days' ? 5 : 30;
  const end = new Date(currentDate);
  end.setDate(end.getDate() + days);
  return `${currentDate.toLocaleDateString('en-US', SHORT_DATE)} - ${end.toLocaleDateString('en-US', SHORT_DATE)}`;
}

/** Build a React key for each visible chore, disambiguating overdue + lookahead entries. */
function choreKey(chore: DisplayChore): string {
  if (chore._instanceType === 'overdue') return `${chore.subject}-overdue`;
  if (chore._earliestDue) return `${chore.subject}-${chore._earliestDue}`;
  return chore.subject;
}

// ── main component ──────────────────────────────────────────────────────────

function ChoreApp() {
  const [activeTab, setActiveTab] = useState<TabName>("Today");
  const [selectedMember, setSelectedMember] = useState("All");
  const [postponeTarget, setPostponeTarget] = useState<{ subject: string; fromDate: string; dismissKey: string } | null>(null);
  const [assigneePicker, setAssigneePicker] = useState<string | null>(null);
  const [expandedChore, setExpandedChore] = useState<string | null>(null);
  const assigneeCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: 'done' | 'abandoned' | 'postponed' } | null>(null);
  const [toastExiting, setToastExiting] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastExitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dismissingCards, setDismissingCards] = useState<Set<string>>(new Set());
  const [pulsingCards, setPulsingCards] = useState<Set<string>>(new Set());

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

  // Sync from Supabase before the 4am rollover so autoPostponeUndone operates
  // on the latest completion state from all devices, preventing stale overrides.
  const syncBeforeRollover = useCallback(async () => {
    try {
      const result = await fetchRemoteSnapshot();
      if (result?.payload) {
        processRemoteData(result.payload, result.updated_at);
      }
    } catch (e) {
      console.error('Pre-rollover sync failed:', e);
    }
  }, [processRemoteData]);

  const { currentDate, setCurrentDate } = useMidnightRollover(autoPostponeUndone, syncBeforeRollover);
  const { isReloading, handleReloadData } = useChoreSync(processRemoteData, dirtyRef);

  const { visibleChores, overdueCount, todayKey } = useVisibleChores(
    chores, activeTab, selectedMember, postponedOverrides, currentDate,
  );

  const postponeDates = useMemo(
    () => getNext4Days(currentDate),
    [currentDate]
  );

  const showToast = (message: string, variant: 'done' | 'abandoned' | 'postponed') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (toastExitTimeoutRef.current) clearTimeout(toastExitTimeoutRef.current);
    setToastExiting(false);
    setToast({ message, variant });
    toastTimeoutRef.current = setTimeout(() => {
      setToastExiting(true);
      toastExitTimeoutRef.current = setTimeout(() => {
        setToast(null);
        setToastExiting(false);
      }, 250);
    }, 2000);
  };

  const dismissCard = useCallback((key: string, callback: () => void) => {
    setDismissingCards(prev => new Set(prev).add(key));
    setTimeout(() => {
      callback();
      setDismissingCards(prev => { const next = new Set(prev); next.delete(key); return next; });
    }, 400);
  }, []);

  const pulseCard = useCallback((key: string) => {
    setPulsingCards(prev => new Set(prev).add(key));
    setTimeout(() => {
      setPulsingCards(prev => { const next = new Set(prev); next.delete(key); return next; });
    }, 1000);
  }, []);

  const handleCompleteLateOverdue = (subject: string, fromDate: string) => {
    showToast('\u2713 Marked done!', 'done');
    dismissCard(`${subject}-overdue`, () => completeLateOverdue(subject, fromDate));
  };

  const handleAbandonOverdue = (subject: string, fromDate: string) => {
    showToast('Chore abandoned', 'abandoned');
    dismissCard(`${subject}-overdue`, () => abandonOverdue(subject, fromDate));
  };

  const handleToggleCompleted = (subject: string) => {
    const chore = chores.find(c => c.subject === subject);
    const wasComplete = chore
      ? isChoreComplete(chore, getAssignedMembers(chore, currentDate), currentDate)
      : false;
    if (!wasComplete) {
      showToast('\u2713 Done!', 'done');
      pulseCard(subject);
      setTimeout(() => toggleCompleted(subject, currentDate), 1000);
    } else {
      toggleCompleted(subject, currentDate);
    }
  };

  const handleToggleMemberCompleted = (subject: string, member: string) => {
    const shouldAutoClose = toggleMemberCompleted(subject, member, currentDate);

    if (shouldAutoClose) {
      if (assigneeCloseTimeoutRef.current) {
        clearTimeout(assigneeCloseTimeoutRef.current);
      }
      showToast('\u2713 Done!', 'done');
      assigneeCloseTimeoutRef.current = setTimeout(() => {
        setAssigneePicker(null);
        assigneeCloseTimeoutRef.current = null;
        pulseCard(subject);
      }, 600);
    }
  };

  const toggleDescription = (subject: string) => {
    setExpandedChore((prev) => (prev === subject ? null : subject));
  };

  const openPostponeSelector = (subject: string, fromDate?: string) => {
    const isOverdueCard = !!fromDate;
    setPostponeTarget({
      subject,
      fromDate: fromDate ?? todayKey,
      dismissKey: isOverdueCard ? `${subject}-overdue` : subject,
    });
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
    if (!postponeTarget) return;
    const { fromDate, dismissKey } = postponeTarget;
    setPostponeTarget(null);
    showToast('Postponed', 'postponed');
    dismissCard(dismissKey, () => {
      postponeToDate(subject, fromDate, getDateKey(date));
      setExpandedChore(null);
      setCurrentDate(getLogicalNow());
    });
  };

  return (
    <div className="min-h-screen bg-[#121212] text-slate-100">
      <div className="mx-auto w-full px-6 py-8 2xl:px-12">
          <main className="w-full min-h-0" style={{ minHeight: 'calc(100dvh - 4rem)', paddingBottom: '8rem', WebkitOverflowScrolling: 'touch', overflow: 'auto' }}>
            <header className="mb-8 flex flex-col gap-5 sticky top-0 z-30 bg-[#121212] bg-opacity-95 backdrop-blur-md" style={{ WebkitBackdropFilter: 'blur(8px)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-3xl sm:text-5xl font-semibold text-slate-100">
                Plimmer Chore Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <a
                href="#/stats"
                className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 sm:px-6 sm:py-2.5 text-sm sm:text-lg font-semibold sm:min-w-[9rem] text-slate-100 hover:bg-slate-800 hover:border-slate-600 shadow transition"
              >
                Stats
              </a>
              <a
                href="#/admin"
                className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 sm:px-6 sm:py-2.5 text-sm sm:text-lg font-semibold sm:min-w-[9rem] text-slate-100 hover:bg-slate-800 hover:border-slate-600 shadow transition"
              >
                Settings
              </a>
              <button
                type="button"
                onClick={handleReloadData}
                disabled={isReloading}
                className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 sm:px-6 sm:py-2.5 text-sm sm:text-lg font-semibold sm:min-w-[9rem] text-slate-100 hover:bg-slate-800 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed shadow transition"
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
                    "rounded-full px-4 py-2 sm:px-6 sm:py-2.5 text-sm sm:text-lg font-semibold transition " +
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
                    "rounded-full px-4 py-2 sm:px-6 sm:py-2.5 text-sm sm:text-lg font-semibold transition min-w-[5rem] sm:min-w-[11rem] " +
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
              {getTabDateLabel(activeTab, currentDate)}
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
              {visibleChores.map((chore, index) => {
                const isLookahead = activeTab === "5 Days" || activeTab === "30 Days";
                const prevDate = index > 0 ? visibleChores[index - 1]._earliestDue : null;
                const showDateHeader = isLookahead && chore._earliestDue && chore._earliestDue !== prevDate;
                return (
                  <Fragment key={choreKey(chore)}>
                    {showDateHeader && (
                      <h3 className="text-lg font-semibold text-slate-300 pt-4 first:pt-0">
                        {parseDateKey(chore._earliestDue)?.toLocaleDateString("en-US", {
                          weekday: "long", month: "short", day: "numeric"
                        })}
                      </h3>
                    )}
                    <ChoreCard
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
                      isDismissing={dismissingCards.has(choreKey(chore))}
                      isPulsing={pulsingCards.has(choreKey(chore))}
                    />
                  </Fragment>
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
          postponeDates={postponeDates}
          postponeTarget={postponeTarget.subject}
          onPostponeToDate={handlePostponeToDate}
          onClose={closePostponeSelector}
        />
      )}

    {/* Action feedback toast */}
    {toast && (
      <div className="fixed bottom-10 left-1/2 z-50 pointer-events-none" style={{ transform: 'translateX(-50%)' }}>
        <div
          className={
            "px-6 py-3 sm:px-10 sm:py-5 rounded-2xl text-xl sm:text-3xl font-bold shadow-2xl whitespace-nowrap " +
            (toast.variant === 'done'
              ? "bg-green-500 text-slate-950"
              : toast.variant === 'abandoned'
              ? "bg-amber-500 text-slate-950"
              : "bg-sky-500 text-slate-950")
          }
          style={{
            animation: toastExiting
              ? 'toast-slide-out 250ms ease-in forwards'
              : 'toast-slide-in 200ms ease-out forwards',
          }}
        >
          {toast.message}
        </div>
      </div>
    )}

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
