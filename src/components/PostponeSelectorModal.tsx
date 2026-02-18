interface PostponeSelectorModalProps {
  postponeDates: Date[];
  postponeTarget: string;
  onPostponeToDate: (subject: string, date: Date) => void;
  onClose: () => void;
}

export default function PostponeSelectorModal({
  postponeDates,
  postponeTarget,
  onPostponeToDate,
  onClose,
}: PostponeSelectorModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-md rounded-3xl bg-[#353E43] p-10 shadow-xl shadow-black/30 border border-green-500/20">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-200">
              Postpone to
            </p>
            <h3 className="mt-3 text-xl font-semibold text-slate-100">
              Choose a new day
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
          {postponeDates.map((date) => (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onPostponeToDate(postponeTarget, date)}
              className="w-full rounded-2xl border border-slate-700 px-6 py-4 text-left text-lg font-semibold text-slate-200 hover:bg-slate-800"
            >
              {date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
