import type { ChoreProgress, ProgressFieldKey, ProgressRecord, PostponeEntry, Chore } from '../types';

export const STORAGE_KEY = 'echo-chore-schedule';
export const POSTPONE_KEY = 'echo-chore-postpones';
export const CHORE_DEFS_KEY = 'echo-chore-definitions';
export const HISTORY_KEY = 'echo-chore-history';
export const ACCESS_CODE_KEY = 'echo-chore-access-code';
export const PUSH_INTENT_KEY = 'echo-chore-push-intent';

/** Record the moment a Supabase push was initiated so processRemoteData can
 *  detect when the remote snapshot is stale relative to local state. */
export const savePushIntent = (): void => {
  try { localStorage.setItem(PUSH_INTENT_KEY, Date.now().toString()); } catch (e) { void e; }
};

export const loadPushIntent = (): number => {
  try {
    const val = localStorage.getItem(PUSH_INTENT_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch (e) { void e; return 0; }
};

export const clearPushIntent = (): void => {
  try { localStorage.removeItem(PUSH_INTENT_KEY); } catch (e) { void e; }
};

export const PROGRESS_FIELDS: ProgressFieldKey[] = [
  "completed",
  "completedBy",
  "lastCompleted",
  "lastCompletedDate",
  "completedToday",
  "completedThrough",
  "nextDue",
  "nextDueDate",
  "rotationIndex",
  "rotationPosition",
  "rotationCursor",
  "rotationIndexPrev",
  "rotationState",
];

export const normalizeProgressEntry = (entry: Record<string, unknown> | null | undefined): ChoreProgress | null => {
  if (!entry || typeof entry !== "object") return null;
  const normalized: Record<string, unknown> = {
    completed: Boolean(entry.completed),
    completedBy: Array.isArray(entry.completedBy) ? entry.completedBy : [],
  };

  PROGRESS_FIELDS.forEach((field) => {
    if (field === "completed" || field === "completedBy") return;
    if (entry[field] !== undefined) {
      normalized[field] = entry[field];
    }
  });

  return normalized as unknown as ChoreProgress;
};

export const parseStoredProgress = (payload: unknown): ProgressRecord | null => {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    return payload.reduce<ProgressRecord>((acc, item) => {
      if (!item?.subject) return acc;
      const normalized = normalizeProgressEntry(item as Record<string, unknown>);
      if (!normalized) return acc;
      acc[item.subject as string] = normalized;
      return acc;
    }, {});
  }

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const progress = (record.progress ?? record) as Record<string, unknown>;
    if (progress && typeof progress === 'object' && !Array.isArray(progress)) {
      return Object.keys(progress).reduce<ProgressRecord>((acc, key) => {
        const entry = progress[key];
        const normalized = normalizeProgressEntry(entry as Record<string, unknown>);
        if (!normalized) return acc;
        acc[key] = normalized;
        return acc;
      }, {});
    }
  }

  return null;
};

export const saveToLocalStorage = (progress: ProgressRecord): void => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, progress })
    );
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

export const loadFromLocalStorage = (): ProgressRecord | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return parseStoredProgress(JSON.parse(stored));
    }
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
  }
  return null;
};

export const saveChoreDefinitions = (chores: Chore[]): void => {
  try {
    const definitions = Array.isArray(chores)
      ? chores.map((chore) => {
          const next = { ...chore } as Record<string, unknown>;
          PROGRESS_FIELDS.forEach((field) => {
            if (field in next) {
              delete next[field];
            }
          });
          return next;
        })
      : [];
    localStorage.setItem(CHORE_DEFS_KEY, JSON.stringify(definitions));
  } catch (error) {
    console.error('Failed to save chore definitions:', error);
  }
};

export const loadChoreDefinitions = (): unknown[] | null => {
  try {
    const stored = localStorage.getItem(CHORE_DEFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : null;
    }
  } catch (error) {
    console.error('Failed to load chore definitions:', error);
  }
  return null;
};

export const savePostpones = (overrides: PostponeEntry[]): void => {
  try {
    localStorage.setItem(POSTPONE_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.error('Failed to save postpones:', error);
  }
};

export const loadPostpones = (): PostponeEntry[] => {
  try {
    const stored = localStorage.getItem(POSTPONE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load postpones:', error);
  }
  return [];
};

export const loadAccessCode = (): string | null => {
  try {
    const code = localStorage.getItem(ACCESS_CODE_KEY);
    return code;
  } catch (error) {
    console.error('Failed to load access code:', error);
  }
  return null;
};

export const saveAccessCode = (code: string): void => {
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code);
  } catch (error) {
    console.error('Failed to save access code:', error);
  }
};
