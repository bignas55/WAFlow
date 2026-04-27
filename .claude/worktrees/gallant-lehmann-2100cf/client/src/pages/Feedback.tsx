import { useState } from "react";
import { trpc } from "../lib/trpc";
import {
  Star, ThumbsUp, ThumbsDown, Minus, Send, Loader2,
  BarChart2, MessageSquare, TrendingUp, Users, Link2, Check,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line,
} from "recharts";

// ── NPS gauge ─────────────────────────────────────────────────────────────────

function NPSGauge({ score }: { score: number }) {
  const clamped = Math.max(-100, Math.min(100, score));
  const pct     = ((clamped + 100) / 200) * 100;
  const color   = clamped >= 50 ? "#25D366" : clamped >= 0 ? "#F59E0B" : "#EF4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-16 overflow-hidden">
        <div className="absolute inset-0 bg-gray-700 rounded-t-full" />
        <div
          className="absolute inset-0 rounded-t-full transition-all duration-700"
          style={{
            background: `conic-gradient(${color} ${pct * 1.8}deg, transparent ${pct * 1.8}deg)`,
            transformOrigin: "50% 100%",
          }}
        />
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-2xl font-bold" style={{ color }}>{clamped}</span>
        </div>
      </div>
      <p className="text-xs text-gray-400">Net Promoter Score</p>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color = "text-[#25D366]" }: {
  icon: React.ElementType; label: string; value: string | number; color?: string;
}) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl bg-gray-700/50 flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-500 text-xs">—</span>;
  const color = score >= 9 ? "bg-green-900/30 text-green-400" : score >= 7 ? "bg-yellow-900/30 text-yellow-400" : "bg-red-900/30 text-red-400";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color} ${score >= 9 ? "border-green-800" : score >= 7 ? "border-yellow-800" : "border-red-800"}`}>
      <Star className="w-2.5 h-2.5" /> {score}/10
    </span>
  );
}

// ── Review Request Modal ──────────────────────────────────────────────────────

function ReviewModal({ onClose }: { onClose: () => void }) {
  const [phone,   setPhone]   = useState("");
  const [link,    setLink]    = useState("");
  const [msg,     setMsg]     = useState("");
  const [sent,    setSent]    = useState(false);

  const requestMutation = trpc.survey.requestReview.useMutation({
    onSuccess: () => { setSent(true); setTimeout(onClose, 1500); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-white font-semibold text-base flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[#25D366]" /> Request a Review
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Customer Phone Number</label>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="27123456789" className="input w-full mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Review Link (Google / Facebook)</label>
            <input value={link} onChange={e => setLink(e.target.value)}
              placeholder="https://g.page/r/..." className="input w-full mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Custom Message (optional)</label>
            <textarea value={msg} onChange={e => setMsg(e.target.value)}
              rows={3} className="input w-full mt-1 text-sm resize-none"
              placeholder="Leave blank to use default message" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-600 text-gray-300 text-sm hover:border-gray-500 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => requestMutation.mutate({ phoneNumber: phone, reviewLink: link || undefined, customMessage: msg || undefined })}
            disabled={!phone || requestMutation.isPending || sent}
            className="flex-1 py-2 rounded-xl bg-[#25D366] text-white text-sm font-medium hover:bg-[#20b959] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sent
              ? <><Check className="w-4 h-4" /> Sent!</>
              : requestMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : <><Send className="w-4 h-4" /> Send via WhatsApp</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Feedback() {
  const [showModal, setShowModal] = useState(false);

  const statsQuery = trpc.survey.stats.useQuery({});
  const listQuery  = trpc.survey.list.useQuery({ status: "responded", limit: 20 });

  const stats = statsQuery.data;

  // Distribution chart data
  const distData = stats
    ? Object.entries(stats.distribution).map(([score, count]) => ({ score: `${score}`, count }))
    : [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Feedback & Reviews</h1>
          <p className="text-gray-400 text-sm mt-1">NPS tracking and customer satisfaction insights</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20b959] text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Send className="w-4 h-4" /> Request Review
        </button>
      </div>

      {/* NPS + stats */}
      {statsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading feedback data…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* NPS gauge */}
            <div className="lg:col-span-1 bg-gray-800/50 border border-gray-700 rounded-2xl p-5 flex items-center justify-center">
              <NPSGauge score={stats?.nps ?? 0} />
            </div>

            {/* Stats */}
            <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={Users}     label="Total Surveys Sent"  value={stats?.totalSent ?? 0} />
              <StatCard icon={MessageSquare} label="Responses"       value={stats?.totalResponded ?? 0} />
              <StatCard icon={ThumbsUp}  label="Promoters (9–10)"    value={stats?.promoters ?? 0} color="text-green-400" />
              <StatCard icon={ThumbsDown} label="Detractors (1–6)"   value={stats?.detractors ?? 0} color="text-red-400" />
            </div>
          </div>

          {/* Score distribution chart */}
          {distData.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-[#25D366]" /> Score Distribution
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={distData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="score" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }}
                    labelStyle={{ color: "#F9FAFB" }}
                  />
                  <Bar dataKey="count" name="Responses" radius={[4, 4, 0, 0]}
                    fill="#25D366"
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-xs text-gray-500 mt-2 px-1">
                <span className="text-red-400">Detractors (1–6)</span>
                <span className="text-yellow-400">Passives (7–8)</span>
                <span className="text-green-400">Promoters (9–10)</span>
              </div>
            </div>
          )}

          {/* NPS legend */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Promoters", range: "Score 9–10", count: stats?.promoters ?? 0, color: "border-green-800 bg-green-900/20", text: "text-green-400", icon: ThumbsUp },
              { label: "Passives",  range: "Score 7–8",  count: stats?.passives  ?? 0, color: "border-yellow-800 bg-yellow-900/20", text: "text-yellow-400", icon: Minus },
              { label: "Detractors", range: "Score 1–6", count: stats?.detractors ?? 0, color: "border-red-800 bg-red-900/20", text: "text-red-400", icon: ThumbsDown },
            ].map(item => (
              <div key={item.label} className={`rounded-2xl border p-4 ${item.color}`}>
                <div className="flex items-center gap-2 mb-2">
                  <item.icon className={`w-4 h-4 ${item.text}`} />
                  <span className={`text-sm font-semibold ${item.text}`}>{item.label}</span>
                </div>
                <p className="text-2xl font-bold text-white">{item.count}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.range}</p>
              </div>
            ))}
          </div>

          {/* Recent feedback */}
          {stats?.recent && stats.recent.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#25D366]" /> Recent Feedback
                </h2>
              </div>
              <div className="divide-y divide-gray-700/50">
                {stats.recent.map((item, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <ScoreBadge score={item.score ?? null} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300 line-clamp-2">{item.feedback}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{item.phone}</p>
                    </div>
                    <p className="text-xs text-gray-600 whitespace-nowrap">
                      {item.date ? new Date(item.date).toLocaleDateString() : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showModal && <ReviewModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
