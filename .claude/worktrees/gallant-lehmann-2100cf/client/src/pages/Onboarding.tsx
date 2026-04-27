import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap, Building2, Bot, Smartphone, CheckCircle2,
  ArrowRight, ArrowLeft, Loader2, Check, AlertCircle,
  RefreshCw, Wifi, WifiOff, ChevronRight,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";

// ── Types ────────────────────────────────────────────────────────────────────

interface StepConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

const STEPS: StepConfig[] = [
  { id: "welcome",  label: "Welcome",       icon: Zap,         description: "Get started" },
  { id: "business", label: "Business Info", icon: Building2,   description: "Your details" },
  { id: "ai",       label: "AI Setup",      icon: Bot,         description: "Configure AI" },
  { id: "whatsapp", label: "WhatsApp",      icon: Smartphone,  description: "Connect" },
  { id: "done",     label: "All Done",      icon: CheckCircle2, description: "Complete" },
];

const TIMEZONES = [
  "Africa/Johannesburg", "Africa/Nairobi", "Africa/Lagos", "Africa/Cairo",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney",
];

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done    = i < current;
        const active  = i === current;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                done   ? "bg-[#25D366] border-[#25D366]" :
                active ? "bg-gray-800 border-[#25D366]" :
                         "bg-gray-900 border-gray-700"
              }`}>
                {done
                  ? <Check className="w-4 h-4 text-white" />
                  : <Icon className={`w-4 h-4 ${active ? "text-[#25D366]" : "text-gray-600"}`} />
                }
              </div>
              <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                active ? "text-[#25D366]" : done ? "text-gray-400" : "text-gray-600"
              }`}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 sm:w-12 mb-4 mx-1 transition-colors duration-300 ${i < current ? "bg-[#25D366]" : "bg-gray-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Welcome step ─────────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 bg-[#25D366]/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Zap className="w-10 h-10 text-[#25D366]" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-3">Welcome to WAFlow!</h2>
      <p className="text-gray-400 mb-8 max-w-md mx-auto leading-relaxed">
        Let's get your AI receptionist up and running in just a few minutes. We'll walk you through
        setting up your business info, configuring the AI, and connecting WhatsApp.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 text-left">
        {[
          { icon: Building2,  title: "Business Info",   desc: "Set your name, hours & timezone" },
          { icon: Bot,        title: "AI Receptionist", desc: "Craft your bot's personality" },
          { icon: Smartphone, title: "WhatsApp",        desc: "Scan QR to go live" },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <Icon className="w-5 h-5 text-[#25D366] mb-2" />
            <p className="text-white text-sm font-medium">{title}</p>
            <p className="text-gray-500 text-xs mt-1">{desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="btn-primary px-8 py-3 text-base flex items-center gap-2 mx-auto"
      >
        Let's Start <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Business Info step ────────────────────────────────────────────────────────

function BusinessStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data: config } = trpc.botConfig.get.useQuery();
  const updateMutation = trpc.botConfig.update.useMutation({
    onSuccess: () => { utils.botConfig.get.invalidate(); onNext(); },
  });

  const [form, setForm] = useState({
    businessName: "",
    timezone: "Africa/Johannesburg",
    enableBusinessHours: false,
    businessHoursStart: "09:00",
    businessHoursEnd: "17:00",
    afterHoursMessage: "",
  });

  useEffect(() => {
    if (config) {
      setForm({
        businessName: config.businessName || "",
        timezone: config.businessHoursTimezone || "Africa/Johannesburg",
        enableBusinessHours: config.businessHoursEnabled ?? false,
        businessHoursStart: config.businessHoursStart || "09:00",
        businessHoursEnd: config.businessHoursEnd || "17:00",
        afterHoursMessage: config.afterHoursMessage || "",
      });
    }
  }, [config]);

  const handleSubmit = () => {
    if (!form.businessName.trim()) return;
    updateMutation.mutate({
      businessName: form.businessName.trim(),
      businessHoursTimezone: form.timezone,
      businessHoursEnabled: form.enableBusinessHours,
      businessHoursStart: form.businessHoursStart,
      businessHoursEnd: form.businessHoursEnd,
      afterHoursMessage: form.afterHoursMessage || `Hi! We're currently outside business hours. We'll get back to you as soon as possible. 🙏`,
    });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Business Information</h2>
      <p className="text-gray-400 text-sm mb-6">Tell us about your business so the AI can introduce itself correctly.</p>

      <div className="space-y-5">
        {/* Business name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Business Name <span className="text-red-400">*</span></label>
          <input
            className="input w-full"
            placeholder="e.g. Acme Dental Clinic"
            value={form.businessName}
            onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
          />
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Timezone</label>
          <select
            className="input w-full"
            value={form.timezone}
            onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        {/* Business hours toggle */}
        <div className="flex items-center justify-between bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div>
            <p className="text-sm font-medium text-white">Enable Business Hours</p>
            <p className="text-xs text-gray-500 mt-0.5">Send after-hours messages outside of working hours</p>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, enableBusinessHours: !f.enableBusinessHours }))}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${form.enableBusinessHours ? "bg-[#25D366]" : "bg-gray-600"}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${form.enableBusinessHours ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>

        {/* Hours range */}
        {form.enableBusinessHours && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Opens at</label>
              <input type="time" className="input w-full" value={form.businessHoursStart}
                onChange={e => setForm(f => ({ ...f, businessHoursStart: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Closes at</label>
              <input type="time" className="input w-full" value={form.businessHoursEnd}
                onChange={e => setForm(f => ({ ...f, businessHoursEnd: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1">After-hours message</label>
              <textarea
                className="input w-full"
                rows={2}
                placeholder="Hi! We're currently closed. We'll get back to you soon. 🙏"
                value={form.afterHoursMessage}
                onChange={e => setForm(f => ({ ...f, afterHoursMessage: e.target.value }))}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-8">
        <button onClick={onBack} className="btn-secondary flex items-center gap-2 px-5">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={!form.businessName.trim() || updateMutation.isPending}
          className="btn-primary flex items-center gap-2 px-6 flex-1"
        >
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save & Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── AI Setup step ─────────────────────────────────────────────────────────────

function AIStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data: config } = trpc.botConfig.get.useQuery();
  const updateMutation = trpc.botConfig.update.useMutation({
    onSuccess: () => { utils.botConfig.get.invalidate(); onNext(); },
  });
  const checkAI = trpc.botConfig.checkAI.useQuery(undefined, { enabled: false });

  const [form, setForm] = useState({
    systemPrompt: "",
    aiApiUrl: "https://api.groq.com/openai/v1",
    aiApiKey: "",
    aiModel: "llama3-8b-8192",
  });
  const [aiStatus, setAiStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    if (config) {
      setForm({
        systemPrompt: config.systemPrompt || DEFAULT_PROMPT(config.businessName),
        aiApiUrl: config.aiApiUrl || "https://api.groq.com/openai/v1",
        aiApiKey: config.aiApiKey || "",
        aiModel: config.aiModel || "llama3-8b-8192",
      });
    }
  }, [config]);

  const DEFAULT_PROMPT = (name = "our business") =>
    `You are a friendly and professional AI receptionist for ${name}. Your role is to:\n- Answer customer questions accurately and helpfully\n- Help book appointments when requested\n- Escalate complex issues to a human agent\n- Always maintain a warm, professional tone\n\nKeep responses concise (2-3 sentences max). Never make up information. If you don't know something, say so politely.`;

  const testConnection = async () => {
    setAiStatus("checking");
    setAiError("");
    try {
      const result = await checkAI.refetch();
      if (result.data?.ok) {
        setAiStatus("ok");
      } else {
        setAiStatus("error");
        setAiError(result.data?.error || "Connection failed");
      }
    } catch {
      setAiStatus("error");
      setAiError("Could not reach AI endpoint");
    }
  };

  const handleSubmit = () => {
    if (!form.systemPrompt.trim()) return;
    updateMutation.mutate({
      systemPrompt: form.systemPrompt.trim(),
      aiApiUrl: form.aiApiUrl.trim(),
      aiApiKey: form.aiApiKey.trim(),
      aiModel: form.aiModel.trim(),
    });
  };

  const PRESET_PROVIDERS = [
    { name: "Groq (Free)", url: "https://api.groq.com/openai/v1", model: "llama3-8b-8192" },
    { name: "OpenAI",      url: "https://api.openai.com/v1",       model: "gpt-4o-mini" },
    { name: "Ollama",      url: "http://host.docker.internal:11434/v1", model: "gemma4:latest" },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">AI Receptionist</h2>
      <p className="text-gray-400 text-sm mb-6">Configure how your AI will speak and which model it uses.</p>

      <div className="space-y-5">
        {/* Quick presets */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Quick Provider Presets</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_PROVIDERS.map(p => (
              <button
                key={p.name}
                onClick={() => setForm(f => ({ ...f, aiApiUrl: p.url, aiModel: p.model }))}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  form.aiApiUrl === p.url
                    ? "bg-[#25D366]/20 border-[#25D366] text-[#25D366]"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* API URL */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">AI API URL</label>
          <input className="input w-full font-mono text-sm" placeholder="https://api.groq.com/openai/v1"
            value={form.aiApiUrl} onChange={e => setForm(f => ({ ...f, aiApiUrl: e.target.value }))} />
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">API Key</label>
          <input className="input w-full font-mono text-sm" type="password" placeholder="sk-... or gsk_..."
            value={form.aiApiKey} onChange={e => setForm(f => ({ ...f, aiApiKey: e.target.value }))} />
          <p className="text-xs text-gray-600 mt-1">Leave as "ollama" if using local Ollama</p>
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Model</label>
          <input className="input w-full font-mono text-sm" placeholder="llama3-8b-8192"
            value={form.aiModel} onChange={e => setForm(f => ({ ...f, aiModel: e.target.value }))} />
        </div>

        {/* Test connection */}
        <div className="flex items-center gap-3">
          <button
            onClick={testConnection}
            disabled={aiStatus === "checking" || !form.aiApiUrl}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {aiStatus === "checking" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Test Connection
          </button>
          {aiStatus === "ok" && (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <Wifi className="w-3.5 h-3.5" /> Connected
            </span>
          )}
          {aiStatus === "error" && (
            <span className="flex items-center gap-1.5 text-sm text-red-400">
              <WifiOff className="w-3.5 h-3.5" /> {aiError}
            </span>
          )}
        </div>

        {/* System prompt */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            System Prompt <span className="text-red-400">*</span>
          </label>
          <textarea
            className="input w-full font-mono text-sm leading-relaxed"
            rows={7}
            placeholder="You are a helpful AI receptionist for..."
            value={form.systemPrompt}
            onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
          />
          <p className="text-xs text-gray-600 mt-1">{form.systemPrompt.length} chars · Aim for 200–600 characters</p>
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button onClick={onBack} className="btn-secondary flex items-center gap-2 px-5">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={!form.systemPrompt.trim() || updateMutation.isPending}
          className="btn-primary flex items-center gap-2 px-6 flex-1"
        >
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save & Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── WhatsApp step ─────────────────────────────────────────────────────────────

function WhatsAppStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data: qrStatus, refetch } = trpc.whatsapp.qrStatus.useQuery(undefined, {
    refetchInterval: 3000,
  });
  const connectMutation = trpc.whatsapp.qrConnect.useMutation();

  const connected  = qrStatus?.status === "connected";
  const qrReady    = qrStatus?.status === "qr_ready";
  const connecting = qrStatus?.status === "connecting" || connectMutation.isPending;

  const handleConnect = () => {
    connectMutation.mutate();
    setTimeout(() => refetch(), 2000);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Connect WhatsApp</h2>
      <p className="text-gray-400 text-sm mb-6">
        Link your WhatsApp account by scanning the QR code with your phone.
      </p>

      {/* Status */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border mb-6 ${
        connected ? "bg-green-900/20 border-green-700" :
        qrReady   ? "bg-blue-900/20  border-blue-700"  :
                    "bg-gray-800/50  border-gray-700"
      }`}>
        <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-400 animate-pulse" : qrReady ? "bg-blue-400 animate-pulse" : "bg-gray-600"}`} />
        <div>
          <p className="text-sm font-medium text-white">
            {connected ? "WhatsApp Connected ✅" : qrReady ? "QR Code Ready — Scan Now" : connecting ? "Connecting..." : "Not connected"}
          </p>
          {connected && <p className="text-xs text-gray-400 mt-0.5">Your WhatsApp is live and ready to receive messages</p>}
          {qrReady  && <p className="text-xs text-gray-400 mt-0.5">Open WhatsApp → Settings → Linked Devices → Link a Device</p>}
        </div>
      </div>

      {/* QR code */}
      {qrReady && qrStatus?.qrDataUrl && (
        <div className="flex flex-col items-center mb-6">
          <div className="bg-white p-4 rounded-2xl shadow-lg">
            <img src={qrStatus.qrDataUrl} alt="QR Code" className="w-52 h-52 object-contain" />
          </div>
          <p className="text-xs text-gray-500 mt-3">QR code expires in ~60 seconds — it will refresh automatically</p>
        </div>
      )}

      {/* Connect button */}
      {!connected && !qrReady && (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="btn-primary flex items-center gap-2 mb-6"
        >
          {connecting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating QR...</>
            : <><Smartphone className="w-4 h-4" /> Generate QR Code</>
          }
        </button>
      )}

      {/* Skip option */}
      {!connected && (
        <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-3 mb-6">
          <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-yellow-300">
            You can skip this step and connect WhatsApp later from the Dashboard. The AI won't respond to messages until WhatsApp is connected.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary flex items-center gap-2 px-5">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {connected ? (
          <button onClick={onNext} className="btn-primary flex items-center gap-2 px-6 flex-1">
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={onNext} className="btn-secondary flex items-center gap-2 px-6 flex-1 opacity-70 hover:opacity-100">
            Skip for now <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Done step ─────────────────────────────────────────────────────────────────

function DoneStep({ onFinish, isLoading }: { onFinish: () => void; isLoading: boolean }) {
  return (
    <div className="text-center">
      <div className="relative w-24 h-24 mx-auto mb-6">
        <div className="w-24 h-24 bg-[#25D366]/20 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-[#25D366]" />
        </div>
        <div className="absolute inset-0 rounded-full border-4 border-[#25D366]/30 animate-ping" style={{ animationDuration: "2s" }} />
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">You're all set! 🎉</h2>
      <p className="text-gray-400 mb-8 max-w-sm mx-auto">
        Your AI receptionist is configured and ready. Head to the dashboard to monitor conversations and fine-tune your setup.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-8 text-left max-w-sm mx-auto">
        {[
          { icon: "📊", label: "Dashboard",     desc: "Monitor live activity" },
          { icon: "💬", label: "Inbox",          desc: "Manage conversations" },
          { icon: "🧠", label: "Train AI",       desc: "Upload knowledge docs" },
          { icon: "📋", label: "Templates",      desc: "Create quick replies" },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="bg-gray-800/50 rounded-xl p-3 border border-gray-700">
            <p className="text-lg mb-1">{icon}</p>
            <p className="text-white text-sm font-medium">{label}</p>
            <p className="text-gray-500 text-xs">{desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onFinish}
        disabled={isLoading}
        className="btn-primary px-10 py-3 text-base flex items-center gap-2 mx-auto"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Go to Dashboard <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Main Onboarding Page ──────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const completeMutation = trpc.botConfig.completeOnboarding.useMutation({
    onSuccess: () => {
      utils.botConfig.getOnboardingStatus.invalidate();
      navigate("/", { replace: true });
    },
  });

  const [step, setStep] = useState(0); // 0 = welcome, 1 = business, 2 = ai, 3 = whatsapp, 4 = done

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  // Admin users don't need onboarding
  if (user?.role === "admin") {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-[#25D366] rounded-xl flex items-center justify-center">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <span className="text-white font-bold text-xl">WAFlow</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-xl bg-gray-900 rounded-2xl border border-gray-800 p-6 sm:p-8 shadow-2xl">
        <StepIndicator current={step} />

        <div>
          {step === 0 && <WelcomeStep onNext={next} />}
          {step === 1 && <BusinessStep onNext={next} onBack={back} />}
          {step === 2 && <AIStep onNext={next} onBack={back} />}
          {step === 3 && <WhatsAppStep onNext={next} onBack={back} />}
          {step === 4 && (
            <DoneStep
              onFinish={() => completeMutation.mutate()}
              isLoading={completeMutation.isPending}
            />
          )}
        </div>
      </div>

      {/* Progress text */}
      <p className="text-gray-600 text-xs mt-4">
        Step {step + 1} of {STEPS.length} · {STEPS[step].label}
      </p>
    </div>
  );
}
