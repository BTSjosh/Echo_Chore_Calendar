import { HOUSEHOLD, BASE_START_DATE } from '../../utils/chores';
import { getFormattedDate } from '../../utils/dates';
import type { Chore, ChoreDefinition, Frequency, CycleType, Recurrence, Rotation } from '../../types';

export interface EditorFormState {
  subject: string;
  description: string;
  assignmentType: 'everyone' | 'fixed' | 'rotating';
  fixedMembers: string[];
  rotationMembers: string[];
  rotationCycleType: CycleType;
  rotationEveryDays: number;
  isRecurring: boolean;
  frequency: Frequency;
  recurrenceInterval: number;
  daysOfWeek: number[];
  dayOfMonth: number;
  startDate: string;
  dueDate: string;
}

const isEveryone = (members: string[]): boolean => {
  if (members.length !== HOUSEHOLD.length) return false;
  return HOUSEHOLD.every((m) => members.includes(m));
};

export const choreToFormState = (chore: Chore): EditorFormState => {
  const rec = chore.recurrence || ({} as Recurrence);
  const isFixed = chore.assignmentType !== 'rotating';
  const assigned = Array.isArray(chore.assigned) ? chore.assigned : [];

  let assignmentType: EditorFormState['assignmentType'] = 'fixed';
  if (!isFixed) {
    assignmentType = 'rotating';
  } else if (isEveryone(assigned)) {
    assignmentType = 'everyone';
  }

  const rotationMembers = chore.rotation?.members ?? HOUSEHOLD.slice(0, 3);

  return {
    subject: chore.subject,
    description: chore.description || '',
    assignmentType,
    fixedMembers: isFixed ? assigned : [],
    rotationMembers,
    rotationCycleType: chore.rotation?.cycleType ?? 'weekly',
    rotationEveryDays: chore.rotation?.everyDays ?? 1,
    isRecurring: rec.frequency !== 'once',
    frequency: rec.frequency || 'daily',
    recurrenceInterval: rec.interval || 1,
    daysOfWeek: rec.dayOfWeek !== undefined ? [rec.dayOfWeek] : [],
    dayOfMonth: rec.dayOfMonth ?? 1,
    startDate: chore.startDate
      ? getFormattedDate(new Date(chore.startDate as string))
      : BASE_START_DATE,
    dueDate: chore.dueDate
      ? getFormattedDate(new Date(chore.dueDate as string))
      : '',
  };
};

export const formStateToChoreDefinition = (
  form: EditorFormState,
  existingId?: string
): ChoreDefinition => {
  const isRotating = form.assignmentType === 'rotating';
  const assigned =
    form.assignmentType === 'everyone'
      ? [...HOUSEHOLD]
      : isRotating
        ? form.rotationMembers.slice(0, 1)
        : form.fixedMembers;

  const recurrence: Recurrence = form.isRecurring
    ? buildRecurrence(form)
    : { frequency: 'once', interval: 1 };

  const def: ChoreDefinition = {
    subject: form.subject.trim(),
    description: form.description.trim(),
    notes: '',
    assigned,
    assignmentType: isRotating ? 'rotating' : 'fixed',
    recurrence,
    startDate: form.startDate || BASE_START_DATE,
  };

  if (existingId) {
    def.id = existingId;
  }

  if (!form.isRecurring && form.dueDate) {
    def.dueDate = form.dueDate;
  }

  if (isRotating) {
    const rotation: Rotation = {
      group: 'A',
      cycleLength: 1,
      members: form.rotationMembers,
      cycleType: form.rotationCycleType,
      everyDays: form.rotationEveryDays,
    };
    def.rotation = rotation;
  }

  return def;
};

const buildRecurrence = (form: EditorFormState): Recurrence => {
  const base: Recurrence = {
    frequency: form.frequency,
    interval: form.recurrenceInterval,
  };

  if (form.frequency === 'weekly' && form.daysOfWeek.length > 0) {
    base.dayOfWeek = form.daysOfWeek[0];
  }

  if (form.frequency === 'monthly') {
    base.dayOfMonth = form.dayOfMonth;
  }

  return base;
};

export const getDefaultFormState = (): EditorFormState => ({
  subject: '',
  description: '',
  assignmentType: 'everyone',
  fixedMembers: [],
  rotationMembers: HOUSEHOLD.slice(0, 3),
  rotationCycleType: 'weekly',
  rotationEveryDays: 1,
  isRecurring: true,
  frequency: 'daily',
  recurrenceInterval: 1,
  daysOfWeek: [],
  dayOfMonth: 1,
  startDate: getFormattedDate(new Date()),
  dueDate: '',
});
