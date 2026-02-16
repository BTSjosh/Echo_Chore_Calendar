import { useEffect, useState } from 'react';

import {
  saveToLocalStorage,
  loadFromLocalStorage,
  saveChoreDefinitions,
  loadChoreDefinitions,
  savePostpones,
  loadPostpones,
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

import { getDateKey, toDateOnly } from '../utils/dates';

import { mergePostpones, extractRemoteChores, extractRemoteProgress } from '../utils/sync';

import { appendHistoryEvent, loadHistory, saveHistory, mergeHistory } from '../utils/history';

import type { Chore, PostponeEntry, RawImportedChore, RemotePayload } from '../types';

export interface UseChoreStateReturn {
  chores: Chore[];
  postponedOverrides: PostponeEntry[];
  toggleCompleted: (subject: string, currentDate: Date) => void;
  toggleMemberCompleted: (subject: string, member: string, currentDate: Date) => boolean;
  postponeToDate: (subject: string, fromDateKey: string, toDate: string) => void;
  replaceChores: (nextChores: Chore[]) => void;
  mergeRemotePostpones: (remote: PostponeEntry[]) => void;
  processRemoteData: (payload: RemotePayload, updated_at: string | null) => boolean;
  /**
   * Auto-postpone all undone chores from `today` to `tomorrow`.
   * Used by the midnight rollover hook.
   */
  autoPostponeUndone: (today: Date) => void;
}

export default function useChoreState(): UseChoreStateReturn {
  const [chores, setChores] = useState<Chore[]>(() => {
    const storedProgress = loadFromLocalStorage();
    const storedDefinitions = loadChoreDefinitions();
    const baseChores = (storedDefinitions ?? SEED_CHORES) as RawImportedChore[];
    return applyProgress(buildInitialChores(baseChores), storedProgress);
  });

  const [postponedOverrides, setPostponedOverrides] = useState<PostponeEntry[]>(
    () => loadPostpones()
  );

  // Persist progress when chores change
  useEffect(() => {
    saveToLocalStorage(extractProgress(chores));
  }, [chores]);

  // Persist postpones when they change
  useEffect(() => {
    savePostpones(postponedOverrides);
  }, [postponedOverrides]);

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
    setChores((prev) =>
      prev.map((chore) => {
        if (chore.subject !== subject) return chore;
        if (chore.completed) {
          appendHistoryEvent({
            action: 'uncompleted',
            choreSubject: subject,
            members: [],
            dueDate: getDateKey(currentDate),
          });
          return { ...chore, completed: false, completedBy: [] };
        }
        appendHistoryEvent({
          action: 'completed',
          choreSubject: subject,
          members: [],
          dueDate: getDateKey(currentDate),
        });
        return advanceRotation({ ...chore, completed: true, completedBy: [] }, currentDate);
      })
    );
  };

  const toggleMemberCompleted = (subject: string, member: string, currentDate: Date): boolean => {
    let shouldAutoClose = false;
    setChores((prev) =>
      prev.map((chore) => {
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
      })
    );
    return shouldAutoClose;
  };

  const postponeToDate = (subject: string, fromDateKey: string, toDate: string) => {
    appendHistoryEvent({
      action: 'postponed',
      choreSubject: subject,
      members: [],
      dueDate: fromDateKey,
      postponedTo: toDate,
    });
    setPostponedOverrides((prev) => {
      const next = prev.filter(
        (override) =>
          !(override.subject === subject && override.fromDate === fromDateKey)
      );
      next.push({ subject, fromDate: fromDateKey, toDate });
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

    const remoteDefinitions = extractRemoteChores(payload);
    const remoteProgress = extractRemoteProgress(payload);
    const baseChores = (remoteDefinitions ?? SEED_CHORES) as RawImportedChore[];
    const storedProgress = remoteProgress ?? loadFromLocalStorage();
    const nextChores = applyProgress(buildInitialChores(baseChores), storedProgress);

    setChores(nextChores);

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
      mergeRemotePostpones(remotePostpones);
    }

    if (Array.isArray(payload?.history)) {
      const merged = mergeHistory(loadHistory(), payload.history);
      saveHistory(merged);
    }

    void updated_at; // consumed by useChoreSync
    return true;
  };

  const autoPostponeUndone = (today: Date) => {
    const todayNorm = toDateOnly(today);
    const todayKey = getDateKey(todayNorm);
    const tomorrow = new Date(todayNorm);
    tomorrow.setDate(todayNorm.getDate() + 1);
    const tomorrowKey = getDateKey(tomorrow);

    setChores((prevChores) => {
      const undoneSubjects = prevChores
        .filter(
          (chore) =>
            isDueOnDate(chore, todayNorm) &&
            !isChoreComplete(chore, getAssignedMembers(chore, todayNorm), todayNorm)
        )
        .map((chore) => chore.subject);

      if (undoneSubjects.length > 0) {
        setPostponedOverrides((prevOverrides) => {
          const newOverrides = [...prevOverrides];
          undoneSubjects.forEach((subject) => {
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
                members: [],
                dueDate: todayKey,
                postponedTo: tomorrowKey,
              });
            }
          });
          return newOverrides;
        });
      }

      return prevChores;
    });
  };

  return {
    chores,
    postponedOverrides,
    toggleCompleted,
    toggleMemberCompleted,
    postponeToDate,
    replaceChores,
    mergeRemotePostpones,
    processRemoteData,
    autoPostponeUndone,
  };
}
