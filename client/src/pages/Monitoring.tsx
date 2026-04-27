import { useState, useRef, useEffect } from "react";
import {
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  Users,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Clock,
  Phone,
  Activity,
  Lock,
  Bot,
  Zap,
  AlertTriangle,
  Info,
  Send,
  ChevronDown,
  ChevronUp,
  Wrench,
  TrendingUp,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";

// ── Types ────────────────────────────────────────────────────────────────────

type AutoFixAction =
  | "reconnect_whatsapp"
  | "clear_whatsapp_session"
  | "fix_missing_system_prompt"
  | "test_ai_connection"
  | null;

interface DiagIssue {
  severity: "critical" | "warning" | "info";
  tenant: string;
  tenantId: number | null;
  issue: string;
  detail: string;
  recommendation: string;
  autoFixAction: AutoFixAction;
}

interface DiagResult {
  summary: string;
  healthScore: number;
  issues: DiagIssue[];
  generatedAt: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Human-readable labels + descriptions for each fix action
const FIX_META: Record<string, { label: string; confirm: string; icon: string }> = {
  reconnect_whatsapp:      { label: "Reconnect WhatsApp",     confirm: "Reconnect this tenant's WhatsApp session (keeps auth files).",                          icon: "⚡" },
  clear_whatsapp_session:  { label: "Clear Session & Rescan", confirm: "Delete session files and generate a new QR. Tenant must rescan.",                       icon: "🗑️" },
  fix_missing_system_prompt:{ label: "Apply Default Prompt",  confirm: "Apply a generic AI receptionist system prompt. Customise it later in Configuration.",   icon: "📝" },
  test_ai_connection:      { label: "Test AI Connection",     confirm: "Ping the tenant's AI endpoint to verify connectivity.",                                 icon: "🔍" },
};

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Monitoring() {
  const { user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isAdmin = user?.role === "admin";

  const summaryStatsQuery = trpc.admin.getSummaryStats.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  const tenantOverviewQuery = trpc.admin.getTenantOverview.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  const disconnectMutation = trpc.admin.disconnectTenant.useMutation({
    onSuccess: () => { tenantOverviewQuery.refetch(); summaryStatsQuery.refetch(); },
  });

  const reconnectMutation = trpc.admin.reconnectTenant.useMutation({
    onSuccess: () => { tenantOverviewQuery.refetch(); summaryStatsQuery.refetch(); },
  });

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([summaryStatsQuery.refetch(), tenantOverviewQuery.refetch()]);
    setIsRefreshing(false);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-red-100 p-3 rounded-full">
              <Lock className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Access Required</h1>
          <p className="text-gray-600 mb-6">
            You don't have permission to access the monitoring dashboard.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Shield className="w-4 h-4" />
            <span>Admin privileges needed</span>
          </div>
        </div>
      </div>
    );
  }

  const summaryStats = summaryStatsQuery.data;
  const tenants      = tenantOverviewQuery.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Monitoring</h1>
              <p className="text-gray-600 mt-1">Multi-tenant WhatsApp bot platform overview</p>
            </div>
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing || summaryStatsQuery.isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={<Users className="w-6 h-6 text-blue-600" />} bg="bg-blue-100" label="Total Tenants"        value={summaryStats?.totalTenants}    />
          <StatCard icon={<CheckCircle className="w-6 h-6 text-green-600" />} bg="bg-green-100" label="Active Tenants" value={summaryStats?.activeTenants}   />
          <StatCard icon={<Wifi className="w-6 h-6 text-green-600" />} bg="bg-green-100" label="Connected WhatsApp" value={summaryStats?.connectedWhatsApp} />
          <StatCard icon={<MessageSquare className="w-6 h-6 text-purple-600" />} bg="bg-purple-100" label="Messages (24h)" value={summaryStats?.messages24h} />
        </div>

        {/* AI IT Assistant Panel */}
        <AIAssistantPanel tenants={tenants} />

        {/* Tenants Table */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Tenant Overview</h2>
            <p className="text-gray-600 text-sm mt-1">
              {tenants.length} tenants · Auto-refreshes every 10 seconds
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Name / Email","WhatsApp Status","Phone Number","Last Activity","Messages (24h)","Messages (7d)","Actions"].map(h => (
                    <th key={h} className="px-6 py-3 text-left font-semibold text-gray-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenantOverviewQuery.isLoading ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center">
                    <RefreshCw className="w-5 h-5 text-gray-400 animate-spin mx-auto" />
                    <p className="text-gray-600 mt-2">Loading tenants...</p>
                  </td></tr>
                ) : tenants.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-600">No tenants found</td></tr>
                ) : tenants.map(tenant => (
                  <tr key={tenant.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{tenant.name}</p>
                      <p className="text-gray-600 text-xs mt-1">{tenant.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <WhatsAppStatusBadge status={tenant.whatsapp.status} error={tenant.whatsapp.error} />
                    </td>
                    <td className="px-6 py-4">
                      {tenant.whatsapp.phoneNumber
                        ? <div className="flex items-center gap-2 text-gray-900"><Phone className="w-4 h-4 text-gray-400" />{tenant.whatsapp.phoneNumber}</div>
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-6 py-4">
                      {tenant.whatsapp.lastActivity
                        ? <div className="flex items-center gap-2 text-gray-700"><Clock className="w-4 h-4 text-gray-400" /><span className="text-xs">{formatRelativeTime(tenant.whatsapp.lastActivity)}</span></div>
                        : <span className="text-gray-400">Never</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-900 font-medium">
                        <MessageSquare className="w-4 h-4 text-purple-500" />{tenant.stats.messages24h}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{tenant.stats.messages7d}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {tenant.whatsapp.status === "connected" && (
                          <button
                            onClick={() => disconnectMutation.mutate({ tenantId: tenant.id })}
                            disabled={disconnectMutation.isPending}
                            className="px-3 py-1 bg-red-100 hover:bg-red-200 disabled:bg-gray-200 text-red-700 disabled:text-gray-500 text-xs font-medium rounded transition-colors"
                          >
                            {disconnectMutation.isPending ? "..." : "Disconnect"}
                          </button>
                        )}
                        <button
                          onClick={() => reconnectMutation.mutate({ tenantId: tenant.id })}
                          disabled={reconnectMutation.isPending}
                          className="px-3 py-1 bg-blue-100 hover:bg-blue-200 disabled:bg-gray-200 text-blue-700 disabled:text-gray-500 text-xs font-medium rounded transition-colors"
                        >
                          {reconnectMutation.isPending ? "..." : "Reconnect"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI IT Assistant Panel ─────────────────────────────────────────────────────

function AIAssistantPanel({ tenants }: { tenants: any[] }) {
  const [diagResult, setDiagResult]       = useState<DiagResult | null>(null);
  const [chat, setChat]                   = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]         = useState("");
  const [chatOpen, setChatOpen]           = useState(false);
  const [fixingId, setFixingId]           = useState<string | null>(null);
  const [confirmFix, setConfirmFix]       = useState<{ issue: DiagIssue; idx: number } | null>(null);
  const chatEndRef                        = useRef<HTMLDivElement>(null);

  const diagnoseMutation   = trpc.admin.diagnose.useMutation({
    onSuccess: (data) => { setDiagResult(data as DiagResult); setChatOpen(false); },
  });

  const askMutation        = trpc.admin.askAssistant.useMutation({
    onSuccess: (data) => setChat(prev => [...prev, { role: "assistant", content: data.response }]),
  });

  const executeFixMutation = trpc.admin.executeAIFix.useMutation();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  const handleRunDiagnosis = () => diagnoseMutation.mutate();

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChat(prev => [...prev, { role: "user", content: msg }]);

    // Try to detect if the message references a known tenant name
    const mentionedTenant = tenants.find(t =>
      msg.toLowerCase().includes(t.name?.toLowerCase()) ||
      msg.toLowerCase().includes(t.email?.split("@")[0]?.toLowerCase())
    );

    const ctx = diagResult
      ? `Last diagnosis (${diagResult.generatedAt}): health=${diagResult.healthScore}/100. ${diagResult.summary} Issues: ${diagResult.issues.map(i => `[${i.severity}] ${i.tenant}: ${i.issue}`).join("; ")}`
      : "";

    askMutation.mutate({
      message: msg,
      systemContext: ctx,
      tenantId: mentionedTenant?.id,
    });
  };

  const handleFix = async (issue: DiagIssue, idx: number) => {
    if (!issue.autoFixAction) return;
    setConfirmFix(null);
    const key = String(idx);
    setFixingId(key);
    try {
      const result = await executeFixMutation.mutateAsync({
        action: issue.autoFixAction as any,
        tenantId: issue.tenantId ?? undefined,
      });
      const emoji = result.success ? "✅" : "❌";
      const msg = `${emoji} [${issue.issue}] ${result.message}`;
      setChat(prev => [...prev, { role: "assistant", content: msg }]);
      setChatOpen(true);
    } finally {
      setFixingId(null);
    }
  };

  const criticalCount = diagResult?.issues.filter(i => i.severity === "critical").length ?? 0;
  const warningCount  = diagResult?.issues.filter(i => i.severity === "warning").length  ?? 0;

  return (
    <>
    {/* Confirm-fix modal */}
    {confirmFix && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
          <h3 className="text-base font-bold text-gray-900 mb-2">
            {FIX_META[confirmFix.issue.autoFixAction!]?.icon} {FIX_META[confirmFix.issue.autoFixAction!]?.label}
          </h3>
          <p className="text-sm text-gray-600 mb-1">
            <strong>Tenant:</strong> {confirmFix.issue.tenant}
          </p>
          <p className="text-sm text-gray-600 mb-4">
            {FIX_META[confirmFix.issue.autoFixAction!]?.confirm}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setConfirmFix(null)}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >Cancel</button>
            <button
              onClick={() => handleFix(confirmFix.issue, confirmFix.idx)}
              className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >Apply Fix</button>
          </div>
        </div>
      </div>
    )}

    <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
      {/* Panel header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">AI IT Assistant</h2>
            <p className="text-sm text-gray-500">Scans real tenant data · recommends + applies fixes</p>
          </div>
        </div>
        <button
          onClick={handleRunDiagnosis}
          disabled={diagnoseMutation.isPending}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg font-medium transition-colors text-sm"
        >
          {diagnoseMutation.isPending
            ? <><RefreshCw className="w-4 h-4 animate-spin" />Scanning system…</>
            : <><Zap className="w-4 h-4" />Run Diagnosis</>}
        </button>
      </div>

      <div className="p-6 space-y-6">

        {/* Empty state */}
        {!diagResult && !diagnoseMutation.isPending && (
          <div className="text-center py-10 text-gray-400">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-500">No diagnosis yet</p>
            <p className="text-sm mt-1">Click <strong>Run Diagnosis</strong> to let the AI scan your platform</p>
          </div>
        )}

        {/* Loading skeleton */}
        {diagnoseMutation.isPending && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {/* Diagnosis result */}
        {diagResult && !diagnoseMutation.isPending && (
          <div className="space-y-5">

            {/* Health score + summary */}
            <div className="flex flex-col sm:flex-row gap-4">
              <HealthScoreGauge score={diagResult.healthScore} />
              <div className="flex-1 bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-indigo-500" />Executive Summary
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">{diagResult.summary}</p>
                <div className="flex gap-3 mt-3">
                  {criticalCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                      <AlertCircle className="w-3 h-3" />{criticalCount} critical
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" />{warningCount} warnings
                    </span>
                  )}
                  {criticalCount === 0 && warningCount === 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                      <CheckCircle className="w-3 h-3" />All clear
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">
                    {new Date(diagResult.generatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Issues list */}
            {diagResult.issues.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Detected Issues
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    — click an issue to expand · click Fix Now to auto-apply
                  </span>
                </h3>
                {diagResult.issues.map((issue, idx) => (
                  <IssueCard
                    key={idx}
                    issue={issue}
                    idx={idx}
                    isFixing={fixingId === String(idx)}
                    onRequestFix={() => setConfirmFix({ issue, idx })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat section */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
            onClick={() => setChatOpen(o => !o)}
          >
            <span className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              Ask the AI IT Assistant
              {chat.length > 0 && (
                <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">{Math.ceil(chat.length/2)} messages</span>
              )}
            </span>
            {chatOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {chatOpen && (
            <div className="flex flex-col">
              {/* Quick prompt chips */}
              {chat.length === 0 && (
                <div className="flex flex-wrap gap-2 p-3 border-b border-gray-100 bg-indigo-50/40">
                  {[
                    "Why is escalation rate high?",
                    "Which tenant needs attention most?",
                    "How do I fix a disconnected WhatsApp?",
                    "What should I check first?",
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => { setChatInput(q); }}
                      className="text-xs bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-2.5 py-1 rounded-full transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Messages */}
              <div className="max-h-72 overflow-y-auto p-4 space-y-3 bg-white">
                {chat.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    Mention a tenant by name to get live data about them — e.g. "What's wrong with Acme?"
                  </p>
                )}
                {chat.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-indigo-600" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {askMutation.isPending && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-indigo-600 animate-pulse" />
                    </div>
                    <div className="bg-gray-100 rounded-xl rounded-bl-sm px-3 py-2 text-sm text-gray-400">
                      Fetching live data &amp; thinking…
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-200 p-3 flex gap-2 bg-white">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendChat()}
                  placeholder="e.g. 'Why is Tenant X getting escalations?' or 'Test AI for Tenant Y'"
                  disabled={askMutation.isPending}
                  className="flex-1 px-3 py-2 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
                <button
                  onClick={handleSendChat}
                  disabled={askMutation.isPending || !chatInput.trim()}
                  className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IssueCard({ issue, idx, isFixing, onRequestFix }: {
  issue: DiagIssue;
  idx: number;
  isFixing: boolean;
  onRequestFix: () => void;
}) {
  const [expanded, setExpanded] = useState(issue.severity === "critical");

  const severityStyles = {
    critical: { bg: "bg-red-50",    border: "border-red-200",    badge: "bg-red-100 text-red-700",       icon: <AlertCircle className="w-4 h-4 text-red-500" />    },
    warning:  { bg: "bg-yellow-50", border: "border-yellow-200", badge: "bg-yellow-100 text-yellow-700", icon: <AlertTriangle className="w-4 h-4 text-yellow-500" />},
    info:     { bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700",     icon: <Info className="w-4 h-4 text-blue-500" />          },
  }[issue.severity];

  const fixMeta = issue.autoFixAction ? FIX_META[issue.autoFixAction] : null;

  return (
    <div className={`rounded-xl border ${severityStyles.bg} ${severityStyles.border} overflow-hidden`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        {severityStyles.icon}
        <span className="flex-1 text-sm font-medium text-gray-900">{issue.issue}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${severityStyles.badge} max-w-[120px] truncate`}>
          {issue.tenant}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${severityStyles.badge} capitalize`}>
          {issue.severity}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-200/60">
          <p className="text-sm text-gray-600 pt-3">{issue.detail}</p>
          <div className="flex items-start gap-2">
            <Wrench className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700"><span className="font-medium">Recommendation: </span>{issue.recommendation}</p>
          </div>
          {fixMeta && (
            <div className="flex items-center gap-3">
              <button
                onClick={onRequestFix}
                disabled={isFixing}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {isFixing
                  ? <><RefreshCw className="w-3 h-3 animate-spin" />Applying…</>
                  : <><Zap className="w-3 h-3" />{fixMeta.icon} {fixMeta.label}</>}
              </button>
              <span className="text-xs text-gray-400">{fixMeta.confirm}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HealthScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-600"  : score >= 50 ? "text-yellow-600" : "text-red-600";
  const ring  = score >= 80 ? "stroke-green-500": score >= 50 ? "stroke-yellow-500": "stroke-red-500";
  const label = score >= 80 ? "Healthy"         : score >= 50 ? "Issues found"    : "Critical";

  // SVG circle gauge
  const r  = 30;
  const cx = 44;
  const cy = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl px-6 py-4 min-w-[120px]">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="8"
          className={ring}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="text-center -mt-14">
        <p className={`text-2xl font-bold ${color}`}>{score}</p>
        <p className="text-[10px] text-gray-500 font-medium">/ 100</p>
      </div>
      <p className={`text-xs font-semibold mt-6 ${color}`}>{label}</p>
    </div>
  );
}

function StatCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: number | undefined }) {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value ?? "-"}</p>
        </div>
        <div className={`${bg} p-3 rounded-lg`}>{icon}</div>
      </div>
    </div>
  );
}

function WhatsAppStatusBadge({ status, error }: { status: string; error: string | null }) {
  const map: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    connected:    { bg: "bg-green-100",  text: "text-green-700",  icon: <Wifi className="w-3 h-3" />,                          label: "Connected"    },
    qr:           { bg: "bg-yellow-100", text: "text-yellow-700", icon: <Activity className="w-3 h-3 animate-pulse" />,        label: "QR Ready"     },
    connecting:   { bg: "bg-yellow-100", text: "text-yellow-700", icon: <RefreshCw className="w-3 h-3 animate-spin" />,        label: "Connecting"   },
    disconnected: { bg: "bg-gray-100",   text: "text-gray-700",   icon: <WifiOff className="w-3 h-3" />,                      label: "Disconnected" },
    error:        { bg: "bg-red-100",    text: "text-red-700",    icon: <AlertCircle className="w-3 h-3" />,                   label: "Error"        },
  };
  const s = map[status] ?? map.disconnected;
  return (
    <div className="relative group">
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        {s.icon}{s.label}
      </div>
      {error && (
        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
