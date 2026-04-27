import { useState } from "react";
import { trpc } from "../lib/trpc";
import {
  Award, Star, Gift, Users, TrendingUp, Loader2,
  ChevronDown, ChevronUp, Check, Save, Settings, Plus,
} from "lucide-react";

// ── Tier badge ────────────────────────────────────────────────────────────────

const TIER_STYLES = {
  Gold:   { bg: "bg-yellow-900/30 border-yellow-700", text: "text-yellow-400", icon: "🥇" },
  Silver: { bg: "bg-gray-700/30 border-gray-500",     text: "text-gray-300",   icon: "🥈" },
  Bronze: { bg: "bg-orange-900/30 border-orange-800", text: "text-orange-400", icon: "🥉" },
};

function TierBadge({ tier }: { tier: "Gold" | "Silver" | "Bronze" }) {
  const s = TIER_STYLES[tier];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${s.bg} ${s.text}`}>
      {s.icon} {tier}
    </span>
  );
}

// ── Award points modal ────────────────────────────────────────────────────────

function AwardModal({ onClose }: { onClose: () => void }) {
  const [customerId,  setCustomerId]  = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [points,      setPoints]      = useState("10");
  const [reason,      setReason]      = useState("");
  const [done,        setDone]        = useState(false);

  const utils    = trpc.useUtils();
  const mutation = trpc.loyalty.awardPoints.useMutation({
    onSuccess: () => {
      utils.loyalty.leaderboard.invalidate();
      utils.loyalty.stats.invalidate();
      setDone(true);
      setTimeout(onClose, 1200);
    },
  });

  const crmQuery = trpc.crm.customers.useQuery({ search: "" });
  const customers = crmQuery.data?.customers ?? [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <Gift className="w-4 h-4 text-[#25D366]" /> Award Points
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Customer</label>
            <select
              value={customerId}
              onChange={e => {
                const cust = customers.find(c => String(c.id) === e.target.value);
                setCustomerId(e.target.value);
                setPhoneNumber(cust?.phone ?? "");
              }}
              className="input w-full mt-1 text-sm"
            >
              <option value="">— select customer —</option>
              {customers.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name ?? "Unknown"} ({c.phone})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">Points to Award</label>
            <input
              type="number" min="1" max="10000"
              value={points} onChange={e => setPoints(e.target.value)}
              className="input w-full mt-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Reason</label>
            <input
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Completed appointment, Referral bonus"
              className="input w-full mt-1 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-600 text-gray-300 text-sm hover:border-gray-500 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate({ customerId: parseInt(customerId), phoneNumber, points: parseInt(points), reason })}
            disabled={!customerId || !reason || mutation.isPending || done}
            className="flex-1 py-2 rounded-xl bg-[#25D366] text-white text-sm font-medium hover:bg-[#20b959] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {done ? <><Check className="w-4 h-4" /> Done!</> : mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Plus className="w-4 h-4" /> Award Points</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Config panel ─────────────────────────────────────────────────────────────

function ConfigPanel({ onClose }: { onClose: () => void }) {
  const utils     = trpc.useUtils();
  const cfgQuery  = trpc.loyalty.getConfig.useQuery();
  const mutation  = trpc.loyalty.updateConfig.useMutation({
    onSuccess: () => { utils.loyalty.getConfig.invalidate(); onClose(); },
  });

  const cfg = cfgQuery.data;
  const [enabled,   setEnabled]   = useState<boolean | null>(null);
  const [ppv,       setPpv]       = useState<string>("");
  const [silver,    setSilver]    = useState<string>("");
  const [gold,      setGold]      = useState<string>("");

  if (cfg && enabled === null) {
    setEnabled(!!cfg.loyaltyEnabled);
    setPpv(String(cfg.loyaltyPointsPerVisit));
    setSilver(String(cfg.loyaltySilverThreshold));
    setGold(String(cfg.loyaltyGoldThreshold));
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 space-y-5">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#25D366]" /> Loyalty Program Settings
        </h2>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Enable Loyalty Program</span>
          <button
            onClick={() => setEnabled(e => !e)}
            className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? "bg-[#25D366]" : "bg-gray-700"}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${enabled ? "left-7" : "left-1"}`} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Points per completed visit</label>
            <input type="number" min="1" value={ppv} onChange={e => setPpv(e.target.value)} className="input w-full mt-1 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">🥈 Silver threshold (pts)</label>
              <input type="number" min="1" value={silver} onChange={e => setSilver(e.target.value)} className="input w-full mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400">🥇 Gold threshold (pts)</label>
              <input type="number" min="1" value={gold} onChange={e => setGold(e.target.value)} className="input w-full mt-1 text-sm" />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-600 text-gray-300 text-sm hover:border-gray-500 transition-colors">Cancel</button>
          <button
            onClick={() => mutation.mutate({
              loyaltyEnabled: !!enabled,
              loyaltyPointsPerVisit: parseInt(ppv),
              loyaltyBronzeThreshold: 0,
              loyaltySilverThreshold: parseInt(silver),
              loyaltyGoldThreshold: parseInt(gold),
            })}
            disabled={mutation.isPending}
            className="flex-1 py-2 rounded-xl bg-[#25D366] text-white text-sm font-medium hover:bg-[#20b959] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const [showAward,  setShowAward]  = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const statsQuery  = trpc.loyalty.stats.useQuery();
  const boardQuery  = trpc.loyalty.leaderboard.useQuery({ limit: 50 });
  const cfgQuery    = trpc.loyalty.getConfig.useQuery();

  const stats = statsQuery.data;
  const board = boardQuery.data ?? [];
  const cfg   = cfgQuery.data;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Loyalty Program</h1>
          <p className="text-gray-400 text-sm mt-1">Reward your most loyal customers and increase retention</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-600 text-gray-300 text-sm hover:border-gray-500 transition-colors">
            <Settings className="w-4 h-4" /> Settings
          </button>
          <button onClick={() => setShowAward(true)} className="flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20b959] text-white text-sm font-medium rounded-xl transition-colors">
            <Gift className="w-4 h-4" /> Award Points
          </button>
        </div>
      </div>

      {/* Program enabled banner */}
      {cfg && !cfg.loyaltyEnabled && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-3 flex items-center gap-3 text-sm">
          <Star className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-300">Loyalty program is <strong>disabled</strong>. Enable it in Settings to automatically award points after each completed appointment.</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4">
          <p className="text-xs text-gray-400">Total Members</p>
          <p className="text-2xl font-bold text-white mt-1">{stats?.totalMembers ?? 0}</p>
        </div>
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-2xl p-4">
          <p className="text-xs text-yellow-400">🥇 Gold</p>
          <p className="text-2xl font-bold text-white mt-1">{stats?.gold ?? 0}</p>
        </div>
        <div className="bg-gray-700/20 border border-gray-500 rounded-2xl p-4">
          <p className="text-xs text-gray-300">🥈 Silver</p>
          <p className="text-2xl font-bold text-white mt-1">{stats?.silver ?? 0}</p>
        </div>
        <div className="bg-orange-900/20 border border-orange-800 rounded-2xl p-4">
          <p className="text-xs text-orange-400">🥉 Bronze</p>
          <p className="text-2xl font-bold text-white mt-1">{stats?.bronze ?? 0}</p>
        </div>
      </div>

      {/* Tier thresholds info */}
      {cfg && (
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "🥉 Bronze", range: "0 pts", color: "text-orange-400 border-orange-800 bg-orange-900/20" },
            { label: "🥈 Silver", range: `${cfg.loyaltySilverThreshold}+ pts`, color: "text-gray-300 border-gray-600 bg-gray-700/20" },
            { label: "🥇 Gold",   range: `${cfg.loyaltyGoldThreshold}+ pts`,   color: "text-yellow-400 border-yellow-700 bg-yellow-900/20" },
          ].map(t => (
            <div key={t.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${t.color}`}>
              <Award className="w-3.5 h-3.5" />
              <span className="font-medium">{t.label}</span>
              <span className="opacity-70">{t.range}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 text-xs text-[#25D366]">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{cfg.loyaltyPointsPerVisit} pts per visit</span>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-[#25D366]" /> Leaderboard
          </h2>
        </div>

        {boardQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : board.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Gift className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No loyalty members yet</p>
            <p className="text-xs mt-1">Points are awarded automatically when loyalty is enabled</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Tier</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {board.map((row, idx) => (
                  <tr key={row.customerId} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-white">{row.name}</p>
                      <p className="text-xs text-gray-500">{row.phoneNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={row.tier as any} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-[#25D366]">{row.total.toLocaleString()}</span>
                      <span className="text-xs text-gray-500 ml-1">pts</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAward  && <AwardModal   onClose={() => setShowAward(false)}  />}
      {showConfig && <ConfigPanel  onClose={() => setShowConfig(false)} />}
    </div>
  );
}
