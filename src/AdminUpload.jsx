import { useState, useRef } from 'react';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_TABLE = (import.meta.env.VITE_SUPABASE_TABLE || 'chore_snapshots').trim();
const SUPABASE_REMOTE_ID = (import.meta.env.VITE_CHORE_REMOTE_ID || 'current').trim();

const normalizeSupabaseUrl = (value) => value ? value.replace(/\/+$/, '') : '';

const uploadSnapshotToSupabase = async (payload) => {
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
  const fileInputRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus('Reading file...');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Validate that the JSON has the expected shape
      if (!parsed.chores || !Array.isArray(parsed.chores)) {
        throw new Error('Invalid format: expected a "chores" array');
      }

      // Build the snapshot payload
      const snapshot = {
        chores: parsed.chores,
        progress: parsed.progress || {},
        postponedOverrides: parsed.postponedOverrides || [],
      };

      setStatus('Uploading to Supabase...');
      await uploadSnapshotToSupabase(snapshot);

      setStatus('✅ Upload successful! Refresh the app to see changes.');
    } catch (error) {
      console.error('Upload failed:', error);
      setStatus(`❌ Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-10">
        <h1 className="text-5xl font-semibold text-slate-900 mb-4">
          Admin: Upload Chores
        </h1>
        <p className="text-xl text-slate-600 mb-8">
          Upload a JSON file from your local app to update the chore definitions in Supabase.
        </p>

        <div className="space-y-6">
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center hover:border-slate-400 transition">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-full bg-slate-900 text-white px-8 py-4 text-xl font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {uploading ? 'Uploading...' : 'Select JSON File'}
            </button>
            <p className="mt-4 text-sm text-slate-500">
              Expected format: <code className="bg-slate-100 px-2 py-1 rounded">{'{ "chores": [...], "progress": {...}, "postponedOverrides": [...] }'}</code>
            </p>
          </div>

          {status && (
            <div className={`rounded-2xl p-6 text-lg font-medium ${
              status.startsWith('✅') ? 'bg-green-100 text-green-800' :
              status.startsWith('❌') ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {status}
            </div>
          )}

          <div className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-600 space-y-2">
            <p className="font-semibold text-slate-900">How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Upload a JSON file with your chore definitions</li>
              <li>The file is validated and sent to Supabase</li>
              <li>All users will see the updated chores on their next page load</li>
              <li>Use this instead of manually editing SQL</li>
            </ul>
          </div>

          <div className="pt-6 border-t border-slate-200">
            <a
              href="/"
              className="inline-block rounded-full border-2 border-slate-300 px-8 py-3 text-lg font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              ← Back to Chore Dashboard
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
      </div>
    </div>
  );
}
