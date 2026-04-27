import { useState } from "react";
import {
  Ticket, AlertTriangle, CheckCircle, ArrowUpCircle, Clock, Filter,
  RefreshCw, Trash2, X, ChevronDown, Shield, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { trpc } from "../lib/trpc";

// ── Types ──────────────────────────────────────────────────────────────────

interface ITTicket {
  id: string;
  phoneNumber: string;
  contactName?: string;
  category: string;
  priority: "high" | "medium" | "low";
  status: "open" | "resolved" | "escalated";
  description: string;
  answers: Record<string, string>;
  diagnosis?: string;
  createdAt: string;
  resolvedAt?: string;
  slaDeadlineAt?: string;
  slaBreached: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function timeLeft(deadline: string) {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Overdue";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

const PRIORITY_CONFIG = {
  high:   { label: "High",   color: "text-red-600 bg-red-50 border-red-200",     icon: ShieldAlert, dot: "bg-red-500" },
  medium: { label: "Medium", color: "text-yellow-600 bg-yellow-50 border-yellow-200", icon: Shield, dot: "bg-yellow-500" },
  low:    { label: "Low",    color: "text-green-600 bg-green-50 border-green-200",  icon: ShieldCheck, dot: "bg-green-500" },
};

const STATUS_CONFIG = {
  open:      { label: "Open",      color: "text-blue-600 bg-blue-50 border-blue-200",     icon: Clock },
  resolved:  { label: "Resolved",  color: "text-green-600 bg-green-50 border-green-200",  icon: CheckCircle },
  escalated: { label: "Escalated", color: "text-orange-600 bg-orange-50 border-orange-200", icon: ArrowUpCircle },
};

// ── Ticket Card ────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onStatusChange,
  onDelete,
}: {
  ticket: ITTicket;
  onStatusChange: (id: string, status: "open" | "resolved" | "escalated") => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pri = PRIORITY_CONFIG[ticket.priority];
  const sta = STATUS_CONFIG[ticket.status];
  const PriIcon = pri.icon;
  const StaIcon = sta.icon;

  return (
    <div className={`bg-white rounded-xl border shadow-sm transition-all ${ticket.slaBreached && ticket.status !== "resolved" ? "border-red-200 ring-1 ring-red-200" : "border-gray-100"}`}>
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        {/* Priority dot */}
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${pri.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {ticket.contactName || ticket.phoneNumber}
                <span className="ml-2 text-xs font-normal text-gray-400">#{ticket.id.slice(-6)}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{ticket.category}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
              {/* SLA badge */}
              {ticket.status !== "resolved" && (
                <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${ticket.slaBreached ? "bg-red-50 text-red-600 border-red-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                  <Clock className="w-3 h-3" />
                  {ticket.slaBreached ? "SLA Breached" : timeLeft(ticket.slaDeadlineAt!)}
                </span>
              )}
              {/* Priority badge */}
              <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${pri.color}`}>
                <PriIcon className="w-3 h-3" />
                {pri.label}
              </span>
              {/* Status badge */}
              <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${sta.color}`}>
                <StaIcon className="w-3 h-3" />
                {sta.label}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-700 mt-2 line-clamp-2">{ticket.description}</p>

          {/* Expand */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 mt-1.5 transition-colors"
          >
            {expanded ? "Show less" : "Show more"}
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>

          {expanded && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {Object.entries(ticket.answers).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Triage Answers</p>
                  <div className="space-y-1">
                    {Object.entries(ticket.answers).map(([q, a]) => (
                      <div key={q} className="flex gap-2 text-xs">
                        <span className="text-gray-500 flex-shrink-0">•</span>
                        <span className="text-gray-500">{q}:</span>
                        <span className="text-gray-800">{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ticket.diagnosis && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">AI Diagnosis</p>
                  <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2 leading-relaxed">{ticket.diagnosis}</p>
                </div>
              )}
              <div className="text-[10px] text-gray-400">
                Created: {formatDate(ticket.createdAt)}
                {ticket.resolvedAt && ` · Resolved: ${formatDate(ticket.resolvedAt)}`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-4 pb-3 border-t border-gray-50 pt-2.5">
        {ticket.status !== "open" && (
          <button
            onClick={() => onStatusChange(ticket.id, "open")}
            className="flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Clock className="w-3 h-3" /> Reopen
          </button>
        )}
        {ticket.status !== "resolved" && (
          <button
            onClick={() => onStatusChange(ticket.id, "resolved")}
            className="flex items-center gap-1 text-xs bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
          >
            <CheckCircle className="w-3 h-3" /> Resolve
          </button>
        )}
        {ticket.status !== "escalated" && ticket.status !== "resolved" && (
          <button
            onClick={() => onStatusChange(ticket.id, "escalated")}
            className="flex items-center gap-1 text-xs bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
          >
            <ArrowUpCircle className="w-3 h-3" /> Escalate
          </button>
        )}
        <button
          onClick={() => onDelete(ticket.id)}
          className="ml-auto flex items-center gap-1 text-xs bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function TicketDashboard() {
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved" | "escalated">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const { data: tickets = [], refetch } = trpc.tickets.list.useQuery(
    { status: statusFilter, priority: priorityFilter },
    { refetchInterval: 15000 }
  );

  const { data: stats } = trpc.tickets.stats.useQuery(undefined, { refetchInterval: 15000 });

  const updateStatus = trpc.tickets.updateStatus.useMutation({ onSuccess: () => refetch() });
  const deleteTicket = trpc.tickets.delete.useMutation({ onSuccess: () => refetch() });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Ticket className="w-6 h-6 text-blue-600" />
            IT Support Tickets
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Track and manage support tickets from WhatsApp</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total", value: stats.total, color: "bg-gray-50 border-gray-200", valueColor: "text-gray-900" },
            { label: "Open", value: stats.open, color: "bg-blue-50 border-blue-200", valueColor: "text-blue-700" },
            { label: "Resolved", value: stats.resolved, color: "bg-green-50 border-green-200", valueColor: "text-green-700" },
            { label: "Escalated", value: stats.escalated, color: "bg-orange-50 border-orange-200", valueColor: "text-orange-700" },
            { label: "SLA Breached", value: stats.breached, color: stats.breached > 0 ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-200", valueColor: stats.breached > 0 ? "text-red-600" : "text-gray-500" },
            { label: "High Priority", value: stats.highPriority, color: "bg-red-50 border-red-200", valueColor: "text-red-600" },
          ].map(({ label, value, color, valueColor }) => (
            <div key={label} className={`rounded-xl border p-4 ${color}`}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Status:</span>
          {(["all", "open", "resolved", "escalated"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-gray-200 hidden sm:block" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Priority:</span>
          {(["all", "high", "medium", "low"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                priorityFilter === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {(statusFilter !== "all" || priorityFilter !== "all") && (
          <button
            onClick={() => { setStatusFilter("all"); setPriorityFilter("all"); }}
            className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Ticket list */}
      {(tickets as ITTicket[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <Ticket className="w-12 h-12 opacity-20" />
          <p className="text-base font-medium">No tickets found</p>
          <p className="text-sm">IT support tickets will appear here when customers request help via WhatsApp.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(tickets as ITTicket[]).map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              onDelete={(id) => deleteTicket.mutate({ id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
