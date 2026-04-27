import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { User, Lock, Mail, CheckCircle, AlertCircle, Eye, EyeOff, Smartphone, ShieldCheck, ShieldOff, Copy, KeyRound } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // ── Profile fields ─────────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  // ── 2FA state ──────────────────────────────────────────────────────────────
  const { data: meData } = trpc.auth.me.useQuery();
  const is2FAEnabled = (meData as any)?.twoFactorEnabled ?? false;
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "setup" | "backup" | "disable">("idle");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [twoFaError, setTwoFaError] = useState("");
  const [disablePwd, setDisablePwd] = useState("");
  const [copied, setCopied] = useState(false);

  const setup2FA = trpc.auth.setup2FA.useMutation({
    onSuccess: (data: any) => { setQrDataUrl(data.qrDataUrl); setTwoFaStep("setup"); setTwoFaError(""); },
    onError: (e) => setTwoFaError(e.message),
  });
  const confirm2FA = trpc.auth.confirm2FA.useMutation({
    onSuccess: (data: any) => { setBackupCodes(data.backupCodes ?? []); setTwoFaStep("backup"); utils.auth.me.invalidate(); },
    onError: (e) => setTwoFaError(e.message),
  });
  const disable2FA = trpc.auth.disable2FA.useMutation({
    onSuccess: () => { setTwoFaStep("idle"); setDisablePwd(""); setTwoFaError(""); utils.auth.me.invalidate(); },
    onError: (e) => setTwoFaError(e.message),
  });

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Password fields ────────────────────────────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Feedback state ─────────────────────────────────────────────────────────
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: (data) => {
      setProfileMsg({ ok: true, text: "Profile updated successfully!" });
      // Invalidate the auth.me query so the sidebar name refreshes
      utils.auth.me.invalidate();
      setTimeout(() => setProfileMsg(null), 4000);
    },
    onError: (err) => {
      setProfileMsg({ ok: false, text: err.message });
    },
  });

  const changePassword = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      setPwdMsg({ ok: true, text: "Password changed! Please log in again next session." });
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setTimeout(() => setPwdMsg(null), 5000);
    },
    onError: (err) => {
      setPwdMsg({ ok: false, text: err.message });
    },
  });

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    updateProfile.mutate({ name, email });
  };

  const handlePasswordSave = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);

    if (newPwd !== confirmPwd) {
      setPwdMsg({ ok: false, text: "New passwords do not match." });
      return;
    }
    if (newPwd.length < 8) {
      setPwdMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }

    changePassword.mutate({ currentPassword: currentPwd, newPassword: newPwd });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Profile & Security</h1>
        <p className="text-gray-400 text-sm mt-1">Update your name, email address, or password</p>
      </div>

      {/* ── Profile Info Card ───────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#25D366]/20 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-[#25D366]" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Personal Information</h2>
            <p className="text-gray-500 text-xs">Update your display name and email</p>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                minLength={1}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors"
                placeholder="Your full name"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors"
                placeholder="your@email.com"
              />
            </div>
          </div>

          {profileMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${profileMsg.ok ? "bg-green-500/10 border border-green-500/30 text-green-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {profileMsg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {profileMsg.text}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="px-6 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
            >
              {updateProfile.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Password Card ───────────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center">
            <Lock className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Change Password</h2>
            <p className="text-gray-500 text-xs">Use a strong password of at least 8 characters</p>
          </div>
        </div>

        <form onSubmit={handlePasswordSave} className="space-y-4">
          {/* Current password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Current Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPwd}
                onChange={e => setCurrentPwd(e.target.value)}
                required
                className="w-full pl-10 pr-10 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors"
                placeholder="Enter current password"
              />
              <button type="button" onClick={() => setShowCurrent(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type={showNew ? "text" : "password"}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                required
                minLength={8}
                className="w-full pl-10 pr-10 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors"
                placeholder="At least 8 characters"
              />
              <button type="button" onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm new password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                required
                minLength={8}
                className={`w-full pl-10 pr-10 py-2.5 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none transition-colors ${confirmPwd && confirmPwd !== newPwd ? "border-red-500 focus:border-red-500" : "border-gray-700 focus:border-[#25D366]"}`}
                placeholder="Repeat new password"
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPwd && confirmPwd !== newPwd && (
              <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
            )}
          </div>

          {pwdMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${pwdMsg.ok ? "bg-green-500/10 border border-green-500/30 text-green-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {pwdMsg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {pwdMsg.text}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={changePassword.isPending || (!!confirmPwd && confirmPwd !== newPwd)}
              className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-60 text-gray-900 font-medium rounded-lg transition-colors"
            >
              {changePassword.isPending ? "Updating…" : "Update Password"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Account Info ────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-white font-semibold mb-4">Account Details</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center py-2 border-b border-gray-800">
            <span className="text-gray-400">Role</span>
            <span className="text-white capitalize bg-[#25D366]/10 text-[#25D366] px-2.5 py-0.5 rounded-full text-xs font-medium">
              {user?.role ?? "user"}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">User ID</span>
            <span className="text-gray-500 font-mono">#{user?.id}</span>
          </div>
        </div>
      </div>

      {/* ── Two-Factor Authentication ────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${is2FAEnabled ? "bg-[#25D366]/10" : "bg-gray-800"}`}>
            <Smartphone className={`w-5 h-5 ${is2FAEnabled ? "text-[#25D366]" : "text-gray-500"}`} />
          </div>
          <div className="flex-1">
            <h2 className="text-white font-semibold">Two-Factor Authentication</h2>
            <p className="text-gray-500 text-xs">Add a second layer of security with an authenticator app</p>
          </div>
          {is2FAEnabled && (
            <span className="flex items-center gap-1 text-xs bg-[#25D366]/10 text-[#25D366] px-2.5 py-1 rounded-full font-medium">
              <ShieldCheck className="w-3 h-3" /> Enabled
            </span>
          )}
        </div>

        {twoFaError && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{twoFaError}
          </div>
        )}

        {/* Idle: not yet set up */}
        {twoFaStep === "idle" && !is2FAEnabled && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              Use Google Authenticator, Authy, or any TOTP app to protect your account with a 6-digit code on every login.
            </p>
            <button
              onClick={() => { setTwoFaError(""); setup2FA.mutate(); }}
              disabled={setup2FA.isPending}
              className="px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <Smartphone className="w-4 h-4" />
              {setup2FA.isPending ? "Generating…" : "Set up 2FA"}
            </button>
          </div>
        )}

        {/* Step 1: Show QR code */}
        {twoFaStep === "setup" && qrDataUrl && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">Scan the QR code below with your authenticator app, then enter the 6-digit code to confirm.</p>
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-xl inline-block">
                <img src={qrDataUrl} alt="2FA QR Code" className="w-48 h-48" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Verification Code</label>
              <div className="flex gap-3">
                <input
                  value={twoFaCode}
                  onChange={e => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="input flex-1 text-center text-lg tracking-widest font-mono"
                  placeholder="000000"
                  maxLength={6}
                />
                <button
                  onClick={() => { setTwoFaError(""); confirm2FA.mutate({ token: twoFaCode }); }}
                  disabled={twoFaCode.length !== 6 || confirm2FA.isPending}
                  className="px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
                >
                  {confirm2FA.isPending ? "Verifying…" : "Confirm"}
                </button>
              </div>
            </div>
            <button onClick={() => { setTwoFaStep("idle"); setQrDataUrl(""); setTwoFaCode(""); }} className="text-gray-500 hover:text-gray-300 text-sm">
              Cancel
            </button>
          </div>
        )}

        {/* Step 2: Backup codes */}
        {twoFaStep === "backup" && backupCodes.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#25D366]">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">2FA enabled successfully!</span>
            </div>
            <p className="text-gray-400 text-sm">Save these backup codes in a safe place. Each code can be used once if you lose access to your authenticator app.</p>
            <div className="bg-gray-800 rounded-xl p-4 grid grid-cols-2 gap-2">
              {backupCodes.map((c, i) => (
                <span key={i} className="font-mono text-sm text-gray-200 bg-gray-700 rounded px-2 py-1 text-center tracking-wider">{c}</span>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={copyBackupCodes} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm">
                <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy codes"}
              </button>
              <button onClick={() => { setTwoFaStep("idle"); setBackupCodes([]); setTwoFaCode(""); }} className="px-4 py-2 bg-[#25D366] hover:bg-[#20ba57] text-white rounded-lg transition-colors text-sm font-medium">
                Done
              </button>
            </div>
          </div>
        )}

        {/* 2FA already enabled: show disable option */}
        {twoFaStep === "idle" && is2FAEnabled && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Your account is protected. Enter your password to disable two-factor authentication.</p>
            {twoFaStep === "idle" && (
              <button
                onClick={() => { setTwoFaStep("disable"); setTwoFaError(""); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-medium rounded-lg transition-colors text-sm"
              >
                <ShieldOff className="w-4 h-4" /> Disable 2FA
              </button>
            )}
          </div>
        )}

        {/* Disable flow */}
        {twoFaStep === "disable" && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Enter your password to confirm disabling two-factor authentication.</p>
            <div className="flex gap-3">
              <input
                type="password"
                value={disablePwd}
                onChange={e => setDisablePwd(e.target.value)}
                className="input flex-1"
                placeholder="Your current password"
              />
              <button
                onClick={() => { setTwoFaError(""); disable2FA.mutate({ password: disablePwd }); }}
                disabled={!disablePwd || disable2FA.isPending}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
              >
                {disable2FA.isPending ? "Disabling…" : "Disable"}
              </button>
              <button onClick={() => { setTwoFaStep("idle"); setDisablePwd(""); setTwoFaError(""); }} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
