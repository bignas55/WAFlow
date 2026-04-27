import { useState } from "react";
import {
  CreditCard, TrendingUp, Users, DollarSign, RefreshCw,
  CheckCircle, XCircle, Edit2, RotateCcw, AlertTriangle,
  ChevronDown, ChevronUp, Lock,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";

const PLANS = [
  { key: "free",       label: "Free",       price: 0,   messages: 500,    color: "gray"   },
  { key: "starter",    label: "Starter",    price: 299, messages: 2000,   color: "blue"   },
  { key: "pro",        label: "Pro",        price: 699, messages: 10000,  color: "purple" },
  { key: "enterprise", label: "Enterprise", price: 0,   messages: 999999, color: "gold"   },
] as const;

const PLAN_COLORS: Record<string, string> = {
  free:       "bg-gray-100 text-gray-700 border-gray-200",
  starter:    "bg-blue-100 text-blue-700 border-blue-200",
  pro:        "bg-purple-100 text-purple-700 border-purple-200",
  enterprise: "bg-amber-100 text-amber-700 border-amber-200",
};

type PlanKey = "free" | "starter" | "pro" | "enterprise";

export default function Billing() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [editingTenant, setEditingTenant] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    plan: PlanKey; price: string; expiresAt: string; notes: string;
  }>({ plan: "free", price: "0", expiresAt: "", notes: "" });

  const summaryQ = trpc.billing.getSummary.useQuery(undefined, { enabled: isAdmin });
  const tenantsQ = trpc.billing.listTenantBilling.useQuery(undefined, { enabled: isAdmin, refetchInterval: 30000 });
  const myBillingQ = trpc.billing.getMyBilling.useQuery(undefined, { enabled: !isAdmin });

  const updatePlanMut = trpc.billing.updatePlan.useMutation({
    onSuccess: () => { setEditingTenant(null); tenantsQ.refetch(); summaryQ.refetch(); },
  });
  const resetUsageMut = trpc.billing.resetUsage.useMutation({
    onSuccess: () => tenantsQ.refetch(),
  });
  const setActiveMut = trpc.billing.setActive.useMutation({
    onSuccess: () => tenantsQ.refetch(),
  });

  // ── Tenant (non-admin) view ───────────────────────────────────────────────
  if (!isAdmin) {
    const b = myBillingQ.data;
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <CreditCard className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Billing & Plan</h1>
        </div>

        {myBillingQ.isLoading ? (
          <div className="animate-pulse h-40 bg-gray-100 rounded-xl" />
        ) : b ? (
          <div className="bg-white border border-gray-200 rounded-xl shadow p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Current Plan</p>
                <p className="text-2xl font-bold text-gray-900">{b.planLabel}</p>
              </div>
              <span className={`text-sm font-semibold px-3 py-1.5 rounded-full border ${PLAN_COLORS[b.plan]}`}>
                {b.plan}
              </span>
            </div>

            {b.isExpired && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Your plan has expired. Please contact your administrator.
              </div>
            )}

            {/* Usage bar */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-700">Messages this month</span>
                <span className="text-gray-500">
                  {b.messagesUsedThisMonth?.toLocaleString()} / {b.messageLimit >= 999999 ? "Unlimited" : b.messageLimit?.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${b.usagePct >= 90 ? "bg-red-500" : b.usagePct >= 70 ? "bg-yellow-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.min(100, b.usagePct ?? 0)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{b.usagePct}% used</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500">Monthly Price</p>
                <p className="font-semibold text-gray-900">
                  {parseFloat(String(b.monthlyPrice ?? 0)) === 0 ? "Free" : `R${b.monthlyPrice}/mo`}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500">Resets</p>
                <p className="font-semibold text-gray-900">
                  {b.billingResetAt ? new Date(b.billingResetAt).toLocaleDateString() : "Monthly"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Admin view ────────────────────────────────────────────────────────────
  const summary = summaryQ.data;
  const tenants = tenantsQ.data ?? [];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CreditCard className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing Management</h1>
          <p className="text-gray-500 text-sm">Manage tenant subscriptions and usage</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={<Users className="w-5 h-5 text-blue-600" />} bg="bg-blue-50" label="Total Tenants" value={summary?.totalTenants ?? "-"} />
        <SummaryCard icon={<CheckCircle className="w-5 h-5 text-green-600" />} bg="bg-green-50" label="Active" value={summary?.activeTenants ?? "-"} />
        <SummaryCard icon={<DollarSign className="w-5 h-5 text-purple-600" />} bg="bg-purple-50" label="MRR" value={summary ? `R${summary.monthlyRevenue.toLocaleString()}` : "-"} />
        <SummaryCard icon={<TrendingUp className="w-5 h-5 text-amber-600" />} bg="bg-amber-50" label="Pro/Enterprise" value={summary ? (summary.byPlan.pro ?? 0) + (summary.byPlan.enterprise ?? 0) : "-"} />
      </div>

      {/* Tenant table */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Tenant Subscriptions</h2>
          <button onClick={() => tenantsQ.refetch()} className="text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Tenant","Plan","Usage","Price/mo","Expires","Status","Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <>
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-400">{t.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${PLAN_COLORS[t.plan] ?? ""}`}>
                        {t.planLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                        <div
                          className={`h-2 rounded-full ${t.usagePct >= 90 ? "bg-red-500" : t.usagePct >= 70 ? "bg-yellow-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(100, t.usagePct)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        {t.messagesUsedThisMonth} / {t.messageLimit >= 999999 ? "∞" : t.messageLimit} ({t.usagePct}%)
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">
                      {parseFloat(String(t.monthlyPrice ?? 0)) === 0 ? "Free" : `R${t.monthlyPrice}`}
                    </td>
                    <td className="px-4 py-3">
                      {t.planExpiresAt
                        ? <span className={new Date(t.planExpiresAt) < new Date() ? "text-red-600 font-medium" : "text-gray-600"}>
                            {new Date(t.planExpiresAt).toLocaleDateString()}
                          </span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {t.isActive
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Active</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Suspended</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingTenant(editingTenant === t.id ? null : t.id);
                            setEditForm({
                              plan:      t.plan as PlanKey,
                              price:     String(t.monthlyPrice ?? 0),
                              expiresAt: t.planExpiresAt ? new Date(t.planExpiresAt).toISOString().split("T")[0] : "",
                              notes:     t.notes ?? "",
                            });
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit plan"
                        >
                          {editingTenant === t.id ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => resetUsageMut.mutate({ tenantId: t.id })}
                          disabled={resetUsageMut.isPending}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Reset monthly usage"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setActiveMut.mutate({ tenantId: t.id, isActive: !t.isActive })}
                          disabled={setActiveMut.isPending}
                          className={`p-1.5 rounded transition-colors ${t.isActive ? "text-gray-400 hover:text-red-600 hover:bg-red-50" : "text-gray-400 hover:text-green-600 hover:bg-green-50"}`}
                          title={t.isActive ? "Suspend tenant" : "Activate tenant"}
                        >
                          {t.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Edit row */}
                  {editingTenant === t.id && (
                    <tr key={`edit-${t.id}`} className="bg-blue-50 border-b border-blue-100">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
                            <select
                              value={editForm.plan}
                              onChange={e => {
                                const p = e.target.value as PlanKey;
                                const def = PLANS.find(pl => pl.key === p);
                                setEditForm(f => ({ ...f, plan: p, price: String(def?.price ?? 0) }));
                              }}
                              className="w-full text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {PLANS.map(p => (
                                <option key={p.key} value={p.key}>{p.label} ({p.messages >= 999999 ? "Unlimited" : p.messages.toLocaleString()} msgs)</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Price (R)</label>
                            <input
                              type="number"
                              min="0"
                              value={editForm.price}
                              onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                              className="w-full text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Expires (optional)</label>
                            <input
                              type="date"
                              value={editForm.expiresAt}
                              onChange={e => setEditForm(f => ({ ...f, expiresAt: e.target.value }))}
                              className="w-full text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                            <input
                              type="text"
                              value={editForm.notes}
                              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                              placeholder="Internal notes…"
                              className="w-full text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => updatePlanMut.mutate({
                              tenantId:      t.id,
                              plan:          editForm.plan,
                              monthlyPrice:  parseFloat(editForm.price) || 0,
                              planExpiresAt: editForm.expiresAt || undefined,
                              notes:         editForm.notes || undefined,
                            })}
                            disabled={updatePlanMut.isPending}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm rounded-lg transition-colors"
                          >
                            {updatePlanMut.isPending ? "Saving…" : "Save Changes"}
                          </button>
                          <button
                            onClick={() => setEditingTenant(null)}
                            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                        {t.notes && <p className="text-xs text-gray-500 mt-2">Current notes: {t.notes}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan reference */}
      <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
        <h3 className="font-bold text-gray-900 mb-4">Plan Reference</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {PLANS.map(p => (
            <div key={p.key} className={`rounded-xl border p-4 ${PLAN_COLORS[p.key]}`}>
              <p className="font-bold text-base">{p.label}</p>
              <p className="text-sm mt-1">{p.messages >= 999999 ? "Unlimited" : p.messages.toLocaleString()} messages/mo</p>
              <p className="text-lg font-bold mt-2">{p.price === 0 ? "Custom" : `R${p.price}/mo`}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow p-5 flex items-center gap-4">
      <div className={`${bg} p-3 rounded-lg`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
