import { useRef, useState } from 'react';

import {
  saveToLocalStorage,
  loadFromLocalStorage,
  saveChoreDefinitions,
  loadChoreDefinitions,
  savePostpones,
  loadPostpones,
  loadPushIntent,
  clearPushIntent,
} from '../utils/storage';

import {
  SEED_CHORES,
  getNextDueAfter,
  isDueOnDate,
  getRotationIndex,
  getAssignedMembers,
  getCompletedBy,
  isChoreComplete,
  isCompletionActive,
  buildInitialChores,
  extractProgress,
  applyProgress,
} from '../utils/chores';

import { getDateKey, toDateOnly, parseDateKey, getLogicalNow } from '../utils/dates';

import { mergePostpones, extractRemoteChores, extractRemoteProgress } from '../utils/sync';

import { appendHistoryEvent, loadHistory, saveHistory, mergeHistory } from '../utils/history';

import type { Chore, PostponeEntry, RawImportedChore, RemotePayload } from '../types';

export interface UseChoreStateReturn {
  chores: Chore[];
  postponedOverrides: PostponeEntry[];
  dirtyRef: React.RefObject<boolean>;
  toggleCompleted: (subject: string, currentDate: Date) => void;
  toggleMemberCompleted: (subject: string, member: string, currentDate: Date) => boolean;
  postponeToDate: (subject: string, fromDateKey: string, toDate: string) => void;
  replaceChores: (nextChores: Chore[]) => void;
  mergeRemotePostpones: (remote: PostponeEntry[]) => void;
  processRemoteData: (payload: RemotePayload, updated_at: string | null) => boolean;
  /** Mark an overdue chore as completed late and remove the override. */
  completeLateOverdue: (subject: string, fromDate: string) => void;
  /** Abandon an overdue chore (won't be completed) and remove the override. */
  abandonOverdue: (subject: string, fromDate: string) => void;
  /**
   * Auto-postpone all undone chores from `today` to `tomorrow`.
   * Used by the midnight rollover hook.
   */
  autoPostponeUndone: (today: Date) => void;
}

export default function useChoreState(): UseChoreStateReturn {
  const dirtyRef = useRef(false);

  const [chores, setChores] = useState<Chore[]>(() => {
    const storedProgress = loadFromLocalStorage();
    const storedDefinitions = loadChoreDefinitions();
    const baseChores = (storedDefinitions ?? SEED_CHORES) as RawImportedChore[];
    const normalized = buildInitialChores(baseChores);
    // Re-save normalized definitions to strip legacy/obsolete fields from old data
    // so that backups and Supabase pushes always contain clean, current-format chores.
    if (storedDefinitions) {
      saveChoreDefinitions(normalized);
    }
    return applyProgress(normalized, storedProgress);
  });

  // Keep a ref to the latest chores so callbacks can read current state
  // without nesting state setters or relying on stale closures.
  const choresRef = useRef(chores);
  choresRef.current = chores;

  const [postponedOverrides, setPostponedOverrides] = useState<PostponeEntry[]>(
    () => loadPostpones()
  );

  // Note: localStorage saves are done synchronously inside each setState updater
  // so that pushSnapshotToSupabase (called on visibilitychange/beforeunload)
  // always reads up-to-date data from localStorage, not stale pre-render data.

  const advanceRotation = (chore: Chore, currentDate: Date): Chore => {
    const nextDue = getNextDueAfter(chore, currentDate);

    if (chore.assignmentType !== 'rotating') {
      // Set completedThrough so isCompletionActive can expire the completion on the next due date
      return {
        ...chore,
        lastCompletedDate: getDateKey(currentDate),
        completedThrough: nextDue ? getDateKey(nextDue) : undefined,
      };
    }

    const rotation = chore.rotation;
    const members = Array.isArray(rotation?.members) ? rotation!.members : [];
    if (!members.length) return chore;

    const currentIndex = getRotationIndex(chore, currentDate);
    const nextIndex = (currentIndex + 1) % members.length;

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

  const toggleCompleted = (subject: string, currentDate: Date) => {
    dirtyRef.current = true;
    setChores((prev) => {
      const next = prev.map((chore) => {
        if (chore.subject !== subject) return chore;
        // Use isCompletionActive (date-aware) rather than chore.completed.
        // After completeLateOverdue, chore.completed=true but the completion may
        // have already expired for the current date (completedThrough < currentDate).
        // Checking chore.completed would incorrectly trigger the unmark branch.
        if (isCompletionActive(chore, currentDate)) {
          appendHistoryEvent({
            action: 'uncompleted',
            choreSubject: subject,
            members: getAssignedMembers(chore, currentDate),
            dueDate: getDateKey(currentDate),
          });
          // Roll the rotation index back to what it was before completion so that
          // mark → unmark is a no-op for the rotation. Without this, every
          // uncheck advances the rotation one step, confusingly changing the assignee.
          const rolledBackIndex = Number.isFinite(chore.rotationIndexPrev)
            ? chore.rotationIndexPrev
            : chore.rotationIndex;
          return {
            ...chore,
            completed: false,
            completedBy: [],
            lastCompletedDate: undefined,
            completedThrough: undefined,
            rotationIndex: rolledBackIndex,
            rotationIndexPrev: undefined,
          };
        }
        appendHistoryEvent({
          action: 'completed',
          choreSubject: subject,
          members: getAssignedMembers(chore, currentDate),
          dueDate: getDateKey(currentDate),
        });
        return advanceRotation({ ...chore, completed: true, completedBy: [] }, currentDate);
      });
      saveToLocalStorage(extractProgress(next));
      return next;
    });
  };

  const toggleMemberCompleted = (subject: string, member: string, currentDate: Date): boolean => {
    dirtyRef.current = true;
    let shouldAutoClose = false;
    setChores((prev) => {
      const next = prev.map((chore) => {
        if (chore.subject !== subject) return chore;
        const assigned = getAssignedMembers(chore, currentDate);
        const completedBy = getCompletedBy(chore, assigned);
        const removing = completedBy.includes(member);
        const nextCompletedBy = removing
          ? completedBy.filter((name) => name !== member)
          : [...completedBy, member];
        if (!removing && assigned.every((name) => nextCompletedBy.includes(name))) {
          shouldAutoClose = true;
        }
        appendHistoryEvent({
          action: removing ? 'uncompleted' : 'completed',
          choreSubject: subject,
          members: [member],
          dueDate: getDateKey(currentDate),
        });
        const wasCompleted = chore.completed;
        const completed =
          assigned.length > 1
            ? assigned.every((name) => nextCompletedBy.includes(name))
            : Boolean(chore.completed);
        const updated: Chore = { ...chore, completedBy: nextCompletedBy, completed };
        if (completed) return advanceRotation(updated, currentDate);
        // If dropping from fully-done back to incomplete, roll back the rotation
        // so the assignee doesn't silently jump to the next person.
        if (wasCompleted && !completed) {
          const rolledBackIndex = Number.isFinite(chore.rotationIndexPrev)
            ? chore.rotationIndexPrev
            : chore.rotationIndex;
          return { ...updated, rotationIndex: rolledBackIndex, rotationIndexPrev: undefined,
            lastCompletedDate: undefined, completedThrough: undefined };
        }
        return updated;
      });
      saveToLocalStorage(extractProgress(next));
      return next;
    });
    return shouldAutoClose;
  };

  const postponeToDate = (subject: string, fromDateKey: string, toDate: string) => {
    dirtyRef.current = true;
    const choreForPostpone = chores.find((c) => c.subject === subject);
    const postponeDate = parseDateKey(fromDateKey) ?? toDateOnly(getLogicalNow());
    appendHistoryEvent({
      action: 'postponed',
      choreSubject: subject,
      members: choreForPostpone ? getAssignedMembers(choreForPostpone, postponeDate) : [],
      dueDate: fromDateKey,
      postponedTo: toDate,
    });
    setPostponedOverrides((prev) => {
      const next = prev.filter(
        (override) =>
          !(override.subject === subject && override.fromDate === fromDateKey)
      );
      next.push({ subject, fromDate: fromDateKey, toDate });
      savePostpones(next);
      return next;
    });
  };

  const replaceChores = (nextChores: Chore[]) => {
    setChores(nextChores);
  };

  const mergeRemotePostpones = (remote: PostponeEntry[]) => {
    setPostponedOverrides((prev) => mergePostpones(prev, remote));
    savePostpones(mergePostpones(loadPostpones(), remote));
  };

  // Remove postpone overrides that are now stale because the chore was actually
  // completed for the original due date (e.g. marked done on Echo Show before
  // the PC's midnight rollover created the override).
  const cleanupStalePostpones = (resolvedChores: Chore[]) => {
    setPostponedOverrides((prev) => {
      const cleaned = prev.filter((override) => {
        const chore = resolvedChores.find((c) => c.subject === override.subject);
        if (!chore) return true;
        const originalDate = parseDateKey(override.fromDate);
        if (!originalDate) return true;
        // Drop the override only if the chore was completed for that original date
        return !isCompletionActive(chore, originalDate);
      });
      if (cleaned.length !== prev.length) {
        savePostpones(cleaned);
      }
      return cleaned;
    });
  };

  const processRemoteData = (payload: RemotePayload, updated_at: string | null): boolean => {
    if (!payload) return false;
    dirtyRef.current = true;

    // If our last push intent is more recent than the remote snapshot's timestamp,
    // the remote is stale (our keepalive push hasn't landed yet or Supabase hasn't
    // processed it). Preserve local progress/postpones and only apply definitions.
    const pushIntent = loadPushIntent();
    const remoteTime = updated_at ? new Date(updated_at).getTime() : 0;
    // Ignore push intents older than 5 minutes — they likely represent failed
    // pushes (e.g. network error on beforeunload) that will never land.
    const PUSH_INTENT_TTL_MS = 5 * 60 * 1000;
    const intentIsStale = pushIntent > 0 && (Date.now() - pushIntent) > PUSH_INTENT_TTL_MS;
    if (intentIsStale) {
      clearPushIntent();
    }
    const localIsNewer = !intentIsStale && pushIntent > 0 && pushIntent > remoteTime;

    const remoteDefinitions = extractRemoteChores(payload);
    const baseChores = (remoteDefinitions ?? SEED_CHORES) as RawImportedChore[];

    // Always merge history — additive only, no conflicts possible
    if (Array.isArray(payload?.history)) {
      const merged = mergeHistory(loadHistory(), payload.history);
      saveHistory(merged);
    }

    if (localIsNewer) {
      // Local push is newer than the remote snapshot — keep local definitions so
      // chores added/edited in the editor survive until the push lands in Supabase.
      // Do NOT overwrite echo-chore-definitions here; use whatever is stored locally.
      const localProgress = loadFromLocalStorage();
      const localDefs = loadChoreDefinitions();
      const localBaseChores = (localDefs ?? remoteDefinitions ?? SEED_CHORES) as RawImportedChore[];
      const resolvedChores = applyProgress(buildInitialChores(localBaseChores), localProgress);
      setChores(resolvedChores);
      cleanupStalePostpones(resolvedChores);
      return true;
    }

    // Remote is newer — save remote definitions (normalised) then apply fully.
    if (remoteDefinitions) {
      // Normalize before saving so definitions are stored in clean current format,
      // stripping legacy fields (daysAhead, schedule, daysOfWeek, assignment, etc.)
      saveChoreDefinitions(buildInitialChores(baseChores));
    }

    clearPushIntent();
    const remoteProgress = extractRemoteProgress(payload);
    const storedProgress = remoteProgress ?? loadFromLocalStorage();
    const resolvedChores = applyProgress(buildInitialChores(baseChores), storedProgress);
    setChores(resolvedChores);

    if (remoteProgress) {
      saveToLocalStorage(remoteProgress);
    }

    const remotePostpones = Array.isArray(payload?.postponedOverrides)
      ? payload.postponedOverrides
      : null;
    if (remotePostpones) {
      mergeRemotePostpones(remotePostpones);
    }

    // Clean up stale postpone overrides now that remote progress is applied.
    // This removes overrides created by midnight rollover for chores that were
    // completed on another device before the rollover ran.
    cleanupStalePostpones(resolvedChores);

    return true;
  };

  const removeOverride = (subject: string, fromDate: string) => {
    setPostponedOverrides((prev) => {
      const next = prev.filter(
        (override) =>
          !(override.subject === subject && override.fromDate === fromDate)
      );
      savePostpones(next);
      return next;
    });
  };

  const completeLateOverdue = (subject: string, fromDate: string) => {
    dirtyRef.current = true;
    const choreForLate = chores.find((c) => c.subject === subject);
    const overdueDate = parseDateKey(fromDate) ?? toDateOnly(getLogicalNow());
    appendHistoryEvent({
      action: 'completed_late',
      choreSubject: subject,
      members: choreForLate ? getAssignedMembers(choreForLate, overdueDate) : [],
      dueDate: fromDate,
    });
    // Advance rotation so the next person is up, same as a normal completion.
    setChores((prev) => {
      const next = prev.map((chore) => {
        if (chore.subject !== subject) return chore;
        return advanceRotation({ ...chore, completed: true, completedBy: [] }, overdueDate);
      });
      saveToLocalStorage(extractProgress(next));
      return next;
    });
    removeOverride(subject, fromDate);
  };

  const abandonOverdue = (subject: string, fromDate: string) => {
    dirtyRef.current = true;
    const choreForAbandon = chores.find((c) => c.subject === subject);
    const abandonDate = parseDateKey(fromDate) ?? toDateOnly(getLogicalNow());
    appendHistoryEvent({
      action: 'abandoned',
      choreSubject: subject,
      members: choreForAbandon ? getAssignedMembers(choreForAbandon, abandonDate) : [],
      dueDate: fromDate,
    });
    // Advance rotation so the next person is up, but don't mark the chore completed.
    setChores((prev) => {
      const next = prev.map((chore) => {
        if (chore.subject !== subject) return chore;
        if (chore.assignmentType !== 'rotating') return chore;
        const members = Array.isArray(chore.rotation?.members) ? chore.rotation!.members : [];
        if (!members.length) return chore;
        const overdueDate = parseDateKey(fromDate) ?? toDateOnly(getLogicalNow());
        const currentIndex = getRotationIndex(chore, overdueDate);
        const nextIndex = (currentIndex + 1) % members.length;
        return { ...chore, rotationIndex: nextIndex, rotationIndexPrev: currentIndex };
      });
      saveToLocalStorage(extractProgress(next));
      return next;
    });
    removeOverride(subject, fromDate);
  };

  const autoPostponeUndone = (today: Date) => {
    // NOTE: We intentionally do NOT set dirtyRef here. Auto-postpone overrides
    // are local-display-only until the next processRemoteData (which sets
    // dirtyRef and triggers a push). This prevents the critical race condition
    // where a device with stale local state pushes stale overrides to Supabase,
    // overwriting completions made on another device.
    const todayNorm = toDateOnly(today);
    const todayKey = getDateKey(todayNorm);
    const tomorrow = new Date(todayNorm);
    tomorrow.setDate(todayNorm.getDate() + 1);
    const tomorrowKey = getDateKey(tomorrow);

    // Read fresh from localStorage instead of choresRef.current so that a
    // just-completed processRemoteData (which writes to localStorage
    // synchronously) is reflected here, even if React hasn't re-rendered yet.
    const storedProgress = loadFromLocalStorage();
    const storedDefinitions = loadChoreDefinitions();
    const baseChores = (storedDefinitions ?? SEED_CHORES) as RawImportedChore[];
    const currentChores = applyProgress(buildInitialChores(baseChores), storedProgress);

    const undoneChores = currentChores.filter(
      (chore) =>
        isDueOnDate(chore, todayNorm) &&
        !isChoreComplete(chore, getAssignedMembers(chore, todayNorm), todayNorm)
    );

    if (undoneChores.length > 0) {
      setPostponedOverrides((prevOverrides) => {
        const newOverrides = [...prevOverrides];
        let addedAny = false;
        undoneChores.forEach((chore) => {
          const { subject } = chore;
          const alreadyExists = prevOverrides.some(
            (override) =>
              override.subject === subject &&
              override.fromDate === todayKey &&
              override.toDate === tomorrowKey
          );
          if (!alreadyExists) {
            addedAny = true;
            newOverrides.push({ subject, fromDate: todayKey, toDate: tomorrowKey });
            appendHistoryEvent({
              action: 'auto_postponed',
              choreSubject: subject,
              members: getAssignedMembers(chore, todayNorm),
              dueDate: todayKey,
              postponedTo: tomorrowKey,
            });
          }
        });
        if (addedAny) {
          savePostpones(newOverrides);
          return newOverrides;
        }
        return prevOverrides;
      });
    }
  };

  return {
    chores,
    postponedOverrides,
    dirtyRef,
    toggleCompleted,
    toggleMemberCompleted,
    postponeToDate,
    completeLateOverdue,
    abandonOverdue,
    replaceChores,
    mergeRemotePostpones,
    processRemoteData,
    autoPostponeUndone,
  };
}
