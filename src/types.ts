export type Frequency = "daily" | "weekly" | "monthly" | "once";

export type CycleType = "daily" | "weekly" | "monthly" | "every-x-days";

export interface Recurrence {
  frequency: Frequency;
  interval: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

export interface Rotation {
  group: string;
  cycleLength: number;
  members: string[];
  cycleType: CycleType;
  everyDays: number;
}

export interface ChoreDefinition {
  subject: string;
  description: string;
  notes: string;
  assigned: string[];
  assignmentType: "fixed" | "rotating";
  recurrence: Recurrence;
  startDate: string | Date;
  rotation?: Rotation;
  id?: string;
  dueDate?: string | Date;
  nextDueDate?: string | Date;
  nextDue?: string | Date;
  rotationStartDate?: string | Date;
}

export interface ChoreProgress {
  completed: boolean;
  completedBy: string[];
  lastCompleted?: string;
  lastCompletedDate?: string;
  completedToday?: boolean;
  completedThrough?: string;
  nextDue?: string;
  nextDueDate?: string;
  rotationIndex?: number;
  rotationPosition?: number;
  rotationCursor?: number;
  rotationIndexPrev?: number;
  rotationState?: string;
}

export type Chore = ChoreDefinition & ChoreProgress;

export type DisplayChore = Chore & {
  _instanceType?: 'overdue' | 'normal';
  _originalDueDate?: string;
  _overdueAssignees?: string[];
};

export type ProgressFieldKey = keyof ChoreProgress;

export type ProgressRecord = Record<string, ChoreProgress>;

export interface PostponeEntry {
  subject: string;
  fromDate: string;
  toDate: string;
}

/** Loose shape for imported chores — may have aliases and extra fields */
export interface RawImportedChore {
  subject?: string;
  description?: string;
  notes?: string;
  note?: string;
  assigned?: string[];
  assignees?: string[];
  completed?: boolean;
  completedBy?: string[];
  assignmentType?: string;
  recurrence?: string | { frequency?: string; recurrence?: string; interval?: number; dayOfWeek?: number; dayOfMonth?: number };
  recurrenceInterval?: number;
  schedule?: { recurrence?: string; frequency?: string; frequencyDays?: number };
  startDate?: string | Date;
  dueDate?: string | Date;
  nextDueDate?: string | Date;
  nextDue?: string | Date;
  daysOfWeek?: string[];
  frequencyDays?: number;
  assignment?: {
    type?: string;
    assignees?: string[];
    order?: string[];
  };
  rotation?: {
    group?: string;
    cycleLength?: number;
    members?: string[];
    cycleType?: CycleType;
    everyDays?: number;
  };
  rotationGroup?: string;
  rotationMembers?: string[];
  rotationCycleType?: string;
  rotationEveryDays?: number;
  rotationInterval?: number;
  cycleLength?: number;
  rotationStartDate?: string | Date;
  rotationIndex?: number;
  rotationPosition?: number;
  rotationCursor?: number;
  rotationIndexPrev?: number;
  [key: string]: unknown;
}

export interface RemoteSnapshot {
  payload: RemotePayload | null;
  updated_at: string | null;
}

export interface RemotePayload {
  chores?: RawImportedChore[];
  progress?: ProgressRecord | ChoreProgress[];
  postponedOverrides?: PostponeEntry[];
  history?: HistoryEvent[];
  [key: string]: unknown;
}

export interface HistoryEvent {
  id: string;              // crypto.randomUUID()
  timestamp: string;       // ISO 8601
  action: "completed" | "uncompleted" | "postponed" | "auto_postponed" | "completed_late" | "abandoned";
  choreSubject: string;
  members: string[];       // who completed it (or empty for postpone)
  dueDate?: string;        // YYYY-MM-DD — the date the chore was due
  postponedTo?: string;    // YYYY-MM-DD — only for postpone actions
}

export type TabName = "Yesterday" | "Today" | "This Week" | "This Month";
