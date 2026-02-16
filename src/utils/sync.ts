import { parseStoredProgress, saveAccessCode, loadFromLocalStorage, loadChoreDefinitions, loadPostpones } from './storage';
import { loadHistory } from './history';
import type { PostponeEntry, ProgressRecord, RemotePayload, RemoteSnapshot, RawImportedChore } from '../types';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const SUPABASE_TABLE = (import.meta.env.VITE_SUPABASE_TABLE || 'chore_snapshots').trim();
export const SUPABASE_REMOTE_ID = (import.meta.env.VITE_CHORE_REMOTE_ID || 'current').trim();
export const ACCESS_CODE = (import.meta.env.VITE_CHORE_ACCESS_CODE || '').trim();

export const normalizeSupabaseUrl = (value: string | null | undefined): string =>
  value ? value.replace(/\/+$/, '') : '';

export const syncAccessCodeFromUrl = (): void => {
  if (!ACCESS_CODE || typeof window === 'undefined') return;

  const { pathname, search, hash } = window.location;

  const searchParams = new URLSearchParams(search);
  let urlCode = searchParams.get('code');

  let nextSearch = search;
  let nextHash = hash;

  if (urlCode) {
    searchParams.delete('code');
    const nextQuery = searchParams.toString();
    nextSearch = nextQuery ? `?${nextQuery}` : '';
  } else if (hash.includes('?')) {
    const [hashPath, hashQuery] = hash.split('?', 2);
    const hashParams = new URLSearchParams(hashQuery);
    const hashCode = hashParams.get('code');
    if (hashCode) {
      urlCode = hashCode;
      hashParams.delete('code');
      const nextHashQuery = hashParams.toString();
      nextHash = nextHashQuery ? `${hashPath}?${nextHashQuery}` : hashPath;
    }
  }

  if (!urlCode) {
    return;
  }

  if (urlCode === ACCESS_CODE) {
    saveAccessCode(urlCode);
  }

  const nextUrl = `${pathname}${nextSearch}${nextHash}`;
  window.history.replaceState({}, '', nextUrl);
};

export const fetchRemoteSnapshot = async (): Promise<RemoteSnapshot | null> => {
  const baseUrl = normalizeSupabaseUrl(SUPABASE_URL);
  if (!baseUrl || !SUPABASE_ANON_KEY) return null;

  const url = new URL(`${baseUrl}/rest/v1/${SUPABASE_TABLE}`);
  url.searchParams.set('select', 'payload,updated_at');
  url.searchParams.set('id', `eq.${SUPABASE_REMOTE_ID}`);
  url.searchParams.set('limit', '1');

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
    const errorText = await response.text();
    console.error('Failed to fetch from Supabase:', response.status, errorText);
    throw new Error(`Remote fetch failed: ${response.status}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return {
    payload: rows[0]?.payload ?? null,
    updated_at: rows[0]?.updated_at ?? null,
  };
};

export const extractRemoteChores = (payload: RemotePayload | RemotePayload[] | null | undefined): RawImportedChore[] | null => {
  if (Array.isArray(payload)) return payload as unknown as RawImportedChore[];
  if (Array.isArray(payload?.chores)) return payload!.chores!;
  return null;
};

export const extractRemoteProgress = (payload: RemotePayload | null | undefined): ProgressRecord | null =>
  parseStoredProgress(payload?.progress ?? payload);

/**
 * Push the current local state to Supabase as a snapshot.
 * Returns true on success, false on failure or if Supabase is not configured.
 * Designed for background/fire-and-forget use — never throws.
 */
export const pushSnapshotToSupabase = async (): Promise<boolean> => {
  const baseUrl = normalizeSupabaseUrl(SUPABASE_URL);
  if (!baseUrl || !SUPABASE_ANON_KEY) return false;

  try {
    const chores = loadChoreDefinitions() ?? [];
    const progress = loadFromLocalStorage() ?? {};
    const postponedOverrides = loadPostpones();
    const history = loadHistory();

    const url = `${baseUrl}/rest/v1/${SUPABASE_TABLE}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: SUPABASE_REMOTE_ID,
        payload: { chores, progress, postponedOverrides, history },
        updated_at: new Date().toISOString(),
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Build the Supabase upsert body for use with `fetch` + `keepalive`.
 * Returns `null` if Supabase is not configured.
 */
export const buildSnapshotRequest = (): { url: string; body: string; headers: Record<string, string> } | null => {
  const baseUrl = normalizeSupabaseUrl(SUPABASE_URL);
  if (!baseUrl || !SUPABASE_ANON_KEY) return null;

  const chores = loadChoreDefinitions() ?? [];
  const progress = loadFromLocalStorage() ?? {};
  const postponedOverrides = loadPostpones();
  const history = loadHistory();

  return {
    url: `${baseUrl}/rest/v1/${SUPABASE_TABLE}`,
    body: JSON.stringify({
      id: SUPABASE_REMOTE_ID,
      payload: { chores, progress, postponedOverrides, history },
      updated_at: new Date().toISOString(),
    }),
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
  };
};

export const mergePostpones = (current: PostponeEntry[] | null, imported: PostponeEntry[] | null): PostponeEntry[] => {
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
