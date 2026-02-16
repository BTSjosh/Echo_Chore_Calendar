import { HISTORY_KEY } from './storage';
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
  saveHistory(history);
};

const escapeCsvField = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const exportHistoryAsCsv = (events: HistoryEvent[]): string => {
  const headers = 'id,timestamp,action,choreSubject,members,dueDate,postponedTo';
  const rows = events.map((e) =>
    [
      escapeCsvField(e.id),
      escapeCsvField(e.timestamp),
      escapeCsvField(e.action),
      escapeCsvField(e.choreSubject),
      escapeCsvField(e.members.join('; ')),
      escapeCsvField(e.dueDate ?? ''),
      escapeCsvField(e.postponedTo ?? ''),
    ].join(',')
  );
  return [headers, ...rows].join('\n');
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
  return merged;
};
