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
import { loadHistory, exportHistoryAsCsv, saveHistory, mergeHistory } from './utils/history';
import type { Chore, PostponeEntry, HistoryEvent } from './types';

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

export default function AdminUpload() {
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [localStatus, setLocalStatus] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
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
    setHistoryBusy(true);
    setTimeout(() => {
      const csv = exportHistoryAsCsv(history);
      triggerDownload(csv, `chore-history-${getFormattedDate()}.csv`, 'text/csv');
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
                href="/#/editor"
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
              >
                Edit Chores
              </a>
              <a
                href="/#/stats"
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
              >
                Stats
              </a>
              <a
                href="/#/"
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
              Download the chore completion history log for analysis.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportHistoryCsv}
                disabled={historyBusy}
                className="rounded-full border border-slate-700 bg-[#232323] px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {historyBusy ? 'Exporting…' : 'Export as CSV'}
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
    </div>
  );
}
