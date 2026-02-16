import { describe, it, expect } from 'vitest';
import {
  mergePostpones,
  extractRemoteChores,
  extractRemoteProgress,
  normalizeSupabaseUrl,
} from '../sync';
import type { PostponeEntry, RemotePayload } from '../../types';

describe('mergePostpones', () => {
  it('deduplicates by subject+fromDate+toDate', () => {
    const current: PostponeEntry[] = [
      { subject: 'Dishes', fromDate: '2025-06-15', toDate: '2025-06-16' },
    ];
    const imported: PostponeEntry[] = [
      { subject: 'Dishes', fromDate: '2025-06-15', toDate: '2025-06-16' },
      { subject: 'Dishes', fromDate: '2025-06-17', toDate: '2025-06-18' },
    ];
    const result = mergePostpones(current, imported);
    expect(result.length).toBe(2);
  });

  it('handles null current', () => {
    const imported: PostponeEntry[] = [{ subject: 'Dishes', fromDate: '2025-06-15', toDate: '2025-06-16' }];
    const result = mergePostpones(null, imported);
    expect(result.length).toBe(1);
  });

  it('handles null imported', () => {
    const current: PostponeEntry[] = [{ subject: 'Dishes', fromDate: '2025-06-15', toDate: '2025-06-16' }];
    const result = mergePostpones(current, null);
    expect(result.length).toBe(1);
    expect(result).toBe(current);
  });

  it('handles both empty arrays', () => {
    expect(mergePostpones([], []).length).toBe(0);
  });

  it('skips entries without subject', () => {
    const result = mergePostpones([], [
      { fromDate: '2025-06-15', toDate: '2025-06-16' } as PostponeEntry,
      { subject: 'Dishes', fromDate: '2025-06-15', toDate: '2025-06-16' },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].subject).toBe('Dishes');
  });
});

describe('extractRemoteChores', () => {
  it('extracts from payload.chores array', () => {
    const payload: RemotePayload = { chores: [{ subject: 'Dishes' }] };
    const result = extractRemoteChores(payload);
    expect(result).toEqual([{ subject: 'Dishes' }]);
  });

  it('handles direct array payload', () => {
    const payload = [{ subject: 'Dishes' }];
    const result = extractRemoteChores(payload as unknown as RemotePayload);
    expect(result).toEqual([{ subject: 'Dishes' }]);
  });

  it('returns null for null/undefined payload', () => {
    expect(extractRemoteChores(null)).toBeNull();
    expect(extractRemoteChores(undefined)).toBeNull();
  });

  it('returns null for object without chores array', () => {
    expect(extractRemoteChores({ foo: 'bar' } as unknown as RemotePayload)).toBeNull();
  });
});

describe('extractRemoteProgress', () => {
  it('extracts progress from payload.progress object', () => {
    const payload: RemotePayload = {
      progress: {
        Dishes: { completed: true, completedBy: ['Alice'] },
      },
    };
    const result = extractRemoteProgress(payload);
    expect(result).not.toBeNull();
    expect(result!['Dishes'].completed).toBe(true);
    expect(result!['Dishes'].completedBy).toEqual(['Alice']);
  });

  it('returns null for null payload', () => {
    expect(extractRemoteProgress(null)).toBeNull();
  });

  it('handles payload as progress array', () => {
    const payload: RemotePayload = {
      progress: [
        { subject: 'Dishes', completed: true, completedBy: [] },
      ] as unknown as Record<string, { completed: boolean; completedBy: string[] }>,
    };
    const result = extractRemoteProgress(payload);
    expect(result).not.toBeNull();
    expect(result!['Dishes'].completed).toBe(true);
  });
});

describe('normalizeSupabaseUrl', () => {
  it('strips trailing slashes', () => {
    expect(normalizeSupabaseUrl('https://example.supabase.co/')).toBe('https://example.supabase.co');
    expect(normalizeSupabaseUrl('https://example.supabase.co///')).toBe('https://example.supabase.co');
  });

  it('returns unchanged URL without trailing slash', () => {
    expect(normalizeSupabaseUrl('https://example.supabase.co')).toBe('https://example.supabase.co');
  });

  it('returns empty string for falsy input', () => {
    expect(normalizeSupabaseUrl('')).toBe('');
    expect(normalizeSupabaseUrl(null)).toBe('');
    expect(normalizeSupabaseUrl(undefined)).toBe('');
  });
});
