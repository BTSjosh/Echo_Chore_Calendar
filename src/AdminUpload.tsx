import { useState, useRef } from 'react';
import {
  parseStoredProgress,
  saveToLocalStorage,
  loadFromLocalStorage,
  savePostpones,
  loadPostpones,
  saveChoreDefinitions,
  loadChoreDefinitions,
} from './utils/storage';
import { getFormattedDate } from './utils/dates';
import { HOUSEHOLD } from './utils/chores';
import {
  normalizeSupabaseUrl,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE,
  SUPABASE_REMOTE_ID,
} from './utils/sync';
import {
  loadHistory,
  exportHistoryAsCsv,
  exportHistoryAsXlsx,
  saveHistory,
  mergeHistory,
  type ExportOptions,
} from './utils/history';
import type { Chore, PostponeEntry, HistoryEvent } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

type DateRangePreset = 'all' | 'last30' | 'last90' | 'thisMonth';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExportCsv: (options: ExportOptions) => void;
  onExportXlsx: (options: ExportOptions) => void;
  household: string[];
}

// ── ExportDialog ──────────────────────────────────────────────────────────────

const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This Month' },
];

function buildDateRange(preset: DateRangePreset): { start: Date; end: Date } | null {
  if (preset === 'all') return null;
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (preset === 'last30') {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (preset === 'last90') {
    const start = new Date(now);
    start.setDate(now.getDate() - 90);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  // thisMonth
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { start, end };
}

function ExportDialog({ open, onClose, onExportCsv, onExportXlsx, household }: ExportDialogProps) {
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [allMembers, setAllMembers] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set(household));

  if (!open) return null;

  const toggleMember = (member: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(member)) next.delete(member);
      else next.add(member);
      return next;
    });
  };

  const buildOptions = (): ExportOptions => ({
    dateRange: buildDateRange(datePreset),
    personFilter: allMembers ? null : [...selectedMembers],
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1e1e1e] border border-green-500/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-100">Export History</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xl leading-none transition"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Date Range */}
        <fieldset className="mb-5">
          <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Date Range
          </legend>
          <div className="space-y-1.5">
            {DATE_RANGE_PRESETS.map((p) => (
              <label key={p.value} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="dateRange"
                  value={p.value}
                  checked={datePreset === p.value}
                  onChange={() => setDatePreset(p.value)}
                  className="accent-green-500"
                />
                <span className="text-sm text-slate-300">{p.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Person Filter */}
        <fieldset className="mb-6">
          <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Filter by Person
          </legend>
          <label className="flex items-center gap-2.5 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={allMembers}
              onChange={(e) => {
                setAllMembers(e.target.checked);
                if (e.target.checked) setSelectedMembers(new Set(household));
              }}
              className="accent-green-500"
            />
            <span className="text-sm text-slate-300 font-medium">All members</span>
          </label>
          {!allMembers && (
            <div className="ml-5 space-y-1.5">
              {household.map((member) => (
                <label key={member} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMembers.has(member)}
                    onChange={() => toggleMember(member)}
                    className="accent-green-500"
                  />
                  <span className="text-sm text-slate-300">{member}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onExportCsv(buildOptions())}
            className="flex-1 rounded-full border border-slate-700 bg-[#2a2a2a] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => onExportXlsx(buildOptions())}
            className="flex-1 rounded-full bg-green-500 text-slate-950 px-4 py-2.5 text-sm font-semibold hover:bg-green-400 transition"
          >
            Export XLSX
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Supabase upload ───────────────────────────────────────────────────────────

const uploadFileToSupabase = async (payload: Record<string, unknown>): Promise<Response> => {
  const baseUrl = normalizeSupabaseUrl(SUPABASE_URL);
  if (!baseUrl || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase URL or API key not configured');
  }

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
      payload,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} ${text}`);
  }

  return response;
};

// ── AdminUpload ───────────────────────────────────────────────────────────────

export default function AdminUpload() {
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [localStatus, setLocalStatus] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus('Reading file...');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.chores || !Array.isArray(parsed.chores)) {
        throw new Error('Invalid format: expected a "chores" array');
      }

      const snapshot = {
        chores: parsed.chores,
        progress: parsed.progress || {},
        postponedOverrides: parsed.postponedOverrides || [],
        history: parsed.history || [],
      };

      setStatus('Uploading to Supabase...');
      await uploadFileToSupabase(snapshot);

      setStatus('\u2705 Upload successful! Refresh the app to see changes.');
    } catch (error) {
      console.error('Upload failed:', error);
      setStatus(`\u274C Upload failed: ${(error as Error).message}`);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleLocalBackup = () => {
    const chores = loadChoreDefinitions() ?? [];
    const progress = loadFromLocalStorage() ?? {};
    const postponedOverrides = loadPostpones();
    const history = loadHistory();
    const payload = JSON.stringify(
      {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        household: HOUSEHOLD,
        chores,
        progress,
        postponedOverrides,
        history,
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

  const handleLocalRestoreFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLocalBusy(true);
    setLocalStatus('Reading file...');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const restoredProgress = parseStoredProgress(parsed?.progress ?? parsed);
      const restoredPostpones: PostponeEntry[] = Array.isArray(parsed?.postponedOverrides)
        ? parsed.postponedOverrides
        : [];
      const restoredDefinitions: Chore[] | null = Array.isArray(parsed?.chores)
        ? parsed.chores
        : null;

      if (!restoredProgress && !restoredDefinitions) {
        throw new Error('Unsupported restore file format');
      }

      if (restoredDefinitions) {
        saveChoreDefinitions(restoredDefinitions);
      }

      if (restoredProgress) {
        saveToLocalStorage(restoredProgress);
      }

      if (Object.prototype.hasOwnProperty.call(parsed ?? {}, 'postponedOverrides')) {
        savePostpones(restoredPostpones);
      }

      if (Array.isArray(parsed?.history)) {
        const merged = mergeHistory(loadHistory(), parsed.history as HistoryEvent[]);
        saveHistory(merged);
      }

      setLocalStatus('\u2705 Local restore saved. Refresh the app to apply changes.');
    } catch (error) {
      console.error('Local restore failed:', error);
      setLocalStatus(`\u274C Restore failed: ${(error as Error).message}`);
    } finally {
      setLocalBusy(false);
      event.target.value = '';
    }
  };

  const triggerDownload = (content: string | Uint8Array, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = (options: ExportOptions) => {
    const history = loadHistory();
    if (history.length === 0) {
      setLocalStatus('No history events to export.');
      setExportDialogOpen(false);
      return;
    }
    setHistoryBusy(true);
    setExportDialogOpen(false);
    setTimeout(() => {
      const csv = exportHistoryAsCsv(history, options);
      triggerDownload(csv, `chore-history-${getFormattedDate()}.csv`, 'text/csv');
      setHistoryBusy(false);
    }, 50);
  };

  const handleExportXlsx = (options: ExportOptions) => {
    const history = loadHistory();
    if (history.length === 0) {
      setLocalStatus('No history events to export.');
      setExportDialogOpen(false);
      return;
    }
    setHistoryBusy(true);
    setExportDialogOpen(false);
    setTimeout(() => {
      const bytes = exportHistoryAsXlsx(history, HOUSEHOLD, options);
      triggerDownload(
        bytes,
        `chore-history-${getFormattedDate()}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      setHistoryBusy(false);
    }, 50);
  };

  const handleExportHistoryJson = () => {
    const history = loadHistory();
    if (history.length === 0) {
      setLocalStatus('No history events to export.');
      return;
    }
    setHistoryBusy(true);
    setTimeout(() => {
      const json = JSON.stringify(history, null, 2);
      triggerDownload(json, `chore-history-${getFormattedDate()}.json`, 'application/json');
      setHistoryBusy(false);
    }, 50);
  };

  const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  return (
    <div className="min-h-screen bg-[#121212] text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-2">
            <h1 className="text-4xl font-semibold">Settings</h1>
            <div className="flex items-center gap-2">
              <a
                href="#/stats"
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
              >
                Stats
              </a>
              <a
                href="#/"
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
              >
                &larr; Back
              </a>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            Backup, restore, and manage your chore data.
          </p>
        </div>

        <div className="space-y-6">
          {/* Edit Chores */}
          <div className="bg-[#181818] border border-green-500/20 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">Edit Chores</h2>
            <p className="text-sm text-slate-400 mb-4">
              Add, edit, or remove chore definitions. Changes sync to all devices automatically.
            </p>
            <a
              href="#/editor"
              className="inline-block rounded-full bg-green-500 text-slate-950 px-5 py-2.5 text-sm font-semibold hover:bg-green-400 transition"
            >
              Open Chore Editor
            </a>
          </div>

          {/* Backup & Restore */}
          <div className="bg-[#181818] border border-green-500/20 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">Backup &amp; Restore</h2>
            <p className="text-sm text-slate-400 mb-4">
              Download a full backup of this browser's data, or restore from a previous backup file.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleLocalBackup}
                className="rounded-full bg-green-500 text-slate-950 px-5 py-2.5 text-sm font-semibold hover:bg-green-400 transition"
              >
                Download Backup
              </button>
              <button
                type="button"
                onClick={() => localFileInputRef.current?.click()}
                disabled={localBusy}
                className="rounded-full border border-slate-700 bg-[#232323] px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Restore from File
              </button>
            </div>
          </div>

          {/* Export History */}
          <div className="bg-[#181818] border border-green-500/20 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">Export History</h2>
            <p className="text-sm text-slate-400 mb-4">
              Download the chore completion history as a filtered CSV or multi-sheet XLSX spreadsheet.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setExportDialogOpen(true)}
                disabled={historyBusy}
                className="rounded-full bg-green-500 text-slate-950 px-5 py-2.5 text-sm font-semibold hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {historyBusy ? 'Exporting…' : 'Export History…'}
              </button>
              <button
                type="button"
                onClick={handleExportHistoryJson}
                disabled={historyBusy}
                className="rounded-full border border-slate-700 bg-[#232323] px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {historyBusy ? 'Exporting…' : 'Export as JSON'}
              </button>
            </div>
          </div>

          {/* Cloud Sync */}
          <div className="bg-[#181818] border border-green-500/20 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">Cloud Sync</h2>
            {supabaseConfigured ? (
              <>
                <p className="text-sm text-slate-400 mb-4">
                  Changes are automatically pushed to the cloud when you leave the app.
                  You can also upload a JSON file to overwrite the cloud snapshot directly.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded-full border border-slate-700 bg-[#232323] px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {uploading ? 'Uploading...' : 'Upload JSON to Cloud'}
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Not configured. Set <code className="text-slate-400">VITE_SUPABASE_URL</code> and <code className="text-slate-400">VITE_SUPABASE_ANON_KEY</code> to enable.
              </p>
            )}

            {status && (
              <div className={`mt-4 rounded-xl p-4 text-sm font-medium ${
                status.startsWith('\u2705') ? 'bg-green-900/40 text-green-200' :
                status.startsWith('\u274C') ? 'bg-red-900/40 text-red-200' :
                'bg-sky-900/40 text-sky-200'
              }`}>
                {status}
              </div>
            )}
          </div>

          {/* Status messages for local operations */}
          {localStatus && (
            <div className={`rounded-xl p-4 text-sm font-medium ${
              localStatus.startsWith('\u2705') ? 'bg-green-900/40 text-green-200' :
              localStatus.startsWith('\u274C') ? 'bg-red-900/40 text-red-200' :
              'bg-sky-900/40 text-sky-200'
            }`}>
              {localStatus}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleFileUpload}
          className="hidden"
        />
        <input
          ref={localFileInputRef}
          type="file"
          accept="application/json"
          onChange={handleLocalRestoreFromFile}
          className="hidden"
        />
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExportCsv={handleExportCsv}
        onExportXlsx={handleExportXlsx}
        household={HOUSEHOLD}
      />
    </div>
  );
}
