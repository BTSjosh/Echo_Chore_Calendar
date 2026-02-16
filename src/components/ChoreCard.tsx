import {
  getAssignedMembers,
  getCompletedBy,
  getNextDueDate,
  isChoreComplete,
} from '../utils/chores';
import type { Chore, TabName } from '../types';

interface ChoreCardProps {
  chore: Chore;
  currentDate: Date;
  expandedChore: string | null;
  activeTab: TabName;
  remainingWeekDates: Date[];
  originalDueDate?: string;
  onToggleDescription: (subject: string) => void;
  onToggleCompleted: (subject: string) => void;
  onOpenPostponeSelector: (subject: string) => void;
  onOpenAssigneePicker: (subject: string) => void;
}

export default function ChoreCard({
  chore,
  currentDate,
  expandedChore,
  activeTab,
  remainingWeekDates,
  originalDueDate,
  onToggleDescription,
  onToggleCompleted,
  onOpenPostponeSelector,
  onOpenAssigneePicker,
}: ChoreCardProps) {
  const assignedList = getAssignedMembers(chore, currentDate);
  const completedBy = getCompletedBy(chore, assignedList);
  const complete = isChoreComplete(chore, assignedList, currentDate);

  return (
    <article
      onClick={() => onToggleDescription(chore.subject)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleDescription(chore.subject);
        }
      }}
      className={
        "rounded-3xl bg-[#353E43] p-4 shadow-xl shadow-black/30 border border-green-500/20 transition hover:shadow-2xl hover:shadow-black/40 hover:border-green-400/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400 " +
        (complete ? "opacity-70" : "")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-[220px] flex-1">
          <h2 className="text-2xl lg:text-3xl font-semibold text-slate-100 scale-x-125 origin-left">
            {chore.subject}
          </h2>
          {expandedChore === chore.subject && (
            <p className="mt-2 text-base text-slate-200">
              {chore.description}
            </p>
          )}
          <p className="mt-2 text-lg font-bold text-slate-100 scale-x-110 origin-left">
            Assigned:{" "}
            {assignedList.map((member, index) => (
              <span
                key={member}
                className={
                  completedBy.includes(member)
                    ? "line-through text-slate-500 scale-x-110 origin-left"
                    : "text-slate-100 scale-x-110 origin-left"
                }
              >
                {member}
                {index < assignedList.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
          <p className={"mt-2 text-[0.7rem] uppercase tracking-[0.2em] scale-x-125 origin-left " + (originalDueDate ? "text-red-400 font-semibold" : "text-slate-200")}>
            {originalDueDate
              ? `Originally due ${new Date(originalDueDate + 'T00:00:00').toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`
              : getNextDueDate(chore, currentDate).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 self-center">
          {activeTab === "Today" && remainingWeekDates.length > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenPostponeSelector(chore.subject);
              }}
              className="rounded-full border border-green-500/40 bg-[#353E43] px-8 py-5 text-lg font-semibold text-[#a7f3d0] hover:bg-[#4a555c] hover:border-green-400 min-w-[11rem] text-center transition-all duration-150"
              style={{ marginRight: '0.5rem' }}
            >
              Postpone
            </button>
          )}
          {assignedList.length > 1 ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenAssigneePicker(chore.subject);
              }}
              className="rounded-full border border-green-500/40 bg-[#353E43] px-8 py-5 text-lg font-semibold text-[#a7f3d0] hover:bg-[#4a555c] hover:border-green-400 min-w-[11rem] text-center transition-all duration-150"
            >
              Mark Done
            </button>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCompleted(chore.subject);
              }}
              className={
                "rounded-full border px-8 py-5 text-base font-semibold transition min-w-[11rem] text-center " +
                (chore.completed
                  ? "border-green-400 bg-green-500/20 text-[#a7f3d0]"
                  : "border-green-500/40 bg-[#353E43] text-[#a7f3d0] hover:bg-[#4a555c] hover:border-green-400 transition-all duration-150")
              }
            >
              {chore.completed ? "\u2713 Done" : "Mark Done"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
