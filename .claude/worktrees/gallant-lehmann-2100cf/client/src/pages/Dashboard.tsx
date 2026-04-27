import React from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare, Users, Bot, TrendingUp, AlertTriangle, CheckCircle,
  Clock, PhoneCall, Activity, ArrowUpRight, ArrowDownRight,
  Wifi, WifiOff, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { trpc } from '../lib/trpc';
import { useWhatsAppSocket } from '../hooks/useWhatsAppSocket';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';

// ── Stat Card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change?: number;
  color: string;
  link?: string;
}

function StatCard({ title, value, icon, change, color, link }: StatCardProps) {
  const content = (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(change)}% vs yesterday
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      </div>
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
}

// ── Custom Chart Tooltip ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const dateLabel = new Date(label + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">{dateLabel}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-bold text-gray-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const { isConnected, lastMessage } = useWhatsAppSocket();
  const { data: stats, isLoading }   = trpc.conversations.stats.useQuery(undefined, { refetchInterval: 8000 });
  const { data: recent, refetch: refetchRecent } = trpc.conversations.list.useQuery(
    { limit: 5, page: 1 }, { refetchInterval: 8000 }
  );
  const { data: aiHealth }  = trpc.botConfig.checkAI.useQuery(undefined, { refetchInterval: 30000 });
  const { data: qrStatus }  = trpc.whatsapp.qrStatus.useQuery(undefined, { refetchInterval: 10000 });
  const { data: trendData } = trpc.analytics.dailyTrend.useQuery();

  React.useEffect(() => { if (lastMessage) refetchRecent(); }, [lastMessage]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  const s = stats || {
    totalToday: 0, activeConversations: 0, aiHandled: 0, escalated: 0,
    avgResponseTime: 0, satisfactionScore: null, newCustomers: 0, resolved: 0,
  };

  const waConnected = qrStatus?.status === 'connected';
  const waPhone     = qrStatus?.phoneNumber ? `+${qrStatus.phoneNumber}` : null;
  const waName      = qrStatus?.name ?? null;

  const chartData = (trendData ?? []).map((d) => ({
    ...d,
    label: new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }),
  }));

  return (
    <div className="space-y-6">

      {/* ── WhatsApp Status Bar ─────────────────────────────────────────── */}
      <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border text-sm ${
        waConnected
          ? 'bg-[#25D366]/5 border-[#25D366]/20 text-[#25D366]'
          : 'bg-amber-50 border-amber-200 text-amber-700'
      }`}>
        {waConnected
          ? <Wifi className="w-4 h-4 flex-shrink-0" />
          : <WifiOff className="w-4 h-4 flex-shrink-0 text-amber-500" />}
        {waConnected ? (
          <span className="flex-1">
            WhatsApp connected
            {waName && <strong> · {waName}</strong>}
            {waPhone && <span className="ml-2 opacity-70">{waPhone}</span>}
          </span>
        ) : (
          <span className="flex-1">
            WhatsApp not connected —{' '}
            <Link to="/receptionist-setup" className="underline font-medium">connect now</Link>
          </span>
        )}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${waConnected ? 'bg-[#25D366] animate-pulse' : 'bg-amber-400'}`} />
      </div>

      {/* ── AI health warning ───────────────────────────────────────────── */}
      {aiHealth && !aiHealth.ok && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
          <div className="flex-1"><strong>AI Configuration Issue</strong> — {aiHealth.error}</div>
          <Link to="/configuration" className="text-xs font-medium underline">Fix in Config</Link>
        </div>
      )}

      {/* ── Stats grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Messages Today"       value={s.totalToday}          icon={<MessageSquare className="w-5 h-5 text-blue-600" />}   color="bg-blue-50"    link="/inbox" />
        <StatCard title="Active Conversations" value={s.activeConversations} icon={<Activity className="w-5 h-5 text-indigo-600" />}      color="bg-indigo-50" />
        <StatCard title="AI Handled"           value={s.aiHandled}           icon={<Bot className="w-5 h-5 text-purple-600" />}           color="bg-purple-50" />
        <StatCard title="Escalated"            value={s.escalated}           icon={<AlertTriangle className="w-5 h-5 text-orange-500" />} color="bg-orange-50"  link="/inbox" />
        <StatCard
          title="Avg Response"
          value={s.avgResponseTime > 0 ? `${Math.round(s.avgResponseTime / 60)}m` : '—'}
          icon={<Clock className="w-5 h-5 text-cyan-600" />} color="bg-cyan-50"
        />
        <StatCard
          title="Satisfaction"
          value={s.satisfactionScore != null ? `${s.satisfactionScore}%` : '—'}
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50"
        />
        <StatCard title="New Customers" value={s.newCustomers} icon={<Users className="w-5 h-5 text-violet-600" />} color="bg-violet-50" link="/crm" />
        <StatCard title="Resolved Today" value={s.resolved}   icon={<CheckCircle className="w-5 h-5 text-teal-600" />} color="bg-teal-50" />
      </div>

      {/* ── 7-Day Trend Chart ────────────────────────────────────────────── */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-800">7-Day Conversation Trend</h2>
              <p className="text-xs text-gray-400 mt-0.5">Daily totals — AI handled vs escalated</p>
            </div>
            <Link to="/analytics" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              Full Analytics <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradAI" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#25D366" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradEsc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              <Area type="monotone" dataKey="total"     name="Total"      stroke="#6366f1" strokeWidth={2} fill="url(#gradTotal)" dot={{ r: 3, fill: '#6366f1' }} />
              <Area type="monotone" dataKey="aiHandled" name="AI Handled" stroke="#25D366" strokeWidth={2} fill="url(#gradAI)"   dot={{ r: 3, fill: '#25D366' }} />
              <Area type="monotone" dataKey="escalated" name="Escalated"  stroke="#f97316" strokeWidth={2} fill="url(#gradEsc)"  dot={{ r: 3, fill: '#f97316' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Recent Conversations ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Recent Conversations</h2>
          <Link to="/inbox" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Open Inbox →</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {recent?.conversations.length === 0 && (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">
              No conversations yet. Connect WhatsApp to get started.
            </div>
          )}
          {recent?.conversations.map((conv) => (
            <Link key={conv.id} to="/inbox" className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition block">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-600 font-semibold text-sm">
                  {(conv.customerName || conv.customerPhone || '?')[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800 truncate">{conv.customerName || conv.customerPhone}</p>
                  {conv.isEscalated && <Badge variant="warning">Escalated</Badge>}
                  {conv.aiHandled   && <Badge variant="info">AI</Badge>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{conv.lastMessage}</p>
              </div>
              <div className="text-xs text-gray-400 flex-shrink-0">
                {conv.lastMessageAt
                  ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : ''}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { to: '/inbox',          icon: PhoneCall,     label: 'Inbox',      color: 'text-green-600',  bg: 'bg-green-50'  },
          { to: '/templates',      icon: MessageSquare, label: 'Templates',  color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { to: '/configuration',  icon: Bot,           label: 'AI Config',  color: 'text-purple-600', bg: 'bg-purple-50' },
          { to: '/analytics',      icon: TrendingUp,    label: 'Analytics',  color: 'text-orange-600', bg: 'bg-orange-50' },
          { to: '/broadcast',      icon: Zap,           label: 'Broadcast',  color: 'text-pink-600',   bg: 'bg-pink-50'   },
          { to: '/crm',            icon: Users,         label: 'CRM',        color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { to: '/knowledge-base', icon: Activity,      label: 'Train AI',   color: 'text-teal-600',   bg: 'bg-teal-50'   },
          { to: '/flow-builder',   icon: Zap,           label: 'Flows',      color: 'text-cyan-600',   bg: 'bg-cyan-50'   },
        ] as const).map(({ to, icon: Icon, label, color, bg }) => (
          <Link key={to} to={to}
            className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col items-center gap-2.5 text-center">
            <div className={`p-2.5 rounded-xl ${bg}`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <span className="text-xs font-medium text-gray-700">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
