import { useState, useCallback } from 'react';
import {
  loadChoreDefinitions,
  saveChoreDefinitions,
  saveToLocalStorage,
  STORAGE_KEY,
} from '../../utils/storage';
import { SEED_CHORES, buildInitialChores } from '../../utils/chores';
import { loadHistory, saveHistory } from '../../utils/history';
import type { Chore, ChoreDefinition, RawImportedChore, HistoryEvent } from '../../types';

export default function useChoreEditorState() {
  const [chores, setChores] = useState<Chore[]>(() => {
    const storedDefinitions = loadChoreDefinitions();
    const baseChores = (storedDefinitions ?? SEED_CHORES) as RawImportedChore[];
    return buildInitialChores(baseChores);
  });

  const persistDefinitions = useCallback((nextChores: Chore[]) => {
    saveChoreDefinitions(nextChores);
  }, []);

  const addChore = useCallback((def: ChoreDefinition) => {
    setChores((prev) => {
      const { nextDue: _nd, nextDueDate: _ndd, ...rest } = def;
      const newChore = {
        ...rest,
        completed: false,
        completedBy: [],
      } as Chore;
      const next = [...prev, newChore];
      persistDefinitions(next);
      return next;
    });
  }, [persistDefinitions]);

  const updateChore = useCallback((
    oldSubject: string,
    def: ChoreDefinition
  ) => {
    setChores((prev) => {
      const { nextDue: _nd, nextDueDate: _ndd, ...defRest } = def;
      const next = prev.map((chore): Chore => {
        if (chore.subject !== oldSubject) return chore;
        return {
          ...chore,
          ...defRest,
          // Keep existing progress data
          completed: chore.completed,
          completedBy: chore.completedBy,
          lastCompleted: chore.lastCompleted,
          lastCompletedDate: chore.lastCompletedDate,
          completedThrough: chore.completedThrough,
          rotationIndex: chore.rotationIndex,
          rotationPosition: chore.rotationPosition,
          rotationCursor: chore.rotationCursor,
          rotationIndexPrev: chore.rotationIndexPrev,
        };
      });
      persistDefinitions(next);

      // If subject changed, migrate progress and history
      if (oldSubject !== def.subject) {
        migrateProgressKey(oldSubject, def.subject);
        migrateHistorySubject(oldSubject, def.subject);
      }

      return next;
    });
  }, [persistDefinitions]);

  const deleteChore = useCallback((subject: string) => {
    setChores((prev) => {
      const next = prev.filter((c) => c.subject !== subject);
      persistDefinitions(next);
      return next;
    });
  }, [persistDefinitions]);

  return { chores, addChore, updateChore, deleteChore };
}

function migrateProgressKey(oldSubject: string, newSubject: string) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const data = JSON.parse(stored);
    const progress = data?.progress;
    if (!progress || typeof progress !== 'object') return;
    if (oldSubject in progress) {
      progress[newSubject] = progress[oldSubject];
      delete progress[oldSubject];
      saveToLocalStorage(progress);
    }
  } catch {
    // ignore
  }
}

function migrateHistorySubject(oldSubject: string, newSubject: string) {
  const history = loadHistory();
  let changed = false;
  const updated = history.map((event: HistoryEvent) => {
    if (event.choreSubject === oldSubject) {
      changed = true;
      return { ...event, choreSubject: newSubject };
    }
    return event;
  });
  if (changed) {
    saveHistory(updated);
  }
}
