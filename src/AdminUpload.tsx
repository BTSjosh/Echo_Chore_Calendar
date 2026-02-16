import { useState, useRef } from 'react';
import {
  STORAGE_KEY,
  POSTPONE_KEY,
  CHORE_DEFS_KEY,
  HISTORY_KEY,
  parseStoredProgress,
  saveToLocalStorage,
  loadFromLocalStorage,
  savePostpones,
  loadPostpones,
  saveChoreDefinitions,
} from './utils/storage';
import { getFormattedDate } from './utils/dates';
import { HOUSEHOLD } from './utils/chores';
import { normalizeSupabaseUrl } from './utils/sync';
import { loadHistory, exportHistoryAsCsv, saveHistory, mergeHistory } from './utils/history';
import type { Chore, ProgressRecord, PostponeEntry, HistoryEvent } from './types';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_TABLE = (import.meta.env.VITE_SUPABASE_TABLE || 'chore_snapshots').trim();
const SUPABASE_REMOTE_ID = (import.meta.env.VITE_CHORE_REMOTE_ID || 'current').trim();

const uploadSnapshotToSupabase = async (payload: Record<string, unknown>): Promise<Response> => {
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

export default function AdminUpload() {
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [localStatus, setLocalStatus] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
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
      await uploadSnapshotToSupabase(snapshot);

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
    const progress = loadFromLocalStorage() ?? {};
    const postponedOverrides = loadPostpones();
    const history = loadHistory();
    const payload = JSON.stringify(
      {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        household: HOUSEHOLD,
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

  const triggerDownload = (content: string, filename: string, mimeType: string) => {
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

  const handleExportHistoryCsv = () => {
    const history = loadHistory();
    if (history.length === 0) {
      setLocalStatus('No history events to export.');
      return;
    }
    const csv = exportHistoryAsCsv(history);
    triggerDownload(csv, `chore-history-${getFormattedDate()}.csv`, 'text/csv');
  };

  const handleExportHistoryJson = () => {
    const history = loadHistory();
    if (history.length === 0) {
      setLocalStatus('No history events to export.');
      return;
    }
    const json = JSON.stringify(history, null, 2);
    triggerDownload(json, `chore-history-${getFormattedDate()}.json`, 'application/json');
  };

  const handleClearLocalData = () => {
    if (window.confirm('\u26A0\uFE0F This will delete local progress, history, and postpones for this browser.')) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(POSTPONE_KEY);
        localStorage.removeItem(CHORE_DEFS_KEY);
        localStorage.removeItem(HISTORY_KEY);
        setLocalStatus('\u2705 Local data cleared. Refresh the app to reload seed chores.');
      } catch (error) {
        console.error('Failed to clear local data:', error);
        setLocalStatus('\u274C Failed to clear local data.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-slate-100 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-[#181818] rounded-3xl shadow-xl shadow-black/30 p-10 border border-green-500/20">
        <h1 className="text-5xl font-semibold text-slate-100 mb-4">
          Admin: Upload Chores
        </h1>
        <p className="text-xl text-slate-400 mb-8">
          Upload a JSON file from your local app to update the chore definitions in Supabase.
        </p>

        <div className="space-y-6">
          <div className="border-2 border-dashed border-green-500/20 rounded-2xl p-10 text-center hover:border-green-400/60 transition">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-full bg-green-500 text-slate-950 px-8 py-4 text-xl font-semibold hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {uploading ? 'Uploading...' : 'Select JSON File'}
            </button>
            <p className="mt-4 text-sm text-slate-400">
              Expected format: <code className="bg-[#1a1a1a] px-2 py-1 rounded text-slate-200">{'{ "chores": [...], "progress": {...}, "postponedOverrides": [...] }'}</code>
            </p>
          </div>

          {status && (
            <div className={`rounded-2xl p-6 text-lg font-medium ${
              status.startsWith('\u2705') ? 'bg-green-900/40 text-green-200' :
              status.startsWith('\u274C') ? 'bg-red-900/40 text-red-200' :
              'bg-sky-900/40 text-sky-200'
            }`}>
              {status}
            </div>
          )}

          <div className="rounded-2xl border border-green-500/20 bg-[#1a1a1a] p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Local Data Tools
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-100">
                  Backup, restore, or clear this browser
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  These actions only affect the current device and browser.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleLocalBackup}
                  className="rounded-full border border-slate-700 bg-[#1a1a1a] px-5 py-2 text-sm font-semibold text-slate-200 shadow-sm hover:bg-slate-800"
                >
                  Backup to File
                </button>
                <button
                  type="button"
                  onClick={() => localFileInputRef.current?.click()}
                  disabled={localBusy}
                  className="rounded-full border border-slate-700 bg-[#1a1a1a] px-5 py-2 text-sm font-semibold text-slate-200 shadow-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Restore from File
                </button>
                <button
                  type="button"
                  onClick={handleExportHistoryCsv}
                  className="rounded-full border border-slate-700 bg-[#1a1a1a] px-5 py-2 text-sm font-semibold text-slate-200 shadow-sm hover:bg-slate-800"
                >
                  Export History (CSV)
                </button>
                <button
                  type="button"
                  onClick={handleExportHistoryJson}
                  className="rounded-full border border-slate-700 bg-[#1a1a1a] px-5 py-2 text-sm font-semibold text-slate-200 shadow-sm hover:bg-slate-800"
                >
                  Export History (JSON)
                </button>
                <button
                  type="button"
                  onClick={handleClearLocalData}
                  className="rounded-full border border-red-400/60 bg-[#1a1a1a] px-5 py-2 text-sm font-semibold text-red-300 shadow-sm hover:bg-red-950/40"
                >
                  Clear Local Data
                </button>
              </div>
            </div>

            {localStatus && (
              <div className={`mt-6 rounded-2xl p-5 text-sm font-medium ${
                localStatus.startsWith('\u2705') ? 'bg-green-900/40 text-green-200' :
                localStatus.startsWith('\u274C') ? 'bg-red-900/40 text-red-200' :
                'bg-sky-900/40 text-sky-200'
              }`}>
                {localStatus}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#1a1a1a] border border-green-500/10 p-6 text-sm text-slate-300 space-y-2">
            <p className="font-semibold text-slate-100">How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Upload a JSON file with your chore definitions</li>
              <li>The file is validated and sent to Supabase</li>
              <li>All users will see the updated chores on their next page load</li>
              <li>Use this instead of manually editing SQL</li>
            </ul>
          </div>

          <div className="pt-6 border-t border-green-500/10 flex flex-wrap gap-4">
            <a
              href="/"
              className="inline-block rounded-full border-2 border-green-500/20 px-8 py-3 text-lg font-semibold text-slate-300 hover:bg-[#1a1a1a] hover:border-green-400/40 transition"
            >
              &larr; Back to Chore Dashboard
            </a>
            <a
              href="/#/stats"
              className="inline-block rounded-full border-2 border-green-500/20 px-8 py-3 text-lg font-semibold text-slate-300 hover:bg-[#1a1a1a] hover:border-green-400/40 transition"
            >
              View Stats
            </a>
          </div>
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
    </div>
  );
}
