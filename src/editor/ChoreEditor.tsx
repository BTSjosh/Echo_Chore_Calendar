import { useMemo } from 'react';
import useChoreEditorState from './hooks/useChoreEditorState';
import useChoreForm from './hooks/useChoreForm';
import ChoreEditorCard from './components/ChoreEditorCard';
import ChoreFormModal from './components/ChoreFormModal';
import type { Chore } from '../types';

const getYearlyFrequency = (chore: Chore): number => {
  const rec = chore.recurrence;
  if (!rec) return 0;
  const interval = rec.interval || 1;
  switch (rec.frequency) {
    case 'daily': return 365 / interval;
    case 'weekly': return 52 / interval;
    case 'monthly': return 12 / interval;
    case 'once': return 0;
    default: return 0;
  }
};

export default function ChoreEditor() {
  const { chores, addChore, updateChore, deleteChore } = useChoreEditorState();

  const sortedChores = useMemo(
    () => [...chores].sort((a, b) => getYearlyFrequency(b) - getYearlyFrequency(a)),
    [chores]
  );

  const form = useChoreForm({ addChore, updateChore });

  return (
    <div className="min-h-screen bg-[#121212] text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-2">
            <h1 className="text-4xl font-semibold">Chore Editor</h1>
            <div className="flex items-center gap-2">
              <a
                href="/#/stats"
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
              >
                Stats
              </a>
              <a
                href="/#/admin"
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
              >
                Settings
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
            Create, edit, and manage chore definitions. Changes are saved to local storage and synced automatically.
          </p>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="rounded-2xl bg-green-500/10 border border-green-500/30 px-4 py-2">
            <span className="text-sm font-semibold text-slate-200">
              {chores.length} chore{chores.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={form.openCreateForm}
            className="rounded-full bg-green-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-green-400 transition"
          >
            + Add Chore
          </button>
        </div>

        {/* Chore list */}
        {chores.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-lg">No chores defined yet.</p>
            <p className="text-sm mt-1">Click "Add Chore" to create your first one.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedChores.map((chore) => (
              <ChoreEditorCard
                key={chore.subject}
                chore={chore}
                onEdit={form.openEditForm}
                onDelete={deleteChore}
              />
            ))}
          </div>
        )}

        {/* Modal */}
        {form.isOpen && (
          <ChoreFormModal
            formValues={form.formValues}
            setFormValues={form.setFormValues}
            editingSubject={form.editingSubject}
            onSave={form.handleSave}
            onClose={form.closeForm}
            onToggleMember={form.toggleMember}
            onAddToRotation={form.addToRotation}
            onRemoveFromRotation={form.removeFromRotation}
            onDragEnd={form.handleDragEnd}
            onToggleDayOfWeek={form.toggleDayOfWeek}
          />
        )}
      </div>
    </div>
  );
}
