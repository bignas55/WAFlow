import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { TrendingUp, MessageSquare, Bot, Clock, Download, AlertTriangle, Lightbulb, Plus, Star, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { Spinner } from '../components/ui/Spinner';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // index 0-6; API returns dow 1=Sun..7=Sat
const HOUR_LABELS = ['12a','2a','4a','6a','8a','10a','12p','2p','4p','6p','8p','10p'];

function exportCSV(filename: string, rows: Record<string, any>[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const SENTIMENT_COLORS = ['#10b981', '#6b7280', '#ef4444'];
const LANG_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

type Period = '7d' | '14d' | '30d' | '90d';

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '14d', label: '14 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
];

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('14d');
  const navigate = useNavigate();
  const { data: faqData } = trpc.analytics.faqSuggestions.useQuery();

  const { data, isLoading } = trpc.advanced.analytics.useQuery({ period }, {
    refetchInterval: 60000,
  });

  const periodDays = period === '7d' ? 7 : period === '14d' ? 14 : period === '30d' ? 30 : 90;
  const { data: revenueData }           = trpc.analytics.revenue.useQuery({ days: periodDays });
  const { data: peakHoursData }         = trpc.analytics.peakHours.useQuery();
  const { data: noShowByServiceData }   = trpc.analytics.noShowByService.useQuery();
  const { data: retentionData }         = trpc.analytics.retention.useQuery();
  const { data: satisfactionData }      = trpc.analytics.satisfactionByService.useQuery();
  const { data: sentimentTrendData }    = trpc.analytics.sentimentTrend.useQuery({ days: periodDays });
  const { data: responseHeatmapData }   = trpc.analytics.responseTimeByHour.useQuery();

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  const {
    hourlyMessages = [],
    dailyMessages = [],
    sentimentBreakdown = [],
    languageBreakdown = [],
    topTemplates = [],
    aiVsHuman = [],
    escalationTrend = [],
    responseTimeTrend = [],
    summary = {} as any,
  } = (data || {}) as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">Insights into your AI receptionist performance</p>
        </div>
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                period === p.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => exportCSV(`waflow-messages-${period}-${new Date().toISOString().slice(0,10)}.csv`, dailyMessages)}
          disabled={!dailyMessages.length}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          Messages CSV
        </button>
        <button
          onClick={() => revenueData?.perDay && exportCSV(`waflow-revenue-${period}-${new Date().toISOString().slice(0,10)}.csv`, revenueData.perDay)}
          disabled={!revenueData?.perDay?.length}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          Revenue CSV
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Revenue card */}
        <div className="bg-emerald-50 rounded-xl p-5 border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Revenue ({period})</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                R{(revenueData?.total ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {(revenueData?.lifetimeValueTotal ?? 0) > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Total LTV: R{(revenueData?.lifetimeValueTotal ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}
                </p>
              )}
            </div>
            <div className="bg-white rounded-lg p-2 shadow-sm">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>
        {[
          { label: 'Total Messages',  value: summary.totalMessages || 0,          icon: <MessageSquare className="w-5 h-5 text-blue-600" />,   bg: 'bg-blue-50',   change: summary.messagesChange },
          { label: 'AI Handled',      value: `${summary.aiHandledPct || 0}%`,     icon: <Bot className="w-5 h-5 text-purple-600" />,           bg: 'bg-purple-50', change: summary.aiChange },
          { label: 'Avg Response',    value: summary.avgResponseTime > 0 ? `${summary.avgResponseTime}s` : '—', icon: <Clock className="w-5 h-5 text-green-600" />, bg: 'bg-green-50', change: summary.responseTimeChange },
          { label: 'Escalation Rate', value: `${summary.escalationRate || 0}%`,   icon: <AlertTriangle className="w-5 h-5 text-orange-600" />, bg: 'bg-orange-50', change: summary.satisfactionChange },
        ].map(({ label, value, icon, bg, change }) => (
          <div key={label} className={`${bg} rounded-xl p-5 border border-gray-100`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                {change !== undefined && (
                  <p className={`text-xs mt-0.5 ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs previous period
                  </p>
                )}
              </div>
              <div className="p-2 bg-white rounded-lg shadow-sm">{icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Daily Messages Area Chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Messages Over Time</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={dailyMessages} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAI" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Legend />
            <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="url(#gradTotal)" strokeWidth={2} name="Total" />
            <Area type="monotone" dataKey="aiHandled" stroke="#8b5cf6" fill="url(#gradAI)" strokeWidth={2} name="AI Handled" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Hourly Distribution Bar Chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Messages by Hour</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyMessages} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Messages" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sentiment Pie Chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Sentiment Analysis</h2>
          {sentimentBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={sentimentBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {sentimentBreakdown.map((_: any, index: number) => (
                    <Cell key={index} fill={SENTIMENT_COLORS[index % SENTIMENT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Language Breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Language Distribution</h2>
          {languageBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={languageBreakdown} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="language" type="category" tick={{ fontSize: 11 }} width={35} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Messages">
                  {languageBreakdown.map((_: any, index: number) => (
                    <Cell key={index} fill={LANG_COLORS[index % LANG_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* AI vs Human Response Line Chart */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">AI vs Human Handling</h2>
          {aiVsHuman.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={aiVsHuman} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend />
                <Line type="monotone" dataKey="ai" stroke="#8b5cf6" strokeWidth={2} dot={false} name="AI" />
                <Line type="monotone" dataKey="human" stroke="#10b981" strokeWidth={2} dot={false} name="Human" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Escalation Rate + Response Time trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Escalation Rate Over Time</h2>
          {escalationTrend.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={escalationTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradEsc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Area type="monotone" dataKey="escalationRate" stroke="#f59e0b" fill="url(#gradEsc)" strokeWidth={2} name="Escalation %" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Avg Response Time (seconds)</h2>
          {responseTimeTrend.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={responseTimeTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="s" />
                <Tooltip formatter={(v: any) => `${v}s`} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Line type="monotone" dataKey="avgSeconds" stroke="#10b981" strokeWidth={2} dot={false} name="Avg Response (s)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Templates */}
      {topTemplates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Top Triggered Templates</h2>
          <div className="space-y-3">
            {topTemplates.map((t: any, i: number) => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{t.name}</span>
                    <span className="text-xs text-gray-500">{t.count} triggers</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(t.count / topTemplates[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Customer Retention: new vs returning ─────────────────────── */}
      {retentionData && retentionData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-indigo-500" />
            <h2 className="font-semibold text-gray-800">Customer Retention (last 12 weeks)</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={retentionData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 9 }} tickFormatter={(w: string) => w.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="newCustomers" name="New" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
              <Bar dataKey="returning" name="Returning" stackId="a" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── No-show rate by service ───────────────────────────────────── */}
      {noShowByServiceData && noShowByServiceData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-1">No-show Rate by Service</h2>
          <p className="text-xs text-gray-400 mb-4">Last 90 days — percentage of booked appointments that were no-shows</p>
          <div className="space-y-3">
            {noShowByServiceData.map((s: any) => (
              <div key={s.service}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700 font-medium">{s.service}</span>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{s.noShows}/{s.total} no-shows</span>
                    <span className={`font-semibold ${s.noShowRate >= 30 ? 'text-red-600' : s.noShowRate >= 15 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {s.noShowRate}%
                    </span>
                  </div>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${s.noShowRate >= 30 ? 'bg-red-400' : s.noShowRate >= 15 ? 'bg-yellow-400' : 'bg-green-400'}`}
                    style={{ width: `${Math.min(s.noShowRate, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Satisfaction score by service ─────────────────────────────── */}
      {satisfactionData && satisfactionData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-yellow-500" />
            <h2 className="font-semibold text-gray-800">Customer Satisfaction by Service</h2>
          </div>
          <div className="space-y-3">
            {satisfactionData.map((s: any) => (
              <div key={s.service} className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{s.service}</p>
                  <p className="text-xs text-gray-400">{s.responses} response{s.responses !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {[1,2,3,4,5].map(n => (
                    <div key={n} className={`w-4 h-4 rounded-sm ${n <= Math.round(s.avgScore) ? 'bg-yellow-400' : 'bg-gray-100'}`} />
                  ))}
                  <span className="text-sm font-bold text-gray-800 ml-1">{s.avgScore}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Peak booking hours heatmap ────────────────────────────────── */}
      {peakHoursData && peakHoursData.length > 0 && (() => {
        // Build 7×12 grid (dow 1..7 × hour buckets 0,2,4..22)
        const maxCount = Math.max(...peakHoursData.map((r: any) => r.count), 1);
        const grid: Record<string, number> = {};
        for (const r of peakHoursData) grid[`${r.dow}-${r.hour}`] = r.count;
        const hours = [0,2,4,6,8,10,12,14,16,18,20,22];

        return (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-1">Peak Booking Hours</h2>
            <p className="text-xs text-gray-400 mb-4">Last 90 days — darker = more appointments booked at that time</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="w-10" />
                    {HOUR_LABELS.map((h, i) => (
                      <th key={i} className="text-center text-gray-400 font-normal pb-2 w-8">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1,2,3,4,5,6,7].map(dow => (
                    <tr key={dow}>
                      <td className="text-gray-500 pr-2 py-0.5 text-right font-medium">{DOW_LABELS[dow - 1]}</td>
                      {hours.map(h => {
                        const count = grid[`${dow}-${h}`] ?? 0;
                        const intensity = count > 0 ? Math.max(0.08, count / maxCount) : 0;
                        return (
                          <td key={h} className="py-0.5 px-0.5">
                            <div
                              title={`${count} booking${count !== 1 ? 's' : ''}`}
                              className="w-7 h-6 rounded mx-auto"
                              style={{ backgroundColor: count > 0 ? `rgba(37,211,102,${intensity})` : '#f3f4f6' }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── Sentiment Trend Line Chart ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800">Sentiment Trend</h2>
            <p className="text-xs text-gray-400 mt-0.5">Daily positive / neutral / negative message counts</p>
          </div>
          {sentimentTrendData && sentimentTrendData.length > 0 && (
            <button
              onClick={() => exportCSV(`waflow-sentiment-${period}-${new Date().toISOString().slice(0,10)}.csv`, sentimentTrendData)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
        </div>
        {!sentimentTrendData || sentimentTrendData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No sentiment data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={sentimentTrendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="positive" stroke="#10b981" strokeWidth={2} dot={false} name="Positive" />
              <Line type="monotone" dataKey="neutral"  stroke="#6b7280" strokeWidth={2} dot={false} name="Neutral" />
              <Line type="monotone" dataKey="negative" stroke="#ef4444" strokeWidth={2} dot={false} name="Negative" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Response Time Heatmap by Hour of Day ─────────────────────── */}
      {responseHeatmapData && responseHeatmapData.length > 0 && (() => {
        const maxAvg = Math.max(...responseHeatmapData.map((r: any) => r.avgMs), 1);
        const byHour: Record<number, number> = {};
        for (const r of responseHeatmapData) byHour[r.hour] = r.avgMs;
        const hours24 = Array.from({ length: 24 }, (_, i) => i);
        const formatHr = (h: number) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;

        return (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-1">Avg Response Time by Hour of Day</h2>
            <p className="text-xs text-gray-400 mb-4">Last 30 days — darker orange = slower average response time</p>
            <div className="overflow-x-auto">
              <div className="flex gap-1 min-w-max">
                {hours24.map((h) => {
                  const secs = byHour[h] ?? 0;
                  const intensity = secs > 0 ? Math.max(0.1, secs / maxAvg) : 0;
                  return (
                    <div key={h} className="flex flex-col items-center gap-1">
                      <div
                        title={secs > 0 ? `${secs >= 1000 ? `${(secs / 1000).toFixed(1)}s` : `${secs}ms`} avg` : 'No data'}
                        className="w-8 h-12 rounded"
                        style={{ backgroundColor: secs > 0 ? `rgba(251,146,60,${intensity})` : '#f3f4f6' }}
                      />
                      <span className="text-[9px] text-gray-400 w-8 text-center">{formatHr(h)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] text-gray-400">Faster</span>
              <div className="flex gap-0.5">
                {[0.1, 0.3, 0.5, 0.7, 0.9].map((op) => (
                  <div key={op} className="w-6 h-3 rounded" style={{ backgroundColor: `rgba(251,146,60,${op})` }} />
                ))}
              </div>
              <span className="text-[10px] text-gray-400">Slower</span>
            </div>
          </div>
        );
      })()}

      {/* FAQ Auto-learning suggestions */}
      {faqData && faqData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              <h2 className="font-semibold text-gray-800">Suggested FAQ Articles</h2>
            </div>
            <span className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">
              Customers asked these {faqData.length > 1 ? `${faqData.length} questions` : 'question'} repeatedly
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            These questions came up multiple times in AI conversations. Adding them to your Knowledge Base will improve response accuracy.
          </p>
          <div className="space-y-2">
            {faqData.map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">×{item.count}</span>
                  <span className="text-sm text-gray-700 capitalize">{item.question}</span>
                </div>
                <button
                  onClick={() => navigate('/knowledge-base')}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add to KB
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
