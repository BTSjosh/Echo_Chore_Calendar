import initialChores from '../data/initialChores.json';
import {
  toDateOnly,
  parseDateKey,
  getDayIndex,
  getDayOfMonth,
} from './dates';
import { PROGRESS_FIELDS } from './storage';
import type {
  Chore,
  ChoreProgress,
  ProgressRecord,
  RawImportedChore,
  Recurrence,
  Rotation,
  TabName,
} from '../types';

export const HOUSEHOLD: string[] = Array.isArray(initialChores.household)
  ? initialChores.household
  : [];
export const BASE_START_DATE = "2025-01-01";
export const SEED_CHORES: RawImportedChore[] = Array.isArray(initialChores.chores)
  ? (initialChores.chores as RawImportedChore[])
  : [];
export const TABS: readonly TabName[] = ["Yesterday", "Today", "This Week", "This Month"] as const;

export const normalizeRecurrence = (chore: RawImportedChore): Recurrence => {
  const recurrenceValue = typeof chore.recurrence === 'object' && chore.recurrence !== null
    ? (chore.recurrence as Record<string, unknown>).frequency ?? (chore.recurrence as Record<string, unknown>).recurrence ?? String(chore.recurrence)
    : chore.recurrence;
  const raw = String(
    recurrenceValue ?? chore.schedule?.recurrence ?? chore.schedule?.frequency ?? ""
  ).toLowerCase();
  const interval = (typeof chore.recurrence === 'object' ? (chore.recurrence as Record<string, unknown>)?.interval as number | undefined : null) ?? chore.recurrenceInterval ?? 1;

  if (raw.includes("once") || raw.includes("one-time") || raw.includes("onetime")) {
    return { frequency: "once", interval: 1 };
  }

  if (raw.startsWith("daily")) {
    return { frequency: "daily", interval };
  }

  if (raw.startsWith("weekly")) {
    const recObj = chore.recurrence as Record<string, unknown> | undefined;
    const dayOfWeek =
      (typeof recObj === 'object' ? recObj?.dayOfWeek as number | undefined : undefined)
      ?? getDayIndex((chore.daysOfWeek as string[] | undefined)?.[0])
      ?? getDayIndex(chore.startDate)
      ?? 0;
    return { frequency: "weekly", interval, dayOfWeek };
  }

  if (raw.startsWith("monthly")) {
    const recObj = chore.recurrence as Record<string, unknown> | undefined;
    const dayOfMonth =
      (typeof recObj === 'object' ? recObj?.dayOfMonth as number | undefined : undefined)
      ?? getDayOfMonth(chore.dueDate)
      ?? getDayOfMonth(chore.startDate)
      ?? 1;
    return { frequency: "monthly", interval, dayOfMonth };
  }

  return { frequency: "daily", interval };
};

export const normalizeRotationCycleType = (chore: RawImportedChore): string => {
  const raw = String(chore.recurrence ?? "").toLowerCase();
  if (raw.startsWith("daily") && Number(chore.recurrenceInterval) > 1) {
    return "every-x-days";
  }
  if (raw.startsWith("daily")) return "daily";
  if (raw.startsWith("weekly")) return "weekly";
  if (raw.startsWith("monthly")) return "monthly";
  return "weekly";
};

export const normalizeCompleted = (chore: RawImportedChore): boolean =>
  Boolean(chore.completed ?? false);

export const normalizeRotation = (chore: RawImportedChore, isRotating: boolean): Rotation | undefined => {
  if (!isRotating) return undefined;
  return {
    group: chore.rotation?.group ?? chore.rotationGroup ?? "A",
    cycleLength: chore.rotation?.cycleLength ?? (chore.cycleLength as number | undefined) ?? 1,
    members: Array.isArray(chore.rotation?.members)
      ? chore.rotation!.members
      : Array.isArray(chore.rotationMembers)
      ? chore.rotationMembers
      : HOUSEHOLD.slice(0, 3),
    cycleType: chore.rotation?.cycleType ?? (chore.rotationCycleType as Rotation['cycleType'] | undefined) ?? "weekly",
    everyDays: chore.rotation?.everyDays ?? chore.rotationEveryDays ?? 1,
  };
};

export const mapImportedChore = (chore: RawImportedChore): Chore => {
  const assignment = chore.assignment || {};
  const isRotating = assignment.type === "rotating" || chore.assignmentType === "rotating";
  const rotationMembers = Array.isArray(assignment.order)
    ? assignment.order
    : Array.isArray(chore.rotation?.members)
    ? chore.rotation!.members
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

  const normalized: Chore = {
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

  if (!isRotating) return normalized;

  return {
    ...normalized,
    rotation: {
      group: chore.rotation?.group ?? chore.rotationGroup ?? "A",
      cycleLength: chore.rotation?.cycleLength ?? (chore.cycleLength as number | undefined) ?? chore.rotationInterval ?? 1,
      members: rotationMembers.length ? rotationMembers : HOUSEHOLD.slice(0, 3),
      cycleType: chore.rotation?.cycleType ?? (chore.rotationCycleType as Rotation['cycleType'] | undefined) ?? normalizeRotationCycleType(chore) as Rotation['cycleType'],
      everyDays: chore.rotation?.everyDays ?? chore.rotationEveryDays ?? chore.recurrenceInterval ?? 1,
    },
  };
};

export const getNextDueDate = (chore: Chore, fromDate: Date = new Date()): Date => {
  const today = toDateOnly(fromDate);
  const startDate = chore.startDate ? toDateOnly(chore.startDate) : null;

  if (startDate && today < startDate) {
    return startDate;
  }

  const rec = chore.recurrence || {} as Recurrence;
  const freq = rec.frequency || "daily";
  const interval = rec.interval || 1;

  if (freq === "daily") {
    if (!startDate) return today;
    const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
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

    const weeksDiff = Math.floor((nextDue.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
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

export const getNextDueAfter = (chore: Chore, date: Date): Date | null => {
  const rec = chore.recurrence || {} as Recurrence;
  if (rec.frequency === "once") return null;
  const base = toDateOnly(date);
  const nextDate = new Date(base);
  nextDate.setDate(base.getDate() + 1);
  return getNextDueDate(chore, nextDate);
};

export const isDueOnDate = (chore: Chore, date: Date): boolean => {
  const target = toDateOnly(date);
  const startDate = chore.startDate ? toDateOnly(chore.startDate) : null;

  if (startDate && target < startDate) {
    return false;
  }

  const rec = chore.recurrence || {} as Recurrence;
  const freq = rec.frequency || "daily";
  const schedule = (chore as unknown as Record<string, Record<string, unknown>>).schedule || {};
  const interval = (typeof rec.interval === 'number' ? rec.interval : null)
    ?? (typeof (chore as unknown as Record<string, unknown>).recurrenceInterval === 'number' ? (chore as unknown as Record<string, unknown>).recurrenceInterval as number : null)
    ?? (typeof schedule.frequencyDays === 'number' ? schedule.frequencyDays as number : null)
    ?? 1;

  if (freq === "daily") {
    if (!startDate) return true;
    const daysDiff = Math.floor((target.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff % interval === 0;
  }
  if (freq === "once") {
    const dueDate = toDateOnly(chore.dueDate ?? chore.nextDueDate ?? chore.nextDue ?? chore.startDate ?? target);
    return target.getTime() === dueDate.getTime();
  }
  if (freq === "weekly") {
    if (target.getDay() !== (rec.dayOfWeek ?? 0)) return false;
    if (!startDate) return true;
    const weeksDiff = Math.floor((target.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * interval));
    return weeksDiff % 1 === 0;
  }
  if (freq === "monthly") {
    if (target.getDate() !== (rec.dayOfMonth ?? 1)) return false;
    if (!startDate) return true;
    const monthsDiff = (target.getFullYear() - startDate.getFullYear()) * 12 + (target.getMonth() - startDate.getMonth());
    return monthsDiff % interval === 0;
  }
  return true;
};

export const getDueDatesInRange = (chore: Chore, start: Date, end: Date): Date[] => {
  const startDate = chore.startDate ? toDateOnly(chore.startDate) : null;
  const rangeStart = toDateOnly(start);
  const rangeEnd = toDateOnly(end);
  const rec = chore.recurrence || {} as Recurrence;
  const freq = rec.frequency || "daily";
  const interval = rec.interval || 1;
  const results: Date[] = [];
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
      const daysDiff = Math.floor((cursor.getTime() - startDate.getTime()) / dayMs);
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
    const cursor = new Date(rangeStart);
    const offset = (dayOfWeek - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + offset);

    if (startDate && cursor < startDate) {
      const weeksDiff = Math.floor((cursor.getTime() - startDate.getTime()) / (dayMs * 7));
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
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);

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

export const isDueInRange = (chore: Chore, start: Date, end: Date): boolean => {
  const startDate = chore.startDate ? toDateOnly(chore.startDate) : null;

  if (startDate && end < startDate) {
    return false;
  }

  const rec = chore.recurrence || {} as Recurrence;
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
    const weeksDiff = Math.floor((dueDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
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

export const getRotationIndex = (chore: Chore, date: Date): number => {
  const rotation = chore.rotation;
  const members = Array.isArray(rotation?.members) ? rotation!.members : [];
  if (!members.length) return 0;

  const storedIndex =
    Number.isFinite(chore.rotationIndex)
      ? chore.rotationIndex!
      : Number.isFinite(chore.rotationPosition)
      ? chore.rotationPosition!
      : Number.isFinite(chore.rotationCursor)
      ? chore.rotationCursor!
      : null;

  if (storedIndex !== null) {
    return ((storedIndex % members.length) + members.length) % members.length;
  }

  const baseDate =
    chore.rotationStartDate ?? chore.startDate ?? BASE_START_DATE;
  const fromDate = toDateOnly(baseDate as string | Date);
  const toDate = toDateOnly(date);
  if (!fromDate || !toDate) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / dayMs);
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

export const getCompletedBy = (chore: Chore, assignedOverride?: string[]): string[] => {
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

export const isCompletionActive = (chore: Chore, date: Date): boolean => {
  if (!chore.completed) return false;

  // Date-aware expiry: if completedThrough is set, completion expires when the next due date arrives.
  // This now applies to both rotating and non-rotating chores.
  const completedThrough = parseDateKey(chore.completedThrough);
  if (completedThrough) {
    return toDateOnly(date) < completedThrough;
  }

  // Legacy non-rotating chores without completedThrough: treat as always complete.
  // New completions will always have completedThrough set via advanceRotation.
  if (chore.assignmentType !== "rotating") return true;

  const lastCompletedDate = parseDateKey(chore.lastCompletedDate);
  // No date context for a rotating chore: treat as not active so the rotation can advance.
  // (Legacy data pre-completedThrough. New completions always have completedThrough set.)
  if (!lastCompletedDate) return false;
  const nextDue = getNextDueAfter(chore, lastCompletedDate);
  if (!nextDue) return true;
  return toDateOnly(date) < toDateOnly(nextDue);
};

export const isChoreComplete = (chore: Chore, assignedOverride: string[] | undefined, date: Date): boolean => {
  const assigned = Array.isArray(assignedOverride)
    ? assignedOverride
    : Array.isArray(chore.assigned)
    ? chore.assigned
    : [];
  if (assigned.length > 1) {
    const completedBy = getCompletedBy(chore, assigned);
    return assigned.every((member) => completedBy.includes(member));
  }
  return isCompletionActive(chore, date);
};

export const getAssignedMembers = (chore: Chore, date: Date): string[] => {
  if (chore.assignmentType !== "rotating") {
    return Array.isArray(chore.assigned) ? chore.assigned : [];
  }

  const rotation = chore.rotation;
  const members = Array.isArray(rotation?.members) ? rotation!.members : [];
  if (!members.length) return [];

  const index = getRotationIndex(chore, date);

  if (isCompletionActive(chore, date)) {
    if (Number.isFinite(chore.rotationIndexPrev)) {
      return [members[chore.rotationIndexPrev!]];
    }
    const prevIndex = (index - 1 + members.length) % members.length;
    return [members[prevIndex]];
  }

  return [members[index]];
};

export const buildInitialChores = (baseChores: RawImportedChore[] = SEED_CHORES): Chore[] => baseChores.map((chore, index) => {
  const normalized = mapImportedChore(chore);
  if (normalized.assigned.length === 0 && HOUSEHOLD.length > 0) {
    normalized.assigned = [HOUSEHOLD[index % HOUSEHOLD.length]];
  }
  return normalized;
});

export const extractProgress = (chores: Chore[]): ProgressRecord =>
  chores.reduce<ProgressRecord>((acc, chore) => {
    const entry: Record<string, unknown> = {
      completed: Boolean(chore.completed),
      completedBy: Array.isArray(chore.completedBy) ? chore.completedBy : [],
    };

    PROGRESS_FIELDS.forEach((field) => {
      if (field === "completed" || field === "completedBy") return;
      const value = chore[field];
      if (value !== undefined) {
        entry[field] = value;
      }
    });

    acc[chore.subject] = entry as unknown as ChoreProgress;
    return acc;
  }, {});

export const applyProgress = (chores: Chore[], progress: ProgressRecord | null): Chore[] => {
  if (!progress) return chores;

  return chores.map((chore) => {
    const entry = progress[chore.subject];
    if (!entry) return chore;

    const next = { ...chore } as Record<string, unknown>;
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

    const completedBy = Array.isArray(next.completedBy) ? next.completedBy as string[] : [];
    const completed = Array.isArray(chore.assigned) && chore.assigned.length > 1
      ? chore.assigned.every((member) => completedBy.includes(member))
      : Boolean(next.completed);

    return { ...next, completed, completedBy } as Chore;
  });
};

export const mergeChores = (currentChores: Chore[], importedChores: RawImportedChore[] | null): Chore[] => {
  const importedBySubject = new Map<string, RawImportedChore>();
  (importedChores || []).forEach((chore) => {
    if (!chore?.subject) return;
    importedBySubject.set(chore.subject, chore);
  });

  const merged = currentChores.map((currentChore) => {
    if (!importedBySubject.has(currentChore.subject)) {
      return currentChore;
    }

    const rawImported = importedBySubject.get(currentChore.subject)!;
    importedBySubject.delete(currentChore.subject);
    const normalized = mapImportedChore(rawImported);
    const next = { ...currentChore } as Record<string, unknown>;

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

    return next as unknown as Chore;
  });

  importedBySubject.forEach((rawImported) => {
    merged.push(mapImportedChore(rawImported));
  });

  return merged;
};
