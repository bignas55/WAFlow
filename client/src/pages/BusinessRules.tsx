import { useState } from "react";
import {
  Zap, Plus, Trash2, ToggleLeft, ToggleRight, Edit2,
  ChevronDown, ChevronUp, Save, X, CheckCircle, AlertTriangle,
  MessageSquare, Clock, TrendingDown, UserX, CalendarCheck,
  Send, Bell, Tag, ArrowUpCircle,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import { Spinner } from "../components/ui/Spinner";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: "keyword",     label: "Keyword Match",       icon: MessageSquare, desc: "Fires when a message contains a specific word or phrase" },
  { value: "sentiment",   label: "Negative Sentiment",  icon: TrendingDown,  desc: "Fires when AI detects negative customer sentiment" },
  { value: "escalation",  label: "Escalation",          icon: UserX,         desc: "Fires when a conversation is escalated to a human agent" },
  { value: "appointment", label: "Appointment Event",   icon: CalendarCheck, desc: "Fires on appointment booked, confirmed, or cancelled" },
  { value: "time",        label: "Time-Based",          icon: Clock,         desc: "Fires at a scheduled time or after a delay" },
] as const;

const ACTION_TYPES = [
  { value: "send_message",      label: "Send a Message",      icon: Send,           desc: "Auto-reply with a custom WhatsApp message" },
  { value: "notify_agent",      label: "Notify Agent",        icon: Bell,           desc: "Send an internal alert to the assigned agent" },
  { value: "tag_conversation",  label: "Tag Conversation",    icon: Tag,            desc: "Automatically apply a label to the conversation" },
  { value: "escalate",          label: "Escalate to Agent",   icon: ArrowUpCircle,  desc: "Hand off the conversation to a human agent" },
  { value: "book_appointment",  label: "Suggest Booking",     icon: CalendarCheck,  desc: "Send the customer your booking link" },
] as const;

type TriggerType = typeof TRIGGER_TYPES[number]["value"];
type ActionType  = typeof ACTION_TYPES[number]["value"];

interface Rule {
  id: number;
  name: string;
  description?: string | null;
  triggerType: TriggerType;
  triggerConfig: Record<string, any>;
  actionType: ActionType;
  actionConfig: Record<string, any>;
  isActive: boolean;
  executionCount: number;
  createdAt: string | Date;
}

// ── Trigger config editors ────────────────────────────────────────────────────

function TriggerConfigEditor({
  type, config, onChange,
}: { type: TriggerType; config: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  if (type === "keyword") return (
    <div className="space-y-2">
      <label className="text-xs text-gray-500">Keywords (comma-separated)</label>
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
        placeholder="e.g. cancel, refund, help"
        value={config.keywords ?? ""}
        onChange={e => onChange({ ...config, keywords: e.target.value })}
      />
      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
        <input type="checkbox" checked={!!config.caseSensitive}
          onChange={e => onChange({ ...config, caseSensitive: e.target.checked })}
          className="rounded" />
        Case sensitive
      </label>
    </div>
  );

  if (type === "sentiment") return (
    <div className="space-y-2">
      <label className="text-xs text-gray-500">Minimum negative score (1–10)</label>
      <input type="number" min={1} max={10}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
        value={config.minScore ?? 6}
        onChange={e => onChange({ ...config, minScore: Number(e.target.value) })}
      />
    </div>
  );

  if (type === "appointment") return (
    <div className="space-y-2">
      <label className="text-xs text-gray-500">Event</label>
      <select
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
        value={config.event ?? "booked"}
        onChange={e => onChange({ ...config, event: e.target.value })}
      >
        <option value="booked">Appointment Booked</option>
        <option value="confirmed">Appointment Confirmed</option>
        <option value="cancelled">Appointment Cancelled</option>
        <option value="no_show">No Show</option>
      </select>
    </div>
  );

  if (type === "time") return (
    <div className="space-y-2">
      <label className="text-xs text-gray-500">Delay after trigger event (hours)</label>
      <input type="number" min={0}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
        value={config.delayHours ?? 1}
        onChange={e => onChange({ ...config, delayHours: Number(e.target.value) })}
      />
    </div>
  );

  return <p className="text-xs text-gray-400 italic">No additional configuration needed.</p>;
}

// ── Action config editors ─────────────────────────────────────────────────────

function ActionConfigEditor({
  type, config, onChange,
}: { type: ActionType; config: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  if (type === "send_message") return (
    <div className="space-y-2">
      <label className="text-xs text-gray-500">Message to send</label>
      <textarea rows={3}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
        placeholder="Hi {{name}}, we noticed your message — how can we help?"
        value={config.message ?? ""}
        onChange={e => onChange({ ...config, message: e.target.value })}
      />
      <p className="text-xs text-gray-400">Use &#123;&#123;name&#125;&#125; for customer name.</p>
    </div>
  );

  if (type === "notify_agent") return (
    <div className="space-y-2">
      <label className="text-xs text-gray-500">Notification message</label>
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
        placeholder="Customer needs immediate attention"
        value={config.message ?? ""}
        onChange={e => onChange({ ...config, message: e.target.value })}
      />
    </div>
  );

  if (type === "tag_conversation") return (
    <div className="space-y-2">
      <label className="text-xs text-gray-500">Tag to apply</label>
      <input
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
        placeholder="e.g. urgent, vip, complaint"
        value={config.tag ?? ""}
        onChange={e => onChange({ ...config, tag: e.target.value })}
      />
    </div>
  );

  return <p className="text-xs text-gray-400 italic">No additional configuration needed.</p>;
}

// ── Empty default configs ─────────────────────────────────────────────────────

function defaultTriggerConfig(type: TriggerType): Record<string, any> {
  if (type === "keyword")     return { keywords: "", caseSensitive: false };
  if (type === "sentiment")   return { minScore: 6 };
  if (type === "appointment") return { event: "booked" };
  if (type === "time")        return { delayHours: 1 };
  return {};
}

function defaultActionConfig(type: ActionType): Record<string, any> {
  if (type === "send_message")    return { message: "" };
  if (type === "notify_agent")    return { message: "" };
  if (type === "tag_conversation") return { tag: "" };
  return {};
}

// ── Rule card ─────────────────────────────────────────────────────────────────

function RuleCard({
  rule, onEdit, onDelete, onToggle,
}: {
  rule: Rule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const trigger = TRIGGER_TYPES.find(t => t.value === rule.triggerType);
  const action  = ACTION_TYPES.find(a => a.value === rule.actionType);
  const TIcon = trigger?.icon ?? Zap;
  const AIcon = action?.icon  ?? Send;

  return (
    <div className={`bg-white border rounded-xl p-4 flex flex-col gap-3 shadow-sm transition-all ${rule.isActive ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${rule.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${rule.isActive ? "bg-green-500" : "bg-gray-400"}`} />
              {rule.isActive ? "Active" : "Inactive"}
            </span>
            <span className="text-xs text-gray-400">{rule.executionCount} runs</span>
          </div>
          <h3 className="font-semibold text-gray-900 truncate">{rule.name}</h3>
          {rule.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{rule.description}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Toggle">
            {rule.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
          </button>
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors" title="Edit">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Trigger → Action pill row */}
      <div className="flex items-center gap-2 text-xs">
        <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full">
          <TIcon className="w-3 h-3" />
          <span>{trigger?.label ?? rule.triggerType}</span>
        </div>
        <span className="text-gray-300">→</span>
        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
          <AIcon className="w-3 h-3" />
          <span>{action?.label ?? rule.actionType}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BusinessRules() {
  const utils = trpc.useUtils();
  const { data: rawRules = [], isLoading } = trpc.businessRules.list.useQuery();
  const rules = rawRules as Rule[];

  const createMutation = trpc.businessRules.create.useMutation({
    onSuccess: () => { utils.businessRules.list.invalidate(); setShowForm(false); },
  });
  const updateMutation = trpc.businessRules.update.useMutation({
    onSuccess: () => { utils.businessRules.list.invalidate(); setShowForm(false); setEditingRule(null); },
  });
  const deleteMutation = trpc.businessRules.delete.useMutation({
    onSuccess: () => utils.businessRules.list.invalidate(),
  });
  const toggleMutation = trpc.businessRules.toggleActive.useMutation({
    onSuccess: () => utils.businessRules.list.invalidate(),
  });

  const [showForm, setShowForm]         = useState(false);
  const [editingRule, setEditingRule]   = useState<Rule | null>(null);
  const [saved, setSaved]               = useState(false);

  // Form state
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("keyword");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>(defaultTriggerConfig("keyword"));
  const [actionType, setActionType]   = useState<ActionType>("send_message");
  const [actionConfig, setActionConfig]   = useState<Record<string, any>>(defaultActionConfig("send_message"));

  function openCreate() {
    setEditingRule(null);
    setName(""); setDescription("");
    setTriggerType("keyword"); setTriggerConfig(defaultTriggerConfig("keyword"));
    setActionType("send_message"); setActionConfig(defaultActionConfig("send_message"));
    setShowForm(true);
  }

  function openEdit(rule: Rule) {
    setEditingRule(rule);
    setName(rule.name);
    setDescription(rule.description ?? "");
    setTriggerType(rule.triggerType);
    setTriggerConfig(rule.triggerConfig ?? {});
    setActionType(rule.actionType);
    setActionConfig(rule.actionConfig ?? {});
    setShowForm(true);
  }

  function handleTriggerTypeChange(t: TriggerType) {
    setTriggerType(t);
    setTriggerConfig(defaultTriggerConfig(t));
  }

  function handleActionTypeChange(a: ActionType) {
    setActionType(a);
    setActionConfig(defaultActionConfig(a));
  }

  async function handleSubmit() {
    const payload = { name, description, triggerType, triggerConfig, actionType, actionConfig, isActive: true };
    if (editingRule) {
      await updateMutation.mutateAsync({ ...payload, id: editingRule.id });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  const activeCount   = rules.filter((r: Rule) => r.isActive).length;
  const totalRuns     = rules.reduce((sum: number, r: Rule) => sum + (r.executionCount ?? 0), 0);
  const isPending     = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-purple-500" /> Business Rules
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Automate responses and actions based on triggers — no coding required.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Rules", value: rules.length, color: "text-gray-900" },
          { label: "Active",      value: activeCount,  color: "text-green-600" },
          { label: "Total Runs",  value: totalRuns,    color: "text-purple-600" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
            <div className={`text-2xl font-bold ${s.color}`}>{String(s.value)}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Rule form (create / edit) */}
      {showForm && (
        <div className="bg-white border border-purple-200 rounded-2xl shadow-lg p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingRule ? "Edit Rule" : "New Automation Rule"}
            </h2>
            <button onClick={() => { setShowForm(false); setEditingRule(null); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Name + description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Rule Name *</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="e.g. Auto-tag complaints"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Description (optional)</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="What does this rule do?"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Trigger section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-purple-700 flex items-center gap-1.5">
                <Zap className="w-4 h-4" /> When this happens…
              </h3>
              <div className="space-y-2">
                {TRIGGER_TYPES.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      onClick={() => handleTriggerTypeChange(t.value)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                        triggerType === t.value
                          ? "border-purple-400 bg-purple-50"
                          : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${triggerType === t.value ? "text-purple-600" : "text-gray-400"}`} />
                      <div>
                        <div className={`text-sm font-medium ${triggerType === t.value ? "text-purple-700" : "text-gray-700"}`}>{t.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="pt-1 border-t border-gray-100">
                <TriggerConfigEditor type={triggerType} config={triggerConfig} onChange={setTriggerConfig} />
              </div>
            </div>

            {/* Action section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                <Send className="w-4 h-4" /> Do this…
              </h3>
              <div className="space-y-2">
                {ACTION_TYPES.map(a => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.value}
                      onClick={() => handleActionTypeChange(a.value)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                        actionType === a.value
                          ? "border-blue-400 bg-blue-50"
                          : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${actionType === a.value ? "text-blue-600" : "text-gray-400"}`} />
                      <div>
                        <div className={`text-sm font-medium ${actionType === a.value ? "text-blue-700" : "text-gray-700"}`}>{a.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{a.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="pt-1 border-t border-gray-100">
                <ActionConfigEditor type={actionType} config={actionConfig} onChange={setActionConfig} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => { setShowForm(false); setEditingRule(null); }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending || !name.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Spinner size="sm" className="border-white border-t-purple-200" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {isPending ? "Saving…" : saved ? "Saved!" : editingRule ? "Update Rule" : "Create Rule"}
            </button>
          </div>
        </div>
      )}

      {/* Rules grid */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : rules.length === 0 ? (
        <div className="text-center py-20 bg-white border border-dashed border-gray-200 rounded-2xl">
          <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No automation rules yet</h3>
          <p className="text-sm text-gray-400 mb-5">Create rules to automatically respond, tag, or escalate conversations.</p>
          <button onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors">
            <Plus className="w-4 h-4" /> Create your first rule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(rules as Rule[]).map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => openEdit(rule)}
              onDelete={() => deleteMutation.mutate({ id: rule.id })}
              onToggle={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
            />
          ))}
        </div>
      )}

      {/* Help callout */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
        <p className="text-xs text-purple-700">
          <strong>Note:</strong> Rules are evaluated in creation order when a message arrives.
          Time-based rules run on a background scheduler. Keyword rules match the full incoming message text.
          Each rule logs an execution count every time it fires.
        </p>
      </div>
    </div>
  );
}
