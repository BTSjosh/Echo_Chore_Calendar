import { useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import initialChores from './data/initialChores.json'
import AdminUpload from './AdminUpload.jsx'
import './App.css'

// localStorage helpers
const STORAGE_KEY = 'echo-chore-schedule';
const POSTPONE_KEY = 'echo-chore-postpones';
const CHORE_DEFS_KEY = 'echo-chore-definitions';
const ACCESS_CODE_KEY = 'echo-chore-access-code';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_TABLE = (import.meta.env.VITE_SUPABASE_TABLE || 'chore_snapshots').trim();
const SUPABASE_REMOTE_ID = (import.meta.env.VITE_CHORE_REMOTE_ID || 'current').trim();
const ACCESS_CODE = (import.meta.env.VITE_CHORE_ACCESS_CODE || '').trim();

const PROGRESS_FIELDS = [
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

const normalizeProgressEntry = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const normalized = {
    completed: Boolean(entry.completed),
    completedBy: Array.isArray(entry.completedBy) ? entry.completedBy : [],
  };

  PROGRESS_FIELDS.forEach((field) => {
    if (field === "completed" || field === "completedBy") return;
    if (entry[field] !== undefined) {
      normalized[field] = entry[field];
    }
  });

  return normalized;
};

const saveToLocalStorage = (progress) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, progress })
    );
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

const saveChoreDefinitions = (chores) => {
  try {
    const definitions = Array.isArray(chores)
      ? chores.map((chore) => {
          const next = { ...chore };
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

const parseStoredProgress = (payload) => {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    return payload.reduce((acc, item) => {
      if (!item?.subject) return acc;
      const normalized = normalizeProgressEntry(item);
      if (!normalized) return acc;
      acc[item.subject] = normalized;
      return acc;
    }, {});
  }

  if (typeof payload === 'object') {
    const progress = payload.progress ?? payload;
    if (progress && typeof progress === 'object' && !Array.isArray(progress)) {
      return Object.keys(progress).reduce((acc, key) => {
        const entry = progress[key];
        const normalized = normalizeProgressEntry(entry);
        if (!normalized) return acc;
        acc[key] = normalized;
        return acc;
      }, {});
    }
  }

  return null;
};

const loadFromLocalStorage = () => {
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

const loadChoreDefinitions = () => {
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

const savePostpones = (overrides) => {
  try {
    localStorage.setItem(POSTPONE_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.error('Failed to save postpones:', error);
  }
};

const loadPostpones = () => {
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

const loadAccessCode = () => {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY);
  } catch (error) {
    console.error('Failed to load access code:', error);
  }
  return null;
};

const saveAccessCode = (code) => {
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code);
  } catch (error) {
    console.error('Failed to save access code:', error);
  }
};

const normalizeSupabaseUrl = (value) =>
  value ? value.replace(/\/+$/, '') : '';

const syncAccessCodeFromUrl = () => {
  if (!ACCESS_CODE || typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get('code');
  if (!urlCode) return;
  if (urlCode === ACCESS_CODE) {
    saveAccessCode(urlCode);
  }
  params.delete('code');
  const nextQuery = params.toString();
  const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
  window.history.replaceState({}, '', nextUrl);
};

const fetchRemoteSnapshot = async () => {
  const baseUrl = normalizeSupabaseUrl(SUPABASE_URL);
  if (!baseUrl || !SUPABASE_ANON_KEY) return null;

  const url = new URL(`${baseUrl}/rest/v1/${SUPABASE_TABLE}`);
  url.searchParams.set('select', 'payload,updated_at');
  url.searchParams.set('id', `eq.${SUPABASE_REMOTE_ID}`);
  url.searchParams.set('limit', '1');
  url.searchParams.set('_t', Date.now().toString()); // Cache-busting timestamp

  const response = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Remote fetch failed: ${response.status}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0]?.payload ?? null;
};

const extractRemoteChores = (payload) => {
  if (Array.isArray(payload?.chores)) return payload.chores;
  if (Array.isArray(payload)) return payload;
  return null;
};

const extractRemoteProgress = (payload) =>
  parseStoredProgress(payload?.progress ?? payload);

const mergePostpones = (current, imported) => {
  const base = Array.isArray(current) ? current : [];
  const additions = Array.isArray(imported) ? imported : [];
  if (!additions.length) return base;

  const seen = new Set(
    base.map((entry) => `${entry?.subject ?? ""}|${entry?.fromDate ?? ""}|${entry?.toDate ?? ""}`)
  );
  const merged = [...base];

  additions.forEach((entry) => {
    if (!entry?.subject) return;
    const key = `${entry.subject}|${entry.fromDate ?? ""}|${entry.toDate ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(entry);
  });

  return merged;
};

const getFormattedDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateKey = (date) => getFormattedDate(toDateOnly(date));

const parseDateKey = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const HOUSEHOLD = Array.isArray(initialChores.household)
  ? initialChores.household
  : [];
const BASE_START_DATE = "2025-01-01";
const SEED_CHORES = Array.isArray(initialChores.chores)
  ? initialChores.chores
  : [];

const TABS = ["Today", "This Week", "This Month", "All"];

const toDateOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const getStartOfWeek = (date) => {
  const dayIndex = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(start.getDate() - dayIndex);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const getRemainingWeekDates = (date) => {
  const today = toDateOnly(date);
  const end = toDateOnly(getEndOfWeek(today));
  const dates = [];
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const getCompletedBy = (chore, assignedOverride) => {
  const assigned = Array.isArray(assignedOverride)
    ? assignedOverride
    : Array.isArray(chore.assigned)
    ? chore.assigned
    : [];
  if (Array.isArray(chore.completedBy)) {
    return chore.completedBy;
  }
  return chore.completed ? assigned : [];
};

const isCompletionActive = (chore, date) => {
  if (!chore.completed) return false;
  if (chore.assignmentType !== "rotating") return true;

  const completedThrough = parseDateKey(chore.completedThrough);
  if (completedThrough) {
    return toDateOnly(date) < completedThrough;
  }

  const lastCompletedDate = parseDateKey(chore.lastCompletedDate);
  if (!lastCompletedDate) return true;
  const nextDue = getNextDueAfter(chore, lastCompletedDate);
  if (!nextDue) return true;
  return toDateOnly(date) < toDateOnly(nextDue);
};

const isChoreComplete = (chore, assignedOverride, date) => {
  const assigned = Array.isArray(assignedOverride)
    ? assignedOverride
    : Array.isArray(chore.assigned)
    ? chore.assigned
    : [];
  if (assigned.length > 1) {
    const completedBy = getCompletedBy(chore, assigned);
    return assigned.every((member) => completedBy.includes(member));
  }
  return isCompletionActive(chore, date ?? new Date());
};

const getRotationIndex = (chore, date) => {
  const rotation = chore.rotation;
  const members = Array.isArray(rotation?.members) ? rotation.members : [];
  if (!members.length) return 0;

  const storedIndex =
    Number.isFinite(chore.rotationIndex)
      ? chore.rotationIndex
      : Number.isFinite(chore.rotationPosition)
      ? chore.rotationPosition
      : Number.isFinite(chore.rotationCursor)
      ? chore.rotationCursor
      : null;

  if (storedIndex !== null) {
    return ((storedIndex % members.length) + members.length) % members.length;
  }

  const baseDate =
    chore.rotationStartDate ?? chore.startDate ?? BASE_START_DATE;
  const fromDate = toDateOnly(baseDate);
  const toDate = toDateOnly(date);
  if (!fromDate || !toDate) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((toDate - fromDate) / dayMs);
  const cycleType = rotation?.cycleType ?? "weekly";
  const cycleLength = rotation?.cycleLength ?? 1;
  const everyDays = rotation?.everyDays ?? 1;

  let steps = 0;
  if (cycleType === "daily") {
    steps = Math.floor(diffDays / Math.max(1, everyDays));
  } else if (cycleType === "every-x-days") {
    steps = Math.floor(diffDays / Math.max(1, everyDays));
  } else if (cycleType === "weekly") {
    steps = Math.floor(diffDays / (7 * Math.max(1, cycleLength)));
  } else if (cycleType === "monthly") {
    const monthsDiff = (toDate.getFullYear() - fromDate.getFullYear()) * 12 + (toDate.getMonth() - fromDate.getMonth());
    steps = Math.floor(monthsDiff / Math.max(1, cycleLength));
  }

  return ((steps % members.length) + members.length) % members.length;
};

const getAssignedMembers = (chore, date) => {
  if (chore.assignmentType !== "rotating") {
    return Array.isArray(chore.assigned) ? chore.assigned : [];
  }

  const rotation = chore.rotation;
  const members = Array.isArray(rotation?.members) ? rotation.members : [];
  if (!members.length) return [];

  const index = getRotationIndex(chore, date);
  
  // If completion is active (chore marked done, waiting until next due), show who completed it
  if (isCompletionActive(chore, date)) {
    // If we have a saved previous index, use it (who just completed it)
    if (Number.isFinite(chore.rotationIndexPrev)) {
      return [members[chore.rotationIndexPrev]];
    }
    // Fallback: if no previous index saved, calculate it (index - 1)
    const prevIndex = (index - 1 + members.length) % members.length;
    return [members[prevIndex]];
  }

  // Otherwise, show the current assignee for this date
  return [members[index]];
};

const getNextDueDate = (chore, fromDate = new Date()) => {
  const today = toDateOnly(fromDate);
  const startDate = chore.startDate ? toDateOnly(chore.startDate) : null;

  if (startDate && today < startDate) {
    return startDate;
  }

  const rec = chore.recurrence || {};
  const freq = rec.frequency || "daily";
  const interval = rec.interval || 1;

  if (freq === "daily") {
    if (!startDate) return today;
    const daysDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    if (daysDiff % interval === 0) return today;
    const daysToAdd = interval - (daysDiff % interval);
    const nextDue = new Date(today);
    nextDue.setDate(today.getDate() + daysToAdd);
    return nextDue;
  }

  if (freq === "once") {
    return toDateOnly(chore.dueDate ?? chore.nextDueDate ?? chore.nextDue ?? chore.startDate ?? today);
  }

  if (freq === "weekly") {
    const dayOfWeek = rec.dayOfWeek ?? 0;
    const daysUntilDue = (dayOfWeek - today.getDay() + 7) % 7;
    const nextDue = new Date(today);
    nextDue.setDate(today.getDate() + (daysUntilDue === 0 ? 0 : daysUntilDue));

    if (!startDate) return nextDue;

    const weeksDiff = Math.floor((nextDue - startDate) / (1000 * 60 * 60 * 24 * 7));
    if (weeksDiff % interval === 0) return nextDue;

    const weeksToAdd = interval - (weeksDiff % interval);
    nextDue.setDate(nextDue.getDate() + weeksToAdd * 7);
    return nextDue;
  }

  if (freq === "monthly") {
    const dayOfMonth = rec.dayOfMonth ?? 1;
    const nextDue = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);

    if (nextDue < today) {
      nextDue.setMonth(today.getMonth() + 1);
    }

    if (!startDate) return nextDue;

    const monthsDiff = (nextDue.getFullYear() - startDate.getFullYear()) * 12 + (nextDue.getMonth() - startDate.getMonth());
    if (monthsDiff % interval === 0) return nextDue;

    const monthsToAdd = interval - (monthsDiff % interval);
    nextDue.setMonth(nextDue.getMonth() + monthsToAdd);
    return nextDue;
  }

  return today;
};

const getNextDueAfter = (chore, date) => {
  const rec = chore.recurrence || {};
  if (rec.frequency === "once") return null;
  const base = toDateOnly(date);
  const nextDate = new Date(base);
  nextDate.setDate(base.getDate() + 1);
  return getNextDueDate(chore, nextDate);
};

const getStartOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const getEndOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const isDueOnDate = (chore, date) => {
  const target = toDateOnly(date);
  const startDate = chore.startDate ? toDateOnly(chore.startDate) : null;

  if (startDate && target < startDate) {
    return false;
  }

  const rec = chore.recurrence || {};
  const freq = rec.frequency || "daily";
  const interval = rec.interval || 1;

  if (freq === "daily") {
    if (!startDate) return true;
    const daysDiff = Math.floor((target - startDate) / (1000 * 60 * 60 * 24));
    return daysDiff % interval === 0;
  }

  if (freq === "once") {
    const dueDate = toDateOnly(chore.dueDate ?? chore.nextDueDate ?? chore.nextDue ?? chore.startDate ?? target);
    return target.getTime() === dueDate.getTime();
  }

  if (freq === "weekly") {
    if (target.getDay() !== (rec.dayOfWeek ?? 0)) return false;
    if (!startDate) return true;
    const weeksDiff = Math.floor((target - startDate) / (1000 * 60 * 60 * 24 * 7));
    return weeksDiff % interval === 0;
  }

  if (freq === "monthly") {
    if (target.getDate() !== (rec.dayOfMonth ?? 1)) return false;
    if (!startDate) return true;
    const monthsDiff = (target.getFullYear() - startDate.getFullYear()) * 12 + (target.getMonth() - startDate.getMonth());
    return monthsDiff % interval === 0;
  }

  return true;
};

const getDueDatesInRange = (chore, start, end) => {
  const startDate = chore.startDate ? toDateOnly(chore.startDate) : null;
  const rangeStart = toDateOnly(start);
  const rangeEnd = toDateOnly(end);
  const rec = chore.recurrence || {};
  const freq = rec.frequency || "daily";
  const interval = rec.interval || 1;
  const results = [];
  const dayMs = 24 * 60 * 60 * 1000;

  if (startDate && rangeEnd < startDate) {
    return results;
  }

  if (freq === "once") {
    const dueDate = toDateOnly(
      chore.dueDate ?? chore.nextDueDate ?? chore.nextDue ?? chore.startDate ?? rangeStart
    );
    if (dueDate >= rangeStart && dueDate <= rangeEnd) {
      results.push(dueDate);
    }
    return results;
  }

  if (freq === "daily") {
    let cursor = startDate && startDate > rangeStart ? startDate : rangeStart;
    if (startDate) {
      const daysDiff = Math.floor((cursor - startDate) / dayMs);
      const offset = ((daysDiff % interval) + interval) % interval;
      if (offset !== 0) {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + (interval - offset));
      }
    }

    while (cursor <= rangeEnd) {
      results.push(new Date(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + interval);
    }
    return results;
  }

  if (freq === "weekly") {
    const dayOfWeek = rec.dayOfWeek ?? 0;
    let cursor = new Date(rangeStart);
    const offset = (dayOfWeek - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + offset);

    if (startDate && cursor < startDate) {
      const weeksDiff = Math.floor((cursor - startDate) / (dayMs * 7));
      const remainder = ((weeksDiff % interval) + interval) % interval;
      if (remainder !== 0) {
        cursor.setDate(cursor.getDate() + (interval - remainder) * 7);
      }
      if (cursor < startDate) {
        cursor.setDate(cursor.getDate() + interval * 7);
      }
    }

    while (cursor <= rangeEnd) {
      results.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + interval * 7);
    }
    return results;
  }

  if (freq === "monthly") {
    const dayOfMonth = rec.dayOfMonth ?? 1;
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);

    while (cursor <= rangeEnd) {
      const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), dayOfMonth);
      if (candidate.getMonth() === cursor.getMonth()) {
        if (!startDate || candidate >= startDate) {
          if (!startDate) {
            results.push(candidate);
          } else {
            const monthsDiff = (candidate.getFullYear() - startDate.getFullYear()) * 12 + (candidate.getMonth() - startDate.getMonth());
            if (monthsDiff % interval === 0) {
              results.push(candidate);
            }
          }
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return results;
  }

  return results;
};

const isDueInRange = (chore, start, end) => {
  const startDate = chore.startDate ? toDateOnly(chore.startDate) : null;

  if (startDate && end < startDate) {
    return false;
  }

  const rec = chore.recurrence || {};
  const freq = rec.frequency || "daily";
  const interval = rec.interval || 1;

  if (freq === "daily") {
    return true;
  }

  if (freq === "once") {
    const dueDate = toDateOnly(chore.dueDate ?? chore.nextDueDate ?? chore.nextDue ?? chore.startDate ?? start);
    return dueDate >= start && dueDate <= end;
  }

  if (freq === "weekly") {
    const dayOfWeek = rec.dayOfWeek ?? 0;
    const offset = (dayOfWeek - start.getDay() + 7) % 7;
    const dueDate = new Date(start);
    dueDate.setDate(start.getDate() + offset);

    if (dueDate > end) {
      return false;
    }

    if (!startDate) return true;
    const weeksDiff = Math.floor((dueDate - startDate) / (1000 * 60 * 60 * 24 * 7));
    return weeksDiff % interval === 0;
  }

  if (freq === "monthly") {
    const dayOfMonth = rec.dayOfMonth ?? 1;
    const dueDate = new Date(start.getFullYear(), start.getMonth(), dayOfMonth);

    if (dueDate.getMonth() !== start.getMonth()) {
      return false;
    }

    if (dueDate < start || dueDate > end) {
      return false;
    }

    if (!startDate) return true;
    const monthsDiff = (dueDate.getFullYear() - startDate.getFullYear()) * 12 + (dueDate.getMonth() - startDate.getMonth());
    return monthsDiff % interval === 0;
  }

  return true;
};

const buildInitialChores = (baseChores = SEED_CHORES) => baseChores.map((chore, index) => {
  const normalized = mapImportedChore(chore);
  // If no assignment was provided, assign to household members in round-robin
  if (normalized.assigned.length === 0 && HOUSEHOLD.length > 0) {
    normalized.assigned = [HOUSEHOLD[index % HOUSEHOLD.length]];
  }
  return normalized;
});

const extractProgress = (chores) =>
  chores.reduce((acc, chore) => {
    const entry = {
      completed: Boolean(chore.completed),
      completedBy: Array.isArray(chore.completedBy) ? chore.completedBy : [],
    };

    PROGRESS_FIELDS.forEach((field) => {
      if (field === "completed" || field === "completedBy") return;
      if (chore[field] !== undefined) {
        entry[field] = chore[field];
      }
    });

    acc[chore.subject] = entry;
    return acc;
  }, {});

const applyProgress = (chores, progress) => {
  if (!progress) return chores;

  return chores.map((chore) => {
    const entry = progress[chore.subject];
    if (!entry) return chore;

    const next = { ...chore };
    PROGRESS_FIELDS.forEach((field) => {
      if (field in entry) {
        if (field === "completedBy") {
          next.completedBy = Array.isArray(entry.completedBy)
            ? entry.completedBy
            : [];
        } else if (field === "completed") {
          next.completed = Boolean(entry.completed);
        } else {
          next[field] = entry[field];
        }
      }
    });

    const completedBy = Array.isArray(next.completedBy) ? next.completedBy : [];
    const completed = Array.isArray(chore.assigned) && chore.assigned.length > 1
      ? chore.assigned.every((member) => completedBy.includes(member))
      : Boolean(next.completed);

    return { ...next, completed, completedBy };
  });
};

const mergeChores = (currentChores, importedChores) => {
  // Map imported chores by subject for fast lookup
  const importedBySubject = new Map();
  (importedChores || []).forEach((chore) => {
    if (!chore?.subject) return;
    importedBySubject.set(chore.subject, chore);
  });

  // Update existing chores with imported definitions, preserve progress/runtime state
  const merged = currentChores.map((currentChore) => {
    if (!importedBySubject.has(currentChore.subject)) {
      return currentChore;
    }

    const rawImported = importedBySubject.get(currentChore.subject);
    importedBySubject.delete(currentChore.subject); // Mark as processed
    const normalized = mapImportedChore(rawImported);
    const next = { ...currentChore };

    if (rawImported.description !== undefined) {
      next.description = normalized.description;
    }

    if (rawImported.notes !== undefined || rawImported.note !== undefined) {
      next.notes = normalized.notes;
    }

    if (rawImported.startDate !== undefined) {
      next.startDate = normalized.startDate;
    }

    const hasAssignmentInfo =
      rawImported.assignmentType !== undefined ||
      rawImported.assignment?.type !== undefined ||
      Array.isArray(rawImported.assignment?.assignees) ||
      Array.isArray(rawImported.assignment?.order) ||
      Array.isArray(rawImported.assigned) ||
      Array.isArray(rawImported.assignees) ||
      Array.isArray(rawImported.rotation?.members) ||
      Array.isArray(rawImported.rotationMembers) ||
      rawImported.rotation?.cycleLength !== undefined ||
      rawImported.rotation?.cycleType !== undefined ||
      rawImported.rotation?.everyDays !== undefined ||
      rawImported.rotationGroup !== undefined ||
      rawImported.rotationCycleType !== undefined ||
      rawImported.rotationEveryDays !== undefined ||
      rawImported.rotationInterval !== undefined ||
      rawImported.cycleLength !== undefined;

    if (hasAssignmentInfo) {
      next.assigned = normalized.assigned;
      next.assignmentType = normalized.assignmentType;
      if (normalized.assignmentType === "rotating") {
        next.rotation = normalized.rotation;
      } else if (next.rotation) {
        delete next.rotation;
      }
    }

    const hasRecurrenceInfo =
      rawImported.recurrence !== undefined ||
      rawImported.schedule !== undefined ||
      rawImported.recurrenceInterval !== undefined ||
      rawImported.daysOfWeek !== undefined ||
      rawImported.frequencyDays !== undefined ||
      rawImported.dueDate !== undefined;

    if (hasRecurrenceInfo) {
      next.recurrence = normalized.recurrence;
    }

    return next;
  });

  // Add new chores from import that weren't in current seed
  importedBySubject.forEach((rawImported) => {
    merged.push(mapImportedChore(rawImported));
  });

  return merged;
};

const WEEKDAY_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const getDayIndex = (value) => {
  if (!value) return null;
  const key = String(value).slice(0, 3).toLowerCase();
  return Object.prototype.hasOwnProperty.call(WEEKDAY_INDEX, key)
    ? WEEKDAY_INDEX[key]
    : null;
};

const getDayOfMonth = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getDate();
};

const normalizeRecurrence = (chore) => {
  const raw = String(
    chore.recurrence ?? chore.schedule?.recurrence ?? chore.schedule?.frequency ?? ""
  ).toLowerCase();
  const interval = chore.recurrence?.interval ?? chore.recurrenceInterval ?? 1;

  if (raw.includes("once") || raw.includes("one-time") || raw.includes("onetime")) {
    return { frequency: "once", interval: 1 };
  }

  if (raw.startsWith("daily")) {
    return { frequency: "daily", interval };
  }

  if (raw.startsWith("weekly")) {
    const dayOfWeek =
      chore.recurrence?.dayOfWeek ?? getDayIndex(chore.daysOfWeek?.[0]) ?? getDayIndex(chore.startDate) ?? 0;
    return { frequency: "weekly", interval, dayOfWeek };
  }

  if (raw.startsWith("monthly")) {
    const dayOfMonth =
      chore.recurrence?.dayOfMonth ?? getDayOfMonth(chore.dueDate) ?? getDayOfMonth(chore.startDate) ?? 1;
    return { frequency: "monthly", interval, dayOfMonth };
  }

  return { frequency: "daily", interval };
};

const normalizeRotationCycleType = (chore) => {
  const raw = String(chore.recurrence ?? "").toLowerCase();
  if (raw.startsWith("daily") && Number(chore.recurrenceInterval) > 1) {
    return "every-x-days";
  }
  if (raw.startsWith("daily")) return "daily";
  if (raw.startsWith("weekly")) return "weekly";
  if (raw.startsWith("monthly")) return "monthly";
  return "weekly";
};

const normalizeCompleted = (chore) =>
  Boolean(chore.completed ?? false);

const normalizeRotation = (chore, isRotating) => {
  if (!isRotating) return undefined;
  return {
    group: chore.rotation?.group ?? chore.rotationGroup ?? "A",
    cycleLength: chore.rotation?.cycleLength ?? chore.cycleLength ?? 1,
    members: Array.isArray(chore.rotation?.members)
      ? chore.rotation.members
      : Array.isArray(chore.rotationMembers)
      ? chore.rotationMembers
      : HOUSEHOLD.slice(0, 3),
    cycleType: chore.rotation?.cycleType ?? chore.rotationCycleType ?? "weekly",
    everyDays: chore.rotation?.everyDays ?? chore.rotationEveryDays ?? 1,
  };
};

const mapImportedChore = (chore) => {
  const assignment = chore.assignment || {};
  const isRotating = assignment.type === "rotating" || chore.assignmentType === "rotating";
  const rotationMembers = Array.isArray(assignment.order)
    ? assignment.order
    : Array.isArray(chore.rotation?.members)
    ? chore.rotation.members
    : Array.isArray(chore.rotationMembers)
    ? chore.rotationMembers
    : [];
  const assigned = isRotating
    ? rotationMembers.slice(0, 1)
    : Array.isArray(assignment.assignees)
    ? assignment.assignees
    : Array.isArray(chore.assigned)
    ? chore.assigned
    : Array.isArray(chore.assignees)
    ? chore.assignees
    : [];
  const completed = normalizeCompleted(chore);
  const completedBy = Array.isArray(chore.completedBy)
    ? chore.completedBy
    : completed && assigned.length > 1
    ? assigned
    : [];

  const base = {
    subject: chore.subject ?? "Untitled",
    description: chore.description ?? "",
    notes: chore.notes ?? chore.note ?? "",
    assigned,
    completed,
    completedBy,
    assignmentType: isRotating ? "rotating" : "fixed",
    recurrence: normalizeRecurrence(chore),
    startDate: chore.startDate ?? BASE_START_DATE,
  };

  if (!isRotating) return base;

  return {
    ...base,
    rotation: {
      group: chore.rotation?.group ?? chore.rotationGroup ?? "A",
      cycleLength: chore.rotation?.cycleLength ?? chore.cycleLength ?? chore.rotationInterval ?? 1,
      members: rotationMembers.length ? rotationMembers : HOUSEHOLD.slice(0, 3),
      cycleType: chore.rotation?.cycleType ?? chore.rotationCycleType ?? normalizeRotationCycleType(chore),
      everyDays: chore.rotation?.everyDays ?? chore.rotationEveryDays ?? chore.recurrenceInterval ?? 1,
    },
  };
};

const parseRestorePayload = (payload) => {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    return {
      progress: parseStoredProgress(payload),
      postponedOverrides: [],
    };
  }

  if (payload && (payload.progress || payload.postponedOverrides)) {
    return {
      progress: parseStoredProgress(payload.progress ?? payload),
      postponedOverrides: Array.isArray(payload.postponedOverrides)
        ? payload.postponedOverrides
        : [],
    };
  }

  if (payload && Array.isArray(payload.chores)) {
    return {
      progress: extractProgress(payload.chores.map(mapImportedChore)),
      postponedOverrides: [],
    };
  }

  return null;
};

function ChoreApp() {
  const [activeTab, setActiveTab] = useState("Today");
  const [selectedMember, setSelectedMember] = useState("All");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [chores, setChores] = useState(() => {
    const storedProgress = loadFromLocalStorage();
    const storedDefinitions = loadChoreDefinitions();
    const baseChores = storedDefinitions ?? SEED_CHORES;
    return applyProgress(buildInitialChores(baseChores), storedProgress);
  });
  const [postponedOverrides, setPostponedOverrides] = useState(() => loadPostpones());
  const [postponeTarget, setPostponeTarget] = useState(null);
  const [assigneePicker, setAssigneePicker] = useState(null);
  const [expandedChore, setExpandedChore] = useState(null);
  const fileInputRef = useRef(null);
  const assigneeCloseTimeoutRef = useRef(null);

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    syncAccessCodeFromUrl();
    if (ACCESS_CODE) {
      const storedCode = loadAccessCode();
      if (storedCode !== ACCESS_CODE) return;
    }

    let isActive = true;

    const loadRemote = async () => {
      try {
        const payload = await fetchRemoteSnapshot();
        if (!payload || !isActive) return;

        const remoteDefinitions = extractRemoteChores(payload);
        const remoteProgress = extractRemoteProgress(payload);
        const baseChores = remoteDefinitions ?? SEED_CHORES;
        const storedProgress = remoteProgress ?? loadFromLocalStorage();
        const nextChores = applyProgress(buildInitialChores(baseChores), storedProgress);

        if (!isActive) return;

        setChores(nextChores);

        if (remoteDefinitions) {
          saveChoreDefinitions(remoteDefinitions);
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
      } catch (error) {
        console.error('Failed to load cloud snapshot:', error);
      }
    };

    loadRemote();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let intervalId;
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeoutId = setTimeout(() => {
      setCurrentDate(new Date());
      intervalId = setInterval(() => setCurrentDate(new Date()), 24 * 60 * 60 * 1000);
    }, nextMidnight.getTime() - now.getTime());

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    savePostpones(postponedOverrides);
  }, [postponedOverrides]);

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
    let filtered = [];

    const isPostponedFrom = (subject, dateKey) =>
      postponedOverrides.some(
        (override) => override.subject === subject && override.fromDate === dateKey
      );

    const isOverrideDueOn = (subject, dateKey) =>
      postponedOverrides.some(
        (override) => override.subject === subject && override.toDate === dateKey
      );

    const isDateKeyInRange = (dateKey, start, end) => {
      const date = parseDateKey(dateKey);
      if (!date) return false;
      return date >= start && date <= end;
    };

    const getDueDatesWithOverrides = (chore, start, end) => {
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

    const isDueToday = (chore) => {
      if (isPostponedFrom(chore.subject, todayKey)) {
        return false;
      }
      if (isOverrideDueOn(chore.subject, todayKey)) {
        return true;
      }
      return isDueOnDate(chore, today);
    };

    if (activeTab === "Today") {
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

    // Filter by selected member
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

  const advanceRotation = (chore) => {
    if (chore.assignmentType !== "rotating") return chore;
    const rotation = chore.rotation;
    const members = Array.isArray(rotation?.members) ? rotation.members : [];
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

  const toggleCompleted = (subject) => {
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

  const toggleMemberCompleted = (subject, member) => {
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
        const updated = { ...chore, completedBy: nextCompletedBy, completed };
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

  const toggleDescription = (subject) => {
    setExpandedChore((prev) => (prev === subject ? null : subject));
  };

  const openPostponeSelector = (subject) => {
    setPostponeTarget(subject);
  };

  const closePostponeSelector = () => {
    setPostponeTarget(null);
  };

  const openAssigneePicker = (subject) => {
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

  const handlePostponeToDate = (subject, date) => {
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


  const autoBackupToFile = (progress, postponed) => {
    const payload = JSON.stringify(
      {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        household: HOUSEHOLD,
        progress,
        postponedOverrides: postponed,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chores-${getFormattedDate()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const backupToFile = () => {
    autoBackupToFile(extractProgress(chores), postponedOverrides);
  };

  const handleRestoreFromFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);

        // Check if imported file has full chore definitions (smart merge case)
        if (Array.isArray(parsed.chores) && parsed.chores.length > 0) {
          // Smart merge: combine imported chore definitions with current progress
          const currentSubjects = new Set(chores.map((chore) => chore.subject));
          const mergedChores = mergeChores(chores, parsed.chores);
          
          // Apply imported progress only for brand-new chores
          const importedProgress = parseStoredProgress(parsed.progress ?? parsed);
          const newSubjects = new Set(
            parsed.chores
              .map((chore) => chore?.subject)
              .filter((subject) => subject && !currentSubjects.has(subject))
          );
          const filteredProgress = importedProgress && newSubjects.size
            ? Object.keys(importedProgress).reduce((acc, subject) => {
                if (newSubjects.has(subject)) {
                  acc[subject] = importedProgress[subject];
                }
                return acc;
              }, {})
            : null;
          const withProgress = applyProgress(mergedChores, filteredProgress);
          
          setChores(withProgress);
          setPostponedOverrides(
            mergePostpones(postponedOverrides, parsed.postponedOverrides)
          );
          saveToLocalStorage(extractProgress(withProgress));
          saveChoreDefinitions(mergedChores);
        } else {
          // Progress-only restore (merge into current definitions)
          const restored = parseRestorePayload(parsed);
          if (restored) {
            const merged = applyProgress(chores, restored.progress);
            setChores(merged);
            setPostponedOverrides(
              mergePostpones(postponedOverrides, restored.postponedOverrides)
            );
            saveToLocalStorage(extractProgress(merged));
          } else {
            console.error("Unsupported restore file format");
            window.alert("Restore failed: file format not recognized.");
          }
        }
      } catch (error) {
        console.error("Failed to restore schedule", error);
        window.alert("Restore failed: invalid JSON file.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const handleClearData = () => {
    if (window.confirm("⚠️ This will delete all progress, completion history, and postpones. Reset to seed file?")) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(POSTPONE_KEY);
        localStorage.removeItem(CHORE_DEFS_KEY);
        const seedWithProgress = applyProgress(buildInitialChores(), null);
        setChores(seedWithProgress);
        setPostponedOverrides([]);
        window.alert("✅ Data cleared. App reset to seed file.");
      } catch (error) {
        console.error("Failed to clear data", error);
        window.alert("Failed to clear data.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto w-full px-8 py-12 2xl:px-16">
        <div className="flex w-full flex-col gap-10 lg:flex-row">
          <aside className="block w-full lg:w-96 flex-shrink-0 rounded-2xl bg-white p-10 shadow-xl sticky top-4 self-start border-r border-gray-200 lg:min-h-screen">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Sort by Name
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {["All", ...HOUSEHOLD].map((member) => {
                const isActive = selectedMember === member;
                return (
                  <button
                    key={member}
                    type="button"
                    onClick={() => setSelectedMember(member)}
                    className={
                      "w-full rounded-xl px-6 py-4 text-left text-2xl font-semibold transition " +
                      (isActive
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                    }
                  >
                    {member}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="flex-1 min-w-0 w-full">
            <header className="mb-12 flex flex-col gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Chore LIST
            </p>
            <h1 className="mt-3 text-5xl sm:text-6xl font-semibold">
              Plimmer Chore Dashboard
            </h1>
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
                    "rounded-full px-7 py-3 text-xl font-semibold transition " +
                    (isActive
                      ? "bg-slate-900 text-white shadow"
                      : "bg-white text-slate-700 shadow-sm hover:bg-slate-200")
                  }
                >
                  {tab}
                </button>
              );
            })}
            <div className="ml-auto rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-500 shadow-sm">
              {currentDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
            <button
              type="button"
              onClick={backupToFile}
              className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-100"
            >
              Backup to File
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-100"
            >
              Restore from File
            </button>
            <button
              type="button"
              onClick={handleClearData}
              className="rounded-full border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50"
            >
              Clear All Data
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleRestoreFromFile}
              className="hidden"
            />
          </div>
            </header>

            <div className="space-y-12">
              {visibleChores.map((chore) => {
                const assignedList = getAssignedMembers(chore, currentDate);
                const completedBy = getCompletedBy(chore, assignedList);
                return (
                  <article
                    key={chore.subject}
                    onClick={() => toggleDescription(chore.subject)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleDescription(chore.subject);
                      }
                    }}
                    className={
                      "rounded-3xl bg-white p-10 shadow-xl transition hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 " +
                      (isChoreComplete(chore, assignedList, currentDate) ? "opacity-70" : "")
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-8">
                      <div className="min-w-[260px] flex-1">
                        <h2 className="text-4xl lg:text-5xl font-semibold">
                          {chore.subject}
                        </h2>
                        {expandedChore === chore.subject && (
                          <p className="mt-4 text-xl text-slate-600">
                            {chore.description}
                          </p>
                        )}
                        <p className="mt-4 text-xl text-slate-600">
                          Assigned:{" "}
                          {assignedList.map((member, index) => (
                            <span
                              key={member}
                              className={
                                completedBy.includes(member)
                                  ? "line-through text-slate-400"
                                  : "text-slate-600"
                              }
                            >
                              {member}
                              {index < assignedList.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </p>
                        <p className="mt-2 text-sm uppercase tracking-[0.2em] text-slate-600">
                          {activeTab === "Today"
                            ? chore.recurrence.frequency
                            : getNextDueDate(chore, currentDate).toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                        </p>
                      </div>

                      <div className="flex flex-col items-start gap-4">
                        {assignedList.length > 1 ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAssigneePicker(chore.subject);
                            }}
                            className="rounded-full border border-slate-200 px-6 py-3 text-lg font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Mark Done
                          </button>
                        ) : (
                          <label className="flex items-center gap-3 text-lg font-semibold">
                            <input
                              type="checkbox"
                              checked={chore.completed}
                              onChange={() => toggleCompleted(chore.subject)}
                              onClick={(event) => event.stopPropagation()}
                              className="h-7 w-7 scale-125 accent-slate-900"
                            />
                            Done
                          </label>
                        )}
                        {activeTab === "Today" && remainingWeekDates.length > 0 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openPostponeSelector(chore.subject);
                            }}
                            className="rounded-full border border-slate-200 px-6 py-3 text-lg font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Postpone
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </main>
        </div>
      </div>

      {assigneePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-10 shadow-2xl">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
                  Done by
                </p>
                <h3 className="mt-3 text-3xl font-semibold text-slate-900">
                  Select completed names
                </h3>
              </div>
              <button
                type="button"
                onClick={closeAssigneePicker}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              {(() => {
                const chore = chores.find((item) => item.subject === assigneePicker);
                if (!chore) return null;
                const assignedList = getAssignedMembers(chore, currentDate);
                const completedBy = getCompletedBy(chore, assignedList);
                return assignedList.map((member) => (
                  <button
                    key={member}
                    type="button"
                    onClick={() => toggleMemberCompleted(chore.subject, member)}
                    className={
                      "w-full rounded-2xl border px-6 py-4 text-left text-lg font-semibold transition " +
                      (completedBy.includes(member)
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-700 hover:bg-slate-100")
                    }
                  >
                    {member}
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {postponeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-10 shadow-2xl">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
                  Postpone to
                </p>
                <h3 className="mt-3 text-3xl font-semibold text-slate-900">
                  Choose a new day
                </h3>
              </div>
              <button
                type="button"
                onClick={closePostponeSelector}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              {remainingWeekDates.map((date) => (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => handlePostponeToDate(postponeTarget, date)}
                  className="w-full rounded-2xl border border-slate-200 px-6 py-4 text-left text-lg font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {date.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </button>
              ))}
            </div>
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
    </Routes>
  );
}

export default App;
