import { useState } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { EditorFormState } from '../utils/editorMappers';
import AssignmentSection from './AssignmentSection';
import RecurrenceSection from './RecurrenceSection';

interface Props {
  formValues: EditorFormState;
  setFormValues: React.Dispatch<React.SetStateAction<EditorFormState>>;
  editingSubject: string | null;
  onSave: () => string | null;
  onClose: () => void;
  onToggleMember: (member: string) => void;
  onAddToRotation: (member: string) => void;
  onRemoveFromRotation: (member: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onToggleDayOfWeek: (day: number) => void;
}

export default function ChoreFormModal({
  formValues,
  setFormValues,
  editingSubject,
  onSave,
  onClose,
  onToggleMember,
  onAddToRotation,
  onRemoveFromRotation,
  onDragEnd,
  onToggleDayOfWeek,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  const handleFieldChange = (patch: Partial<EditorFormState>) => {
    setFormValues((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = () => {
    const err = onSave();
    if (err) {
      setError(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#1A1A1A] border border-slate-700 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[#1A1A1A] border-b border-slate-700 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-100">
            {editingSubject ? 'Edit Chore' : 'New Chore'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {error && (
            <div className="rounded-xl bg-red-900/40 border border-red-500/30 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-300">Subject</label>
            <input
              type="text"
              value={formValues.subject}
              onChange={(e) => handleFieldChange({ subject: e.target.value })}
              placeholder="e.g. Take out trash"
              className="w-full rounded-lg bg-[#2A3136] border border-slate-700 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-300">Description</label>
            <textarea
              value={formValues.description}
              onChange={(e) => handleFieldChange({ description: e.target.value })}
              placeholder="Optional details..."
              rows={2}
              className="w-full rounded-lg bg-[#2A3136] border border-slate-700 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-500 resize-none"
            />
          </div>

          <AssignmentSection
            formValues={formValues}
            onFieldChange={handleFieldChange}
            onToggleMember={onToggleMember}
            onAddToRotation={onAddToRotation}
            onRemoveFromRotation={onRemoveFromRotation}
            onDragEnd={onDragEnd}
          />

          <RecurrenceSection
            formValues={formValues}
            onFieldChange={handleFieldChange}
            onToggleDayOfWeek={onToggleDayOfWeek}
          />
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-700 bg-[#1A1A1A] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 bg-[#232323] px-6 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-green-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-green-400 transition"
          >
            {editingSubject ? 'Save Changes' : 'Create Chore'}
          </button>
        </div>
      </div>
    </div>
  );
}
