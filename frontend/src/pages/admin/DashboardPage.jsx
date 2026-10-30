import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import {
  Building2,
  CalendarCheck,
  IndianRupee,
  Timer,
  Users,
  BedDouble,
  Search,
  ClipboardCheck,
  CircleAlert,
  Rocket,
  TrendingUp,
  Bell,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Wallet,
  CheckCircle2,
  RotateCcw,
  Hotel,
  BarChart3,
  Activity,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

import {
  Alert,
  Badge,
  Card,
  CardContent,
  Skeleton,
} from '@/components/ui/surfaces.jsx';

import { Button } from '@/components/ui/button.jsx';

import {
  PageHeader,
  formatMoney,
} from '@/components/shared/index.jsx';

import {
  BOOKING_STATUS_LABEL,
} from '@/features/booking/bookingFormat.js';

import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

/* =========================================================
   PREMIUM DESIGN TOKENS
========================================================= */

const COLORS = {
  navy: '#1E3A5F',
  navyDark: '#142A45',
  gold: '#CC8A2A',
  goldLight: '#F8EBD7',
  blue: '#5079B7',
  green: '#16856B',
  red: '#D9534F',
  purple: '#8170C9',
  muted: '#7B8798',
  border: 'var(--border-subtle)',
};

const STATUS_COLORS = [
  '#1E3A5F',
  '#CC8A2A',
  '#16856B',
  '#8170C9',
  '#5079B7',
  '#D9534F',
  '#94A3B8',
];

const RANGES = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 Days', days: 6 },
  { key: '30d', label: '30 Days', days: 29 },
  { key: '90d', label: '90 Days', days: 89 },
  { key: '12m', label: '12 Months', days: 364 },
];

/* =========================================================
   DATE HELPERS
========================================================= */

function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 10);
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(iso) {
  if (!iso) return '';

  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    },
  );
}

function formatMinutes(value) {
  if (value == null) {
    return 'No recent imports';
  }

  if (value < 1) {
    return `${Math.round(value * 60)} sec`;
  }

  return `${value.toFixed(1)} min`;
}

/* =========================================================
   SECTION HEADING
========================================================= */

function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-[var(--text-strong)] sm:text-lg">
          {Icon && (
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}

          {title}
        </h2>

        {description && (
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
            {description}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

/* =========================================================
   PREMIUM ICON BOX
========================================================= */

function IconBox({
  icon: Icon,
  tone = 'navy',
  size = 'md',
}) {
  const tones = {
    navy: 'bg-[#E9EFF7] text-[#1E3A5F]',
    gold: 'bg-[#FBF0DF] text-[#A66A17]',
    green: 'bg-[#E3F5EE] text-[#16856B]',
    blue: 'bg-[#E8F0FC] text-[#5079B7]',
    red: 'bg-[#FCE9E8] text-[#D9534F]',
    purple: 'bg-[#F0ECFC] text-[#8170C9]',
  };

  const sizes = {
    sm: 'h-9 w-9 rounded-xl',
    md: 'h-11 w-11 rounded-2xl',
    lg: 'h-12 w-12 rounded-2xl',
  };

  return (
    <span
      className={`grid shrink-0 place-items-center ${sizes[size]} ${tones[tone]}`}
    >
      <Icon
        className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'}
        aria-hidden="true"
      />
    </span>
  );
}

/* =========================================================
   LOADING SKELETONS
========================================================= */

function LoadingCards({ count = 4 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <Skeleton className="h-5 w-16" />
          </div>

          <Skeleton className="mt-5 h-4 w-28" />
          <Skeleton className="mt-2 h-8 w-36" />
          <Skeleton className="mt-3 h-3 w-24" />
        </Card>
      ))}
    </div>
  );
}

/* =========================================================
   PREMIUM KPI CARD
========================================================= */

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
  tone = 'navy',
  featured = false,
}) {
  const card = (
    <Card
      className={[
        'group relative h-full overflow-hidden',
        'border border-[var(--border-subtle)]',
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg',
        featured
          ? 'bg-[#1E3A5F] text-white'
          : 'bg-[var(--surface-card)]',
      ].join(' ')}
    >
      {featured && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full border border-white/10"
        >
          <div className="absolute inset-4 rounded-full border border-white/10" />
        </div>
      )}

      <CardContent className="relative flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <p
            className={`text-sm font-medium ${
              featured
                ? 'text-white/70'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {label}
          </p>

          <span
            className={[
              'grid h-11 w-11 shrink-0 place-items-center rounded-2xl',
              featured
                ? 'bg-white/10 text-[#F1C780]'
                : tone === 'gold'
                  ? 'bg-[#FBF0DF] text-[#A66A17]'
                  : tone === 'green'
                    ? 'bg-[#E3F5EE] text-[#16856B]'
                    : tone === 'blue'
                      ? 'bg-[#E8F0FC] text-[#5079B7]'
                      : 'bg-[#E9EFF7] text-[#1E3A5F]',
            ].join(' ')}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>

        <p
          className={`mt-4 break-words text-2xl font-bold tracking-tight sm:text-3xl ${
            featured
              ? 'text-white'
              : 'text-[var(--text-strong)]'
          }`}
        >
          {value ?? '—'}
        </p>

        {hint && (
          <p
            className={`mt-2 text-xs leading-5 ${
              featured
                ? 'text-white/65'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {hint}
          </p>
        )}

        {to && (
          <div
            className={`mt-auto flex items-center gap-1 pt-4 text-xs font-semibold ${
              featured ? 'text-[#F1C780]' : 'text-brand-700'
            }`}
          >
            View details

            <ArrowUpRight
              className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!to) return card;

  return (
    <Link
      to={to}
      className="block h-full rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      {card}
    </Link>
  );
}

/* =========================================================
   DATE RANGE SELECTOR
========================================================= */

function RangeSelector({ value, onChange }) {
  return (
    <div
      className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1"
      aria-label="Select reporting period"
    >
      {RANGES.map((range) => {
        const active = value === range.key;

        return (
          <button
            key={range.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(range.key)}
            className={[
              'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
              'focus-visible:outline-2 focus-visible:outline-brand-500',
              active
                ? 'bg-[#1E3A5F] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]',
            ].join(' ')}
          >
            {range.label}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================
   CUSTOM CHART TOOLTIP
========================================================= */

function CustomTooltip({
  active,
  payload,
  label,
  valueFormatter,
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="min-w-36 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-xl">
      <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
        {shortDate(label)}
      </p>

      {payload.map((item) => (
        <div
          key={item.dataKey}
          className="flex items-center gap-2 text-sm"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />

          <span className="text-[var(--text-muted)]">
            {item.name}
          </span>

          <span className="ml-auto font-semibold text-[var(--text-strong)]">
            {valueFormatter
              ? valueFormatter(item.value)
              : item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   PREMIUM TREND CHART
========================================================= */

function TrendChart({
  data,
  dataKey,
  color,
  valueFormatter,
  label,
  gradientId,
}) {
  const hasData = data.length > 0;

  return (
    <div className="min-w-0">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-strong)]">
            {label}
          </p>

          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Daily performance for the selected period
          </p>
        </div>

        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{
            color,
            backgroundColor: `${color}12`,
          }}
        >
          <Activity className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      {!hasData ? (
        <div className="grid h-[230px] place-items-center text-center">
          <div>
            <BarChart3 className="mx-auto h-8 w-8 text-[var(--text-muted)]" />

            <p className="mt-3 text-sm font-medium text-[var(--text-strong)]">
              No data available
            </p>

            <p className="mt-1 text-xs text-[var(--text-muted)]">
              No records were returned for this period.
            </p>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart
            data={data}
            margin={{
              top: 8,
              right: 8,
              left: -18,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient
                id={gradientId}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={color}
                  stopOpacity={0.24}
                />

                <stop
                  offset="95%"
                  stopColor={color}
                  stopOpacity={0.01}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="var(--border-subtle)"
              strokeDasharray="4 5"
            />

            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{
                fontSize: 10,
                fill: COLORS.muted,
              }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />

            <YAxis
              tick={{
                fontSize: 10,
                fill: COLORS.muted,
              }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={40}
            />

            <Tooltip
              content={
                <CustomTooltip
                  valueFormatter={valueFormatter}
                />
              }
            />

            <Area
              type="monotone"
              dataKey={dataKey}
              name={label}
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{
                r: 5,
                strokeWidth: 2,
                fill: 'var(--surface-card)',
              }}
              animationDuration={450}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* =========================================================
   REVENUE METRIC
========================================================= */

function RevenueMetric({
  label,
  value,
  icon: Icon,
  tone = 'navy',
}) {
  const tones = {
    navy: 'text-[#1E3A5F] bg-[#E9EFF7]',
    gold: 'text-[#A66A17] bg-[#FBF0DF]',
    green: 'text-[#16856B] bg-[#E3F5EE]',
    red: 'text-[#D9534F] bg-[#FCE9E8]',
  };

  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5 transition-colors hover:bg-[var(--surface-muted)] sm:p-4">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones[tone]}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          {label}
        </p>

        <p className="mt-1 break-words text-base font-bold tracking-tight text-[var(--text-strong)] sm:text-lg">
          {value}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   BOOKING STATUS DONUT CHART
========================================================= */

function BookingStatusPanel({ breakdown }) {
  const entries = Object.entries(breakdown ?? {});

  const total = entries.reduce(
    (sum, [, count]) => sum + Number(count || 0),
    0,
  );

  const chartData = entries
    .map(([status, count]) => ({
      status,
      count: Number(count || 0),
      name: BOOKING_STATUS_LABEL[status]?.label ?? status,
    }))
    .filter((item) => item.count > 0);

  return (
    <Card className="h-full p-5 transition-shadow duration-200 hover:shadow-md sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">
            Booking status
          </h3>

          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Distribution by current status
          </p>
        </div>

        <IconBox icon={CalendarCheck} tone="blue" size="sm" />
      </div>

      {total === 0 ? (
        <div className="grid min-h-52 place-items-center text-center">
          <div>
            <CalendarCheck className="mx-auto h-8 w-8 text-[var(--text-muted)]" />

            <p className="mt-3 text-sm font-medium text-[var(--text-strong)]">
              No bookings in this range
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative mx-auto mt-3 h-48 w-full max-w-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={61}
                  outerRadius={84}
                  paddingAngle={3}
                  stroke="none"
                  cornerRadius={4}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={entry.status}
                      fill={
                        STATUS_COLORS[
                          index % STATUS_COLORS.length
                        ]
                      }
                    />
                  ))}
                </Pie>

                <Tooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid var(--border-subtle)',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tracking-tight text-[var(--text-strong)]">
                {total.toLocaleString('en-IN')}
              </span>

              <span className="mt-1 text-xs text-[var(--text-muted)]">
                Total bookings
              </span>
            </div>
          </div>

          <div className="mt-2 space-y-3">
            {chartData.map((entry, index) => {
              const percent = (entry.count / total) * 100;

              const color =
                STATUS_COLORS[index % STATUS_COLORS.length];

              return (
                <div key={entry.status}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />

                      <span className="truncate text-xs text-[var(--text-body)]">
                        {entry.name}
                      </span>
                    </div>

                    <span className="shrink-0 text-xs font-semibold text-[var(--text-strong)]">
                      {entry.count.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: color,
                      }}
                    />
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

/* =========================================================
   TOP HOTELS PANEL
========================================================= */

function TopHotelsPanel({ hotels }) {
  return (
    <Card className="h-full p-5 transition-shadow duration-200 hover:shadow-md sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">
            Top hotels
          </h3>

          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Ranked by revenue for the selected period
          </p>
        </div>

        <IconBox icon={Hotel} tone="gold" size="sm" />
      </div>

      {!hotels?.length ? (
        <div className="grid min-h-52 place-items-center text-center">
          <div>
            <Building2 className="mx-auto h-8 w-8 text-[var(--text-muted)]" />

            <p className="mt-3 text-sm font-medium text-[var(--text-strong)]">
              No hotel activity yet
            </p>

            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Hotel performance will appear when data is available.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {hotels.map((hotel, index) => (
            <Link
              key={hotel.id}
              to={`/admin/hotels/${hotel.id}`}
              className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--surface-muted)]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E9EFF7] text-sm font-bold text-[#1E3A5F]">
                {String(index + 1).padStart(2, '0')}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text-strong)]">
                  {hotel.name}
                </span>

                <span className="mt-1 block text-xs text-[var(--text-muted)]">
                  Hotel performance
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold text-[var(--text-strong)]">
                  {formatMoney(hotel.revenueMinor)}
                </span>

                <ArrowUpRight className="ml-auto mt-1 h-3.5 w-3.5 text-[var(--text-muted)] transition-colors group-hover:text-brand-700" />
              </span>
            </Link>
          ))}

          <Link
            to="/admin/reports"
            className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] p-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-[var(--surface-muted)]"
          >
            View full performance report

            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </Card>
  );
}

/* =========================================================
   ONBOARDING METRIC CARD
========================================================= */

function OnboardingCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
  tone = 'navy',
}) {
  const content = (
    <Card className="group h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full items-start gap-3 p-4 sm:p-5">
        <IconBox icon={Icon} tone={tone} />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-5 text-[var(--text-muted)] sm:text-sm">
            {label}
          </p>

          <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-strong)]">
            {value ?? '—'}
          </p>

          {hint && (
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              {hint}
            </p>
          )}

          {to && (
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
              View details

              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return to ? (
    <Link to={to} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [rangeKey, setRangeKey] = useState('30d');
  const [trends, setTrends] = useState(null);
  const [trendsError, setTrendsError] = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(true);

  const [alerts, setAlerts] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /* =======================================================
     LOAD DASHBOARD DATA
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([
      adminApi.dashboard(),
      adminApi.dashboardAlerts().catch(() => []),
    ])
      .then(([dashboardData, dashboardAlerts]) => {
        if (cancelled) return;

        setData(dashboardData);
        setAlerts(dashboardAlerts);
        if (import.meta.env.DEV) console.debug('[dashboard] initial data loaded');
      })
      .catch((err) => {
        if (!cancelled) {
          const message = normalizeError(err).message;
          if (import.meta.env.DEV) console.debug('[dashboard] initial data load failed', { message });
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  /* =======================================================
     DATE RANGE
  ======================================================= */

  const range = useMemo(() => {
    const preset =
      RANGES.find((item) => item.key === rangeKey) ??
      RANGES[2];

    return {
      from: isoDaysAgo(preset.days),
      to: isoToday(),
    };
  }, [rangeKey]);

  /* =======================================================
     LOAD ANALYTICS
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    setTrends(null);
    setTrendsError(null);
    setTrendsLoading(true);

    adminApi
      .dashboardTrends(range)
      .then((result) => {
        if (!cancelled) {
          setTrends(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTrendsError(normalizeError(err).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTrendsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [range, refreshKey]);

  /* =======================================================
     CHART DATA
  ======================================================= */

  const revenueData = useMemo(
    () =>
      trends?.revenueSeries?.map((row) => ({
        date: row.date,
        amount: row.collectedMinor / 100,
      })) ?? [],
    [trends],
  );

  const bookingData = useMemo(
    () => trends?.bookingSeries ?? [],
    [trends],
  );

  /* =======================================================
     INITIAL LOADING
  ======================================================= */

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-[1600px] space-y-8 pb-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 rounded-xl" />
          <Skeleton className="h-4 w-80 max-w-full rounded-lg" />
        </div>

        <LoadingCards />

        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  /* =======================================================
     DASHBOARD ERROR
  ======================================================= */

  if (error && !data) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Dashboard"
          description="Your Gokaasa business overview."
        />

        <Alert tone="error" title="Dashboard unavailable">
          {error}
        </Alert>

        <Button
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const {
    hotels,
    rooms,
    customers,
    bookings,
    onboarding,
  } = data;

  const revenue = trends?.revenue;

  /* =======================================================
     RENDER DASHBOARD
  ======================================================= */

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 pb-8 sm:space-y-10">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <PageHeader
        title="Dashboard"
        description="Your Gokaasa business performance, inventory and booking activity."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  loading ? 'animate-spin' : ''
                }`}
                aria-hidden="true"
              />

              Refresh
            </Button>

            <Link to="/admin/hotels/onboarding">
              <Button size="md">
                <Search className="h-4 w-4" aria-hidden="true" />
                Import a hotel
              </Button>
            </Link>
          </div>
        }
      />

      {/* =====================================================
          ALERTS
      ===================================================== */}

      {alerts?.length > 0 && (
        <section
          aria-labelledby="alerts-heading"
          className="space-y-3"
        >
          <SectionHeading
            icon={Bell}
            title="Needs attention"
            description="Items that may require your review."
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {alerts.map((alert, index) => {
              const content = (
                <div className="flex h-full items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 transition-colors hover:bg-amber-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                    <CircleAlert className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-amber-950">
                      {alert.message}
                    </p>

                    {alert.href && (
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                        Review now
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              );

              return alert.href ? (
                <Link
                  key={alert.type ?? index}
                  to={alert.href}
                  className="block h-full"
                >
                  {content}
                </Link>
              ) : (
                <div key={alert.type ?? index}>
                  {content}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =====================================================
          HOTEL ONBOARDING
      ===================================================== */}

      <section className="space-y-4">
        <SectionHeading
          icon={Rocket}
          title="Hotel onboarding"
          description="Monitor imported hotels and review progress."
          action={
            <Link
              to="/admin/hotels/onboarding"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
            >
              Open onboarding
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OnboardingCard
            icon={Rocket}
            label="Imported today"
            value={onboarding.importedToday}
            hint="Today's import requests"
            tone="blue"
          />

          <OnboardingCard
            icon={ClipboardCheck}
            label="Pending verification"
            value={onboarding.pendingVerification}
            hint="Drafts awaiting review"
            to="/admin/hotels?status=DRAFT"
            tone="gold"
          />

          <OnboardingCard
            icon={CheckCircle2}
            label="Published hotels"
            value={onboarding.published}
            hint="Published inventory"
            to="/admin/hotels?status=PUBLISHED"
            tone="green"
          />

          <OnboardingCard
            icon={CircleAlert}
            label="Failed imports"
            value={onboarding.failedImports30d}
            hint="Last 30 days"
            to="/admin/hotels/onboarding"
            tone="red"
          />
        </div>

        <Card className="overflow-hidden transition-shadow hover:shadow-md">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <IconBox icon={Timer} tone="gold" />

              <div className="min-w-0">
                <p className="font-semibold text-[var(--text-strong)]">
                  Average time to a verified draft
                </p>

                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  Based on {onboarding.completedImports30d} completed
                  import(s) in the last 30 days. Admin review time
                  is excluded.
                </p>
              </div>
            </div>

            <div className="shrink-0 sm:text-right">
              <p className="text-2xl font-bold tracking-tight text-[var(--text-strong)]">
                {formatMinutes(onboarding.averageImportMinutes30d)}
              </p>

              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Average processing time
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* =====================================================
          INVENTORY AND DEMAND
      ===================================================== */}

      <section className="space-y-4">
        <SectionHeading
          icon={Building2}
          title="Inventory and demand"
          description="A snapshot of the current platform."
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Building2}
            label="Total hotels"
            value={hotels.total}
            hint={`${hotels.drafts} draft · ${hotels.pendingReview} in review`}
            to="/admin/hotels"
            tone="navy"
          />

          <StatCard
            icon={BedDouble}
            label="Total rooms"
            value={rooms.total}
            hint="Total room inventory"
            tone="gold"
          />

          <StatCard
            icon={Users}
            label="Customers"
            value={customers.total}
            hint="Registered customers"
            to="/admin/customers"
            tone="blue"
          />

          <StatCard
            icon={CalendarCheck}
            label="Total bookings"
            value={bookings.total}
            hint={`${bookings.today} created today`}
            to="/admin/bookings"
            tone="green"
          />
        </div>

        {/* REVENUE BANNER */}

        <Card className="overflow-hidden border-0 bg-[#1E3A5F] text-white shadow-md">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-[#F1C780]">
                <Wallet className="h-5 w-5" aria-hidden="true" />
              </span>

              <div>
                <p className="text-sm font-medium text-white/70">
                  Confirmed revenue
                </p>

                <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                  {formatMoney(
                    bookings.revenueMinor,
                    bookings.currency,
                  )}
                </p>
              </div>
            </div>

            <Link
              to="/admin/reports"
              className="inline-flex items-center gap-2 self-start rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:self-auto"
            >
              View reports
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* =====================================================
          PERFORMANCE ANALYTICS
      ===================================================== */}

      <section className="space-y-5">
        <SectionHeading
          icon={TrendingUp}
          title="Performance analytics"
          description="Track bookings, collected revenue and booking distribution."
          action={
            <RangeSelector
              value={rangeKey}
              onChange={setRangeKey}
            />
          }
        />

        {trendsError && (
          <Alert
            tone="error"
            title="Analytics temporarily unavailable"
          >
            {trendsError}
          </Alert>
        )}

        {trendsLoading && !trends ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        ) : trends ? (
          <>
            {/* CHARTS */}

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="min-w-0 p-4 sm:p-6">
                <TrendChart
                  data={bookingData}
                  dataKey="count"
                  color={COLORS.navy}
                  label="Bookings over time"
                  gradientId="booking-gradient"
                />
              </Card>

              <Card className="min-w-0 p-4 sm:p-6">
                <TrendChart
                  data={revenueData}
                  dataKey="amount"
                  color={COLORS.gold}
                  label="Collected revenue"
                  gradientId="revenue-gradient"
                  valueFormatter={(value) =>
                    formatMoney(value * 100)
                  }
                />
              </Card>
            </div>

            {/* REVENUE OVERVIEW */}

            {revenue && (
              <Card className="p-5 sm:p-6">
                <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text-strong)]">
                      Revenue overview
                    </h3>

                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Financial summary for the selected period.
                    </p>
                  </div>

                  <Badge tone="neutral">
                    {RANGES.find(
                      (item) => item.key === rangeKey,
                    )?.label}
                  </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <RevenueMetric
                    icon={IndianRupee}
                    label="Gross booking value"
                    value={formatMoney(revenue.grossMinor)}
                    tone="navy"
                  />

                  <RevenueMetric
                    icon={Wallet}
                    label="Collected"
                    value={formatMoney(revenue.collectedMinor)}
                    tone="green"
                  />

                  <RevenueMetric
                    icon={RotateCcw}
                    label="Refunded"
                    value={formatMoney(revenue.refundedMinor)}
                    tone="red"
                  />

                  <RevenueMetric
                    icon={TrendingUp}
                    label="Net revenue"
                    value={formatMoney(revenue.netMinor)}
                    tone="gold"
                  />
                </div>
              </Card>
            )}

            {/* BOOKING STATUS AND TOP HOTELS */}

            <div className="grid gap-4 xl:grid-cols-2">
              <BookingStatusPanel
                breakdown={trends.statusBreakdown}
              />

              <TopHotelsPanel
                hotels={trends.topHotels}
              />
            </div>
          </>
        ) : (
          !trendsError && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-80 rounded-2xl" />
              <Skeleton className="h-80 rounded-2xl" />
            </div>
          )
        )}
      </section>

      {/* =====================================================
          EMPTY STATE
      ===================================================== */}

      {hotels.total === 0 && (
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-4">
              <IconBox icon={Sparkles} tone="gold" size="lg" />

              <div>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">
                  Start building your hotel inventory
                </h3>

                <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
                  Search for hotels by name and city, review imported
                  details, and create your first hotel draft.
                </p>
              </div>
            </div>

            <Link
              to="/admin/hotels/onboarding"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#1E3A5F] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#142A45]"
            >
              Start onboarding
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* =====================================================
          FOOTER
      ===================================================== */}

      <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>Gokaasa Admin · Business overview</p>

        <p className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Data supplied by the connected backend
        </p>
      </div>
    </div>
  );
}
