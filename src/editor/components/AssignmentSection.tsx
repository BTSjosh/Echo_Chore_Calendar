import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { HOUSEHOLD } from '../../utils/chores';
import type { EditorFormState } from '../utils/editorMappers';
import SortableRotationItem from './SortableRotationItem';

interface Props {
  formValues: EditorFormState;
  onFieldChange: (patch: Partial<EditorFormState>) => void;
  onToggleMember: (member: string) => void;
  onAddToRotation: (member: string) => void;
  onRemoveFromRotation: (member: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

const ASSIGNMENT_TYPES = [
  { value: 'everyone' as const, label: 'Everyone' },
  { value: 'fixed' as const, label: 'Specific People' },
  { value: 'rotating' as const, label: 'Rotating' },
];

const CYCLE_TYPES = [
  { value: 'daily' as const, label: 'Daily' },
  { value: 'weekly' as const, label: 'Weekly' },
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'every-x-days' as const, label: 'Every X Days' },
];

export default function AssignmentSection({
  formValues,
  onFieldChange,
  onToggleMember,
  onAddToRotation,
  onRemoveFromRotation,
  onDragEnd,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const availableForRotation = HOUSEHOLD.filter(
    (m) => !formValues.rotationMembers.includes(m)
  );

  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold text-slate-300">Assignment</label>

      <div className="flex flex-wrap gap-2">
        {ASSIGNMENT_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onFieldChange({ assignmentType: t.value })}
            className={
              'rounded-full px-5 py-2 text-sm font-semibold transition ' +
              (formValues.assignmentType === t.value
                ? 'bg-green-500 text-slate-950'
                : 'bg-[#353E43] text-slate-200 hover:bg-slate-700')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {formValues.assignmentType === 'fixed' && (
        <div className="flex flex-wrap gap-2">
          {HOUSEHOLD.map((member) => (
            <button
              key={member}
              type="button"
              onClick={() => onToggleMember(member)}
              className={
                'rounded-full px-5 py-2 text-sm font-semibold transition ' +
                (formValues.fixedMembers.includes(member)
                  ? 'bg-green-600 text-white'
                  : 'bg-[#2A3136] text-slate-300 hover:bg-slate-700')
              }
            >
              {member}
            </button>
          ))}
        </div>
      )}

      {formValues.assignmentType === 'rotating' && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Rotation Order (drag to reorder)
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={formValues.rotationMembers}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {formValues.rotationMembers.map((member, index) => (
                  <SortableRotationItem
                    key={member}
                    id={member}
                    index={index}
                    onRemove={onRemoveFromRotation}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {availableForRotation.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-xs text-slate-400 self-center">Add:</span>
              {availableForRotation.map((member) => (
                <button
                  key={member}
                  type="button"
                  onClick={() => onAddToRotation(member)}
                  className="rounded-full bg-[#2A3136] px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-700 transition"
                >
                  + {member}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-center pt-2">
            <label className="text-sm text-slate-300">Rotate:</label>
            <select
              value={formValues.rotationCycleType}
              onChange={(e) =>
                onFieldChange({ rotationCycleType: e.target.value as EditorFormState['rotationCycleType'] })
              }
              className="rounded-lg bg-[#2A3136] border border-slate-700 px-3 py-2 text-sm text-slate-100"
            >
              {CYCLE_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>

            {formValues.rotationCycleType === 'every-x-days' && (
              <input
                type="number"
                min={1}
                value={formValues.rotationEveryDays}
                onChange={(e) =>
                  onFieldChange({ rotationEveryDays: Math.max(1, Number(e.target.value)) })
                }
                className="w-20 rounded-lg bg-[#2A3136] border border-slate-700 px-3 py-2 text-sm text-slate-100"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
