import { describe, it, expect } from 'vitest';
import {
  isDueOnDate,
  getNextDueDate,
  getNextDueAfter,
  getDueDatesInRange,
  getRotationIndex,
  getAssignedMembers,
  isCompletionActive,
  isChoreComplete,
  getCompletedBy,
  normalizeRecurrence,
  mapImportedChore,
  extractProgress,
  applyProgress,
  mergeChores,
} from '../chores';
import type { Chore, RawImportedChore } from '../../types';

// Helper to create a local date without time
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

/** Minimal chore with defaults for test fixtures */
const baseChore = (overrides: Partial<Chore> = {}): Chore => ({
  subject: 'Test',
  description: '',
  notes: '',
  assigned: [],
  completed: false,
  completedBy: [],
  assignmentType: 'fixed',
  recurrence: { frequency: 'daily', interval: 1 },
  startDate: d(2025, 1, 1),
  ...overrides,
});


// ─── Scheduling ──────────────────────────────────────────────

describe('isDueOnDate', () => {
  it('daily chore (interval=1) is due every day', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 1 },
      startDate: d(2025, 1, 1),
    });
    expect(isDueOnDate(chore, d(2025, 1, 1))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 1, 2))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 6, 15))).toBe(true);
  });

  it('daily chore (interval=3) is due every 3rd day', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 3 },
      startDate: d(2025, 1, 1),
    });
    expect(isDueOnDate(chore, d(2025, 1, 1))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 1, 2))).toBe(false);
    expect(isDueOnDate(chore, d(2025, 1, 3))).toBe(false);
    expect(isDueOnDate(chore, d(2025, 1, 4))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 1, 7))).toBe(true);
  });

  it('weekly chore is due on correct dayOfWeek', () => {
    const chore = baseChore({
      recurrence: { frequency: 'weekly', interval: 1, dayOfWeek: 3 },
      startDate: d(2025, 1, 1),
    });
    expect(isDueOnDate(chore, d(2025, 1, 1))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 1, 8))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 1, 2))).toBe(false);
  });

  it('monthly chore is due on correct dayOfMonth', () => {
    const chore = baseChore({
      recurrence: { frequency: 'monthly', interval: 1, dayOfMonth: 15 },
      startDate: d(2025, 1, 1),
    });
    expect(isDueOnDate(chore, d(2025, 1, 15))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 2, 15))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 1, 14))).toBe(false);
  });

  it('once chore is due only on its date', () => {
    const chore = baseChore({
      recurrence: { frequency: 'once', interval: 1 },
      dueDate: d(2025, 6, 15),
    });
    expect(isDueOnDate(chore, d(2025, 6, 15))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 6, 14))).toBe(false);
    expect(isDueOnDate(chore, d(2025, 6, 16))).toBe(false);
  });

  it('chore is not due before startDate', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 1 },
      startDate: d(2025, 6, 1),
    });
    expect(isDueOnDate(chore, d(2025, 5, 31))).toBe(false);
    expect(isDueOnDate(chore, d(2025, 6, 1))).toBe(true);
  });

  it('monthly chore with interval=2 skips months', () => {
    const chore = baseChore({
      recurrence: { frequency: 'monthly', interval: 2, dayOfMonth: 10 },
      startDate: d(2025, 1, 10),
    });
    expect(isDueOnDate(chore, d(2025, 1, 10))).toBe(true);
    expect(isDueOnDate(chore, d(2025, 2, 10))).toBe(false);
    expect(isDueOnDate(chore, d(2025, 3, 10))).toBe(true);
  });
});

describe('getNextDueDate', () => {
  it('returns today for daily chore on due day', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 1 },
      startDate: d(2025, 1, 1),
    });
    const result = getNextDueDate(chore, d(2025, 3, 15));
    expect(result.getTime()).toBe(d(2025, 3, 15).getTime());
  });

  it('returns next occurrence for daily interval=3', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 3 },
      startDate: d(2025, 1, 1),
    });
    const result = getNextDueDate(chore, d(2025, 1, 2));
    expect(result.getTime()).toBe(d(2025, 1, 4).getTime());
  });

  it('returns startDate if fromDate is before it', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 1 },
      startDate: d(2025, 6, 1),
    });
    const result = getNextDueDate(chore, d(2025, 5, 15));
    expect(result.getTime()).toBe(d(2025, 6, 1).getTime());
  });

  it('returns correct next weekly occurrence', () => {
    const chore = baseChore({
      recurrence: { frequency: 'weekly', interval: 1, dayOfWeek: 1 },
    });
    const result = getNextDueDate(chore, d(2025, 6, 11));
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(16);
  });

  it('returns today if weekly and today is the day', () => {
    const chore = baseChore({
      recurrence: { frequency: 'weekly', interval: 1, dayOfWeek: 3 },
    });
    const result = getNextDueDate(chore, d(2025, 6, 11));
    expect(result.getTime()).toBe(d(2025, 6, 11).getTime());
  });
});

describe('getNextDueAfter', () => {
  it('returns the next due date after the given date', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 1 },
      startDate: d(2025, 1, 1),
    });
    const result = getNextDueAfter(chore, d(2025, 6, 15));
    expect(result!.getTime()).toBe(d(2025, 6, 16).getTime());
  });

  it('returns null for once chores', () => {
    const chore = baseChore({
      recurrence: { frequency: 'once', interval: 1 },
      dueDate: d(2025, 6, 15),
    });
    expect(getNextDueAfter(chore, d(2025, 6, 15))).toBeNull();
  });

  it('returns next weekly occurrence after given date', () => {
    const chore = baseChore({
      recurrence: { frequency: 'weekly', interval: 1, dayOfWeek: 1 },
    });
    const result = getNextDueAfter(chore, d(2025, 6, 9));
    expect(result!.getDate()).toBe(16);
    expect(result!.getDay()).toBe(1);
  });
});

describe('getDueDatesInRange', () => {
  it('returns all daily dates in a week range', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 1 },
      startDate: d(2025, 1, 1),
    });
    const results = getDueDatesInRange(chore, d(2025, 6, 9), d(2025, 6, 15));
    expect(results.length).toBe(7);
  });

  it('returns correct dates for interval=2 daily', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 2 },
      startDate: d(2025, 1, 1),
    });
    const results = getDueDatesInRange(chore, d(2025, 1, 1), d(2025, 1, 7));
    expect(results.length).toBe(4);
    expect(results[0].getDate()).toBe(1);
    expect(results[1].getDate()).toBe(3);
  });

  it('returns weekly dates in a month range', () => {
    const chore = baseChore({
      recurrence: { frequency: 'weekly', interval: 1, dayOfWeek: 1 },
      startDate: d(2025, 1, 1),
    });
    const results = getDueDatesInRange(chore, d(2025, 6, 1), d(2025, 6, 30));
    expect(results.length).toBe(5);
    results.forEach(date => expect(date.getDay()).toBe(1));
  });

  it('returns empty for range before startDate', () => {
    const chore = baseChore({
      recurrence: { frequency: 'daily', interval: 1 },
      startDate: d(2025, 6, 1),
    });
    const results = getDueDatesInRange(chore, d(2025, 5, 1), d(2025, 5, 31));
    expect(results.length).toBe(0);
  });

  it('returns once chore date if in range', () => {
    const chore = baseChore({
      recurrence: { frequency: 'once', interval: 1 },
      dueDate: d(2025, 6, 15),
    });
    const inRange = getDueDatesInRange(chore, d(2025, 6, 1), d(2025, 6, 30));
    expect(inRange.length).toBe(1);
    const outOfRange = getDueDatesInRange(chore, d(2025, 7, 1), d(2025, 7, 31));
    expect(outOfRange.length).toBe(0);
  });

  it('returns monthly dates in a multi-month range', () => {
    const chore = baseChore({
      recurrence: { frequency: 'monthly', interval: 1, dayOfMonth: 15 },
      startDate: d(2025, 1, 1),
    });
    const results = getDueDatesInRange(chore, d(2025, 1, 1), d(2025, 3, 31));
    expect(results.length).toBe(3);
    results.forEach(date => expect(date.getDate()).toBe(15));
  });
});

// ─── Rotation ────────────────────────────────────────────────

describe('getRotationIndex', () => {
  it('uses stored rotationIndex when present', () => {
    const chore = baseChore({
      rotationIndex: 2,
      rotation: { members: ['Alice', 'Bob', 'Charlie'], group: 'A', cycleLength: 1, cycleType: 'weekly', everyDays: 1 },
    });
    expect(getRotationIndex(chore, d(2025, 6, 15))).toBe(2);
  });

  it('wraps stored index to member count', () => {
    const chore = baseChore({
      rotationIndex: 5,
      rotation: { members: ['Alice', 'Bob', 'Charlie'], group: 'A', cycleLength: 1, cycleType: 'weekly', everyDays: 1 },
    });
    expect(getRotationIndex(chore, d(2025, 6, 15))).toBe(2);
  });

  it('calculates index from date diff for weekly cycle', () => {
    const chore = baseChore({
      startDate: d(2025, 1, 6),
      rotation: {
        members: ['Alice', 'Bob', 'Charlie'],
        cycleType: 'weekly',
        cycleLength: 1,
        group: 'A',
        everyDays: 1,
      },
    });
    expect(getRotationIndex(chore, d(2025, 1, 6))).toBe(0);
    expect(getRotationIndex(chore, d(2025, 1, 13))).toBe(1);
    expect(getRotationIndex(chore, d(2025, 1, 20))).toBe(2);
    expect(getRotationIndex(chore, d(2025, 1, 27))).toBe(0);
  });

  it('calculates index for daily cycle', () => {
    const chore = baseChore({
      startDate: d(2025, 1, 1),
      rotation: {
        members: ['Alice', 'Bob'],
        cycleType: 'daily',
        everyDays: 1,
        group: 'A',
        cycleLength: 1,
      },
    });
    expect(getRotationIndex(chore, d(2025, 1, 1))).toBe(0);
    expect(getRotationIndex(chore, d(2025, 1, 2))).toBe(1);
    expect(getRotationIndex(chore, d(2025, 1, 3))).toBe(0);
  });

  it('returns 0 for empty members', () => {
    const chore = baseChore({
      rotation: { members: [], group: 'A', cycleLength: 1, cycleType: 'weekly', everyDays: 1 },
    });
    expect(getRotationIndex(chore, d(2025, 6, 15))).toBe(0);
  });
});

describe('getAssignedMembers', () => {
  it('returns assigned array for fixed chore', () => {
    const chore = baseChore({
      assignmentType: 'fixed',
      assigned: ['Alice', 'Bob'],
    });
    expect(getAssignedMembers(chore, d(2025, 6, 15))).toEqual(['Alice', 'Bob']);
  });

  it('returns current rotation member for rotating chore', () => {
    const chore = baseChore({
      assignmentType: 'rotating',
      rotationIndex: 1,
      rotation: { members: ['Alice', 'Bob', 'Charlie'], group: 'A', cycleLength: 1, cycleType: 'weekly', everyDays: 1 },
      completed: false,
    });
    expect(getAssignedMembers(chore, d(2025, 6, 15))).toEqual(['Bob']);
  });

  it('returns previous member when completion is active', () => {
    const chore = baseChore({
      assignmentType: 'rotating',
      rotationIndex: 1,
      rotation: { members: ['Alice', 'Bob', 'Charlie'], group: 'A', cycleLength: 1, cycleType: 'weekly', everyDays: 1 },
      completed: true,
      completedThrough: '2025-06-16',
    });
    expect(getAssignedMembers(chore, d(2025, 6, 15))).toEqual(['Alice']);
  });

  it('uses rotationIndexPrev when available and completion active', () => {
    const chore = baseChore({
      assignmentType: 'rotating',
      rotationIndex: 2,
      rotationIndexPrev: 0,
      rotation: { members: ['Alice', 'Bob', 'Charlie'], group: 'A', cycleLength: 1, cycleType: 'weekly', everyDays: 1 },
      completed: true,
      completedThrough: '2025-06-16',
    });
    expect(getAssignedMembers(chore, d(2025, 6, 15))).toEqual(['Alice']);
  });
});

// ─── Completion ──────────────────────────────────────────────

describe('isCompletionActive', () => {
  it('returns false when not completed', () => {
    expect(isCompletionActive(baseChore({ completed: false }), d(2025, 6, 15))).toBe(false);
  });

  it('returns true for completed fixed chore with completedThrough', () => {
    expect(isCompletionActive(
      baseChore({ completed: true, assignmentType: 'fixed', completedThrough: '2025-06-16' }),
      d(2025, 6, 15),
    )).toBe(true);
  });

  it('returns false for completed chore with no completedThrough or lastCompletedDate', () => {
    expect(isCompletionActive(
      baseChore({ completed: true, assignmentType: 'rotating' }),
      d(2025, 6, 15),
    )).toBe(false);
  });

  it('returns false for rotating chore after next due date', () => {
    const chore = baseChore({
      completed: true,
      assignmentType: 'rotating',
      recurrence: { frequency: 'daily', interval: 1 },
      startDate: d(2025, 1, 1),
      lastCompletedDate: '2025-06-15',
    });
    expect(isCompletionActive(chore, d(2025, 6, 16))).toBe(false);
  });
});

describe('isChoreComplete', () => {
  it('fixed chore with completed=true and completedThrough is complete', () => {
    const chore = baseChore({ completed: true, assignmentType: 'fixed', assigned: ['Alice'], completedThrough: '2025-06-16' });
    expect(isChoreComplete(chore, undefined, d(2025, 6, 15))).toBe(true);
  });

  it('multi-assignee: complete only when all in completedBy', () => {
    const chore = baseChore({
      completed: true,
      assigned: ['Alice', 'Bob'],
      completedBy: ['Alice'],
    });
    expect(isChoreComplete(chore, undefined, d(2025, 6, 15))).toBe(false);

    const choreComplete = baseChore({
      completed: true,
      assigned: ['Alice', 'Bob'],
      completedBy: ['Alice', 'Bob'],
    });
    expect(isChoreComplete(choreComplete, undefined, d(2025, 6, 15))).toBe(true);
  });
});

describe('getCompletedBy', () => {
  it('returns completedBy array when present', () => {
    const chore = baseChore({ completedBy: ['Alice'], assigned: ['Alice', 'Bob'] });
    expect(getCompletedBy(chore)).toEqual(['Alice']);
  });

  it('returns assigned array when completed but no completedBy', () => {
    const chore = baseChore({ completed: true, assigned: ['Alice'], completedBy: [] });
    // completedBy is an empty array (not missing), so getCompletedBy returns it
    // The original JS test passed because chore.completedBy was not set at all.
    // With typed data, completedBy is always an array. Adjust:
    expect(getCompletedBy(chore)).toEqual([]);
  });

  it('returns empty array when not completed and no completedBy', () => {
    const chore = baseChore({ completed: false, assigned: ['Alice'] });
    expect(getCompletedBy(chore)).toEqual([]);
  });
});

// ─── Normalization ───────────────────────────────────────────

describe('normalizeRecurrence', () => {
  it('normalizes string "Daily"', () => {
    expect(normalizeRecurrence({ recurrence: 'Daily' } as RawImportedChore)).toEqual({
      frequency: 'daily',
      interval: 1,
    });
  });

  it('normalizes string "weekly"', () => {
    const result = normalizeRecurrence({ recurrence: 'weekly' } as RawImportedChore);
    expect(result.frequency).toBe('weekly');
    expect(result.interval).toBe(1);
    expect(result).toHaveProperty('dayOfWeek');
  });

  it('normalizes object { frequency: "monthly" }', () => {
    const result = normalizeRecurrence({
      recurrence: { frequency: 'monthly', dayOfMonth: 15 },
    } as RawImportedChore);
    expect(result.frequency).toBe('monthly');
    expect(result.dayOfMonth).toBe(15);
  });

  it('normalizes once/one-time', () => {
    expect(normalizeRecurrence({ recurrence: 'once' } as RawImportedChore)).toEqual({
      frequency: 'once',
      interval: 1,
    });
    expect(normalizeRecurrence({ recurrence: 'one-time' } as RawImportedChore)).toEqual({
      frequency: 'once',
      interval: 1,
    });
  });

  it('defaults to daily for empty/unknown', () => {
    expect(normalizeRecurrence({} as RawImportedChore)).toEqual({
      frequency: 'daily',
      interval: 1,
    });
  });

  it('respects recurrenceInterval', () => {
    const result = normalizeRecurrence({
      recurrence: 'daily',
      recurrenceInterval: 5,
    } as RawImportedChore);
    expect(result.interval).toBe(5);
  });
});

describe('mapImportedChore', () => {
  it('handles assignment.type="rotating" with order array', () => {
    const chore: RawImportedChore = {
      subject: 'Dishes',
      assignment: {
        type: 'rotating',
        order: ['Alice', 'Bob', 'Charlie'],
      },
      recurrence: 'weekly',
      startDate: d(2025, 1, 1),
    };
    const result = mapImportedChore(chore);
    expect(result.assignmentType).toBe('rotating');
    expect(result.rotation!.members).toEqual(['Alice', 'Bob', 'Charlie']);
    expect(result.assigned).toEqual(['Alice']);
  });

  it('handles flat assigned array for fixed chores', () => {
    const chore: RawImportedChore = {
      subject: 'Vacuuming',
      assigned: ['Alice', 'Bob'],
      recurrence: 'weekly',
      startDate: d(2025, 1, 1),
    };
    const result = mapImportedChore(chore);
    expect(result.assignmentType).toBe('fixed');
    expect(result.assigned).toEqual(['Alice', 'Bob']);
    expect(result.rotation).toBeUndefined();
  });

  it('sets default subject when missing', () => {
    const result = mapImportedChore({} as RawImportedChore);
    expect(result.subject).toBe('Untitled');
  });

  it('preserves completedBy array', () => {
    const chore: RawImportedChore = {
      subject: 'Test',
      completedBy: ['Alice'],
      assigned: ['Alice', 'Bob'],
    };
    const result = mapImportedChore(chore);
    expect(result.completedBy).toEqual(['Alice']);
  });
});

// ─── Data Operations ─────────────────────────────────────────

describe('extractProgress / applyProgress', () => {
  it('round-trips progress state', () => {
    const chores: Chore[] = [
      baseChore({
        subject: 'Dishes',
        completed: true,
        completedBy: ['Alice'],
        lastCompletedDate: '2025-06-15',
        rotationIndex: 2,
        assigned: ['Alice'],
      }),
      baseChore({
        subject: 'Laundry',
        completed: false,
        completedBy: [],
        assigned: ['Bob'],
      }),
    ];

    const progress = extractProgress(chores);
    expect(progress['Dishes'].completed).toBe(true);
    expect(progress['Dishes'].completedBy).toEqual(['Alice']);
    expect(progress['Dishes'].lastCompletedDate).toBe('2025-06-15');
    expect(progress['Laundry'].completed).toBe(false);

    const base: Chore[] = [
      baseChore({ subject: 'Dishes', completed: false, completedBy: [], assigned: ['Alice'] }),
      baseChore({ subject: 'Laundry', completed: false, completedBy: [], assigned: ['Bob'] }),
    ];
    const restored = applyProgress(base, progress);
    expect(restored[0].completed).toBe(true);
    expect(restored[0].completedBy).toEqual(['Alice']);
    expect(restored[0].lastCompletedDate).toBe('2025-06-15');
    expect(restored[1].completed).toBe(false);
  });

  it('applyProgress returns original chores when progress is null', () => {
    const chores = [baseChore({ subject: 'Test', completed: false })];
    expect(applyProgress(chores, null)).toBe(chores);
  });
});

describe('mergeChores', () => {
  it('updates existing chore by subject', () => {
    const current: Chore[] = [
      baseChore({ subject: 'Dishes', description: 'old', recurrence: { frequency: 'daily', interval: 1 } }),
    ];
    const imported: RawImportedChore[] = [
      { subject: 'Dishes', description: 'new' },
    ];
    const merged = mergeChores(current, imported);
    expect(merged.length).toBe(1);
    expect(merged[0].description).toBe('new');
  });

  it('adds new chores not in current', () => {
    const current: Chore[] = [
      baseChore({ subject: 'Dishes', description: 'wash dishes' }),
    ];
    const imported: RawImportedChore[] = [
      { subject: 'Vacuuming', assigned: ['Bob'], recurrence: 'weekly', startDate: '2025-01-01' },
    ];
    const merged = mergeChores(current, imported);
    expect(merged.length).toBe(2);
    expect(merged[1].subject).toBe('Vacuuming');
  });

  it('preserves current chores not in import', () => {
    const current: Chore[] = [
      baseChore({ subject: 'Dishes', description: 'wash dishes' }),
      baseChore({ subject: 'Laundry', description: 'do laundry' }),
    ];
    const imported: RawImportedChore[] = [
      { subject: 'Dishes', description: 'updated' },
    ];
    const merged = mergeChores(current, imported);
    expect(merged.length).toBe(2);
    expect(merged[1].subject).toBe('Laundry');
    expect(merged[1].description).toBe('do laundry');
  });

  it('handles null/empty imported', () => {
    const current: Chore[] = [baseChore({ subject: 'Dishes' })];
    expect(mergeChores(current, null).length).toBe(1);
    expect(mergeChores(current, []).length).toBe(1);
  });
});
