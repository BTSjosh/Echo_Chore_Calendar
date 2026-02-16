import { useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import AdminUpload from './AdminUpload'
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
  saveToLocalStorage,
  loadFromLocalStorage,
  saveChoreDefinitions,
  loadChoreDefinitions,
  savePostpones,
  loadPostpones,
  loadAccessCode,
} from './utils/storage'

import {
  HOUSEHOLD,
  SEED_CHORES,
  TABS,
  getNextDueAfter,
  isDueOnDate,
  getDueDatesInRange,
  getRotationIndex,
  getAssignedMembers,
  getCompletedBy,
  isChoreComplete,
  buildInitialChores,
  extractProgress,
  applyProgress,
} from './utils/chores'

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  ACCESS_CODE,
  syncAccessCodeFromUrl,
  fetchRemoteSnapshot,
  extractRemoteChores,
  extractRemoteProgress,
  mergePostpones,
} from './utils/sync'

import useKeepAlive from './hooks/useKeepAlive'
import ChoreCard from './components/ChoreCard'
import AssigneePickerModal from './components/AssigneePickerModal'
import PostponeSelectorModal from './components/PostponeSelectorModal'

import type { Chore, PostponeEntry, TabName, RawImportedChore, RemotePayload } from './types'

function ChoreApp() {
  const [activeTab, setActiveTab] = useState<TabName>("Today");
  const [selectedMember, setSelectedMember] = useState("All");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [isReloading, setIsReloading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [chores, setChores] = useState<Chore[]>(() => {
    const storedProgress = loadFromLocalStorage();
    const storedDefinitions = loadChoreDefinitions();
    const baseChores = (storedDefinitions ?? SEED_CHORES) as RawImportedChore[];
    return applyProgress(buildInitialChores(baseChores), storedProgress);
  });
  const [postponedOverrides, setPostponedOverrides] = useState<PostponeEntry[]>(() => loadPostpones());
  const [postponeTarget, setPostponeTarget] = useState<string | null>(null);
  const [assigneePicker, setAssigneePicker] = useState<string | null>(null);
  const [expandedChore, setExpandedChore] = useState<string | null>(null);
  const assigneeCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useKeepAlive();

  const processRemoteData = (payload: RemotePayload, updated_at: string | null): boolean => {
    if (!payload) return false;

    const remoteDefinitions = extractRemoteChores(payload);
    const remoteProgress = extractRemoteProgress(payload);
    const baseChores = (remoteDefinitions ?? SEED_CHORES) as RawImportedChore[];
    const storedProgress = remoteProgress ?? loadFromLocalStorage();
    const nextChores = applyProgress(buildInitialChores(baseChores), storedProgress);

    setChores(nextChores);
    setLastUpdatedAt(updated_at);

    if (remoteDefinitions) {
      saveChoreDefinitions(remoteDefinitions as unknown as Chore[]);
    }

    if (remoteProgress) {
      saveToLocalStorage(remoteProgress);
    }

    const remotePostpones = Array.isArray(payload?.postponedOverrides)
      ? payload.postponedOverrides
      : null;
    if (remotePostpones) {
      setPostponedOverrides((prev) => mergePostpones(prev, remotePostpones));
      savePostpones(mergePostpones(loadPostpones(), remotePostpones));
    }

    return true;
  };

  const checkForUpdates = async (silent = false) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    try {
      const result = await fetchRemoteSnapshot();
      if (!result) return;

      const { payload, updated_at } = result;

      if (lastUpdatedAt && updated_at && new Date(updated_at) <= new Date(lastUpdatedAt)) {
        if (!silent) console.log('Data is up to date');
        return;
      }

      if (payload) {
        const success = processRemoteData(payload, updated_at);
        if (success && !silent) {
          console.log('Auto-reloaded new data');
        }
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const handleReloadData = async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      window.alert('Supabase not configured');
      return;
    }

    setIsReloading(true);
    try {
      const result = await fetchRemoteSnapshot();
      if (!result || !result.payload) {
        window.alert('No data found in Supabase');
        setIsReloading(false);
        return;
      }

      processRemoteData(result.payload, result.updated_at);
      console.log('Data reloaded successfully');
    } catch (error) {
      console.error('Failed to reload data:', error);
      window.alert('Failed to reload data from cloud');
    } finally {
      setIsReloading(false);
    }
  };

  // Remote sync on mount + visibility/polling
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    syncAccessCodeFromUrl();

    if (ACCESS_CODE) {
      const storedCode = loadAccessCode();
      if (storedCode !== ACCESS_CODE) {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!isLocalhost) {
          return;
        }
      }
    }

    let isActive = true;

    const loadRemote = async () => {
      try {
        const result = await fetchRemoteSnapshot();
        if (!result || !isActive) return;

        const { payload, updated_at } = result;
        if (payload) {
          processRemoteData(payload, updated_at);
        }
      } catch (error) {
        console.error('Failed to load cloud snapshot:', error);
      }
    };

    loadRemote();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkForUpdates(true);
      }
    }, 2 * 60 * 1000);

    return () => {
      isActive = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(pollInterval);
    };
  }, []);

  // Midnight rollover
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeoutId = setTimeout(() => {
      setCurrentDate(new Date());
      intervalId = setInterval(() => setCurrentDate(new Date()), 24 * 60 * 60 * 1000);

      setChores((prevChores) => {
        const today = toDateOnly(now);
        const todayKey = getDateKey(today);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const tomorrowKey = getDateKey(tomorrow);

        const undoneSubjects = prevChores
          .filter((chore) => isDueOnDate(chore, today) && !isChoreComplete(chore, getAssignedMembers(chore, today), today))
          .map((chore) => chore.subject);

        setPostponedOverrides((prevOverrides) => {
          const newOverrides = [...prevOverrides];
          undoneSubjects.forEach((subject) => {
            const alreadyExists = prevOverrides.some(
              (override) => override.subject === subject && override.fromDate === todayKey && override.toDate === tomorrowKey
            );
            if (!alreadyExists) {
              newOverrides.push({ subject, fromDate: todayKey, toDate: tomorrowKey });
            }
          });
          return newOverrides;
        });
        return prevChores;
      });
    }, nextMidnight.getTime() - now.getTime());

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  // Persist postpones
  useEffect(() => {
    savePostpones(postponedOverrides);
  }, [postponedOverrides]);

  // Persist progress
  useEffect(() => {
    saveToLocalStorage(extractProgress(chores));
  }, [chores]);

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
  }, [activeTab, chores, currentDate, selectedMember]);

  const advanceRotation = (chore: Chore): Chore => {
    if (chore.assignmentType !== "rotating") return chore;
    const rotation = chore.rotation;
    const members = Array.isArray(rotation?.members) ? rotation!.members : [];
    if (!members.length) return chore;

    const currentIndex = getRotationIndex(chore, currentDate);
    const nextIndex = (currentIndex + 1) % members.length;
    const nextDue = getNextDueAfter(chore, currentDate);

    return {
      ...chore,
      rotationIndexPrev: currentIndex,
      rotationIndex: nextIndex,
      lastCompletedDate: getDateKey(currentDate),
      completedThrough: nextDue ? getDateKey(nextDue) : undefined,
      completed: true,
      completedBy: [],
    };
  };

  const toggleCompleted = (subject: string) => {
    setChores((prev) =>
      prev.map((chore) =>
        chore.subject === subject
          ? chore.completed
            ? { ...chore, completed: false, completedBy: [] }
            : advanceRotation({ ...chore, completed: true, completedBy: [] })
          : chore
      )
    );
  };

  const toggleMemberCompleted = (subject: string, member: string) => {
    let shouldAutoClose = false;
    setChores((prev) =>
      prev.map((chore) => {
        if (chore.subject !== subject) return chore;
        const assigned = getAssignedMembers(chore, currentDate);
        const completedBy = getCompletedBy(chore, assigned);
        const nextCompletedBy = completedBy.includes(member)
          ? completedBy.filter((name) => name !== member)
          : [...completedBy, member];
        if (completedBy.length === 0 && nextCompletedBy.length > 0) {
          shouldAutoClose = true;
        }
        const completed = assigned.length > 1
          ? assigned.every((name) => nextCompletedBy.includes(name))
          : Boolean(chore.completed);
        const updated: Chore = { ...chore, completedBy: nextCompletedBy, completed };
        return completed ? advanceRotation(updated) : updated;
      })
    );

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
    const toDate = getDateKey(date);
    setPostponedOverrides((prev) => {
      const next = prev.filter(
        (override) =>
          !(override.subject === subject && override.fromDate === todayKey)
      );
      next.push({ subject, fromDate: todayKey, toDate });
      return next;
    });
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
                    onToggleDescription={toggleDescription}
                    onToggleCompleted={toggleCompleted}
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
          onToggleMemberCompleted={toggleMemberCompleted}
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
    </Routes>
  );
}

export default App;
