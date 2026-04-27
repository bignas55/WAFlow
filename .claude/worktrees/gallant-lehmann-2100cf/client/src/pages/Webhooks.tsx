import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Webhook, Plus, Trash2, RefreshCw, CheckCircle, XCircle, Copy, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";

const EVENT_LABELS: Record<string, string> = {
  "appointment.booked": "Appointment Booked",
  "appointment.completed": "Appointment Completed",
  "appointment.cancelled": "Appointment Cancelled",
  "appointment.no_show": "Appointment No-Show",
  "message.received": "Message Received",
  "customer.new": "New Customer",
  "broadcast.sent": "Broadcast Sent",
  "review.received": "Review Received",
  "*": "All Events",
};

function StatusBadge({ status }: { status: number }) {
  return status ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/40 text-green-400">
      <CheckCircle className="w-3 h-3" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-400">
      <XCircle className="w-3 h-3" /> Disabled
    </span>
  );
}

function WebhookLogs({ webhookId }: { webhookId: number }) {
  const { data: logs } = trpc.outboundWebhooks.recentLogs.useQuery({ webhookId, limit: 10 });

  if (!logs?.length) {
    return <p className="text-sm text-gray-500 py-2">No logs yet.</p>;
  }

  return (
    <div className="mt-2 space-y-1">
      {logs.map((log: any) => (
        <div key={log.id} className="flex items-center gap-3 text-xs font-mono bg-[#1a1a2e] rounded px-3 py-1.5">
          <span className={`w-16 shrink-0 ${log.statusCode && log.statusCode < 300 ? "text-green-400" : "text-red-400"}`}>
            {log.statusCode ?? "ERR"}
          </span>
          <span className="text-gray-400 shrink-0">{log.event}</span>
          <span className="text-gray-500 truncate flex-1">
            {log.responseBody ? log.responseBody.slice(0, 80) : log.errorMessage ?? ""}
          </span>
          <span className="text-gray-600 shrink-0">
            {log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (secret: string) => void }) {
  const { data: allEvents } = trpc.outboundWebhooks.availableEvents.useQuery();
  const create = trpc.outboundWebhooks.create.useMutation();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["appointment.booked"]);
  const [error, setError] = useState("");

  const toggleEvent = (ev: string) => {
    if (ev === "*") {
      setSelectedEvents(["*"]);
      return;
    }
    setSelectedEvents(prev => {
      const without = prev.filter(e => e !== "*");
      return without.includes(ev) ? without.filter(e => e !== ev) : [...without, ev];
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) return setError("Name is required");
    if (!url.trim()) return setError("URL is required");
    if (!selectedEvents.length) return setError("Select at least one event");
    try {
      const result = await create.mutateAsync({ name: name.trim(), url: url.trim(), events: selectedEvents });
      onCreated(result.secret);
    } catch (e: any) {
      setError(e.message ?? "Failed to create webhook");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#12122a] border border-white/10 rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 className="text-lg font-semibold text-white mb-4">Add Webhook Endpoint</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">Name</label>
            <input
              className="w-full bg-[#1e1e3a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#25D366]"
              value={name} onChange={e => setName(e.target.value)} placeholder="My Integration"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Endpoint URL</label>
            <input
              className="w-full bg-[#1e1e3a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#25D366]"
              value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-server.com/webhook"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-2">Events to subscribe</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(allEvents ?? Object.keys(EVENT_LABELS)).map((ev: string) => (
                <label key={ev} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-[#25D366]"
                    checked={selectedEvents.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                  />
                  {EVENT_LABELS[ev] ?? ev}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg py-2 text-sm transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={create.isPending}
            className="flex-1 bg-[#25D366] hover:bg-[#1fb855] text-black font-semibold rounded-lg py-2 text-sm transition disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create Webhook"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SecretModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#12122a] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold text-white mb-2">Webhook Secret</h2>
        <p className="text-sm text-gray-400 mb-4">
          Copy this secret now — it won't be shown again. Use it to verify webhook signatures via
          <code className="ml-1 text-[#25D366]">X-WAFlow-Signature</code>.
        </p>
        <div className="bg-[#1e1e3a] rounded-lg px-4 py-3 flex items-center gap-2 border border-white/10">
          <code className="flex-1 text-sm text-green-400 font-mono break-all">{secret}</code>
          <button onClick={copy} className="shrink-0 text-gray-400 hover:text-white transition">
            {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <button onClick={onClose} className="mt-4 w-full bg-[#25D366] hover:bg-[#1fb855] text-black font-semibold rounded-lg py-2 text-sm transition">
          I've saved the secret
        </button>
      </div>
    </div>
  );
}

export default function Webhooks() {
  const utils = trpc.useUtils();
  const { data: webhooks, isLoading } = trpc.outboundWebhooks.list.useQuery();
  const deleteMutation = trpc.outboundWebhooks.delete.useMutation({ onSuccess: () => utils.outboundWebhooks.list.invalidate() });
  const updateMutation = trpc.outboundWebhooks.update.useMutation({ onSuccess: () => utils.outboundWebhooks.list.invalidate() });
  const regenerateMutation = trpc.outboundWebhooks.regenerateSecret.useMutation();
  const testMutation = trpc.outboundWebhooks.test.useMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showSecretFor, setShowSecretFor] = useState<number | null>(null);

  const handleCreated = (secret: string) => {
    setShowCreate(false);
    setNewSecret(secret);
    utils.outboundWebhooks.list.invalidate();
  };

  const handleRegenerate = async (id: number) => {
    const result = await regenerateMutation.mutateAsync({ id });
    setNewSecret(result.secret);
  };

  const handleTest = async (id: number) => {
    await testMutation.mutateAsync({ id });
    alert("Test event fired! Check your endpoint logs.");
  };

  return (
    <div className="space-y-6 p-6">
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {newSecret && (
        <SecretModal secret={newSecret} onClose={() => setNewSecret(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Webhook className="w-6 h-6 text-[#25D366]" /> Outbound Webhooks
          </h1>
          <p className="text-gray-400 text-sm mt-1">Push real-time events to your external systems when things happen in WAFlow.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-black font-semibold px-4 py-2 rounded-lg text-sm transition"
        >
          <Plus className="w-4 h-4" /> Add Endpoint
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-4 text-sm text-blue-300">
        <strong>How it works:</strong> WAFlow sends a signed <code className="text-blue-200">POST</code> request to your endpoint for each subscribed event.
        Verify the signature using the <code className="text-blue-200">X-WAFlow-Signature</code> header (HMAC-SHA256 of the raw body).
        Endpoints that fail 10 consecutive deliveries are automatically disabled.
      </div>

      {/* Webhook list */}
      {isLoading ? (
        <div className="text-gray-400 text-center py-12">Loading…</div>
      ) : !webhooks?.length ? (
        <div className="text-center py-16 text-gray-500">
          <Webhook className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg">No webhooks configured yet</p>
          <p className="text-sm mt-1">Add your first endpoint to start receiving events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh: any) => (
            <div key={wh.id} className="bg-[#12122a] border border-white/10 rounded-xl overflow-hidden">
              {/* Main row */}
              <div className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-white">{wh.name}</span>
                    <StatusBadge status={wh.isActive} />
                  </div>
                  <p className="text-sm text-gray-400 font-mono truncate">{wh.url}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(wh.events ?? []).map((ev: string) => (
                      <span key={ev} className="text-xs bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">
                        {EVENT_LABELS[ev] ?? ev}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Toggle active */}
                  <button
                    onClick={() => updateMutation.mutate({ id: wh.id, isActive: !wh.isActive })}
                    className={`text-xs px-2.5 py-1 rounded-lg transition font-medium ${
                      wh.isActive
                        ? "bg-red-900/30 text-red-400 hover:bg-red-900/50"
                        : "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                    }`}
                  >
                    {wh.isActive ? "Disable" : "Enable"}
                  </button>

                  {/* Test */}
                  <button
                    onClick={() => handleTest(wh.id)}
                    disabled={testMutation.isPending}
                    title="Send test event"
                    className="p-1.5 text-gray-400 hover:text-blue-400 transition"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  {/* Regenerate secret */}
                  <button
                    onClick={() => handleRegenerate(wh.id)}
                    title="Regenerate secret"
                    className="p-1.5 text-gray-400 hover:text-yellow-400 transition"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (confirm("Delete this webhook endpoint?")) deleteMutation.mutate({ id: wh.id });
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {/* Expand logs */}
                  <button
                    onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)}
                    className="p-1.5 text-gray-400 hover:text-white transition"
                  >
                    {expandedId === wh.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Delivery logs */}
              {expandedId === wh.id && (
                <div className="border-t border-white/5 px-4 py-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Recent Deliveries</p>
                  <WebhookLogs webhookId={wh.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
