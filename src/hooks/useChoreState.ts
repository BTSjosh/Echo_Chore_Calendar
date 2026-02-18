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
  buildInitialChores,
  extractProgress,
  applyProgress,
} from '../utils/chores';

import { getDateKey, toDateOnly, parseDateKey } from '../utils/dates';

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
    return applyProgress(buildInitialChores(baseChores), storedProgress);
  });

  const [postponedOverrides, setPostponedOverrides] = useState<PostponeEntry[]>(
    () => loadPostpones()
  );

  // Note: localStorage saves are done synchronously inside each setState updater
  // so that pushSnapshotToSupabase (called on visibilitychange/beforeunload)
  // always reads up-to-date data from localStorage, not stale pre-render data.

  const advanceRotation = (chore: Chore, currentDate: Date): Chore => {
    if (chore.assignmentType !== 'rotating') return chore;
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

  const toggleCompleted = (subject: string, currentDate: Date) => {
    dirtyRef.current = true;
    setChores((prev) => {
      const next = prev.map((chore) => {
        if (chore.subject !== subject) return chore;
        if (chore.completed) {
          appendHistoryEvent({
            action: 'uncompleted',
            choreSubject: subject,
            members: getAssignedMembers(chore, currentDate),
            dueDate: getDateKey(currentDate),
          });
          return { ...chore, completed: false, completedBy: [] };
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
        if (completedBy.length === 0 && nextCompletedBy.length > 0) {
          shouldAutoClose = true;
        }
        appendHistoryEvent({
          action: removing ? 'uncompleted' : 'completed',
          choreSubject: subject,
          members: [member],
          dueDate: getDateKey(currentDate),
        });
        const completed =
          assigned.length > 1
            ? assigned.every((name) => nextCompletedBy.includes(name))
            : Boolean(chore.completed);
        const updated: Chore = { ...chore, completedBy: nextCompletedBy, completed };
        return completed ? advanceRotation(updated, currentDate) : updated;
      });
      saveToLocalStorage(extractProgress(next));
      return next;
    });
    return shouldAutoClose;
  };

  const postponeToDate = (subject: string, fromDateKey: string, toDate: string) => {
    dirtyRef.current = true;
    const choreForPostpone = chores.find((c) => c.subject === subject);
    const postponeDate = parseDateKey(fromDateKey) ?? toDateOnly(new Date());
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

  const processRemoteData = (payload: RemotePayload, updated_at: string | null): boolean => {
    if (!payload) return false;
    dirtyRef.current = true;

    // If our last push intent is more recent than the remote snapshot's timestamp,
    // the remote is stale (our keepalive push hasn't landed yet or Supabase hasn't
    // processed it). Preserve local progress/postpones and only apply definitions.
    const pushIntent = loadPushIntent();
    const remoteTime = updated_at ? new Date(updated_at).getTime() : 0;
    const localIsNewer = pushIntent > 0 && pushIntent > remoteTime;

    const remoteDefinitions = extractRemoteChores(payload);
    const baseChores = (remoteDefinitions ?? SEED_CHORES) as RawImportedChore[];

    if (remoteDefinitions) {
      saveChoreDefinitions(remoteDefinitions as unknown as Chore[]);
    }

    // Always merge history — additive only, no conflicts possible
    if (Array.isArray(payload?.history)) {
      const merged = mergeHistory(loadHistory(), payload.history);
      saveHistory(merged);
    }

    if (localIsNewer) {
      // Rebuild chores from local progress so definitions stay current,
      // but don't overwrite locally-resolved completions or postpones.
      const localProgress = loadFromLocalStorage();
      setChores(applyProgress(buildInitialChores(baseChores), localProgress));
      return true;
    }

    // Remote is newer — clear push intent and apply remote data fully
    clearPushIntent();
    const remoteProgress = extractRemoteProgress(payload);
    const storedProgress = remoteProgress ?? loadFromLocalStorage();
    setChores(applyProgress(buildInitialChores(baseChores), storedProgress));

    if (remoteProgress) {
      saveToLocalStorage(remoteProgress);
    }

    const remotePostpones = Array.isArray(payload?.postponedOverrides)
      ? payload.postponedOverrides
      : null;
    if (remotePostpones) {
      mergeRemotePostpones(remotePostpones);
    }

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
    const overdueDate = parseDateKey(fromDate) ?? toDateOnly(new Date());
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
    const abandonDate = parseDateKey(fromDate) ?? toDateOnly(new Date());
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
        const overdueDate = parseDateKey(fromDate) ?? toDateOnly(new Date());
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
    dirtyRef.current = true;
    const todayNorm = toDateOnly(today);
    const todayKey = getDateKey(todayNorm);
    const tomorrow = new Date(todayNorm);
    tomorrow.setDate(todayNorm.getDate() + 1);
    const tomorrowKey = getDateKey(tomorrow);

    setChores((prevChores) => {
      const undoneChores = prevChores.filter(
        (chore) =>
          isDueOnDate(chore, todayNorm) &&
          !isChoreComplete(chore, getAssignedMembers(chore, todayNorm), todayNorm)
      );

      if (undoneChores.length > 0) {
        setPostponedOverrides((prevOverrides) => {
          const newOverrides = [...prevOverrides];
          undoneChores.forEach((chore) => {
            const { subject } = chore;
            const alreadyExists = prevOverrides.some(
              (override) =>
                override.subject === subject &&
                override.fromDate === todayKey &&
                override.toDate === tomorrowKey
            );
            if (!alreadyExists) {
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
          savePostpones(newOverrides);
          return newOverrides;
        });
      }

      return prevChores;
    });
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
