import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, Circle, ChevronRight, ChevronLeft,
  Smartphone, Bot, BookOpen, Clock, Rocket,
  Wifi, WifiOff, Loader2, RefreshCw, AlertTriangle,
  Globe, File, Upload, Plus, Trash2, Info, Send,
  Building2, Sparkles, ExternalLink, Zap, MessageSquare, Key,
  QrCode, ScanLine, Shield, Copy, Check, Eye, EyeOff,
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Spinner } from '../components/ui/Spinner';

// ── Helpers ────────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

const DEFAULT_PROMPT = `You are a friendly and professional receptionist for {businessName}.

Your responsibilities:
• Answer questions about our services, pricing and availability
• Help customers schedule appointments or get quotes
• Share information about our location, business hours, and contact details
• Escalate to a human when you cannot help or when the customer requests it

Guidelines:
• Keep replies short and clear — no more than 3-4 sentences
• Always use a warm, welcoming tone
• If you don't know something, say so honestly and offer to connect them with a person
• Never make up prices, availability, or policies you are unsure about`;

// ── Step 1: WhatsApp Connection ────────────────────────────────────────────

// ── QR Code sub-panel ──────────────────────────────────────────────────────
function QrCodePanel({ onConnected }: { onConnected: boolean }) {
  const scannedRef = useRef(false);
  const [syncSeconds, setSyncSeconds] = useState(0);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: qrState, refetch } = trpc.whatsapp.qrStatus.useQuery(undefined, {
    refetchInterval: (q) => {
      const s = (q?.state?.data as any)?.status;
      if (s === 'connected') return false;
      if (s === 'connecting' && scannedRef.current) return 1000;
      if (s === 'qr_ready') return 2500;
      return 2000;
    },
  });
  const connect    = trpc.whatsapp.qrConnect.useMutation({ onSuccess: () => refetch() });
  const disconnect = trpc.whatsapp.qrDisconnect.useMutation({ onSuccess: () => refetch() });

  const status      = qrState?.status ?? 'disconnected';
  const isConnected = status === 'connected';

  useEffect(() => {
    if (status === 'qr_ready') scannedRef.current = false;
    if (status === 'connecting' && !scannedRef.current && !qrState?.qrDataUrl) scannedRef.current = true;
    if (scannedRef.current && status === 'connecting') {
      setSyncSeconds(0);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      syncTimerRef.current = setInterval(() => setSyncSeconds(s => s + 1), 1000);
    } else {
      if (syncTimerRef.current) { clearInterval(syncTimerRef.current); syncTimerRef.current = null; }
    }
    if (status === 'connected') {
      scannedRef.current = false;
      if (syncTimerRef.current) { clearInterval(syncTimerRef.current); syncTimerRef.current = null; }
    }
  }, [status, qrState?.qrDataUrl]);

  const isPostScanSync = scannedRef.current && status === 'connecting';

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      {/* Status badge */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium text-gray-300">Connection Status</span>
        <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
          isConnected      ? 'bg-[#25D366]/10 text-[#25D366]' :
          status === 'qr_ready'   ? 'bg-yellow-500/10 text-yellow-400' :
          status === 'connecting' ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-700 text-gray-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            isConnected ? 'bg-[#25D366] animate-pulse' :
            status === 'qr_ready' ? 'bg-yellow-400 animate-pulse' :
            status === 'connecting' ? 'bg-blue-400 animate-pulse' : 'bg-gray-500'
          }`} />
          {isConnected ? 'Connected' : status === 'qr_ready' ? 'Scan QR Code' :
           status === 'connecting' ? 'Connecting…' : 'Not Connected'}
        </span>
      </div>

      {status === 'disconnected' && (
        <div className="text-center py-8 space-y-5">
          <div className="w-20 h-20 bg-[#25D366]/10 rounded-full flex items-center justify-center mx-auto">
            <ScanLine className="w-10 h-10 text-[#25D366]" />
          </div>
          <div>
            <p className="text-white font-semibold text-lg">Ready to connect</p>
            <p className="text-gray-400 text-sm mt-1">No API keys needed — just scan once. Your session saves automatically.</p>
          </div>
          {qrState?.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{qrState.error}
            </div>
          )}
          <button onClick={() => connect.mutate()} disabled={connect.isPending}
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-semibold rounded-xl transition-colors">
            {connect.isPending ? <><Loader2 className="w-5 h-5 animate-spin" />Starting…</> : <><Wifi className="w-5 h-5" />Generate QR Code</>}
          </button>
        </div>
      )}

      {status === 'connecting' && (
        <div className="text-center py-10 space-y-4">
          <div className="relative w-20 h-20 mx-auto">
            <div className="w-20 h-20 border-4 border-[#25D366]/20 border-t-[#25D366] rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-[#25D366]/60" />
            </div>
          </div>
          {isPostScanSync ? (
            <>
              <div>
                <p className="text-white font-semibold text-lg">QR scanned — syncing…</p>
                <p className="text-gray-400 text-sm mt-1">WhatsApp is loading your chats and contacts.</p>
                <p className="text-gray-400 text-sm">This usually takes <span className="text-white font-medium">30–60 seconds</span>.</p>
              </div>
              {qrState?.loadingPercent != null ? (
                <div className="w-full max-w-xs mx-auto space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{qrState.loadingMessage || 'Loading…'}</span>
                    <span className="text-[#25D366] font-medium tabular-nums">{qrState.loadingPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-[#25D366] h-2 rounded-full transition-all duration-500" style={{ width: `${qrState.loadingPercent}%` }} />
                  </div>
                </div>
              ) : syncSeconds > 0 ? (
                <p className="text-[#25D366] text-sm font-medium tabular-nums">{syncSeconds}s elapsed…</p>
              ) : null}
              <div className="bg-[#25D366]/5 border border-[#25D366]/20 rounded-xl p-3 max-w-xs mx-auto">
                <p className="text-xs text-[#25D366]/80 text-center">Keep this page open — it will update automatically when ready.</p>
              </div>
            </>
          ) : (
            <>
              <p className="text-white font-medium">Starting browser session…</p>
              <p className="text-gray-400 text-sm">Takes about 15–30 seconds on first run</p>
            </>
          )}
        </div>
      )}

      {status === 'qr_ready' && (
        <div className="text-center space-y-4">
          <div className="bg-white p-4 rounded-2xl inline-block shadow-lg">
            {qrState?.qrDataUrl
              ? <img src={qrState.qrDataUrl} alt="WhatsApp QR Code" className="w-56 h-56" />
              : <div className="w-56 h-56 flex items-center justify-center"><Spinner size="lg" /></div>}
          </div>
          <div className="text-left bg-gray-800 rounded-xl p-4 max-w-sm mx-auto space-y-2">
            {['Open WhatsApp on your phone', 'Tap Settings → Linked Devices → Link a Device', 'Point your camera at the QR code above'].map((step, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-gray-300">
                <span className="w-5 h-5 rounded-full bg-[#25D366]/20 text-[#25D366] flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">QR code expires after 20 seconds — it refreshes automatically</p>
          <button onClick={() => connect.mutate()} className="flex items-center gap-1.5 mx-auto text-gray-400 hover:text-white text-sm transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate QR
          </button>
        </div>
      )}

      {isConnected && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 bg-[#25D366]/5 border border-[#25D366]/20 rounded-xl p-4">
            <div className="w-12 h-12 bg-[#25D366]/10 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-[#25D366]" />
            </div>
            <div>
              <p className="text-white font-semibold">WhatsApp Connected!</p>
              {qrState?.name       && <p className="text-[#25D366] text-sm">👤 {qrState.name}</p>}
              {qrState?.phoneNumber && <p className="text-gray-400 text-sm">📱 +{qrState.phoneNumber}</p>}
            </div>
          </div>
          <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending}
            className="w-full py-2 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500/30 text-sm font-medium rounded-lg transition-colors">
            {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Meta Business API sub-panel ────────────────────────────────────────────
function MetaApiPanel({ onSaved }: { onSaved: () => void }) {
  const { data: config } = trpc.botConfig.get.useQuery();
  const updateMutation   = trpc.botConfig.update.useMutation({ onSuccess: onSaved });

  const [form, setForm] = useState({ phoneNumberId: '', businessAccountId: '', accessToken: '', verifyToken: '' });
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied]       = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        phoneNumberId:     (config as any).phoneNumberId      || '',
        businessAccountId: (config as any).businessAccountId  || '',
        accessToken:       (config as any).accessToken        || '',
        verifyToken:       (config as any).verifyToken        || '',
      });
    }
  }, [config]);

  const webhookUrl = `${window.location.origin}/api/webhook/whatsapp`;
  const isSaved    = !!(form.phoneNumberId && form.accessToken);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  }

  function handleSave() {
    updateMutation.mutate({
      phoneNumberId:     form.phoneNumberId     || undefined,
      businessAccountId: form.businessAccountId || undefined,
      accessToken:       form.accessToken       || undefined,
      verifyToken:       form.verifyToken       || undefined,
    } as any, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000); onSaved(); },
    });
  }

  function field(label: string, value: string, key: keyof typeof form, type = 'text', placeholder = '') {
    const isSecret = key === 'accessToken';
    return (
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
        <div className="relative">
          <input
            type={isSecret && !showToken ? 'password' : type}
            value={value}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#25D366] pr-16"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            {isSecret && (
              <button onClick={() => setShowToken(v => !v)} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            )}
            {value && (
              <button onClick={() => copy(value, key)} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
                {copied === key ? <Check className="w-3.5 h-3.5 text-[#25D366]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* How-to banner */}
      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-blue-300 flex items-center gap-2">
          <Info className="w-4 h-4" /> How to get your Meta credentials
        </p>
        <ol className="space-y-1.5 text-xs text-blue-200/80 list-none">
          {[
            'Go to developers.facebook.com → My Apps → Create App → Business',
            'Add the "WhatsApp" product to your app',
            'Under WhatsApp → API Setup, copy your Phone Number ID and Business Account ID',
            'Generate a System User permanent access token in Meta Business Suite',
            'Under Webhooks, set the callback URL to the webhook URL shown below and paste your verify token',
          ].map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-blue-700/50 text-blue-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1">
          <ExternalLink className="w-3 h-3" /> Meta Cloud API docs
        </a>
      </div>

      {/* Webhook URL (read-only) */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Your Webhook URL <span className="text-gray-600">(paste this in Meta)</span></label>
        <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
          <Globe className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="flex-1 text-xs text-gray-300 font-mono break-all">{webhookUrl}</span>
          <button onClick={() => copy(webhookUrl, 'webhook')} className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0">
            {copied === 'webhook' ? <Check className="w-4 h-4 text-[#25D366]" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        {field('Phone Number ID', form.phoneNumberId, 'phoneNumberId', 'text', 'e.g. 123456789012345')}
        {field('WhatsApp Business Account ID', form.businessAccountId, 'businessAccountId', 'text', 'e.g. 987654321098765')}
        {field('Permanent Access Token', form.accessToken, 'accessToken', 'text', 'EAAxxxxx…')}
        {field('Webhook Verify Token', form.verifyToken, 'verifyToken', 'text', 'Any secret string you choose')}
      </div>

      {isSaved && (
        <div className="flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/20 rounded-lg px-4 py-3">
          <CheckCircle className="w-4 h-4 text-[#25D366]" />
          <p className="text-sm text-[#25D366] font-medium">Meta API credentials configured</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!form.phoneNumberId || !form.accessToken || updateMutation.isPending}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
      >
        {updateMutation.isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
          : saved
          ? <><Check className="w-4 h-4" />Saved!</>
          : <><Shield className="w-4 h-4" />Save Meta Credentials</>}
      </button>
    </div>
  );
}

// ── Method chooser + main step ─────────────────────────────────────────────
function StepWhatsApp({ onDone }: { onDone: () => void }) {
  const [method, setMethod] = useState<'qr' | 'meta' | null>(null);

  // Detect if Meta credentials are already saved
  const { data: config } = trpc.botConfig.get.useQuery();
  const hasMetaCreds = !!(config as any)?.phoneNumberId && !!(config as any)?.accessToken;

  // QR connection status (to know if QR is connected even if method picker is shown)
  const { data: qrState } = trpc.whatsapp.qrStatus.useQuery(undefined, { refetchInterval: 5000 });
  const isQrConnected = qrState?.status === 'connected';

  const isConnected = isQrConnected || hasMetaCreds;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Connect Your WhatsApp Number</h2>
        <p className="text-gray-400 text-sm">Choose how you'd like to connect WAFlow to WhatsApp.</p>
      </div>

      {/* Method selector */}
      {method === null && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* QR Code option */}
          <button
            onClick={() => setMethod('qr')}
            className="group relative flex flex-col items-start gap-4 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-[#25D366] rounded-2xl p-6 text-left transition-all"
          >
            <div className="w-14 h-14 bg-[#25D366]/10 group-hover:bg-[#25D366]/20 rounded-xl flex items-center justify-center transition-colors">
              <QrCode className="w-7 h-7 text-[#25D366]" />
            </div>
            <div>
              <p className="text-white font-semibold text-base mb-1">Scan QR Code</p>
              <p className="text-gray-400 text-sm leading-relaxed">Link your personal or business WhatsApp number by scanning a QR code — no Meta account needed.</p>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {['Quick setup', 'No Meta account', 'Personal numbers'].map(tag => (
                <span key={tag} className="text-[10px] bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 px-2 py-0.5 rounded-full font-medium">{tag}</span>
              ))}
            </div>
            {isQrConnected && (
              <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] bg-[#25D366] text-white px-2 py-0.5 rounded-full font-semibold">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> Connected
              </span>
            )}
          </button>

          {/* Meta App option */}
          <button
            onClick={() => setMethod('meta')}
            className="group relative flex flex-col items-start gap-4 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-2xl p-6 text-left transition-all"
          >
            <div className="w-14 h-14 bg-blue-600/10 group-hover:bg-blue-600/20 rounded-xl flex items-center justify-center transition-colors">
              {/* Meta "M" logo */}
              <svg viewBox="0 0 24 24" className="w-7 h-7 fill-blue-400" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l7 4.5-7 4.5z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-base mb-1">Connect via Meta App</p>
              <p className="text-gray-400 text-sm leading-relaxed">Use the official WhatsApp Business Cloud API via your Meta Developer account for enterprise-grade reliability.</p>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {['Official API', 'Enterprise grade', 'Business numbers'].map(tag => (
                <span key={tag} className="text-[10px] bg-blue-600/10 text-blue-400 border border-blue-600/20 px-2 py-0.5 rounded-full font-medium">{tag}</span>
              ))}
            </div>
            {hasMetaCreds && (
              <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold">
                <Check className="w-2.5 h-2.5" /> Configured
              </span>
            )}
          </button>
        </div>
      )}

      {/* Back button when a method is selected */}
      {method !== null && (
        <button onClick={() => setMethod(null)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
          {method === 'qr' ? 'QR Code Connection' : 'Meta App Connection'}
        </button>
      )}

      {/* Active panel */}
      {method === 'qr'   && <QrCodePanel onConnected={isQrConnected} />}
      {method === 'meta' && <MetaApiPanel onSaved={() => {}} />}

      {/* Footer */}
      <div className="flex justify-between items-center">
        <p className="text-gray-500 text-xs">You can reconnect or switch methods later from Configuration.</p>
        <button
          onClick={onDone}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors text-sm ${
            isConnected
              ? 'bg-[#25D366] hover:bg-[#20ba57] text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          {isConnected ? 'Continue' : 'Skip for now'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Business Profile ───────────────────────────────────────────────

function StepProfile({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data: config, isLoading } = trpc.botConfig.get.useQuery();
  const updateMutation = trpc.botConfig.update.useMutation({ onSuccess: onNext });

  const GROQ_MODELS = [
    { value: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B Instant (fast, free)' },
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (smartest)' },
    { value: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B (long context)' },
    { value: 'gemma2-9b-it',            label: 'Gemma 2 9B (Google)' },
    { value: 'gpt-4o-mini',             label: 'GPT-4o Mini (OpenAI)' },
    { value: 'gpt-4o',                  label: 'GPT-4o (OpenAI, premium)' },
  ];

  const OLLAMA_MODELS = [
    { value: 'gemma4:latest', label: 'Gemma 4 (Recommended)' },
    { value: 'gemma4:26b',    label: 'Gemma 4 26B (highest quality)' },
    { value: 'gemma3:4b',     label: 'Gemma 3 4B (fast)' },
    { value: 'llama3.2:1b',   label: 'Llama 3.2 1B (fastest)' },
    { value: 'llama3.1:8b',   label: 'Llama 3.1 8B (reliable)' },
    { value: 'mistral:latest', label: 'Mistral 7B' },
    { value: 'qwen2.5',       label: 'Qwen 2.5 7B (multilingual)' },
  ];

  const [form, setForm] = useState({
    businessName: '',
    systemPrompt: DEFAULT_PROMPT,
    aiApiUrl:     '',
    aiApiKey:     '',
    aiModel:      '',
    enableServiceMenu:  false,
    serviceMenuTrigger: 'MENU',
    enableSmsFallback:  false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setForm(f => ({
        ...f,
        businessName:       config.businessName || '',
        systemPrompt:       config.systemPrompt || DEFAULT_PROMPT,
        aiApiUrl:           (config as any).aiApiUrl || '',
        aiApiKey:           (config as any).aiApiKey || '',
        aiModel:            (config as any).aiModel || '',
        enableServiceMenu:  !!(config as any).enableServiceMenu,
        serviceMenuTrigger: (config as any).serviceMenuTrigger || 'MENU',
        enableSmsFallback:  !!(config as any).enableSmsFallback,
      }));
    }
  }, [config]);

  const fillPrompt = () => {
    const name = form.businessName || 'my business';
    setForm(f => ({
      ...f,
      systemPrompt: DEFAULT_PROMPT.replace(/{businessName}/g, name),
    }));
  };

  const handleNext = () => {
    updateMutation.mutate({
      businessName:       form.businessName,
      systemPrompt:       form.systemPrompt,
      aiApiUrl:           form.aiApiUrl || undefined,
      aiApiKey:           form.aiApiKey || undefined,
      aiModel:            form.aiModel || undefined,
      enableServiceMenu:  form.enableServiceMenu,
      serviceMenuTrigger: form.serviceMenuTrigger,
      enableSmsFallback:  form.enableSmsFallback,
    });
  };

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Business Profile</h2>
        <p className="text-gray-400 text-sm">Tell the AI who it's working for and how to behave.</p>
      </div>

      <div className="space-y-5">
        {/* Business Name */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#25D366]" /> Business Name
          </label>
          <input
            type="text"
            value={form.businessName}
            onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors"
            placeholder="e.g. Sarah's Beauty Salon"
          />
          <p className="text-xs text-gray-500 mt-2">Used by the AI to introduce itself and personalise responses.</p>
        </div>

        {/* System Prompt */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#25D366]" /> AI Personality & Instructions
            </label>
            <button
              onClick={fillPrompt}
              className="flex items-center gap-1.5 text-xs text-[#25D366] hover:text-[#20ba57] font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto-fill with my business name
            </button>
          </div>
          <textarea
            value={form.systemPrompt}
            onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
            rows={12}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors resize-none font-mono text-sm leading-relaxed"
          />
          <div className="flex items-start gap-2 mt-2">
            <Info className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500">This defines how your AI receptionist talks. Be specific about services, tone, and what to escalate to a human.</p>
          </div>
        </div>
      </div>

        {/* AI Model & API */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
          <label className="block text-sm font-medium text-gray-300 flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#25D366]" /> AI Engine
          </label>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">Model</p>
            <select
              value={form.aiModel}
              onChange={e => setForm(f => ({ ...f, aiModel: e.target.value }))}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-[#25D366] transition-colors"
            >
              <option value="">— use platform default —</option>
              <optgroup label="── Ollama (Local) ──">
                {OLLAMA_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </optgroup>
              <optgroup label="── Groq / Cloud ──">
                {GROQ_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </optgroup>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1.5">API URL <span className="text-gray-600">(leave blank to use platform default)</span></p>
              <input
                type="url"
                value={form.aiApiUrl}
                onChange={e => setForm(f => ({ ...f, aiApiUrl: e.target.value }))}
                placeholder="https://api.groq.com/openai/v1"
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#25D366] transition-colors font-mono"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1.5">API Key <span className="text-gray-600">(leave blank to use platform default)</span></p>
              <input
                type="password"
                value={form.aiApiKey}
                onChange={e => setForm(f => ({ ...f, aiApiKey: e.target.value }))}
                placeholder="sk-... or gsk-..."
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#25D366] transition-colors font-mono"
              />
            </div>
          </div>
        </div>

        {/* Service Menu */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#25D366]" /> Service Menu
            </label>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, enableServiceMenu: !f.enableServiceMenu }))}
              className={`w-11 h-6 rounded-full transition-colors relative ${form.enableServiceMenu ? 'bg-[#25D366]' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.enableServiceMenu ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <p className="text-xs text-gray-500">When enabled, customers who send the trigger word receive a formatted list of your services automatically.</p>
          {form.enableServiceMenu && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Trigger keyword (e.g. MENU, SERVICES)</p>
              <input
                value={form.serviceMenuTrigger}
                onChange={e => setForm(f => ({ ...f, serviceMenuTrigger: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-[#25D366] transition-colors"
                placeholder="MENU"
              />
            </div>
          )}
        </div>

        {/* SMS Fallback */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-300 block">SMS Fallback</label>
              <p className="text-xs text-gray-500 mt-0.5">If WhatsApp delivery fails, retry via SMS (requires Twilio configured).</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, enableSmsFallback: !f.enableSmsFallback }))}
              className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${form.enableSmsFallback ? 'bg-[#25D366]' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.enableSmsFallback ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

      {updateMutation.isError && (
        <p className="text-red-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{updateMutation.error.message}</p>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-2.5 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg font-medium text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={handleNext}
          disabled={updateMutation.isPending || !form.businessName.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
        >
          {updateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <>Save & Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Knowledge Base ─────────────────────────────────────────────────

function StepKnowledge({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [url, setUrl] = useState('');
  const [urlStatus, setUrlStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: kbData, refetch } = trpc.knowledgeBase.list.useQuery({});
  const addUrlMutation = trpc.knowledgeBase.addUrl.useMutation({
    onSuccess: (data) => {
      setPendingId(data.id);
      setUrlStatus({ ok: true, text: 'Fetching page content…' });
      setUrl('');
      refetch();
    },
    onError: e => setUrlStatus({ ok: false, text: e.message }),
  });

  // Poll the pending KB entry until it's no longer processing
  const { data: pendingEntry } = trpc.knowledgeBase.getOne.useQuery(
    { id: pendingId! },
    { enabled: pendingId !== null, refetchInterval: pendingId ? 2000 : false }
  );
  useEffect(() => {
    if (!pendingEntry) return;
    if (pendingEntry.status === 'ready') {
      setUrlStatus({ ok: true, text: `✅ "${pendingEntry.title}" imported successfully!` });
      setPendingId(null);
      refetch();
    } else if (pendingEntry.status === 'error') {
      setUrlStatus({ ok: false, text: pendingEntry.processingError || 'Failed to scrape page.' });
      setPendingId(null);
    }
  }, [pendingEntry]);

  const deleteMutation = trpc.knowledgeBase.delete.useMutation({ onSuccess: () => refetch() });

  const uploadFile = async (file: File) => {
    const allowed = ['.pdf', '.docx', '.txt', '.md', '.csv'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      setUploadStatus({ ok: false, text: `Unsupported type. Allowed: ${allowed.join(', ')}` });
      return;
    }
    setUploading(true);
    setUploadStatus(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'business');
      const resp = await fetch('/api/knowledge-base/upload', { method: 'POST', body: fd, credentials: 'include' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Upload failed');
      setUploadStatus({ ok: true, text: `"${file.name}" uploaded — processing in background.` });
      setTimeout(() => refetch(), 2000);
    } catch (err: any) {
      setUploadStatus({ ok: false, text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const articles = kbData?.articles ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Knowledge Base</h2>
        <p className="text-gray-400 text-sm">Give the AI information about your business so it can answer customer questions accurately.</p>
      </div>

      {/* URL import */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-[#25D366]" />
          <span className="text-sm font-medium text-gray-300">Import from your website</span>
        </div>
        <p className="text-xs text-gray-500">Paste a URL from your website (About, Services, FAQ, Pricing) and the AI will learn from that page.</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && url && addUrlMutation.mutate({ url, category: 'business' })}
              className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#25D366] transition-colors"
              placeholder="https://www.yourbusiness.com/services"
            />
          </div>
          <button
            onClick={() => addUrlMutation.mutate({ url, category: 'business' })}
            disabled={addUrlMutation.isPending || !url || !!pendingId}
            className="px-4 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {addUrlMutation.isPending || pendingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Import
          </button>
        </div>
        {urlStatus && (
          <p className={`text-xs flex items-center gap-1.5 ${urlStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
            {urlStatus.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {urlStatus.text}
          </p>
        )}
      </div>

      {/* File upload */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-[#25D366]" />
          <span className="text-sm font-medium text-gray-300">Upload a document</span>
        </div>
        <p className="text-xs text-gray-500">Upload a PDF, Word doc, or text file (price list, menu, brochure, FAQ document).</p>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
          className="border-2 border-dashed border-gray-700 hover:border-[#25D366]/50 rounded-xl p-6 text-center cursor-pointer transition-colors"
        >
          {uploading
            ? <div className="flex flex-col items-center gap-2"><Loader2 className="w-7 h-7 text-[#25D366] animate-spin" /><p className="text-sm text-gray-400">Uploading…</p></div>
            : <div className="flex flex-col items-center gap-2"><File className="w-7 h-7 text-gray-500" /><p className="text-sm text-gray-400">Drop file here or <span className="text-[#25D366]">click to browse</span></p><p className="text-xs text-gray-600">PDF, DOCX, TXT, MD, CSV · max 20 MB</p></div>
          }
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.md,.csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
        </div>
        {uploadStatus && (
          <p className={`text-xs flex items-center gap-1.5 ${uploadStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
            {uploadStatus.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {uploadStatus.text}
          </p>
        )}
      </div>

      {/* Current KB entries */}
      {articles.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
          <p className="text-sm font-medium text-gray-300">{articles.length} knowledge {articles.length === 1 ? 'entry' : 'entries'}</p>
          <div className="space-y-2">
            {articles.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  {a.type === 'link' ? <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" /> : <File className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  <span className="text-sm text-gray-300 truncate">{a.title}</span>
                  {a.status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin flex-shrink-0" />}
                  {a.status === 'ready' && <span className="text-xs bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded flex-shrink-0">Ready</span>}
                  {a.status === 'error' && <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded flex-shrink-0">Error</span>}
                </div>
                <button onClick={() => deleteMutation.mutate({ id: a.id })} className="p-1 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-2.5 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg font-medium text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={onNext} className="flex items-center gap-2 px-6 py-2.5 bg-[#25D366] hover:bg-[#20ba57] text-white rounded-lg font-medium text-sm transition-colors">
          {articles.length > 0 ? 'Continue' : 'Skip for now'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Business Hours ─────────────────────────────────────────────────

function StepHours({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data: config, isLoading } = trpc.botConfig.get.useQuery();
  const updateMutation = trpc.botConfig.update.useMutation({ onSuccess: onNext });

  const [form, setForm] = useState({
    enableBusinessHours: false,
    businessHoursStart: '08:00',
    businessHoursEnd: '17:00',
    businessDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    timezone: 'Africa/Johannesburg',
    afterHoursMessage: "Thanks for reaching out! We're currently closed. We'll reply during business hours. For emergencies, please call us directly.",
  });

  useEffect(() => {
    if (config) {
      setForm(f => ({
        ...f,
        enableBusinessHours: (config as any).enableBusinessHours ?? false,
        businessHoursStart: (config as any).businessHoursStart || '08:00',
        businessHoursEnd: (config as any).businessHoursEnd || '17:00',
        businessDays: (config as any).businessDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        timezone: (config as any).timezone || 'Africa/Johannesburg',
        afterHoursMessage: (config as any).afterHoursMessage || f.afterHoursMessage,
      }));
    }
  }, [config]);

  const toggleDay = (day: string) => {
    setForm(f => ({
      ...f,
      businessDays: f.businessDays.includes(day) ? f.businessDays.filter((d: string) => d !== day) : [...f.businessDays, day],
    }));
  };

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Business Hours</h2>
        <p className="text-gray-400 text-sm">Optionally restrict when the AI responds and set an after-hours message.</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-5">
        {/* Enable toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="text-white font-medium">Restrict to business hours</p>
            <p className="text-gray-500 text-xs mt-0.5">Outside these hours the AI sends the after-hours message instead of AI replies.</p>
          </div>
          <div
            onClick={() => setForm(f => ({ ...f, enableBusinessHours: !f.enableBusinessHours }))}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.enableBusinessHours ? 'bg-[#25D366]' : 'bg-gray-700'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.enableBusinessHours ? 'translate-x-5' : ''}`} />
          </div>
        </label>

        {form.enableBusinessHours && (
          <>
            {/* Days */}
            <div>
              <p className="text-sm font-medium text-gray-300 mb-2">Operating Days</p>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      form.businessDays.includes(day)
                        ? 'bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/30'
                        : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {DAY_SHORT[day]}
                  </button>
                ))}
              </div>
            </div>

            {/* Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Opening Time</label>
                <input type="time" value={form.businessHoursStart}
                  onChange={e => setForm(f => ({ ...f, businessHoursStart: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-[#25D366]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Closing Time</label>
                <input type="time" value={form.businessHoursEnd}
                  onChange={e => setForm(f => ({ ...f, businessHoursEnd: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-[#25D366]"
                />
              </div>
            </div>

            {/* After-hours message */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">After-Hours Auto-Reply</label>
              <textarea
                value={form.afterHoursMessage}
                onChange={e => setForm(f => ({ ...f, afterHoursMessage: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-[#25D366] transition-colors"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-2.5 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg font-medium text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={() => updateMutation.mutate(form as any)}
          disabled={updateMutation.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
        >
          {updateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <>Save & Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Done ───────────────────────────────────────────────────────────

function StepDone({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { data: qrState } = trpc.whatsapp.qrStatus.useQuery();
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean } | null>(null);
  const sendTest = trpc.whatsapp.qrTestMessage.useMutation({
    onSuccess: d => setTestResult({ success: d.success }),
    onError: () => setTestResult({ success: false }),
  });

  const isConnected = qrState?.status === 'connected';

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <div className="w-20 h-20 bg-[#25D366]/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Rocket className="w-10 h-10 text-[#25D366]" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Your Receptionist is Ready!</h2>
        <p className="text-gray-400">Your AI is configured and waiting for customer messages.</p>
      </div>

      {/* Summary */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-300 mb-3">Setup Summary</p>
        {[
          { label: 'WhatsApp', value: isConnected ? `Connected — ${qrState?.name || qrState?.phoneNumber || 'active'}` : 'Not connected yet', ok: isConnected },
          { label: 'AI Personality', value: 'System prompt configured', ok: true },
          { label: 'Knowledge Base', value: 'Ready (add more anytime from Tenant Setup)', ok: true },
          { label: 'Business Hours', value: 'Configured', ok: true },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
            <span className="text-sm text-gray-400">{row.label}</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${row.ok ? 'text-[#25D366]' : 'text-yellow-400'}`}>{row.value}</span>
              {row.ok ? <CheckCircle className="w-4 h-4 text-[#25D366]" /> : <AlertTriangle className="w-4 h-4 text-yellow-400" />}
            </div>
          </div>
        ))}
      </div>

      {/* Test message */}
      {isConnected && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
          <p className="text-sm font-medium text-gray-300 flex items-center gap-2"><Send className="w-4 h-4 text-[#25D366]" /> Send a Test Message</p>
          <p className="text-xs text-gray-500">Send a real WhatsApp message to confirm everything is working.</p>
          <div className="flex gap-2">
            <input
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#25D366]"
              placeholder="+27821234567"
            />
            <button
              onClick={() => { setTestResult(null); sendTest.mutate({ phoneNumber: testPhone, message: "Hello! 👋 I'm your new AI receptionist. How can I help you today?" }); }}
              disabled={sendTest.isPending || !testPhone}
              className="px-4 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {sendTest.isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
          {testResult && (
            <p className={`text-sm font-medium flex items-center gap-1.5 ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.success ? <><CheckCircle className="w-4 h-4" />Message sent!</> : <><AlertTriangle className="w-4 h-4" />Failed — check connection</>}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-2.5 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg font-medium text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={() => navigate('/configuration')}
          className="flex items-center gap-2 px-5 py-2.5 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 rounded-lg font-medium text-sm transition-colors"
        >
          Advanced Settings <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#25D366] hover:bg-[#20ba57] text-white rounded-lg font-medium text-sm transition-colors"
        >
          Go to Dashboard <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main Wizard ────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, label: 'Connect WhatsApp', icon: Smartphone },
  { id: 1, label: 'Business Profile', icon: Bot },
  { id: 2, label: 'Knowledge Base',   icon: BookOpen },
  { id: 3, label: 'Business Hours',   icon: Clock },
  { id: 4, label: 'Go Live!',         icon: Rocket },
];

export default function ReceptionistSetup() {
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);

  const advance = () => {
    const next = step + 1;
    setStep(next);
    setMaxReached(r => Math.max(r, next));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">My Receptionist Setup</h1>
        <p className="text-gray-400 text-sm mt-0.5">Configure your personal AI WhatsApp receptionist in a few steps.</p>
      </div>

      {/* Step sidebar + content */}
      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-44 flex-shrink-0 space-y-1">
          {STEPS.map(s => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = maxReached > s.id;
            const isClickable = s.id <= maxReached;
            return (
              <button
                key={s.id}
                onClick={() => isClickable && setStep(s.id)}
                disabled={!isClickable}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                  isActive ? 'bg-[#25D366]/10 text-[#25D366] font-semibold' :
                  isDone  ? 'text-gray-300 hover:bg-gray-800 cursor-pointer' :
                  'text-gray-600 cursor-not-allowed'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isActive ? 'bg-[#25D366]/20' : isDone ? 'bg-[#25D366]/10' : 'bg-gray-800'
                }`}>
                  {isDone && !isActive
                    ? <CheckCircle className="w-3.5 h-3.5 text-[#25D366]" />
                    : <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#25D366]' : 'text-gray-500'}`} />
                  }
                </div>
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
          {/* Progress line */}
          <div className="pt-3 px-3">
            <div className="h-1.5 bg-gray-800 rounded-full">
              <div
                className="h-1.5 bg-[#25D366] rounded-full transition-all duration-500"
                style={{ width: `${((maxReached) / (STEPS.length - 1)) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">{maxReached}/{STEPS.length - 1} steps done</p>
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 min-w-0">
          {step === 0 && <StepWhatsApp onDone={advance} />}
          {step === 1 && <StepProfile onNext={advance} onBack={() => setStep(0)} />}
          {step === 2 && <StepKnowledge onNext={advance} onBack={() => setStep(1)} />}
          {step === 3 && <StepHours onNext={advance} onBack={() => setStep(2)} />}
          {step === 4 && <StepDone onBack={() => setStep(3)} />}
        </div>
      </div>
    </div>
  );
}
