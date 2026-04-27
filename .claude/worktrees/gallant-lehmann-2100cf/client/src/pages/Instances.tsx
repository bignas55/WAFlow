import { useState } from "react";
import {
  Server, Plus, RefreshCw, Send, Shield, ShieldOff,
  Wifi, WifiOff, Cloud, Monitor, Copy, CheckCircle2,
  AlertCircle, Clock, ChevronDown, ChevronUp, Loader2,
  ExternalLink, Key, Mail,
} from "lucide-react";
import { trpc } from "../lib/trpc";

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan = "free" | "starter" | "pro" | "enterprise";

const PLAN_COLORS: Record<Plan, string> = {
  free:       "bg-gray-700 text-gray-300",
  starter:    "bg-blue-900 text-blue-300",
  pro:        "bg-purple-900 text-purple-300",
  enterprise: "bg-amber-900 text-amber-300",
};

function planBadge(plan: Plan) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}>
      {plan}
    </span>
  );
}

// ── Create Client Modal ───────────────────────────────────────────────────────

function CreateClientModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const createMutation = trpc.license.createClient.useMutation({ onSuccess });

  const [form, setForm] = useState({
    clientName:  "",
    clientEmail: "",
    plan:        "starter" as Plan,
    selfHosted:  false,
    notes:       "",
    expiresAt:   "",
  });

  const f = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-lg shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
          <Plus className="w-5 h-5 text-[#25D366]" /> Add New Client
        </h2>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1">Client / Business Name <span className="text-red-400">*</span></label>
              <input className="input w-full" placeholder="Acme Dental Clinic" value={form.clientName} onChange={e => f("clientName", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1">Client Email <span className="text-red-400">*</span></label>
              <input className="input w-full" type="email" placeholder="owner@acmedental.co.za" value={form.clientEmail} onChange={e => f("clientEmail", e.target.value)} />
              <p className="text-xs text-gray-600 mt-0.5">They'll receive an invite at this address</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Plan</label>
              <select className="input w-full" value={form.plan} onChange={e => f("plan", e.target.value as Plan)}>
                <option value="free">Free (500 msg/mo)</option>
                <option value="starter">Starter (2 000 msg/mo)</option>
                <option value="pro">Pro (10 000 msg/mo)</option>
                <option value="enterprise">Enterprise (Unlimited)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">License Expires</label>
              <input className="input w-full" type="date" value={form.expiresAt} onChange={e => f("expiresAt", e.target.value)} />
              <p className="text-xs text-gray-600 mt-0.5">Leave blank = no expiry</p>
            </div>
          </div>

          {/* Hosting type */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => f("selfHosted", false)}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${!form.selfHosted ? "bg-[#25D366]/10 border-[#25D366]" : "bg-gray-800 border-gray-700 hover:border-gray-600"}`}
            >
              <Cloud className={`w-5 h-5 ${!form.selfHosted ? "text-[#25D366]" : "text-gray-500"}`} />
              <div className="text-left">
                <p className={`text-sm font-medium ${!form.selfHosted ? "text-white" : "text-gray-400"}`}>Cloud Hosted</p>
                <p className="text-xs text-gray-500">You host, client logs in</p>
              </div>
            </button>
            <button
              onClick={() => f("selfHosted", true)}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${form.selfHosted ? "bg-[#25D366]/10 border-[#25D366]" : "bg-gray-800 border-gray-700 hover:border-gray-600"}`}
            >
              <Monitor className={`w-5 h-5 ${form.selfHosted ? "text-[#25D366]" : "text-gray-500"}`} />
              <div className="text-left">
                <p className={`text-sm font-medium ${form.selfHosted ? "text-white" : "text-gray-400"}`}>Self-Hosted</p>
                <p className="text-xs text-gray-500">Client installs locally</p>
              </div>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Notes (internal)</label>
            <textarea className="input w-full" rows={2} placeholder="e.g. Referred by John, on 3-month trial..." value={form.notes} onChange={e => f("notes", e.target.value)} />
          </div>
        </div>

        {createMutation.isError && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl p-3 border border-red-700/50">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {(createMutation.error as any)?.message ?? "Failed to create client"}
          </div>
        )}

        {createMutation.isSuccess && (
          <div className="mt-3 flex items-center gap-2 text-green-400 text-sm bg-green-900/20 rounded-xl p-3 border border-green-700/50">
            <CheckCircle2 className="w-4 h-4" /> Client created! Invite email sent.
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => createMutation.mutate(form)}
            disabled={!form.clientName || !form.clientEmail || createMutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Create & Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Instance Row ──────────────────────────────────────────────────────────────

function InstanceRow({ client, onRefresh }: { client: any; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied]     = useState(false);

  const updateMutation  = trpc.license.updateClient.useMutation({ onSuccess: onRefresh });
  const resendMutation  = trpc.license.resendInvite.useMutation({ onSuccess: onRefresh });

  const isOnline  = client.online === true;
  const isOffline = client.online === false;
  const isCloud   = client.online === null;

  const copyKey = () => {
    navigator.clipboard.writeText(client.licenseKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const hbData = client.lastHeartbeatData as Record<string, any> | null;

  return (
    <div className={`bg-gray-800/50 rounded-xl border transition-colors ${expanded ? "border-gray-600" : "border-gray-700/50"}`}>
      {/* Main row */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Status dot */}
        <div className="flex-shrink-0">
          {isCloud   && <Cloud   className="w-5 h-5 text-blue-400" />}
          {isOnline  && <Monitor className="w-5 h-5 text-green-400" />}
          {isOffline && <Monitor className="w-5 h-5 text-gray-600" />}
        </div>

        {/* Name + email */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium text-sm">{client.clientName}</span>
            {planBadge(client.plan)}
            {!client.isActive && (
              <span className="text-[10px] bg-red-900 text-red-300 px-2 py-0.5 rounded-full font-bold">SUSPENDED</span>
            )}
            {!client.inviteAcceptedAt && (
              <span className="text-[10px] bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full">INVITE PENDING</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{client.clientEmail}</p>
        </div>

        {/* Heartbeat / connection status */}
        <div className="text-right flex-shrink-0 hidden sm:block">
          {client.selfHosted ? (
            <div className="flex items-center gap-1.5">
              {isOnline
                ? <><Wifi    className="w-3.5 h-3.5 text-green-400" /><span className="text-xs text-green-400">Online</span></>
                : <><WifiOff className="w-3.5 h-3.5 text-gray-600" /><span className="text-xs text-gray-500">{client.lastHeartbeatAt ? "Offline" : "Never connected"}</span></>
              }
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-blue-400">
              <Cloud className="w-3.5 h-3.5" />
              <span className="text-xs">Cloud</span>
            </div>
          )}
          {client.instanceVersion && (
            <p className="text-xs text-gray-600 mt-0.5">v{client.instanceVersion}</p>
          )}
        </div>

        {/* Expand */}
        <div className="flex-shrink-0 text-gray-600">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-700/50 p-4 space-y-4">
          {/* License key */}
          <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-3">
            <Key className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <code className="text-xs text-gray-400 flex-1 font-mono">{client.licenseKey}</code>
            <button onClick={copyKey} className="text-gray-500 hover:text-gray-300 transition-colors">
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Hosting",    value: client.selfHosted ? "Self-hosted" : "Cloud" },
              { label: "Expires",    value: client.expiresAt ? new Date(client.expiresAt).toLocaleDateString() : "Never" },
              { label: "Invite",     value: client.inviteAcceptedAt ? "Accepted " + new Date(client.inviteAcceptedAt).toLocaleDateString() : "Pending" },
              { label: "Last seen",  value: client.lastHeartbeatAt ? new Date(client.lastHeartbeatAt).toLocaleString() : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-900/50 rounded-lg p-2.5">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xs text-gray-300 font-medium mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Heartbeat data (self-hosted only) */}
          {hbData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {hbData.waConnected !== undefined && (
                <div className="bg-gray-900/50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-500">WhatsApp</p>
                  <p className={`text-xs font-medium mt-0.5 ${hbData.waConnected ? "text-green-400" : "text-red-400"}`}>
                    {hbData.waConnected ? "Connected" : "Disconnected"}
                  </p>
                </div>
              )}
              {hbData.messagesLast24h !== undefined && (
                <div className="bg-gray-900/50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-500">Msgs (24h)</p>
                  <p className="text-xs text-gray-300 font-medium mt-0.5">{hbData.messagesLast24h}</p>
                </div>
              )}
              {hbData.uptime !== undefined && (
                <div className="bg-gray-900/50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-500">Uptime</p>
                  <p className="text-xs text-gray-300 font-medium mt-0.5">{Math.round(hbData.uptime / 3600)}h</p>
                </div>
              )}
              {hbData.memoryMB !== undefined && (
                <div className="bg-gray-900/50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-500">Memory</p>
                  <p className="text-xs text-gray-300 font-medium mt-0.5">{hbData.memoryMB} MB</p>
                </div>
              )}
            </div>
          )}

          {/* Instance URL (self-hosted) */}
          {client.instanceUrl && (
            <a href={client.instanceUrl} target="_blank" rel="noreferrer"
               className="flex items-center gap-2 text-blue-400 text-xs hover:underline">
              <ExternalLink className="w-3.5 h-3.5" />
              {client.instanceUrl}
            </a>
          )}

          {client.notes && (
            <p className="text-xs text-gray-500 italic">📝 {client.notes}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap pt-1">
            {/* Suspend / Activate */}
            <button
              onClick={() => updateMutation.mutate({ id: client.id, isActive: !client.isActive })}
              disabled={updateMutation.isPending}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                client.isActive
                  ? "border-red-700/50 text-red-400 hover:bg-red-900/20"
                  : "border-green-700/50 text-green-400 hover:bg-green-900/20"
              }`}
            >
              {client.isActive
                ? <><ShieldOff className="w-3.5 h-3.5" /> Suspend</>
                : <><Shield    className="w-3.5 h-3.5" /> Activate</>
              }
            </button>

            {/* Resend invite */}
            {!client.inviteAcceptedAt && (
              <button
                onClick={() => resendMutation.mutate({ id: client.id })}
                disabled={resendMutation.isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-yellow-700/50 text-yellow-400 hover:bg-yellow-900/20 transition-colors"
              >
                {resendMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Mail className="w-3.5 h-3.5" />
                }
                Resend Invite
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ clients }: { clients: any[] }) {
  const total      = clients.length;
  const cloud      = clients.filter(c => !c.selfHosted).length;
  const selfHosted = clients.filter(c => c.selfHosted).length;
  const online     = clients.filter(c => c.online === true).length;
  const suspended  = clients.filter(c => !c.isActive).length;
  const pending    = clients.filter(c => !c.inviteAcceptedAt).length;

  const cards = [
    { label: "Total Clients",    value: total,      icon: Server,       color: "text-[#25D366]" },
    { label: "Cloud Hosted",     value: cloud,      icon: Cloud,        color: "text-blue-400"  },
    { label: "Self-Hosted",      value: selfHosted, icon: Monitor,      color: "text-purple-400"},
    { label: "Currently Online", value: online,     icon: Wifi,         color: "text-green-400" },
    { label: "Pending Invite",   value: pending,    icon: Mail,         color: "text-yellow-400"},
    { label: "Suspended",        value: suspended,  icon: ShieldOff,    color: "text-red-400"   },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3">
          <Icon className={`w-4 h-4 ${color} mb-1.5`} />
          <p className="text-xl font-bold text-white">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Instances() {
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "cloud" | "self-hosted" | "pending">("all");

  const { data: clients = [], refetch, isLoading } = trpc.license.listClients.useQuery(undefined, {
    refetchInterval: 30_000, // refresh every 30s to catch new heartbeats
  });

  const filtered = clients.filter(c => {
    if (filter === "cloud")       return !c.selfHosted;
    if (filter === "self-hosted") return c.selfHosted;
    if (filter === "pending")     return !c.inviteAcceptedAt;
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Server className="w-6 h-6 text-[#25D366]" /> Client Instances
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage cloud tenants and self-hosted WAFlow deployments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary p-2" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 px-4">
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards clients={clients} />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", "cloud", "self-hosted", "pending"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
              filter === f
                ? "bg-[#25D366] border-[#25D366] text-white"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            {f === "all" ? `All (${clients.length})` : f === "pending" ? `Pending Invite (${clients.filter(c => !c.inviteAcceptedAt).length})` : f === "self-hosted" ? `Self-Hosted (${clients.filter(c => c.selfHosted).length})` : `Cloud (${clients.filter(c => !c.selfHosted).length})`}
          </button>
        ))}
      </div>

      {/* Client list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#25D366] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-gray-800/30 rounded-2xl border border-dashed border-gray-700">
          <Server className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No clients yet</p>
          <p className="text-gray-600 text-sm mt-1 mb-4">Add your first client to get started</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 mx-auto">
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(client => (
            <InstanceRow key={client.id} client={client} onRefresh={refetch} />
          ))}
        </div>
      )}

      {/* Self-hosted install instructions */}
      <div className="mt-8 bg-gray-800/50 rounded-2xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Monitor className="w-4 h-4 text-purple-400" /> Self-Hosted Install Instructions
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Share these steps with clients who want to run WAFlow on their own machine or server.
        </p>
        <div className="space-y-2">
          {[
            { step: "1", cmd: "curl -fsSL https://get.waflow.app/install.sh | bash", desc: "Download & run the installer" },
            { step: "2", cmd: "WAFLOW_LICENSE_KEY=WAFL-XXXX-XXXX-XXXX-XXXX docker compose up -d", desc: "Start WAFlow with their license key" },
            { step: "3", cmd: "# Open http://localhost:3000 and complete the setup wizard", desc: "Access the dashboard" },
          ].map(({ step, cmd, desc }) => (
            <div key={step} className="flex gap-3">
              <span className="w-5 h-5 bg-[#25D366]/20 text-[#25D366] rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{step}</span>
              <div>
                <code className="text-xs text-gray-300 bg-gray-900 px-2 py-0.5 rounded font-mono">{cmd}</code>
                <p className="text-xs text-gray-600 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreate && (
        <CreateClientModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); refetch(); }}
        />
      )}
    </div>
  );
}
