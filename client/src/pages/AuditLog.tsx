import { useState } from "react";
import { ShieldCheck, Search, ChevronLeft, ChevronRight, Clock, User, Tag, Info } from "lucide-react";
import { trpc } from "../lib/trpc";

function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "";
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const ACTION_STYLES: Record<string, string> = {
  "appointment.booked":           "bg-green-900/30 text-green-300 border-green-800",
  "appointment.cancelled":        "bg-red-900/30 text-red-300 border-red-800",
  "appointment.status_changed":   "bg-blue-900/30 text-blue-300 border-blue-800",
  "appointment.invoice_generated":"bg-purple-900/30 text-purple-300 border-purple-800",
  "broadcast.sent":               "bg-yellow-900/30 text-yellow-300 border-yellow-800",
  "kb.trained":                   "bg-cyan-900/30 text-cyan-300 border-cyan-800",
  "kb.entry_added":               "bg-cyan-900/30 text-cyan-300 border-cyan-800",
  "kb.entry_deleted":             "bg-orange-900/30 text-orange-300 border-orange-800",
  "customer.imported":            "bg-indigo-900/30 text-indigo-300 border-indigo-800",
  "customer.merged":              "bg-indigo-900/30 text-indigo-300 border-indigo-800",
  "customer.opted_out":           "bg-red-900/30 text-red-300 border-red-800",
  "settings.updated":             "bg-gray-700/60 text-gray-300 border-gray-600",
  "whatsapp.connected":           "bg-emerald-900/30 text-emerald-300 border-emerald-800",
  "whatsapp.disconnected":        "bg-rose-900/30 text-rose-300 border-rose-800",
};

function actionStyle(action: string) {
  return ACTION_STYLES[action] ?? "bg-gray-800/50 text-gray-400 border-gray-700";
}

const LIMIT = 30;

const ACTION_FILTERS = [
  { label: "All Actions", value: "" },
  { label: "Appointments", value: "appointment" },
  { label: "Broadcasts", value: "broadcast" },
  { label: "Knowledge Base", value: "kb" },
  { label: "Customers", value: "customer" },
  { label: "Settings", value: "settings" },
  { label: "WhatsApp", value: "whatsapp" },
];

export default function AuditLog() {
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [days, setDays] = useState(30);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = trpc.audit.list.useQuery({
    limit: LIMIT,
    offset,
    action: actionFilter || undefined,
    days,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const goPage = (page: number) => setOffset((page - 1) * LIMIT);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#25D366]" /> Audit Log
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Track all key actions taken on your account
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Days filter */}
          <select
            value={days}
            onChange={e => { setDays(Number(e.target.value)); setOffset(0); }}
            className="input text-sm px-3 py-1.5"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {/* Action filter chips */}
      <div className="flex gap-2 flex-wrap">
        {ACTION_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setActionFilter(f.value); setOffset(0); }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              actionFilter === f.value
                ? "bg-[#25D366]/20 border-[#25D366] text-[#25D366]"
                : "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="text-sm text-gray-500">
        {isLoading ? "Loading…" : `${total} event${total !== 1 ? "s" : ""} found`}
        {total > 0 && !isLoading && (
          <span className="ml-2">· Page {currentPage} of {Math.max(1, totalPages)}</span>
        )}
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <div className="w-8 h-8 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <ShieldCheck className="w-10 h-10 opacity-20 mb-2" />
            <p>No audit events found for this period.</p>
          </div>
        )}

        {!isLoading && logs.length > 0 && (
          <div className="divide-y divide-gray-800">
            {logs.map(log => {
              const isExpanded = expandedId === log.id;
              const details = log.details as Record<string, unknown> | null;

              return (
                <div key={log.id} className="transition-colors hover:bg-gray-800/20">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="w-full text-left px-5 py-3.5 flex items-start gap-4"
                  >
                    {/* Action badge */}
                    <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium mt-0.5 ${actionStyle(log.action)}`}>
                      {log.action}
                    </span>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        {log.entityType && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {log.entityType}{log.entityId ? ` #${log.entityId}` : ""}
                          </span>
                        )}
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {log.userName ?? "System"}
                        </span>
                      </div>
                      {details && Object.keys(details).length > 0 && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {Object.entries(details).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-gray-400">{timeAgo(log.createdAt)}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">{formatDateTime(log.createdAt)}</p>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && details && (
                    <div className="px-5 pb-4 ml-2">
                      <div className="bg-gray-900/70 border border-gray-700 rounded-xl p-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Info className="w-3.5 h-3.5" /> Event Details
                        </p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                          {Object.entries(details).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-gray-500 flex-shrink-0">{k}:</span>
                              <span className="text-gray-300 truncate">{String(v ?? "—")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => goPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-40 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-800"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const page = i + 1;
              return (
                <button
                  key={page}
                  onClick={() => goPage(page)}
                  className={`w-8 h-8 text-xs rounded-lg transition-colors ${
                    currentPage === page
                      ? "bg-[#25D366] text-white font-bold"
                      : "text-gray-400 hover:bg-gray-800"
                  }`}
                >
                  {page}
                </button>
              );
            })}
            {totalPages > 7 && <span className="text-gray-600 text-xs">…</span>}
          </div>
          <button
            onClick={() => goPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-40 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-800"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
