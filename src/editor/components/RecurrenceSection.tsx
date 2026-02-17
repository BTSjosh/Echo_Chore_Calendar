import type { EditorFormState } from '../utils/editorMappers';
import type { Frequency } from '../../types';

interface Props {
  formValues: EditorFormState;
  onFieldChange: (patch: Partial<EditorFormState>) => void;
  onToggleDayOfWeek: (day: number) => void;
}

const FREQUENCIES: { value: Frequency; label: string; recurring: boolean }[] = [
  { value: 'daily', label: 'Daily', recurring: true },
  { value: 'weekly', label: 'Weekly', recurring: true },
  { value: 'monthly', label: 'Monthly', recurring: true },
  { value: 'once', label: 'One-time', recurring: false },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function RecurrenceSection({
  formValues,
  onFieldChange,
  onToggleDayOfWeek,
}: Props) {
  const handleFrequencyClick = (freq: Frequency, recurring: boolean) => {
    onFieldChange({ frequency: freq, isRecurring: recurring });
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold text-slate-300">Schedule</label>

      <div className="flex flex-wrap gap-2">
        {FREQUENCIES.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => handleFrequencyClick(f.value, f.recurring)}
            className={
              'rounded-full px-5 py-2 text-sm font-semibold transition ' +
              (formValues.frequency === f.value
                ? 'bg-green-500 text-slate-950'
                : 'bg-[#353E43] text-slate-200 hover:bg-slate-700')
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {formValues.isRecurring && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-300">Every</label>
            <input
              type="number"
              min={1}
              value={formValues.recurrenceInterval}
              onChange={(e) =>
                onFieldChange({ recurrenceInterval: Math.max(1, Number(e.target.value)) })
              }
              className="w-20 rounded-lg bg-[#2A3136] border border-slate-700 px-3 py-2 text-sm text-slate-100"
            />
            <span className="text-sm text-slate-400">
              {formValues.frequency === 'daily'
                ? 'day(s)'
                : formValues.frequency === 'weekly'
                  ? 'week(s)'
                  : 'month(s)'}
            </span>
          </div>

          {formValues.frequency === 'weekly' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Day of Week
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day, i) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onToggleDayOfWeek(i)}
                    className={
                      'rounded-full px-4 py-2 text-sm font-semibold transition ' +
                      (formValues.daysOfWeek.includes(i)
                        ? 'bg-green-600 text-white'
                        : 'bg-[#2A3136] text-slate-300 hover:bg-slate-700')
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formValues.frequency === 'monthly' && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-300">Day of month</label>
              <input
                type="number"
                min={1}
                max={31}
                value={formValues.dayOfMonth}
                onChange={(e) =>
                  onFieldChange({ dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value))) })
                }
                className="w-20 rounded-lg bg-[#2A3136] border border-slate-700 px-3 py-2 text-sm text-slate-100"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-300">Start date</label>
            <input
              type="date"
              value={formValues.startDate}
              onChange={(e) => onFieldChange({ startDate: e.target.value })}
              className="rounded-lg bg-[#2A3136] border border-slate-700 px-3 py-2 text-sm text-slate-100"
            />
          </div>
        </>
      )}

      {!formValues.isRecurring && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-300">Due date</label>
          <input
            type="date"
            value={formValues.dueDate}
            onChange={(e) => onFieldChange({ dueDate: e.target.value })}
            className="rounded-lg bg-[#2A3136] border border-slate-700 px-3 py-2 text-sm text-slate-100"
          />
        </div>
      )}
    </div>
  );
}
