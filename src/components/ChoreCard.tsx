import { useState } from 'react';
import {
  getAssignedMembers,
  getCompletedBy,
  getNextDueDate,
  isChoreComplete,
} from '../utils/chores';
import type { DisplayChore, TabName } from '../types';

interface ChoreCardProps {
  chore: DisplayChore;
  currentDate: Date;
  expandedChore: string | null;
  activeTab: TabName;
  originalDueDate?: string;
  overdueAssignees?: string[];
  instanceType?: 'overdue' | 'normal';
  onToggleDescription: (subject: string) => void;
  onToggleCompleted: (subject: string) => void;
  onCompleteLateOverdue: (subject: string, fromDate: string) => void;
  onAbandonOverdue: (subject: string, fromDate: string) => void;
  onOpenPostponeSelector: (subject: string, fromDate?: string) => void;
  onOpenAssigneePicker: (subject: string) => void;
}

export default function ChoreCard({
  chore,
  currentDate,
  expandedChore,
  activeTab,
  originalDueDate,
  overdueAssignees,
  instanceType,
  onToggleDescription,
  onToggleCompleted,
  onCompleteLateOverdue,
  onAbandonOverdue,
  onOpenPostponeSelector,
  onOpenAssigneePicker,
}: ChoreCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const isOverdue = instanceType === 'overdue';
  const assignedList = isOverdue && overdueAssignees ? overdueAssignees : getAssignedMembers(chore, currentDate);
  const completedBy = getCompletedBy(chore, assignedList);
  const complete = isChoreComplete(chore, assignedList, currentDate);

  return (
    <article
      className={
        "rounded-3xl bg-[#353E43] p-4 shadow-xl shadow-black/30 border transition hover:shadow-2xl hover:shadow-black/40 " +
        (isOverdue
          ? "border-red-500/40 hover:border-red-400/60 "
          : "border-green-500/20 hover:border-green-400/40 ") +
        (complete ? "opacity-70" : "")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        {/* Clickable text area — only this triggers expand/collapse */}
        <div
          className="min-w-[220px] cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={() => onToggleDescription(chore.subject)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleDescription(chore.subject);
            }
          }}
        >
          <h2 className="text-2xl lg:text-3xl font-semibold text-slate-100 scale-x-125 origin-left">
            {chore.subject}
            {isOverdue && (
              <span className="ml-3 text-sm font-bold uppercase tracking-wider text-red-400">OVERDUE</span>
            )}
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

        {/* Buttons area — no parent click handler, so taps always hit the button */}
        <div className="flex flex-wrap items-center gap-6 self-center">
          {isOverdue ? (
            showConfirm ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-base font-semibold text-amber-300 text-center">Are you sure you did this?<br />Don't lie!</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (originalDueDate) onCompleteLateOverdue(chore.subject, originalDueDate);
                    }}
                    className="rounded-full border border-green-500/40 bg-[#353E43] px-6 py-4 text-base font-semibold text-[#a7f3d0] hover:bg-[#4a555c] hover:border-green-400 active:scale-95 min-w-[8rem] text-center transition-all duration-150"
                  >
                    Yes, Done
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    className="rounded-full border border-slate-600 bg-[#353E43] px-6 py-4 text-base font-semibold text-slate-300 hover:bg-[#4a555c] hover:border-slate-500 active:scale-95 min-w-[8rem] text-center transition-all duration-150"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : showAbandonConfirm ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-base font-semibold text-red-300 text-center">Skip this chore?<br />Rotation will move on.</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (originalDueDate) onAbandonOverdue(chore.subject, originalDueDate);
                    }}
                    className="rounded-full border border-red-500/40 bg-[#353E43] px-6 py-4 text-base font-semibold text-red-300 hover:bg-[#4a555c] hover:border-red-400 active:scale-95 min-w-[8rem] text-center transition-all duration-150"
                  >
                    Yes, Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAbandonConfirm(false)}
                    className="rounded-full border border-slate-600 bg-[#353E43] px-6 py-4 text-base font-semibold text-slate-300 hover:bg-[#4a555c] hover:border-slate-500 active:scale-95 min-w-[8rem] text-center transition-all duration-150"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  className="rounded-full border border-green-500/40 bg-[#353E43] px-8 py-5 text-lg font-semibold text-[#a7f3d0] hover:bg-[#4a555c] hover:border-green-400 active:scale-95 min-w-[11rem] text-center transition-all duration-150"
                >
                  Mark Done
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPostponeSelector(chore.subject, originalDueDate)}
                  className="rounded-full border border-green-500/40 bg-[#353E43] px-8 py-5 text-lg font-semibold text-[#a7f3d0] hover:bg-[#4a555c] hover:border-green-400 active:scale-95 min-w-[11rem] text-center transition-all duration-150"
                >
                  Postpone
                </button>
                <button
                  type="button"
                  onClick={() => setShowAbandonConfirm(true)}
                  className="rounded-full border border-red-500/40 bg-[#353E43] px-8 py-5 text-lg font-semibold text-red-300 hover:bg-[#4a555c] hover:border-red-400 active:scale-95 min-w-[11rem] text-center transition-all duration-150"
                >
                  Abandon
                </button>
              </div>
            )
          ) : (
            <>
              {activeTab === "Today" && (
                <button
                  type="button"
                  onClick={() => onOpenPostponeSelector(chore.subject)}
                  className="rounded-full border border-green-500/40 bg-[#353E43] px-8 py-5 text-lg font-semibold text-[#a7f3d0] hover:bg-[#4a555c] hover:border-green-400 active:scale-95 min-w-[11rem] text-center transition-all duration-150"
                  style={{ marginRight: '0.5rem' }}
                >
                  Postpone
                </button>
              )}
              {assignedList.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onOpenAssigneePicker(chore.subject)}
                  className="rounded-full border border-green-500/40 bg-[#353E43] px-8 py-5 text-lg font-semibold text-[#a7f3d0] hover:bg-[#4a555c] hover:border-green-400 active:scale-95 min-w-[11rem] text-center transition-all duration-150"
                >
                  Mark Done
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onToggleCompleted(chore.subject)}
                  className={
                    "rounded-full border px-8 py-5 text-base font-semibold transition-all duration-150 min-w-[11rem] text-center active:scale-95 " +
                    (complete
                      ? "border-green-400 bg-green-500/20 text-[#a7f3d0]"
                      : "border-green-500/40 bg-[#353E43] text-[#a7f3d0] hover:bg-[#4a555c] hover:border-green-400")
                  }
                >
                  {complete ? "\u2713 Done" : "Mark Done"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
