import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowUpRight, Activity, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/surfaces.jsx';

/**
 * Presentational building blocks for the Onboarding & Performance Analytics module, visually matching
 * DashboardPage.jsx's premium KPI/chart style (same color tokens and layout) without importing from or
 * modifying that page -- DashboardPage's own components aren't exported, and this module's charts carry
 * different data shapes (month buckets, per-employee bars), so a fresh, self-contained set avoids any
 * risk of regressing the existing operations dashboard.
 */
export const COLORS = {
  navy: '#1E3A5F', gold: '#CC8A2A', blue: '#5079B7', green: '#16856B', red: '#D9534F', purple: '#8170C9', muted: '#7B8798',
};
export const SERIES_COLORS = ['#1E3A5F', '#CC8A2A', '#16856B', '#8170C9', '#5079B7', '#D9534F', '#94A3B8'];

export function IconBox({ icon: Icon, tone = 'navy', size = 'md' }) {
  const tones = {
    navy: 'bg-[#E9EFF7] text-[#1E3A5F]', gold: 'bg-[#FBF0DF] text-[#A66A17]', green: 'bg-[#E3F5EE] text-[#16856B]',
    blue: 'bg-[#E8F0FC] text-[#5079B7]', red: 'bg-[#FCE9E8] text-[#D9534F]', purple: 'bg-[#F0ECFC] text-[#8170C9]',
  };
  const sizes = { sm: 'h-9 w-9 rounded-xl', md: 'h-11 w-11 rounded-2xl' };
  return (
    <span className={`grid shrink-0 place-items-center ${sizes[size]} ${tones[tone]}`}>
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
    </span>
  );
}

export function StatCard({ icon: Icon, label, value, hint, to, tone = 'navy' }) {
  const card = (
    <Card className="group relative h-full overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <CardContent className="relative flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-[var(--text-muted)]">{label}</p>
          <IconBox icon={Icon} tone={tone} />
        </div>
        <p className="mt-4 break-words text-2xl font-bold tracking-tight text-[var(--text-strong)] sm:text-3xl">{value ?? '—'}</p>
        {hint && <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{hint}</p>}
        {to && (
          <div className="mt-auto flex items-center gap-1 pt-4 text-xs font-semibold text-brand-700">
            View details
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
        )}
      </CardContent>
    </Card>
  );
  if (!to) return card;
  return <Link to={to} className="block h-full rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-brand-500">{card}</Link>;
}

export function RangeSelector({ ranges, value, onChange }) {
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1" aria-label="Select reporting period">
      {ranges.map((range) => {
        const active = value === range.key;
        return (
          <button
            key={range.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(range.key)}
            className={[
              'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-brand-500',
              active ? 'bg-[#1E3A5F] text-white shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]',
            ].join(' ')}
          >
            {range.label}
          </button>
        );
      })}
    </div>
  );
}

function CustomTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-xl">
      <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-[var(--text-muted)]">{item.name}</span>
          <span className="ml-auto font-semibold text-[var(--text-strong)]">{valueFormatter ? valueFormatter(item.value) : item.value}</span>
        </div>
      ))}
    </div>
  );
}

const EmptyChart = ({ icon: Icon = BarChart3, title = 'No data available', description = 'No records were returned for this period.' }) => (
  <div className="grid h-[230px] place-items-center text-center">
    <div>
      <Icon className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
      <p className="mt-3 text-sm font-medium text-[var(--text-strong)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
    </div>
  </div>
);

/** A line/area trend over an x-axis of arbitrary string buckets (day or month labels). */
export function TrendChart({ data, dataKey, xKey = 'date', color = COLORS.navy, valueFormatter, labelFormatter, label, gradientId, emptyLabel }) {
  const hasData = data.length > 0;
  return (
    <div className="min-w-0">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-strong)]">{label}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ color, backgroundColor: `${color}12` }}>
          <Activity className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      {!hasData ? (
        <EmptyChart description={emptyLabel} />
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                <stop offset="95%" stopColor={color} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="4 5" />
            <XAxis dataKey={xKey} tickFormatter={labelFormatter} tick={{ fontSize: 10, fill: COLORS.muted }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 10, fill: COLORS.muted }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
            <Tooltip content={<CustomTooltip valueFormatter={valueFormatter} labelFormatter={labelFormatter} />} />
            <Area type="monotone" dataKey={dataKey} name={label} stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'var(--surface-card)' }} animationDuration={450} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Grouped/stacked bars, one group per category (e.g. employee), one Bar per series (e.g. status bucket). */
export function BarComparisonChart({ data, categoryKey, series, emptyLabel }) {
  if (!data.length) return <EmptyChart description={emptyLabel} />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(260, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--border-subtle)" strokeDasharray="4 5" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: COLORS.muted }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey={categoryKey} width={120} tick={{ fontSize: 11, fill: COLORS.muted }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border-subtle)', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, index) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId={s.stackId ?? 'stack'} fill={s.color ?? SERIES_COLORS[index % SERIES_COLORS.length]} radius={index === series.length - 1 ? [0, 4, 4, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A donut + manual legend, generalised from the booking-status donut: `data` is [{ key, name, count }]. */
export function DonutPanel({ title, description, icon: Icon = BarChart3, iconTone = 'blue', data, totalLabel = 'Total', emptyLabel = 'No records in this range' }) {
  const total = data.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const chartData = data.filter((item) => item.count > 0);
  return (
    <Card className="h-full p-5 transition-shadow duration-200 hover:shadow-md sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h3>
          {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
        </div>
        <IconBox icon={Icon} tone={iconTone} size="sm" />
      </div>
      {total === 0 ? (
        <div className="grid min-h-52 place-items-center text-center">
          <div>
            <Icon className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
            <p className="mt-3 text-sm font-medium text-[var(--text-strong)]">{emptyLabel}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative mx-auto mt-3 h-48 w-full max-w-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="count" nameKey="name" innerRadius={61} outerRadius={84} paddingAngle={3} stroke="none" cornerRadius={4}>
                  {chartData.map((entry, index) => <Cell key={entry.key} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ borderRadius: 12, border: '1px solid var(--border-subtle)', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tracking-tight text-[var(--text-strong)]">{total.toLocaleString('en-IN')}</span>
              <span className="mt-1 text-xs text-[var(--text-muted)]">{totalLabel}</span>
            </div>
          </div>
          <div className="mt-2 space-y-3">
            {chartData.map((entry, index) => {
              const percent = (entry.count / total) * 100;
              const color = SERIES_COLORS[index % SERIES_COLORS.length];
              return (
                <div key={entry.key}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className="truncate text-xs text-[var(--text-body)]">{entry.name}</span>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-[var(--text-strong)]">{entry.count.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
