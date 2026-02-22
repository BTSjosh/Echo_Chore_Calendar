import * as XLSX from 'xlsx';
import { HISTORY_KEY } from './storage';
import { getStartOfWeek } from './dates';
import type { HistoryEvent } from '../types';

export const loadHistory = (): HistoryEvent[] => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    console.error('Failed to load history:', error);
  }
  return [];
};

export const saveHistory = (events: HistoryEvent[]): void => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(events));
  } catch (error) {
    console.error('Failed to save history:', error);
  }
};

const RETENTION_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

export const pruneHistory = (events: HistoryEvent[]): HistoryEvent[] => {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  return events.filter((e) => e.timestamp >= cutoff);
};

export const appendHistoryEvent = (
  event: Omit<HistoryEvent, 'id' | 'timestamp'>
): void => {
  const full: HistoryEvent = {
    ...event,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  const history = loadHistory();
  history.push(full);
  saveHistory(pruneHistory(history));
};

const escapeCsvField = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export interface ExportOptions {
  dateRange?: { start: Date; end: Date } | null;
  personFilter?: string[] | null;
}

const ACTION_LABELS: Record<string, string> = {
  completed: 'Completed',
  completed_late: 'Completed Late',
  abandoned: 'Abandoned',
  postponed: 'Postponed',
  auto_postponed: 'Auto-Postponed',
  uncompleted: 'Uncompleted',
};

const applyExportFilters = (events: HistoryEvent[], options: ExportOptions): HistoryEvent[] => {
  let filtered = events;

  if (options.dateRange) {
    const startMs = options.dateRange.start.getTime();
    const endMs = options.dateRange.end.getTime();
    filtered = filtered.filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      return ts >= startMs && ts <= endMs;
    });
  }

  if (options.personFilter && options.personFilter.length > 0) {
    const persons = new Set(options.personFilter);
    filtered = filtered.filter((e) => e.members.some((m) => persons.has(m)));
  }

  return filtered;
};

export const exportHistoryAsCsv = (events: HistoryEvent[], options: ExportOptions = {}): string => {
  const filtered = applyExportFilters(events, options);
  const headers = 'id,timestamp,action,choreSubject,members,dueDate,postponedTo';
  const rows = filtered.map((e) =>
    [
      escapeCsvField(e.id),
      escapeCsvField(e.timestamp),
      escapeCsvField(ACTION_LABELS[e.action] ?? e.action),
      escapeCsvField(e.choreSubject),
      escapeCsvField(e.members.join('; ')),
      escapeCsvField(e.dueDate ?? ''),
      escapeCsvField(e.postponedTo ?? ''),
    ].join(',')
  );
  return [headers, ...rows].join('\n');
};

const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10);

export const exportHistoryAsXlsx = (
  allEvents: HistoryEvent[],
  household: string[],
  options: ExportOptions = {}
): Uint8Array => {
  const events = applyExportFilters(allEvents, options);

  // ── Sheet 1: Raw Log ──────────────────────────────────────────────────────
  const fmtDate = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const rawRows = events.map((e) => {
    const dt = new Date(e.timestamp);
    return {
      Date: dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      Time: dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      Action: ACTION_LABELS[e.action] ?? e.action,
      Chore: e.choreSubject,
      Members: (e.members ?? []).join('; '),
      'Due Date': e.dueDate ? fmtDate(e.dueDate) : '',
      'Postponed To': e.postponedTo ? fmtDate(e.postponedTo) : '',
    };
  });
  const rawSheet = XLSX.utils.json_to_sheet(rawRows);

  // ── Sheet 2: Per-Person Summary ──────────────────────────────────────────
  const personStats = new Map<string, { onTime: number; late: number; abandoned: number }>();
  for (const member of household) {
    personStats.set(member, { onTime: 0, late: 0, abandoned: 0 });
  }
  for (const e of events) {
    for (const m of e.members) {
      if (!personStats.has(m)) personStats.set(m, { onTime: 0, late: 0, abandoned: 0 });
      const s = personStats.get(m)!;
      if (e.action === 'completed') s.onTime++;
      else if (e.action === 'completed_late') s.late++;
      else if (e.action === 'abandoned') s.abandoned++;
    }
  }
  const personRows = [...personStats.entries()].map(([member, s]) => {
    const total = s.onTime + s.late;
    const totalWithAbandoned = total + s.abandoned;
    return {
      Member: member,
      'Completed (On-Time)': s.onTime,
      'Completed Late': s.late,
      'Total Completions': total,
      Abandoned: s.abandoned,
      'Completion Rate': totalWithAbandoned > 0
        ? `${Math.round((total / totalWithAbandoned) * 100)}%`
        : 'N/A',
      'On-Time Rate': total > 0
        ? `${Math.round((s.onTime / total) * 100)}%`
        : 'N/A',
    };
  });
  const personSheet = XLSX.utils.json_to_sheet(personRows);

  // ── Sheet 3: Weekly Totals ────────────────────────────────────────────────
  const weekMap = new Map<string, { completed: number; late: number; abandoned: number; postponed: number }>();
  for (const e of events) {
    const monday = getStartOfWeek(new Date(e.timestamp));
    const key = toIsoDate(monday);
    if (!weekMap.has(key)) weekMap.set(key, { completed: 0, late: 0, abandoned: 0, postponed: 0 });
    const w = weekMap.get(key)!;
    if (e.action === 'completed') w.completed++;
    else if (e.action === 'completed_late') w.late++;
    else if (e.action === 'abandoned') w.abandoned++;
    else if (e.action === 'postponed' || e.action === 'auto_postponed') w.postponed++;
  }
  const weekRows = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, w]) => ({
      'Week Starting': weekStart,
      Completed: w.completed,
      Late: w.late,
      Abandoned: w.abandoned,
      Postponed: w.postponed,
      'Total Actions': w.completed + w.late + w.abandoned + w.postponed,
    }));
  const weekSheet = XLSX.utils.json_to_sheet(weekRows);

  // ── Sheet 4: Chore Summary ────────────────────────────────────────────────
  const choreMap = new Map<string, { completed: number; late: number; abandoned: number; postponed: number }>();
  for (const e of events) {
    if (!choreMap.has(e.choreSubject)) {
      choreMap.set(e.choreSubject, { completed: 0, late: 0, abandoned: 0, postponed: 0 });
    }
    const c = choreMap.get(e.choreSubject)!;
    if (e.action === 'completed') c.completed++;
    else if (e.action === 'completed_late') c.late++;
    else if (e.action === 'abandoned') c.abandoned++;
    else if (e.action === 'postponed' || e.action === 'auto_postponed') c.postponed++;
  }
  const choreRows = [...choreMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chore, c]) => {
      const totalDone = c.completed + c.late;
      const total = totalDone + c.abandoned;
      return {
        Chore: chore,
        Completed: c.completed,
        Late: c.late,
        Abandoned: c.abandoned,
        Postponed: c.postponed,
        Total: totalDone + c.abandoned + c.postponed,
        'Completion Rate': total > 0
          ? `${Math.round((totalDone / total) * 100)}%`
          : 'N/A',
      };
    });
  const choreSheet = XLSX.utils.json_to_sheet(choreRows);

  // ── Assemble workbook ─────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, rawSheet, 'Raw Log');
  XLSX.utils.book_append_sheet(wb, personSheet, 'Per-Person');
  XLSX.utils.book_append_sheet(wb, weekSheet, 'Weekly Totals');
  XLSX.utils.book_append_sheet(wb, choreSheet, 'Chore Summary');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
};

export const mergeHistory = (
  local: HistoryEvent[],
  remote: HistoryEvent[]
): HistoryEvent[] => {
  const ids = new Set(local.map((e) => e.id));
  const merged = [...local];
  for (const event of remote) {
    if (!ids.has(event.id)) {
      merged.push(event);
      ids.add(event.id);
    }
  }
  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return pruneHistory(merged);
};
