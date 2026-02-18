import { useMemo, useState } from 'react';
import { loadHistory } from './utils/history';
import { HOUSEHOLD } from './utils/chores';
import {
  computeAnalytics,
  type Period,
  type PersonCompletionStat,
  type ChoreCompletionStat,
  type PostponeStat,
  type TimeOfDayBucket,
  type PunctualityStat,
  type MissedPatternStat,
} from './utils/analytics';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-2">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={
            'rounded-full px-5 py-2 text-sm font-semibold transition ' +
            (period === p.value
              ? 'bg-green-500 text-slate-950'
              : 'bg-[#232323] text-slate-300 hover:bg-[#2a2a2a]')
          }
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#181818] border border-green-500/20 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-slate-100 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function BarRow({
  label,
  value,
  maxValue,
  color,
  suffix,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  suffix: string;
}) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-36 shrink-0 text-sm text-slate-300 truncate">{label}</span>
      <div className="flex-1 h-5 bg-[#232323] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 shrink-0 text-sm text-slate-400 text-right">{suffix}</span>
    </div>
  );
}

function PunctualityRow({ stat }: { stat: PunctualityStat }) {
  const clampedOffset = Math.max(-7, Math.min(7, stat.averageDaysOffset));
  // Map -7..+7 to 0..100 with 50 as center
  const pct = ((clampedOffset + 7) / 14) * 100;
  const isLate = stat.averageDaysOffset > 0;
  const color = isLate ? 'bg-red-500' : 'bg-green-500';
  const label = stat.averageDaysOffset === 0
    ? 'On time'
    : isLate
      ? `${stat.averageDaysOffset}d late`
      : `${Math.abs(stat.averageDaysOffset)}d early`;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-36 shrink-0 text-sm text-slate-300 truncate">{stat.member}</span>
      <div className="flex-1 h-5 bg-[#232323] rounded-full overflow-hidden relative">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
        {/* Bar from center to position */}
        {pct !== 50 && (
          <div
            className={`absolute top-0 bottom-0 ${color}`}
            style={
              pct < 50
                ? { left: `${pct}%`, width: `${50 - pct}%` }
                : { left: '50%', width: `${pct - 50}%` }
            }
          />
        )}
      </div>
      <span className="w-20 shrink-0 text-sm text-slate-400 text-right">{label}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-500 italic">{message}</p>;
}

function PersonCompletionSection({ data }: { data: PersonCompletionStat[] }) {
  if (data.length === 0) return <EmptyState message="No completion data yet." />;
  return (
    <div>
      {data.map((s) => (
        <BarRow
          key={s.member}
          label={s.member}
          value={s.rate}
          maxValue={1}
          color="bg-green-500"
          suffix={`${Math.round(s.rate * 100)}% (${s.completed}/${s.total})`}
        />
      ))}
    </div>
  );
}

function ChoreCompletionSection({ data }: { data: ChoreCompletionStat[] }) {
  if (data.length === 0) return <EmptyState message="No chore data yet." />;
  return (
    <div>
      {data.map((s) => (
        <BarRow
          key={s.choreSubject}
          label={s.choreSubject}
          value={s.rate}
          maxValue={1}
          color={s.rate < 0.5 ? 'bg-red-500' : 'bg-green-500'}
          suffix={`${Math.round(s.rate * 100)}% (${s.completed}/${s.total})`}
        />
      ))}
    </div>
  );
}

function PostponeSection({ data }: { data: PostponeStat[] }) {
  if (data.length === 0) return <EmptyState message="No postponements recorded." />;
  const max = data[0].postponeCount;
  return (
    <div>
      {data.map((s) => (
        <BarRow
          key={s.choreSubject}
          label={s.choreSubject}
          value={s.postponeCount}
          maxValue={max}
          color="bg-amber-500"
          suffix={`${s.postponeCount}\u00d7`}
        />
      ))}
    </div>
  );
}

function TimeOfDaySection({ data }: { data: TimeOfDayBucket[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div>
      {data.map((b) => (
        <BarRow
          key={b.label}
          label={`${b.label} (${b.range})`}
          value={b.count}
          maxValue={max}
          color="bg-sky-500"
          suffix={String(b.count)}
        />
      ))}
    </div>
  );
}

function MissedPatternsSection({ data }: { data: MissedPatternStat[] }) {
  if (data.length === 0) return <EmptyState message="No frequently missed chores detected." />;
  const max = data[0].windowSize;
  return (
    <div>
      {data.map((s) => (
        <BarRow
          key={s.choreSubject}
          label={s.choreSubject}
          value={s.missedCount}
          maxValue={max}
          color="bg-red-500"
          suffix={`${s.missedCount} of ${s.windowSize} wks`}
        />
      ))}
    </div>
  );
}

function PunctualitySection({ data }: { data: PunctualityStat[] }) {
  if (data.length === 0) return <EmptyState message="No punctuality data yet." />;
  return (
    <div>
      {data.map((s) => (
        <PunctualityRow key={s.member} stat={s} />
      ))}
    </div>
  );
}

export default function SummaryDashboard() {
  const [period, setPeriod] = useState<Period>('week');

  const history = useMemo(() => loadHistory(), []);

  const analytics = useMemo(
    () => computeAnalytics(history, period, HOUSEHOLD),
    [history, period],
  );

  return (
    <div className="min-h-screen bg-[#121212] text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h1 className="text-4xl font-semibold">Stats</h1>
            <a
              href="#/"
              className="rounded-full border-2 border-green-500/20 px-6 py-2 text-sm font-semibold text-slate-300 hover:bg-[#1a1a1a] hover:border-green-400/40 transition"
            >
              &larr; Back
            </a>
          </div>
          <PeriodToggle period={period} onChange={setPeriod} />
          <p className="mt-3 text-sm text-slate-400">
            {analytics.rangeLabel} &middot; {analytics.totalEvents} event{analytics.totalEvents !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          <Section title="Completion Rate by Person">
            <PersonCompletionSection data={analytics.personCompletion} />
          </Section>

          <Section title="Completion Rate by Chore">
            <ChoreCompletionSection data={analytics.choreCompletion} />
          </Section>

          <Section title="Most Postponed Chores">
            <PostponeSection data={analytics.postponeFrequency} />
          </Section>

          <Section title="Time of Day">
            <TimeOfDaySection data={analytics.timeOfDay} />
          </Section>

          <Section title="Avg Days Early / Late">
            <PunctualitySection data={analytics.punctuality} />
          </Section>

          <Section title="Frequently Missed (Last 4 Weeks)">
            <MissedPatternsSection data={analytics.missedPatterns} />
          </Section>
        </div>

        {/* Footer nav */}
        <div className="pt-8 mt-8 border-t border-green-500/10 flex flex-wrap gap-4">
          <a
            href="#/"
            className="inline-block rounded-full border-2 border-green-500/20 px-8 py-3 text-lg font-semibold text-slate-300 hover:bg-[#1a1a1a] hover:border-green-400/40 transition"
          >
            &larr; Chore Dashboard
          </a>
          <a
            href="#/admin"
            className="inline-block rounded-full border-2 border-green-500/20 px-8 py-3 text-lg font-semibold text-slate-300 hover:bg-[#1a1a1a] hover:border-green-400/40 transition"
          >
            Admin
          </a>
        </div>
      </div>
    </div>
  );
}
