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
  type ExecutiveSummary,
  type WeeklyBucket,
} from './utils/analytics';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
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
    <div className="bg-[#181818] border border-green-500/20 rounded-2xl p-6 print:border-slate-300 print:bg-white print:text-slate-900">
      <h2 className="text-lg font-semibold text-slate-100 mb-4 print:text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: 'green' | 'amber' | 'red' | 'sky';
}) {
  const colorMap = {
    green: 'text-green-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    sky: 'text-sky-400',
  };
  return (
    <div className="bg-[#1e1e1e] border border-white/5 rounded-xl p-4 flex flex-col gap-1 print:border-slate-200 print:bg-slate-50">
      <span className={`text-2xl font-bold ${colorMap[color]} print:text-slate-900`}>{value}</span>
      <span className="text-xs text-slate-400 print:text-slate-600">{label}</span>
    </div>
  );
}

function ExecutiveSummaryCards({ summary }: { summary: ExecutiveSummary }) {
  const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      <StatCard label="Completed" value={summary.totalCompleted} color="green" />
      <StatCard label="On Time" value={summary.totalOnTime} color="green" />
      <StatCard label="Late" value={summary.totalLate} color="amber" />
      <StatCard label="Abandoned" value={summary.totalAbandoned} color="red" />
      <StatCard label="Postponed" value={summary.totalPostponed} color="amber" />
      <StatCard label="On-Time %" value={fmtPct(summary.onTimePct)} color="sky" />
    </div>
  );
}

function KeyInsightsSection({
  personCompletion,
  choreCompletion,
}: {
  personCompletion: PersonCompletionStat[];
  choreCompletion: ChoreCompletionStat[];
}) {
  const bullets: string[] = [];

  // Top performer
  if (personCompletion.length > 1) {
    const top = personCompletion[0];
    if (top.total > 0) {
      bullets.push(`Top performer: ${top.member} (${Math.round(top.rate * 100)}% completion rate)`);
    }
    // Needs improvement
    const worst = personCompletion[personCompletion.length - 1];
    if (worst.total > 0 && worst.rate < 0.8 && worst.member !== top.member) {
      bullets.push(`Needs improvement: ${worst.member} (${Math.round(worst.rate * 100)}% completion rate)`);
    }
  }

  // Best chore
  const perfect = choreCompletion.filter((c) => c.total > 0 && c.rate === 1);
  if (perfect.length === 1) {
    bullets.push(`${perfect[0].choreSubject} has a perfect completion record`);
  } else if (perfect.length > 1) {
    bullets.push(`${perfect.length} chores completed with a perfect record`);
  }

  // Worst chore
  const worst = [...choreCompletion].sort((a, b) => a.rate - b.rate)[0];
  if (worst && worst.total > 0 && worst.rate < 0.5) {
    bullets.push(`Most neglected: ${worst.choreSubject} (${Math.round(worst.rate * 100)}% completion rate)`);
  }

  // All green
  const aboveThreshold = choreCompletion.filter((c) => c.total > 0 && c.rate >= 0.8);
  if (choreCompletion.length > 0 && aboveThreshold.length === choreCompletion.filter((c) => c.total > 0).length && aboveThreshold.length > 0) {
    bullets.push('All chores above 80% — looking great!');
  }

  if (bullets.length === 0) {
    return (
      <Section title="Key Insights">
        <p className="text-sm text-slate-500 italic">Not enough data yet. Keep logging chores!</p>
      </Section>
    );
  }

  return (
    <Section title="Key Insights">
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-300 print:text-slate-700">
            <span className="mt-0.5 text-green-400 print:text-green-600">›</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function WeeklyTrendSection({ data }: { data: WeeklyBucket[] }) {
  const maxTotal = Math.max(
    ...data.map((w) => w.completed + w.late + w.abandoned),
    1
  );

  return (
    <Section title="8-Week Trend">
      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          {/* Chart area */}
          <div className="flex items-end gap-1.5 h-32 mb-2">
            {data.map((w) => {
              const total = w.completed + w.late + w.abandoned;
              const totalPct = (total / maxTotal) * 100;
              const completedPct = total > 0 ? (w.completed / total) * 100 : 0;
              const latePct = total > 0 ? (w.late / total) * 100 : 0;
              const abandonedPct = total > 0 ? (w.abandoned / total) * 100 : 0;

              return (
                <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full flex flex-col justify-end rounded-sm overflow-hidden"
                    style={{ height: `${Math.max(totalPct, totalPct > 0 ? 4 : 0)}%`, minHeight: total > 0 ? '4px' : '0' }}
                  >
                    {/* Stacked: abandoned (bottom), late, completed (top) */}
                    {abandonedPct > 0 && (
                      <div className="bg-red-500" style={{ height: `${abandonedPct}%` }} />
                    )}
                    {latePct > 0 && (
                      <div className="bg-amber-400" style={{ height: `${latePct}%` }} />
                    )}
                    {completedPct > 0 && (
                      <div className="bg-green-500" style={{ height: `${completedPct}%` }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex gap-1.5">
            {data.map((w) => (
              <div key={w.weekStart} className="flex-1 text-center text-[10px] text-slate-500 leading-tight">
                {w.weekLabel}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-400" /> Late
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Abandoned
            </span>
          </div>
        </div>
      </div>
    </Section>
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
      <span className="w-36 shrink-0 text-sm text-slate-300 truncate print:text-slate-700">{label}</span>
      <div className="flex-1 h-5 bg-[#232323] rounded-full overflow-hidden print:bg-slate-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 shrink-0 text-sm text-slate-400 text-right print:text-slate-600">{suffix}</span>
    </div>
  );
}

function PunctualityRow({ stat }: { stat: PunctualityStat }) {
  const clampedOffset = Math.max(-7, Math.min(7, stat.averageDaysOffset));
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
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
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

function ChorePerformanceTable({ data }: { data: ChoreCompletionStat[] }) {
  if (data.length === 0) return <EmptyState message="No chore data yet." />;

  const rateColor = (rate: number) =>
    rate < 0.5 ? 'text-red-400' : rate < 0.8 ? 'text-amber-400' : 'text-green-400';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left min-w-[480px]">
        <thead>
          <tr className="text-xs text-slate-500 border-b border-white/10">
            <th className="pb-2 pr-4 font-medium">Chore</th>
            <th className="pb-2 px-2 font-medium text-center text-green-400">Done</th>
            <th className="pb-2 px-2 font-medium text-center text-amber-400">Late</th>
            <th className="pb-2 px-2 font-medium text-center text-red-400">Abandoned</th>
            <th className="pb-2 px-2 font-medium text-center text-slate-400">Postponed</th>
            <th className="pb-2 pl-4 font-medium text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.choreSubject} className="border-b border-white/5 hover:bg-white/[0.02]">
              <td className="py-2 pr-4 text-slate-300 truncate max-w-[160px]">{s.choreSubject}</td>
              <td className="py-2 px-2 text-center text-slate-300">{s.completed}</td>
              <td className="py-2 px-2 text-center text-slate-300">{s.late}</td>
              <td className="py-2 px-2 text-center text-slate-300">{s.abandoned}</td>
              <td className="py-2 px-2 text-center text-slate-300">{s.postponed}</td>
              <td className={`py-2 pl-4 text-right font-semibold ${rateColor(s.rate)}`}>
                {Math.round(s.rate * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
    <div className="min-h-screen bg-[#121212] text-slate-100 print:bg-white print:text-slate-900">
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          .print\\:bg-white { background-color: white !important; }
          .print\\:text-slate-900 { color: #0f172a !important; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h1 className="text-4xl font-semibold">Stats</h1>
            <div className="flex items-center gap-2 print-hide">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-slate-700 bg-[#232323] px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                Print / Save PDF
              </button>
              <a
                href="#/"
                className="rounded-full border-2 border-green-500/20 px-6 py-2 text-sm font-semibold text-slate-300 hover:bg-[#1a1a1a] hover:border-green-400/40 transition"
              >
                &larr; Back
              </a>
            </div>
          </div>

          {/* Executive summary cards — always visible above period toggle */}
          <div className="mb-5">
            <ExecutiveSummaryCards summary={analytics.executiveSummary} />
          </div>

          <div className="print-hide">
            <PeriodToggle period={period} onChange={setPeriod} />
            <p className="mt-3 text-sm text-slate-400">
              {analytics.rangeLabel} &middot; {analytics.totalEvents} event{analytics.totalEvents !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Key Insights */}
        <div className="mb-6">
          <KeyInsightsSection
            personCompletion={analytics.personCompletion}
            choreCompletion={analytics.choreCompletion}
          />
        </div>

        {/* 8-week trend — always shows all-time data */}
        <div className="mb-6">
          <WeeklyTrendSection data={analytics.weeklyTrend} />
        </div>

        {/* Sections */}
        <div className="space-y-6">
          <Section title="Completion Rate by Person">
            <PersonCompletionSection data={analytics.personCompletion} />
          </Section>

          <Section title="Chore Performance">
            <ChorePerformanceTable data={analytics.choreCompletion} />
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
        <div className="pt-8 mt-8 border-t border-green-500/10 flex flex-wrap gap-4 print-hide">
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
