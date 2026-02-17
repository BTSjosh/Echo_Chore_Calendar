import { HOUSEHOLD } from '../../utils/chores';
import type { Chore } from '../../types';

interface Props {
  chore: Chore;
  onEdit: (chore: Chore) => void;
  onDelete: (subject: string) => void;
}

const isEveryone = (members: string[]): boolean => {
  if (members.length !== HOUSEHOLD.length) return false;
  return HOUSEHOLD.every((m) => members.includes(m));
};

const getAssignmentSummary = (chore: Chore): string => {
  if (chore.assignmentType === 'rotating') {
    const members = chore.rotation?.members ?? [];
    return `Rotating: ${members.join(' \u2192 ')}`;
  }
  const assigned = Array.isArray(chore.assigned) ? chore.assigned : [];
  if (isEveryone(assigned)) return 'Everyone';
  return assigned.join(', ') || 'Unassigned';
};

const getScheduleSummary = (chore: Chore): string => {
  const rec = chore.recurrence;
  if (!rec) return '';
  const { frequency, interval } = rec;

  if (frequency === 'once') return 'One-time';

  if (frequency === 'daily') {
    return interval > 1 ? `Every ${interval} days` : 'Daily';
  }

  if (frequency === 'weekly') {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = rec.dayOfWeek !== undefined ? dayNames[rec.dayOfWeek] : '';
    const base = interval > 1 ? `Every ${interval} weeks` : 'Weekly';
    return day ? `${base} on ${day}` : base;
  }

  if (frequency === 'monthly') {
    const day = rec.dayOfMonth ?? 1;
    const base = interval > 1 ? `Every ${interval} months` : 'Monthly';
    return `${base} on the ${day}${ordinalSuffix(day)}`;
  }

  return '';
};

const ordinalSuffix = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

export default function ChoreEditorCard({ chore, onEdit, onDelete }: Props) {
  return (
    <div
      onClick={() => onEdit(chore)}
      className="rounded-2xl bg-[#353E43] border border-slate-700 p-5 flex flex-col gap-3 cursor-pointer hover:bg-[#3D474C] hover:border-slate-600 transition relative"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`Delete "${chore.subject}"? This cannot be undone.`)) {
            onDelete(chore.subject);
          }
        }}
        className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-red-400 transition"
        title="Delete chore"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
        </svg>
      </button>

      <div className="pr-8">
        <h3 className="text-lg font-semibold text-slate-100 truncate">{chore.subject}</h3>
        {chore.description && (
          <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{chore.description}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
        <span>{getAssignmentSummary(chore)}</span>
        <span className="text-slate-500">|</span>
        <span>{getScheduleSummary(chore)}</span>
      </div>
    </div>
  );
}
