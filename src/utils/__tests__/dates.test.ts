import { describe, it, expect } from 'vitest';
import {
  toDateOnly,
  getFormattedDate,
  getDateKey,
  parseDateKey,
  getStartOfWeek,
  getEndOfWeek,
  getNext4Days,
  getStartOfMonth,
  getEndOfMonth,
  getDayIndex,
  getDayOfMonth,
} from '../dates';

describe('toDateOnly', () => {
  it('strips time from a Date object', () => {
    const date = new Date(2025, 5, 15, 14, 30, 45);
    const result = toDateOnly(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(15);
  });

  it('handles string input', () => {
    const result = toDateOnly(new Date(2025, 2, 10, 15, 30));
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(10);
    expect(result.getHours()).toBe(0);
  });

  it('returns a new Date instance', () => {
    const original = new Date(2025, 0, 1);
    const result = toDateOnly(original);
    expect(result).not.toBe(original);
    expect(result.getTime()).toBe(original.getTime());
  });
});

describe('getFormattedDate', () => {
  it('returns YYYY-MM-DD format', () => {
    const date = new Date(2025, 0, 5);
    expect(getFormattedDate(date)).toBe('2025-01-05');
  });

  it('pads single-digit month and day', () => {
    const date = new Date(2025, 2, 3);
    expect(getFormattedDate(date)).toBe('2025-03-03');
  });

  it('handles December correctly', () => {
    const date = new Date(2025, 11, 31);
    expect(getFormattedDate(date)).toBe('2025-12-31');
  });
});

describe('getDateKey / parseDateKey', () => {
  it('roundtrips a date correctly', () => {
    const date = new Date(2025, 5, 15, 10, 30);
    const key = getDateKey(date);
    expect(key).toBe('2025-06-15');
    const parsed = parseDateKey(key)!;
    expect(parsed.getFullYear()).toBe(2025);
    expect(parsed.getMonth()).toBe(5);
    expect(parsed.getDate()).toBe(15);
  });

  it('parseDateKey returns null for falsy input', () => {
    expect(parseDateKey(null)).toBeNull();
    expect(parseDateKey('')).toBeNull();
    expect(parseDateKey(undefined)).toBeNull();
  });

  it('parseDateKey returns null for malformed strings', () => {
    expect(parseDateKey('not-a-date')).toBeNull();
    expect(parseDateKey('2025')).toBeNull();
  });
});

describe('getStartOfWeek / getEndOfWeek', () => {
  it('returns Monday for a Wednesday', () => {
    const wed = new Date(2025, 5, 11);
    const start = getStartOfWeek(wed);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(9);
  });

  it('returns same day for Monday', () => {
    const mon = new Date(2025, 5, 9);
    const start = getStartOfWeek(mon);
    expect(start.getDate()).toBe(9);
  });

  it('returns previous Monday for Sunday', () => {
    const sun = new Date(2025, 5, 15);
    const start = getStartOfWeek(sun);
    expect(start.getDate()).toBe(9);
    expect(start.getDay()).toBe(1);
  });

  it('end of week is Sunday', () => {
    const wed = new Date(2025, 5, 11);
    const end = getEndOfWeek(wed);
    expect(end.getDay()).toBe(0);
    expect(end.getDate()).toBe(15);
  });

  it('end of week has time set to end of day', () => {
    const date = new Date(2025, 5, 11);
    const end = getEndOfWeek(date);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });
});

describe('getNext4Days', () => {
  it('always returns exactly 4 days starting from tomorrow', () => {
    const wed = new Date(2025, 5, 11);
    const days = getNext4Days(wed);
    expect(days.length).toBe(4);
    expect(days[0].getDate()).toBe(12);
    expect(days[3].getDate()).toBe(15);
  });

  it('returns 4 days even on Sunday (end of week)', () => {
    const sun = new Date(2025, 5, 15);
    const days = getNext4Days(sun);
    expect(days.length).toBe(4);
    expect(days[0].getDate()).toBe(16);
    expect(days[3].getDate()).toBe(19);
  });

  it('returns 4 days on Monday', () => {
    const mon = new Date(2025, 5, 9);
    const days = getNext4Days(mon);
    expect(days.length).toBe(4);
    expect(days[0].getDate()).toBe(10);
    expect(days[3].getDate()).toBe(13);
  });
});

describe('getStartOfMonth / getEndOfMonth', () => {
  it('start of month is day 1', () => {
    const date = new Date(2025, 5, 15);
    const start = getStartOfMonth(date);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(5);
  });

  it('end of month for June is 30', () => {
    const date = new Date(2025, 5, 15);
    const end = getEndOfMonth(date);
    expect(end.getDate()).toBe(30);
  });

  it('end of month for February (non-leap) is 28', () => {
    const date = new Date(2025, 1, 10);
    const end = getEndOfMonth(date);
    expect(end.getDate()).toBe(28);
  });

  it('end of month for February (leap year) is 29', () => {
    const date = new Date(2024, 1, 10);
    const end = getEndOfMonth(date);
    expect(end.getDate()).toBe(29);
  });
});

describe('getDayIndex', () => {
  it('maps short day names to indices', () => {
    expect(getDayIndex('mon')).toBe(1);
    expect(getDayIndex('tue')).toBe(2);
    expect(getDayIndex('wed')).toBe(3);
    expect(getDayIndex('thu')).toBe(4);
    expect(getDayIndex('fri')).toBe(5);
    expect(getDayIndex('sat')).toBe(6);
    expect(getDayIndex('sun')).toBe(0);
  });

  it('handles full day names (truncates to 3 chars)', () => {
    expect(getDayIndex('monday')).toBe(1);
    expect(getDayIndex('Wednesday')).toBe(3);
    expect(getDayIndex('FRIDAY')).toBe(5);
  });

  it('returns null for invalid input', () => {
    expect(getDayIndex(null)).toBeNull();
    expect(getDayIndex('')).toBeNull();
    expect(getDayIndex('xyz')).toBeNull();
  });
});

describe('getDayOfMonth', () => {
  it('extracts day from a Date object', () => {
    expect(getDayOfMonth(new Date(2025, 5, 15))).toBe(15);
  });

  it('returns null for null input', () => {
    expect(getDayOfMonth(null)).toBeNull();
  });

  it('returns null for invalid date', () => {
    expect(getDayOfMonth('not-a-date')).toBeNull();
  });
});
