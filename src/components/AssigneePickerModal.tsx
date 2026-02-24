import { getAssignedMembers, getCompletedBy } from '../utils/chores';
import type { Chore } from '../types';

interface AssigneePickerModalProps {
  chores: Chore[];
  assigneePicker: string;
  currentDate: Date;
  onToggleMemberCompleted: (subject: string, member: string) => void;
  onClose: () => void;
}

export default function AssigneePickerModal({
  chores,
  assigneePicker,
  currentDate,
  onToggleMemberCompleted,
  onClose,
}: AssigneePickerModalProps) {
  const chore = chores.find((item) => item.subject === assigneePicker);
  if (!chore) return null;

  const assignedList = getAssignedMembers(chore, currentDate);
  const completedBy = getCompletedBy(chore, assignedList);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-md rounded-3xl bg-[#353E43] p-6 sm:p-10 shadow-xl shadow-black/30 border border-green-500/20">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-200">
              Done by
            </p>
            <h3 className="mt-3 text-xl sm:text-3xl font-semibold text-slate-100">
              Select completed names
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-4">
          {assignedList.map((member) => (
            <button
              key={member}
              type="button"
              onClick={() => onToggleMemberCompleted(chore.subject, member)}
              className={
                "w-full rounded-2xl border px-6 py-4 text-left text-lg font-semibold transition " +
                (completedBy.includes(member)
                  ? "border-green-400 bg-green-500 text-slate-950"
                  : "border-slate-700 text-slate-200 hover:bg-slate-800")
              }
            >
              {member}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
