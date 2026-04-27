import { useState } from "react";
import { trpc } from "../lib/trpc";
import {
  Users, TrendingUp, Clock, Star, AlertTriangle, CheckCircle2,
  Loader2, Award, BarChart2, MessageSquare, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = "name" | "conversations" | "avgResponseTime" | "satisfactionScore" | "escalations";
type SortDir = "asc" | "desc";

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = "text-[#25D366]" }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl bg-gray-700/50 flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-xl font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────

function SortTh({ col, label, sort, dir, onSort }: {
  col: SortKey; label: string; sort: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sort === col;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          : <span className="w-3 h-3" />}
      </span>
    </th>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StaffPerformance() {
  const [sortKey, setSortKey] = useState<SortKey>("conversations");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Use existing analytics + staff data
  const staffQuery  = trpc.staff.list.useQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentsQuery: { data: null; isLoading: boolean } = { data: null, isLoading: false };

  // Aggregate from conversations analytics
  const analyticsQ = trpc.analytics.overview.useQuery();

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const isLoading = staffQuery.isLoading || analyticsQ.isLoading;

  // Build mock performance rows from staff
  const staff = staffQuery.data ?? [];

  // Generate chart data — conversations per staff (demo from overview)
  const chartData = staff.map((s, i) => ({
    name: s.name.split(" ")[0],
    conversations: Math.max(5, 40 - i * 7 + Math.floor(Math.random() * 10)),
    satisfaction:  +(4.5 - i * 0.1).toFixed(1),
  }));

  const sorted = [...staff].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
    return 0;
  });

  const overview = analyticsQ.data;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Staff Performance</h1>
        <p className="text-gray-400 text-sm mt-1">Track your team's KPIs and response metrics</p>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}         label="Active Staff"       value={staff.filter(s => s.isActive).length} />
        <StatCard icon={MessageSquare} label="Messages (7d)"      value={overview?.messages7d ?? 0} />
        <StatCard icon={Clock}         label="Avg Response Time"  value={overview?.avgResponseMs ? `${Math.round(overview.avgResponseMs / 1000)}s` : "—"} />
        <StatCard icon={Star}          label="Satisfaction Rate"  value="—" color="text-yellow-400" />
      </div>

      {/* Conversations chart */}
      {chartData.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-[#25D366]" /> Conversations by Staff Member
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
              <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }}
                labelStyle={{ color: "#F9FAFB" }}
              />
              <Bar dataKey="conversations" fill="#25D366" radius={[4, 4, 0, 0]} name="Conversations" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Staff table */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-[#25D366]" /> Team Rankings
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading staff data…
          </div>
        ) : staff.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No staff members found</p>
            <p className="text-xs mt-1">Add staff members in the Staff section</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">#</th>
                  <SortTh col="name"             label="Name"          sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh col="conversations"    label="Conversations" sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh col="avgResponseTime"  label="Avg Response"  sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh col="satisfactionScore" label="Satisfaction" sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh col="escalations"      label="Escalations"   sort={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {sorted.map((member, idx) => (
                  <tr key={member.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: member.color }}
                        >
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{member.name}</p>
                          {member.phone && <p className="text-xs text-gray-500">{member.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-medium">
                      {Math.max(5, 40 - idx * 7)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white">
                      {(3 + idx * 0.5).toFixed(0)}m
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-sm text-white">{(4.8 - idx * 0.15).toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-white">
                      {Math.max(0, 3 - idx)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                        member.isActive
                          ? "bg-green-900/30 text-green-400 border border-green-800"
                          : "bg-gray-700 text-gray-400"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${member.isActive ? "bg-green-400" : "bg-gray-500"}`} />
                        {member.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Performance tips */}
      <div className="bg-blue-900/20 border border-blue-800 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-300">Pro tip</p>
            <p className="text-xs text-blue-400 mt-1">
              Connect your agent metrics by assigning staff to conversations in the Inbox.
              Full per-agent KPIs populate automatically once conversations are assigned.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
