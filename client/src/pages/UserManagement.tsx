import { useState, useEffect, useRef } from "react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  UserPlus, Pencil, Trash2, Power, PowerOff, X, CheckCircle,
  AlertCircle, Shield, User, Mail, Lock, Eye, EyeOff, Users,
  Smartphone, QrCode, Wifi, WifiOff, Loader2, RefreshCw, Settings, Search,
  MessageSquare, FileText, Clock, Sparkles,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type Role = "admin" | "user";
type SubRole = "owner" | "manager" | "agent" | "viewer";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  subRole?: SubRole | null;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const SUB_ROLE_COLORS: Record<SubRole, string> = {
  owner:   "bg-yellow-500/10 text-yellow-400",
  manager: "bg-blue-500/10 text-blue-400",
  agent:   "bg-purple-500/10 text-purple-400",
  viewer:  "bg-gray-700 text-gray-400",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(d: Date | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Create / Edit Modal ────────────────────────────────────────────────────
function UserModal({
  editing,
  onClose,
  onSaved,
  onCreated,
}: {
  editing: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
  onCreated?: (user: { id: number; name: string }) => void;
}) {
  const isEdit = editing !== null;

  const [name, setName] = useState(editing?.name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [role, setRole] = useState<Role>(editing?.role ?? "user");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const create = trpc.users.create.useMutation({
    onSuccess: (data) => {
      utils.users.list.invalidate();
      onSaved();
      // Trigger WhatsApp setup for the new user
      if (onCreated && data?.id) {
        onCreated({ id: data.id, name });
      }
    },
    onError: e => setError(e.message),
  });
  const update = trpc.users.update.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); onSaved(); },
    onError: e => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isEdit) {
      update.mutate({
        id: editing.id,
        name,
        email,
        role,
        ...(password ? { newPassword: password } : {}),
      });
    } else {
      create.mutate({ name, email, password, role });
    }
  };

  const busy = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-white font-semibold text-lg">
            {isEdit ? "Edit User" : "Add New User"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text" required value={name} onChange={e => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors"
                placeholder="Jane Smith"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors"
                placeholder="jane@example.com"
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Role</label>
            <div className="grid grid-cols-2 gap-3">
              {(["user", "admin"] as Role[]).map(r => (
                <button
                  key={r} type="button"
                  onClick={() => setRole(r)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${role === r ? "bg-[#25D366]/10 border-[#25D366] text-[#25D366]" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"}`}
                >
                  {r === "admin" ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            {role === "admin" && (
              <p className="text-yellow-400 text-xs mt-2 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Admins can manage all users and settings
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              {isEdit ? "New Password (leave blank to keep current)" : "Password"}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type={showPwd ? "text" : "password"}
                required={!isEdit}
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={isEdit && !password ? undefined : 8}
                className="w-full pl-10 pr-10 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors"
                placeholder={isEdit ? "Leave blank to keep current" : "At least 8 characters"}
              />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-medium rounded-lg transition-colors">
              {busy ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── User Detail Modal ───────────────────────────────────────────────────
type DetailTab = "info" | "ai" | "templates" | "knowledge-base" | "business-hours";

function UserDetailModal({
  user,
  onClose,
  onApprove,
  isApproving,
}: {
  user: UserRow;
  onClose: () => void;
  onApprove: () => void;
  isApproving: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("info");
  const [aiForm, setAiForm] = useState({ systemPrompt: "", aiModel: "gemma4:latest" });

  const { data: botConfig } = trpc.botConfig.get.useQuery(
    { tenantId: user.id },
    { enabled: !!user.id && user.emailVerified }
  );

  const updateAIMutation = trpc.admin.updateTenantConfig.useMutation({
    onSuccess: () => {
      // Success handled by parent
    },
  });

  const generatePrompt = trpc.promptExpert.generate.useMutation({
    onSuccess: (data) => {
      if (data?.prompt) {
        setAiForm(f => ({ ...f, systemPrompt: data.prompt }));
      }
    },
  });

  // Load AI config when botConfig is fetched
  useEffect(() => {
    if (botConfig) {
      setAiForm({
        systemPrompt: botConfig.systemPrompt || "",
        aiModel: botConfig.aiModel || "gemma4:latest",
      });
    }
  }, [botConfig]);

  const handleSaveAI = () => {
    if (!aiForm.systemPrompt.trim()) return;
    updateAIMutation.mutate({
      tenantId: user.id,
      systemPrompt: aiForm.systemPrompt.trim(),
      aiModel: aiForm.aiModel.trim(),
    });
  };

  const TABS: Array<{ id: DetailTab; label: string; icon: any }> = [
    { id: "info", label: "User Info", icon: User },
    ...(user.emailVerified ? [
      { id: "ai", label: "AI & Prompt", icon: MessageSquare },
      { id: "templates", label: "Templates", icon: FileText },
      { id: "knowledge-base", label: "Knowledge Base", icon: FileText },
      { id: "business-hours", label: "Business Hours", icon: Clock },
    ] : []),
  ];

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold text-lg">{user.name}</h2>
            <p className="text-gray-400 text-xs mt-1">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-800 bg-gray-900/50 px-6 flex gap-1 overflow-x-auto flex-shrink-0">
          {TABS.map(tab => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap text-sm font-medium ${
                  isActive
                    ? "border-[#25D366] text-white"
                    : "border-transparent text-gray-400 hover:text-gray-300"
                }`}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* User Info Tab */}
          {activeTab === "info" && (
            <div className="space-y-5">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium">Full Name</label>
                <p className="text-white font-medium mt-2">{user.name}</p>
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium">Email Address</label>
                <p className="text-white font-medium mt-2 break-all">{user.email}</p>
              </div>

              {botConfig?.businessName && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium">Business Name</label>
                  <p className="text-white font-medium mt-2">{botConfig.businessName}</p>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium">Signed Up</label>
                <p className="text-white font-medium mt-2">
                  {new Date(user.createdAt).toLocaleDateString("en-ZA", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium">Status</label>
                <div className="mt-2">
                  {user.emailVerified ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#25D366]/10 text-[#25D366]">
                      <CheckCircle className="w-4 h-4" />Verified & Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400">
                      <AlertCircle className="w-4 h-4" />Pending Approval
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AI & Prompt Tab */}
          {activeTab === "ai" && user.emailVerified && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-white">
                    System Prompt <span className="text-red-400">*</span>
                  </label>
                  <button
                    onClick={() => generatePrompt.mutate({ businessName: botConfig?.businessName || user.name })}
                    disabled={generatePrompt.isPending}
                    className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white rounded transition-colors flex items-center gap-1.5"
                    title="Generate prompt using AI"
                  >
                    <Sparkles className="w-3 h-3" />
                    {generatePrompt.isPending ? "Generating..." : "Generate with AI"}
                  </button>
                </div>
                <textarea
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors resize-none"
                  rows={6}
                  value={aiForm.systemPrompt}
                  onChange={e => setAiForm(f => ({ ...f, systemPrompt: e.target.value }))}
                  placeholder="Define how your AI receptionist should behave..."
                />
                {generatePrompt.data && (
                  <p className="text-xs text-gray-400 mt-2">💡 AI-generated prompt loaded. Review and save when ready.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">AI Model</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#25D366] transition-colors"
                  value={aiForm.aiModel}
                  onChange={e => setAiForm(f => ({ ...f, aiModel: e.target.value }))}
                >
                  <option value="gemma4:latest">Gemma 4 (Latest)</option>
                  <option value="llama3.2">Llama 3.2</option>
                  <option value="mistral">Mistral</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                </select>
              </div>
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === "templates" && user.emailVerified && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Templates management coming soon</p>
            </div>
          )}

          {/* Knowledge Base Tab */}
          {activeTab === "knowledge-base" && user.emailVerified && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Knowledge Base management coming soon</p>
            </div>
          )}

          {/* Business Hours Tab */}
          {activeTab === "business-hours" && user.emailVerified && (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Business Hours management coming soon</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 p-6 border-t border-gray-800 flex-shrink-0 bg-gray-900/50">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
          >
            Close
          </button>
          {activeTab === "ai" && user.emailVerified && (
            <button
              onClick={handleSaveAI}
              disabled={!aiForm.systemPrompt.trim() || updateAIMutation.isPending}
              className="flex-1 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
            >
              {updateAIMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          )}
          {activeTab === "info" && !user.emailVerified && (
            <button
              onClick={onApprove}
              disabled={isApproving}
              className="flex-1 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
            >
              {isApproving ? "Approving..." : "Approve User"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Confirm Delete Dialog ──────────────────────────────────────────────────
function ConfirmDeleteDialog({
  isOpen,
  user,
  isLoading,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  user: UserRow | null;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!user) return null;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      type="danger"
      title="Delete User"
      message={`Are you sure you want to permanently delete ${user.name}? This action cannot be undone and will remove all associated data.`}
      confirmLabel="Delete User"
      cancelLabel="Cancel"
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ── WhatsApp QR Setup Modal ────────────────────────────────────────────────
function WhatsAppSetupModal({
  tenantId,
  tenantName,
  onClose,
}: {
  tenantId: number;
  tenantName: string;
  onClose: () => void;
}) {
  const [started, setStarted] = useState(false);
  const scannedRef = useRef(false);
  const [syncSeconds, setSyncSeconds] = useState(0);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initMutation = trpc.admin.initTenantWhatsApp.useMutation({
    onSuccess: () => setStarted(true),
  });

  const { data: waState, refetch } = trpc.admin.getTenantWhatsAppState.useQuery(
    { tenantId },
    {
      enabled: started,
      refetchInterval: started
        ? (q) => {
            const s = (q?.state?.data as any)?.status;
            if (s === 'connected') return false;
            if (s === 'connecting' && scannedRef.current) return 1000;
            return 2000;
          }
        : false,
    }
  );

  const isConnected = waState?.status === "connected";
  const isQrReady = waState?.status === "qr_ready";
  const isConnecting = waState?.status === "connecting";
  const isPostScanSync = isConnecting && scannedRef.current;

  // Detect qr_ready → connecting transition (user scanned)
  useEffect(() => {
    if (isQrReady) scannedRef.current = false;
    if (isConnecting && !waState?.qrDataUrl) scannedRef.current = true;

    if (scannedRef.current && isConnecting) {
      setSyncSeconds(0);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      syncTimerRef.current = setInterval(() => setSyncSeconds(s => s + 1), 1000);
    } else {
      if (syncTimerRef.current) { clearInterval(syncTimerRef.current); syncTimerRef.current = null; }
    }
    if (isConnected) {
      scannedRef.current = false;
      if (syncTimerRef.current) { clearInterval(syncTimerRef.current); syncTimerRef.current = null; }
    }
  }, [isConnecting, isQrReady, isConnected, waState?.qrDataUrl]);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#25D366]/10 rounded-full flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-[#25D366]" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Connect WhatsApp</h2>
              <p className="text-gray-500 text-xs">{tenantName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Not started yet */}
          {!started && (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-[#25D366]/10 rounded-full flex items-center justify-center mx-auto">
                <QrCode className="w-10 h-10 text-[#25D366]" />
              </div>
              <div>
                <p className="text-white font-medium mb-1">Set up WhatsApp for this account</p>
                <p className="text-gray-400 text-sm">
                  Click below to generate a QR code. The business owner scans it with their WhatsApp to connect their number.
                </p>
              </div>
              <button
                onClick={() => initMutation.mutate({ tenantId })}
                disabled={initMutation.isPending}
                className="w-full py-3 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {initMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
                ) : (
                  <><QrCode className="w-4 h-4" /> Generate QR Code</>
                )}
              </button>
              <button onClick={onClose} className="w-full py-2.5 text-gray-400 hover:text-gray-200 text-sm transition-colors">
                Skip for now
              </button>
            </div>
          )}

          {/* Connecting / waiting for QR */}
          {started && isConnecting && !isQrReady && (
            <div className="text-center space-y-4 py-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="w-16 h-16 border-4 border-[#25D366]/20 border-t-[#25D366] rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-[#25D366]/60" />
                </div>
              </div>
              {isPostScanSync ? (
                <>
                  <p className="text-white font-semibold">QR scanned — syncing…</p>
                  <p className="text-gray-400 text-sm">WhatsApp is loading chats and contacts.<br/>This usually takes <span className="text-white font-medium">30–60 seconds</span>.</p>
                  {waState?.loadingPercent != null ? (
                    <div className="w-full space-y-1.5">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{waState.loadingMessage || 'Loading…'}</span>
                        <span className="text-[#25D366] font-medium tabular-nums">{waState.loadingPercent}%</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div
                          className="bg-[#25D366] h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${waState.loadingPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : syncSeconds > 0 ? (
                    <p className="text-[#25D366] text-sm font-medium tabular-nums">{syncSeconds}s elapsed…</p>
                  ) : null}
                  <p className="text-xs text-gray-500">Keep this window open — it will update automatically.</p>
                </>
              ) : (
                <>
                  <p className="text-white font-medium">Starting WhatsApp client…</p>
                  <p className="text-gray-400 text-sm">This may take 15–30 seconds. Please wait.</p>
                </>
              )}
            </div>
          )}

          {/* QR Code ready */}
          {started && isQrReady && waState?.qrDataUrl && (
            <div className="text-center space-y-4">
              <p className="text-white font-medium">Scan with WhatsApp</p>
              <p className="text-gray-400 text-sm">
                Open WhatsApp on the business owner's phone → <strong className="text-gray-300">Linked Devices</strong> → <strong className="text-gray-300">Link a Device</strong> → scan this code.
              </p>
              <div className="bg-white p-3 rounded-xl inline-block mx-auto">
                <img src={waState.qrDataUrl} alt="WhatsApp QR Code" className="w-52 h-52" />
              </div>
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for scan…
              </div>
              <button
                onClick={() => initMutation.mutate({ tenantId })}
                className="flex items-center gap-2 mx-auto text-gray-400 hover:text-white text-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Refresh QR
              </button>
            </div>
          )}

          {/* Connected! */}
          {started && isConnected && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-[#25D366]/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-9 h-9 text-[#25D366]" />
              </div>
              <div>
                <p className="text-white font-semibold text-lg">WhatsApp Connected!</p>
                {waState?.name && (
                  <p className="text-[#25D366] font-medium mt-1">{waState.name}</p>
                )}
                {waState?.phoneNumber && (
                  <p className="text-gray-400 text-sm">+{waState.phoneNumber}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 bg-[#25D366] hover:bg-[#20ba57] text-white font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Error state */}
          {started && waState?.error && !isConnected && !isQrReady && !isConnecting && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                <WifiOff className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <p className="text-white font-medium">Connection failed</p>
                <p className="text-red-400 text-sm mt-1">{waState.error}</p>
              </div>
              <button
                onClick={() => { initMutation.mutate({ tenantId }); setStarted(true); }}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
              <button onClick={onClose} className="w-full py-2.5 text-gray-400 hover:text-gray-200 text-sm transition-colors">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function UserManagement() {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();

  const { data: userList = [], isLoading } = trpc.users.list.useQuery();

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [viewingUser, setViewingUser] = useState<UserRow | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [whatsappSetup, setWhatsappSetup] = useState<{ tenantId: number; tenantName: string } | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const showToast = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 4000);
  };

  const toggleActive = trpc.users.toggleActive.useMutation({
    onSuccess: (data, vars) => {
      utils.users.list.invalidate();
      showToast(true, `User ${data.isActive ? "activated" : "deactivated"} successfully`);
    },
    onError: e => showToast(false, e.message),
  });

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      setDeletingUser(null);
      showToast(true, "User deleted successfully");
    },
    onError: e => showToast(false, e.message),
  });

  const approveTenant = trpc.admin.approveTenant.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      showToast(true, "User approved and trial started!");
    },
    onError: e => showToast(false, e.message),
  });

  // Non-admin gets a read-only notice
  if (me?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Shield className="w-12 h-12 text-gray-600 mb-4" />
        <h2 className="text-white font-semibold text-lg mb-2">Admin Access Required</h2>
        <p className="text-gray-400 text-sm">Only administrators can manage users.</p>
      </div>
    );
  }

  const adminCount = userList.filter(u => u.role === "admin").length;
  const pendingCount = userList.filter(u => !u.emailVerified).length;
  const activeCount = userList.filter(u => u.isActive).length;

  // Filter users based on tab and search
  let filteredList = userList;
  if (filterTab === "pending") {
    filteredList = userList.filter(u => !u.emailVerified);
  } else if (filterTab === "active") {
    filteredList = userList.filter(u => u.isActive && u.emailVerified);
  } else if (filterTab === "inactive") {
    filteredList = userList.filter(u => !u.isActive && u.emailVerified);
  }

  // Apply search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredList = filteredList.filter(u => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));
  }

  return (
    <div className="space-y-6">
      {/* Header with Title & Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">User Management</h1>
          <p className="text-gray-400 text-sm mt-1">Manage all users, approve new signups, and configure tenant settings</p>
        </div>
        <button
          onClick={() => { setEditingUser(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#25D366] hover:bg-[#20ba57] text-white font-medium rounded-lg transition-colors flex-shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${toast.ok ? "bg-green-500/10 border border-green-500/30 text-green-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.text}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: userList.length, color: "text-white", bg: "bg-gray-800" },
          { label: "Admins", value: adminCount, color: "text-yellow-400", bg: "bg-yellow-500/10" },
          { label: "Pending Approval", value: pendingCount, color: "text-orange-400", bg: "bg-orange-500/10" },
          { label: "Active", value: userList.filter(u => u.isActive).length, color: "text-[#25D366]", bg: "bg-[#25D366]/10" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-gray-800 p-4`}>
            <p className="text-gray-400 text-xs mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "pending", "active", "inactive"] as const).map((tab) => {
            const tabLabels = { all: "All Users", pending: "Pending Approval", active: "Active", inactive: "Inactive" };
            const isActive = filterTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#25D366] text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {tabLabels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <Users className="w-6 h-6 animate-pulse mr-2" /> Loading users…
          </div>
        ) : userList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <Users className="w-8 h-8 mb-2 opacity-40" />
            <p>No users yet. Add one to get started.</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <Users className="w-8 h-8 mb-2 opacity-40" />
            <p>No users match your filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left">User</th>
                <th className="px-5 py-3 text-left">Role</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Verification</th>
                <th className="px-5 py-3 text-left">Last Login</th>
                <th className="px-5 py-3 text-left">Joined</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((u, i) => {
                const isSelf = u.id === me?.id;
                const isPending = !u.emailVerified;
                return (
                  <tr
                    key={u.id}
                    onClick={() => setViewingUser(u as UserRow)}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer ${isPending ? "bg-orange-500/5" : ""} ${i === filteredList.length - 1 ? "border-0" : ""}`}
                  >
                    {/* User info */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${u.role === "admin" ? "bg-yellow-500/20" : "bg-[#25D366]/10"}`}>
                          <span className={`font-semibold text-sm ${u.role === "admin" ? "text-yellow-400" : "text-[#25D366]"}`}>
                            {u.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium flex items-center gap-1.5">
                            {u.name}
                            {isSelf && <span className="text-[10px] bg-[#25D366]/10 text-[#25D366] px-1.5 py-0.5 rounded-full">You</span>}
                          </p>
                          <p className="text-gray-500 text-xs">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${u.role === "admin" ? "bg-yellow-500/10 text-yellow-400" : "bg-gray-700 text-gray-300"}`}>
                          {u.role === "admin" ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          {u.role}
                        </span>
                        {(u as any).subRole && (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${SUB_ROLE_COLORS[(u as any).subRole as SubRole] ?? "bg-gray-700 text-gray-400"}`}>
                            {(u as any).subRole}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${u.isActive ? "bg-[#25D366]/10 text-[#25D366]" : "bg-gray-700 text-gray-400"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? "bg-[#25D366]" : "bg-gray-500"}`} />
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Verification */}
                    <td className="px-5 py-4">
                      {u.emailVerified ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#25D366]/10 text-[#25D366]">
                          <CheckCircle className="w-3 h-3" />Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400">
                          <AlertCircle className="w-3 h-3" />Pending
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-gray-400 text-xs">{fmtDate(u.lastLoginAt)}</td>
                    <td className="px-5 py-4 text-gray-400 text-xs">{fmtDate(u.createdAt)}</td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* Connect WhatsApp */}
                        <button
                          onClick={() => setWhatsappSetup({ tenantId: u.id, tenantName: u.name })}
                          className="p-1.5 text-gray-500 hover:text-[#25D366] hover:bg-[#25D366]/10 rounded-lg transition-colors"
                          title="Connect WhatsApp"
                        >
                          <Smartphone className="w-4 h-4" />
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => { setEditingUser(u as UserRow); setShowModal(true); }}
                          className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                          title="Edit user"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {/* Toggle active */}
                        {!isSelf && (
                          <button
                            onClick={() => toggleActive.mutate({ id: u.id })}
                            disabled={toggleActive.isPending}
                            className={`p-1.5 rounded-lg transition-colors ${u.isActive ? "text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10" : "text-gray-500 hover:text-[#25D366] hover:bg-[#25D366]/10"}`}
                            title={u.isActive ? "Deactivate user" : "Activate user"}
                          >
                            {u.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                          </button>
                        )}

                        {/* Delete */}
                        {!isSelf && (
                          <button
                            onClick={() => setDeletingUser(u as UserRow)}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <UserModal
          editing={editingUser}
          onClose={() => { setShowModal(false); setEditingUser(null); }}
          onSaved={() => {
            setShowModal(false);
            setEditingUser(null);
            showToast(true, editingUser ? "User updated!" : "User created successfully!");
          }}
          onCreated={(newUser) => {
            // Open WhatsApp setup modal for the newly created user
            setWhatsappSetup({ tenantId: newUser.id, tenantName: newUser.name });
          }}
        />
      )}

      {whatsappSetup && (
        <WhatsAppSetupModal
          tenantId={whatsappSetup.tenantId}
          tenantName={whatsappSetup.tenantName}
          onClose={() => setWhatsappSetup(null)}
        />
      )}

      <ConfirmDeleteDialog
        isOpen={!!deletingUser}
        user={deletingUser}
        isLoading={deleteUser.isPending}
        onCancel={() => setDeletingUser(null)}
        onConfirm={() => deleteUser.mutate({ id: deletingUser!.id })}
      />

      {viewingUser && (
        <UserDetailModal
          user={viewingUser}
          onClose={() => setViewingUser(null)}
          onApprove={() => {
            approveTenant.mutate({ tenantId: viewingUser.id });
            setViewingUser(null);
          }}
          isApproving={approveTenant.isPending}
        />
      )}
    </div>
  );
}
