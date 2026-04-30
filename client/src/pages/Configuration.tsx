import React, { useState, useEffect, useRef } from 'react';
import { Save, Bot, Phone, Globe, Clock, Bell, RefreshCw, Terminal, ExternalLink, CheckCircle, Eye, EyeOff, Copy, CheckCheck, Wifi, WifiOff, Send, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Spinner } from '../components/ui/Spinner';

// ── QR Code Connection Component ──────────────────────────────────────────
function QRConnect() {
  const { data: qrState, refetch } = trpc.whatsapp.qrStatus.useQuery(undefined, {
    refetchInterval: (q) => {
      const s = (q?.state?.data as any)?.status;
      return s === 'connected' ? false : s === 'qr_ready' ? 3000 : 2000;
    },
  });

  const connect = trpc.whatsapp.qrConnect.useMutation({ onSuccess: () => refetch() });
  const disconnect = trpc.whatsapp.qrDisconnect.useMutation({ onSuccess: () => refetch() });
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean } | null>(null);
  const sendTest = trpc.whatsapp.qrTestMessage.useMutation({
    onSuccess: (d) => setTestResult({ success: d.success }),
    onError: () => setTestResult({ success: false }),
  });

  const status = qrState?.status ?? 'disconnected';

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Phone className="w-5 h-5 text-green-600" />
            Connect via QR Code
          </h3>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            status === 'connected' ? 'bg-green-100 text-green-700' :
            status === 'qr_ready' ? 'bg-yellow-100 text-yellow-700' :
            status === 'connecting' ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === 'connected' ? 'bg-green-500 animate-pulse' :
              status === 'qr_ready' ? 'bg-yellow-500 animate-pulse' :
              status === 'connecting' ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
            }`} />
            {status === 'connected' ? 'Connected' : status === 'qr_ready' ? 'Scan QR Code' :
             status === 'connecting' ? 'Connecting…' : 'Disconnected'}
          </span>
        </div>

        {status === 'disconnected' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto">
              <Phone className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <p className="text-gray-700 font-medium">Connect your WhatsApp in seconds</p>
              <p className="text-gray-400 text-sm mt-1">No API keys needed — just scan a QR code from your phone</p>
            </div>
            {qrState?.error && (
              <div className="text-red-600 text-sm bg-red-50 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{qrState.error}
              </div>
            )}
            <button
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
            >
              {connect.isPending
                ? <><Spinner size="sm" className="border-white border-t-green-300" />Starting…</>
                : <><Wifi className="w-5 h-5" />Connect WhatsApp</>}
            </button>
          </div>
        )}

        {status === 'connecting' && (
          <div className="text-center py-8 space-y-3">
            <div className="w-16 h-16 border-4 border-green-200 border-t-green-500 rounded-full animate-spin mx-auto" />
            <p className="text-gray-600 font-medium">Starting browser session…</p>
            <p className="text-gray-400 text-sm">Takes about 10–20 seconds on first run</p>
          </div>
        )}

        {status === 'qr_ready' && (
          <div className="text-center space-y-4">
            <p className="text-gray-700 font-medium">Open WhatsApp on your phone and scan this code</p>
            <div className="inline-block p-3 bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
              {qrState?.qrDataUrl
                ? <img src={qrState.qrDataUrl} alt="WhatsApp QR Code" className="w-56 h-56" />
                : <div className="w-56 h-56 flex items-center justify-center bg-gray-50 rounded-xl"><Spinner size="lg" /></div>
              }
            </div>
            <div className="text-sm text-gray-500 space-y-1 text-left max-w-xs mx-auto">
              <p>1. Open <strong>WhatsApp</strong> on your phone</p>
              <p>2. Tap <strong>Settings → Linked Devices → Link a Device</strong></p>
              <p>3. Point your camera at the QR code above</p>
            </div>
            <p className="text-xs text-gray-400">QR code refreshes automatically every 20 seconds</p>
          </div>
        )}

        {status === 'connected' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-green-50 rounded-xl border border-green-200">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-800">WhatsApp Connected!</p>
                {qrState?.name && <p className="text-green-700 text-sm">👤 {qrState.name}</p>}
                {qrState?.phoneNumber && <p className="text-green-700 text-sm">📱 +{qrState.phoneNumber}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Send className="w-4 h-4" /> Send a Test Message
              </p>
              <div className="flex gap-2">
                <input
                  value={testPhone} onChange={e => setTestPhone(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="+27821234567"
                />
                <button
                  onClick={() => { setTestResult(null); sendTest.mutate({ phoneNumber: testPhone, message: 'Hello! WAFlow QR connection is working ✅' }); }}
                  disabled={sendTest.isPending || !testPhone}
                  className="px-4 py-2 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {sendTest.isPending ? 'Sending…' : 'Send'}
                </button>
              </div>
              {testResult && (
                <p className={`text-sm font-medium flex items-center gap-1.5 ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.success ? <><CheckCircle className="w-4 h-4" /> Sent!</> : <><AlertTriangle className="w-4 h-4" /> Failed to send</>}
                </p>
              )}
            </div>
            <button
              onClick={() => disconnect.mutate()} disabled={disconnect.isPending}
              className="w-full py-2.5 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors"
            >
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect WhatsApp'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-sm text-blue-700 space-y-1">
        <p className="font-medium">ℹ️ About QR Connection</p>
        <p>Uses your existing WhatsApp number — no Meta developer account needed. Your session is saved locally so you only scan once. Keep the server running to stay connected.</p>
      </div>
    </div>
  );
}

// ── WhatsApp Setup Component ───────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="ml-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0" title="Copy">
      {copied ? <CheckCheck className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function WhatsAppTab({ form, setForm }: { form: any; setForm: (f: any) => void }) {
  const [mode, setMode] = useState<'qr' | 'meta'>('qr');
  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Choose connection method</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('qr')}
            className={`p-4 rounded-xl border-2 text-left transition ${mode === 'qr' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <p className="font-semibold text-sm text-gray-800">📱 QR Code Scan</p>
            <p className="text-xs text-green-600 font-medium mt-0.5">Easiest · No API keys</p>
            <p className="text-xs text-gray-500 mt-1">Scan once, works instantly. Uses your existing WhatsApp number.</p>
          </button>
          <button
            onClick={() => setMode('meta')}
            className={`p-4 rounded-xl border-2 text-left transition ${mode === 'meta' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <p className="font-semibold text-sm text-gray-800">🔧 Meta Business API</p>
            <p className="text-xs text-blue-600 font-medium mt-0.5">Official · Scalable</p>
            <p className="text-xs text-gray-500 mt-1">Requires Meta developer app. Best for production at scale.</p>
          </button>
        </div>
      </div>
      {mode === 'qr' ? <QRConnect /> : <WhatsAppSetup form={form} setForm={setForm} />}
    </div>
  );
}

function WhatsAppSetup({ form, setForm }: { form: any; setForm: (f: any) => void }) {
  const [showToken, setShowToken] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; displayPhoneNumber?: string | null; verifiedName?: string | null; qualityRating?: string | null; error?: string } | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('Hello! This is a test message from WAFlow. 👋');
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const webhookUrl = `${window.location.origin}/api/webhooks/whatsapp`;

  const verify = trpc.whatsapp.verifyConnection.useMutation({
    onSuccess: (data) => setVerifyResult(data),
    onError: (e) => setVerifyResult({ success: false, error: e.message }),
  });

  const sendTest = trpc.whatsapp.testMessage.useMutation({
    onSuccess: (data) => setTestResult({ success: data.success }),
    onError: (e) => setTestResult({ success: false, error: e.message }),
  });

  const generateToken = () => {
    const token = 'waflow_' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    setForm({ ...form, verifyToken: token });
  };

  const STEPS = [
    {
      num: 1,
      title: 'Create a Meta Developer App',
      content: (
        <div className="space-y-2 text-sm text-gray-600">
          <p>Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">developers.facebook.com <ExternalLink className="w-3 h-3" /></a> and log in with your Facebook account.</p>
          <p>Click <strong>My Apps → Create App</strong>, choose <strong>Business</strong> type, then add the <strong>WhatsApp</strong> product to your app.</p>
        </div>
      ),
    },
    {
      num: 2,
      title: 'Get your Phone Number ID & Access Token',
      content: (
        <div className="space-y-2 text-sm text-gray-600">
          <p>In your app dashboard: <strong>WhatsApp → API Setup</strong></p>
          <p>You'll see your <strong>Phone Number ID</strong> and a temporary <strong>Access Token</strong>. For production, generate a permanent token via <strong>System Users</strong> in Business Manager.</p>
          <a href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs">
            Official Meta setup guide <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ),
    },
    {
      num: 3,
      title: 'Configure Webhook in Meta',
      content: (
        <div className="space-y-3 text-sm text-gray-600">
          <p>In <strong>WhatsApp → Configuration → Webhooks</strong>, enter:</p>
          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Callback URL</p>
              <div className="flex items-center bg-gray-100 rounded-lg px-3 py-2">
                <code className="text-xs font-mono text-gray-700 flex-1 break-all">{webhookUrl}</code>
                <CopyButton text={webhookUrl} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Verify Token (must match what you set below)</p>
              <div className="flex items-center bg-gray-100 rounded-lg px-3 py-2">
                <code className="text-xs font-mono text-gray-700 flex-1">{form.verifyToken || '— set one below first —'}</code>
                {form.verifyToken && <CopyButton text={form.verifyToken} />}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">Subscribe to <strong>messages</strong> webhook field.</p>
        </div>
      ),
    },
    {
      num: 4,
      title: 'Test & go live',
      content: (
        <div className="text-sm text-gray-600 space-y-2">
          <p>Enter your credentials below, click <strong>Test Connection</strong>, then send a test message to verify everything works end-to-end.</p>
          <p>For production access, submit your app for <strong>WhatsApp Business API review</strong> on Meta to remove the 24-hour sandbox limit.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Setup Steps */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2">
          <Phone className="w-5 h-5 text-green-600" />
          WhatsApp Business API Setup
        </h3>
        <div className="space-y-4">
          {STEPS.map((step) => (
            <div key={step.num} className="flex gap-4">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
                {step.num}
              </div>
              <div className="flex-1 pt-0.5">
                <p className="font-medium text-gray-800 text-sm mb-1">{step.title}</p>
                {step.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Credentials */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" />
          Your Credentials
        </h3>

        {/* Phone Number ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID</label>
          <input
            value={form.phoneNumberId}
            onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
            className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
            placeholder="e.g. 123456789012345"
          />
          <p className="text-xs text-gray-400 mt-1">Found in Meta App → WhatsApp → API Setup</p>
        </div>

        {/* Access Token */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
              className="w-full px-3 py-2 pr-10 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
              placeholder="EAAxxxxxxxx..."
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Use a permanent System User token for production</p>
        </div>

        {/* Webhook Verify Token */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Webhook Verify Token</label>
          <div className="flex gap-2">
            <input
              value={form.verifyToken}
              onChange={(e) => setForm({ ...form, verifyToken: e.target.value })}
              className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
              placeholder="my_secure_verify_token"
            />
            <button
              type="button"
              onClick={generateToken}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Generate
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Must match exactly what you enter in Meta's webhook settings</p>
        </div>

        {/* Webhook URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Webhook Callback URL</label>
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <code className="text-xs font-mono text-gray-600 flex-1 break-all">{webhookUrl}</code>
            <CopyButton text={webhookUrl} />
          </div>
          <p className="text-xs text-gray-400 mt-1">Paste this into Meta → WhatsApp → Configuration → Webhooks</p>
        </div>

        {/* Test Connection */}
        <div className="pt-1 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Test Connection</p>
            <button
              onClick={() => {
                setVerifyResult(null);
                verify.mutate({ phoneNumberId: form.phoneNumberId, accessToken: form.accessToken });
              }}
              disabled={verify.isPending || !form.phoneNumberId || !form.accessToken}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {verify.isPending ? <><Spinner size="sm" className="border-white border-t-green-300" />Checking…</> : <><Wifi className="w-4 h-4" />Verify Credentials</>}
            </button>
          </div>

          {verifyResult && (
            <div className={`rounded-lg p-4 border text-sm ${verifyResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              {verifyResult.success ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 font-medium text-green-700">
                    <CheckCircle className="w-4 h-4" /> Connected successfully!
                  </div>
                  {verifyResult.displayPhoneNumber && (
                    <p className="text-green-700">📱 Number: <strong>{verifyResult.displayPhoneNumber}</strong></p>
                  )}
                  {verifyResult.verifiedName && (
                    <p className="text-green-700">🏢 Business: <strong>{verifyResult.verifiedName}</strong></p>
                  )}
                  {verifyResult.qualityRating && (
                    <p className="text-green-700">⭐ Quality: <strong>{verifyResult.qualityRating}</strong></p>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2 text-red-700">
                  <WifiOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Connection failed</p>
                    <p className="text-xs mt-0.5 text-red-600">{verifyResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Send Test Message */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Send className="w-4 h-4 text-green-600" />
          Send a Test Message
        </h3>
        <p className="text-xs text-gray-500">
          After saving your credentials, send a real WhatsApp message to verify your bot can send messages. The recipient must have messaged your number first (within 24 hours) due to Meta's policy.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Phone Number</label>
          <input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="+27821234567 (international format)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea
            rows={2}
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setTestResult(null);
              sendTest.mutate({ phoneNumber: testPhone, message: testMsg });
            }}
            disabled={sendTest.isPending || !testPhone}
            className="flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {sendTest.isPending ? <><Spinner size="sm" className="border-white border-t-green-300" />Sending…</> : <><Send className="w-4 h-4" />Send Test</>}
          </button>

          {testResult && (
            <span className={`flex items-center gap-1.5 text-sm font-medium ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
              {testResult.success ? <><CheckCircle className="w-4 h-4" /> Message sent!</> : <><AlertTriangle className="w-4 h-4" /> {testResult.error || 'Failed to send'}</>}
            </span>
          )}
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>Make sure to <strong>Save Changes</strong> first before sending a test message, so the server uses your latest credentials.</p>
        </div>
      </div>
    </div>
  );
}

const GROQ_MODELS = [
  { id: 'llama-3.1-8b-instant',      label: 'Llama 3.1 8B Instant', speed: 'Very Fast', best: 'Best for quick replies' },
  { id: 'llama-3.3-70b-versatile',   label: 'Llama 3.3 70B',        speed: 'Fast',      best: 'Highest quality answers' },
  { id: 'mixtral-8x7b-32768',        label: 'Mixtral 8×7B',         speed: 'Fast',      best: 'Long conversations' },
  { id: 'gemma2-9b-it',              label: 'Gemma 2 9B',           speed: 'Fast',      best: 'Balanced' },
];

const OLLAMA_MODELS = [
  // ─── Google Gemma Series (Recommended) ───
  { id: 'gemma4:latest',      label: 'Gemma 4 (Recommended)', size: '9.6GB', speed: 'Fast',      best: 'Best overall quality' },
  { id: 'gemma2:latest',      label: 'Gemma 2',               size: '5.4GB', speed: 'Fast',      best: 'Solid & balanced' },
  { id: 'gemma:latest',       label: 'Gemma',                 size: '2.5GB', speed: 'Very Fast', best: 'Lightweight' },

  // ─── Meta Llama Series ───
  { id: 'llama3.1:latest',    label: 'Llama 3.1 (Latest)',     size: '4.9GB', speed: 'Medium',    best: 'Proven & reliable' },
  { id: 'llama3:latest',      label: 'Llama 3',                size: '4.7GB', speed: 'Medium',    best: 'Popular choice' },
  { id: 'llama2:latest',      label: 'Llama 2',                size: '3.8GB', speed: 'Fast',      best: 'Classic' },
  { id: 'llama2-uncensored:latest', label: 'Llama 2 (Uncensored)', size: '3.8GB', speed: 'Fast', best: 'Unrestricted' },

  // ─── Mistral Series ───
  { id: 'mistral:latest',     label: 'Mistral 7B',             size: '4.4GB', speed: 'Medium',    best: 'Instruction-following' },
  { id: 'mistral-nemo:latest', label: 'Mistral Nemo',          size: '4.5GB', speed: 'Medium',    best: 'Refined version' },
  { id: 'mistral-openorca:latest', label: 'Mistral OpenOrca',  size: '4.7GB', speed: 'Medium',    best: 'Enhanced reasoning' },

  // ─── Microsoft Phi Series (Lightweight) ───
  { id: 'phi3.5:latest',      label: 'Phi 3.5 (Fast & Smart)', size: '2.3GB', speed: 'Very Fast', best: 'Lightweight, fast' },
  { id: 'phi3:latest',        label: 'Phi 3',                  size: '2.3GB', speed: 'Very Fast', best: 'Compact & efficient' },
  { id: 'phi:latest',         label: 'Phi (Original)',         size: '1.6GB', speed: 'Fastest',   best: 'Ultra-light' },

  // ─── Neural & Chat Models ───
  { id: 'neural-chat:latest', label: 'Neural Chat',            size: '4.4GB', speed: 'Medium',    best: 'Conversational' },
  { id: 'openchat:latest',    label: 'OpenChat',               size: '3.8GB', speed: 'Fast',      best: 'Chat optimized' },
  { id: 'starling-lm:latest', label: 'Starling LM',            size: '7.0GB', speed: 'Medium',    best: 'High quality chat' },
  { id: 'zephyr:latest',      label: 'Zephyr',                 size: '4.1GB', speed: 'Medium',    best: 'Conversation focus' },

  // ─── Specialized Models ───
  { id: 'dolphin-mixtral:latest', label: 'Dolphin Mixtral',    size: '26GB',  speed: 'Medium',    best: 'Strong reasoning' },
  { id: 'dolphin-phi:latest', label: 'Dolphin Phi',            size: '2.7GB', speed: 'Very Fast', best: 'Dolphin + lightweight' },
  { id: 'orca-mini:latest',   label: 'Orca Mini',              size: '1.6GB', speed: 'Fastest',   best: 'Fast with logic' },
  { id: 'tinyllama:latest',   label: 'TinyLlama',              size: '1.1GB', speed: 'Fastest',   best: 'Minimal resources' },

  // ─── Other Popular Models ───
  { id: 'qwen:latest',        label: 'Qwen',                   size: '4.7GB', speed: 'Medium',    best: 'Multilingual' },
  { id: 'solar:latest',       label: 'Solar',                  size: '6.1GB', speed: 'Medium',    best: 'Korean-optimized' },
  { id: 'vicuna:latest',      label: 'Vicuna',                 size: '7.3GB', speed: 'Medium',    best: 'Conversational' },

  // ─── Specialized Use Cases ───
  { id: 'nomic-embed-text:latest', label: 'Nomic Embed (Embeddings)', size: '0.3GB', speed: 'Fastest', best: 'Text embeddings' },
  { id: 'llava:latest',       label: 'LLaVA (Vision)',         size: '4.5GB', speed: 'Medium',    best: 'Image understanding' },

  // ─── Custom ───
  { id: 'custom',             label: 'Custom Model',           size: '',      speed: '',          best: 'Any Ollama model' },
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

type Tab = 'ai' | 'whatsapp' | 'hours' | 'voice' | 'language' | 'notifications';

export default function Configuration() {
  const [tab, setTab] = useState<Tab>('ai');
  const [saved, setSaved] = useState(false);
  const [aiProvider, setAiProvider] = useState<'ollama' | 'openai' | 'groq' | 'claude'>('ollama');
  // customModel is only used when the user selects the "Custom Model" card
  const [customModel, setCustomModel] = useState('');

  const utils = trpc.useUtils();
  // Use a ref (not state) so that remounting re-initialises the form without
  // triggering an extra re-render cycle that could race with pending refetches.
  const initializedRef = useRef(false);
  const { data: user } = trpc.auth.me.useQuery();
  const isAdmin = user?.role === 'admin';
  const { data: config, isLoading, isError, error } = trpc.botConfig.get.useQuery();
  const updateMutation = trpc.botConfig.update.useMutation({
    onSuccess: () => {
      // Invalidate so the next query reflects the actual DB value instead of
      // relying on an optimistic cache patch that could mask a failed write.
      utils.botConfig.get.invalidate();
      // Reset initializedRef so that when config refetches, the useEffect will
      // run and update the form with the fresh DB values
      initializedRef.current = false;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => {
      console.error('[botConfig.update] save failed:', err);
      alert(`Failed to save configuration: ${err.message}`);
    },
  });

  const [form, setForm] = useState({
    businessName: '',
    systemPrompt: '',
    aiProvider: 'ollama',
    aiApiUrl: 'http://host.docker.internal:11434/v1',
    aiApiKey: 'ollama',
    aiModel: 'neural-chat',
    claudeApiKey: '',
    claudeModel: 'claude-3-5-sonnet-20241022',
    phoneNumberId: '',
    accessToken: '',
    verifyToken: '',
    businessHoursEnabled: false,
    businessHoursTimezone: 'Africa/Johannesburg',
    businessHoursStart: '08:00',
    businessHoursEnd: '17:00',
    businessDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    afterHoursMessage: '',
    maxConversationLength: 50,
    escalationEmail: '',
    escalationPhone: '',
    // Language
    language: 'en',
    enableMultiLanguage: false,
    // Voice
    enableVoiceTranscription: false,
    enableVoiceResponse: false,
    ttsVoice: 'alloy',
    whisperApiUrl: '',
    // Notification preferences
    enableApptConfirmation: true,
    enableFollowUp: true,
    enableNoShowNotify: true,
    enableDailySummary: true,
    enableWeeklyReport: true,
    enableReEngagement: false,
    reEngagementDays: 30,
    reEngagementMessage: '',
    // Webhook
    enableWebhook: false,
    webhookUrl: '',
    // AI Fallback (legacy)
    aiFallbackModel: '',
    aiFallbackApiUrl: '',
    aiFallbackApiKey: '',
    // Dual AI Fallback (Groq + Ollama)
    fallbackAiEnabled: true,
    fallbackAiModel: 'neural-chat',
    fallbackAiUrl: 'http://localhost:11434/v1',
    fallbackAiKey: 'ollama',
    fallbackAiTimeout: 8000,
    // Birthday messages
    enableBirthdayMessages: false,
    birthdayMessage: '',
    // Conversation auto-close
    enableConversationAutoClose: false,
    autoCloseDays: 7,
  });

  // ── Derive selectedModel from form.aiModel (single source of truth) ─────────
  // If the current aiModel value doesn't match any known card ID, treat it as
  // a custom entry so the "Custom Model" card highlights correctly.
  const _knownModelIds = new Set([
    ...OLLAMA_MODELS.map((m) => m.id),
    ...GROQ_MODELS.map((m) => m.id),
    'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo',
  ]);
  const selectedModel = _knownModelIds.has(form.aiModel) ? form.aiModel
    : form.aiModel ? 'custom'
    : 'neural-chat';

  useEffect(() => {
    if (config && !initializedRef.current) {
      initializedRef.current = true;
      setForm((prev) => ({ ...prev, ...config }));
      const url = config.aiApiUrl || '';
      const isOllama = url.includes('11434') || config.aiApiKey === 'ollama';
      const isGroq   = url.includes('groq.com');
      const isClaude = config.aiProvider === 'claude';
      setAiProvider(isClaude ? 'claude' : isOllama ? 'ollama' : isGroq ? 'groq' : 'openai');
      // If the saved model is a custom (unknown) value, pre-fill the custom input
      if (config.aiModel && !_knownModelIds.has(config.aiModel)) {
        setCustomModel(config.aiModel);
      }
    }
  }, [config]);

  const handleProviderChange = (provider: 'ollama' | 'openai' | 'groq' | 'claude') => {
    if (provider === aiProvider) return;
    setAiProvider(provider);
    if (provider === 'ollama') {
      // Restore saved Ollama model if it was previously an Ollama config,
      // otherwise fall back to the default (neural-chat — faster than gemma4).
      const restoredModel =
        config?.aiModel &&
        !config.aiApiUrl?.includes('groq') &&
        !config.aiApiUrl?.includes('openai')
          ? config.aiModel
          : 'neural-chat';
      setForm((prev) => ({
        ...prev,
        aiProvider: 'ollama',
        aiApiUrl: 'http://host.docker.internal:11434/v1',
        aiApiKey: 'ollama',
        aiModel: restoredModel,
        // Clear Claude fields
        claudeApiKey: '',
        claudeModel: 'claude-3-5-sonnet-20241022',
      }));
    } else if (provider === 'groq') {
      setForm((prev) => ({
        ...prev,
        aiProvider: 'groq',
        aiApiUrl: 'https://api.groq.com/openai/v1',
        aiApiKey: '',
        aiModel: 'llama-3.1-8b-instant',
        // Clear Claude fields
        claudeApiKey: '',
        claudeModel: 'claude-3-5-sonnet-20241022',
      }));
    } else if (provider === 'claude') {
      setForm((prev) => ({
        ...prev,
        aiProvider: 'claude',
        // Clear OpenAI/Groq/Ollama fields
        aiApiUrl: '',
        aiApiKey: '',
        aiModel: '',
        // Set Claude fields
        claudeApiKey: '',
        claudeModel: 'claude-3-5-sonnet-20241022',
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        aiProvider: 'openai',
        aiApiUrl: 'https://api.openai.com/v1',
        aiApiKey: '',
        aiModel: 'gpt-4o-mini',
        // Clear Claude fields
        claudeApiKey: '',
        claudeModel: 'claude-3-5-sonnet-20241022',
      }));
    }
  };

  const handleModelChange = (modelId: string) => {
    if (modelId === 'custom') {
      // Enter custom mode — keep form.aiModel as customModel (user will type)
      setForm((prev) => ({ ...prev, aiModel: customModel || '' }));
    } else {
      setForm((prev) => ({ ...prev, aiModel: modelId }));
      setCustomModel('');
    }
  };

  const toggleDay = (day: string) => {
    setForm((prev) => ({
      ...prev,
      businessDays: prev.businessDays.includes(day)
        ? prev.businessDays.filter((d) => d !== day)
        : [...prev.businessDays, day],
    }));
  };

  // form.aiModel is always the definitive value — no separate selectedModel state
  const handleSave = () => {
    updateMutation.mutate({ ...form });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="text-red-500 text-lg font-semibold">Failed to load configuration</div>
        <div className="text-sm text-gray-500 max-w-md font-mono bg-gray-100 rounded p-3">
          {(error as any)?.message || "Unknown server error"}
        </div>
        <p className="text-xs text-gray-400">Check the server terminal for more details.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'ai', label: 'AI & Model', icon: <Bot className="w-4 h-4" /> },
    { key: 'whatsapp', label: 'WhatsApp', icon: <Phone className="w-4 h-4" /> },
    { key: 'voice', label: 'Voice', icon: <Globe className="w-4 h-4" /> },
    { key: 'language', label: 'Language', icon: <Globe className="w-4 h-4" /> },
    { key: 'hours', label: 'Business Hours', icon: <Clock className="w-4 h-4" /> },
    { key: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
          <p className="text-gray-500 text-sm mt-0.5">Configure your AI receptionist settings</p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } disabled:opacity-60`}
        >
          {updateMutation.isPending ? (
            <><Spinner size="sm" className="border-white border-t-blue-200" />Saving...</>
          ) : saved ? (
            <><CheckCircle className="w-4 h-4" />Saved!</>
          ) : (
            <><Save className="w-4 h-4" />Save Changes</>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* AI & Model Tab */}
      {tab === 'ai' && (
        <div className="space-y-6">
          {/* Business Name */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Business Identity</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
              <input
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="My Business"
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">AI System Prompt</label>
              <textarea
                rows={5}
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="You are a helpful receptionist for [Business Name]. Be professional, friendly, and concise..."
              />
            </div>
          </div>

          {/* AI Provider */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-4">AI Provider</h3>

            <div className="grid grid-cols-4 gap-3 mb-6">
              {/* Groq — recommended */}
              <button
                onClick={() => handleProviderChange('groq')}
                className={`p-4 rounded-xl border-2 text-left transition relative ${
                  aiProvider === 'groq' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="absolute -top-2 left-3 text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold">RECOMMENDED</span>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Bot className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">Groq</p>
                    <p className="text-xs text-orange-600 font-medium">FREE · Cloud</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Free API key, blazing fast. Best option to get started.</p>
              </button>

              {/* Ollama */}
              <button
                onClick={() => handleProviderChange('ollama')}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  aiProvider === 'ollama' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <Terminal className="w-4 h-4 text-green-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">Ollama</p>
                    <p className="text-xs text-green-600 font-medium">FREE · Local</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Runs on your computer. Private data, no internet needed.</p>
              </button>

              {/* OpenAI */}
              <button
                onClick={() => handleProviderChange('openai')}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  aiProvider === 'openai' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Bot className="w-4 h-4 text-blue-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">OpenAI</p>
                    <p className="text-xs text-blue-600 font-medium">Cloud · Paid</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">GPT-4o, GPT-4-turbo. Best quality, requires paid API key.</p>
              </button>

              {/* Claude */}
              <button
                onClick={() => handleProviderChange('claude')}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  aiProvider === 'claude' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Bot className="w-4 h-4 text-purple-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">Claude</p>
                    <p className="text-xs text-purple-600 font-medium">Cloud · Paid</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Anthropic's Claude. Advanced reasoning and capabilities.</p>
              </button>
            </div>

            {aiProvider === 'ollama' && (
              <>
                {/* Model Selector */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Model</label>
                  <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
                    {[...OLLAMA_MODELS].sort((a, b) => {
                      if (a.id === selectedModel) return -1;
                      if (b.id === selectedModel) return 1;
                      return 0;
                    }).map((m) => {
                      const isSelected = selectedModel === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => handleModelChange(m.id)}
                          className={`flex items-center justify-between p-3 rounded-lg border-2 text-left transition ${
                            isSelected
                              ? 'border-green-500 bg-green-50 shadow-sm'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                            )}
                            <div>
                              <p className={`text-sm font-medium ${isSelected ? 'text-green-700' : 'text-gray-800'}`}>
                                {m.label}
                                {isSelected && <span className="ml-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Active</span>}
                              </p>
                              <p className="text-xs text-gray-400">{m.best}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {m.size && <p className="text-xs font-medium text-gray-600">{m.size}</p>}
                            {m.speed && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                m.speed === 'Very Fast' ? 'bg-green-100 text-green-700' :
                                m.speed === 'Fast' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                              }`}>{m.speed}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedModel === 'custom' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Custom Model Name</label>
                    <input
                      value={customModel}
                      onChange={(e) => {
                        setCustomModel(e.target.value);
                        setForm((prev) => ({ ...prev, aiModel: e.target.value }));
                      }}
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="e.g., llama3.2:latest or my-finetuned-model"
                    />
                  </div>
                )}

                {/* Pull Command */}
                <div className="p-3 bg-gray-900 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Run in terminal to download model:</p>
                  <code className="text-sm text-green-400 font-mono">
                    ollama pull {selectedModel === 'custom' ? (customModel || 'gemma4:latest') : selectedModel}
                  </code>
                </div>

                <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                  Ollama API: <code className="font-mono">{form.aiApiUrl}</code>
                  <br />
                  <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline mt-1">
                    Browse all models <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </>
            )}

            {aiProvider === 'openai' && (
              <div className="space-y-4">
                {isAdmin ? (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <span className="font-semibold">API keys configured via .env</span><br />
                      <span className="text-xs text-blue-700 mt-1 block">Admin users use system-wide keys from environment variables. Individual tenants can configure their own keys if needed.</span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Key <span className="text-xs text-gray-400">(optional — leave blank to use default)</span></label>
                    <input
                      type="password"
                      value={form.aiApiKey}
                      onChange={(e) => setForm({ ...form, aiApiKey: e.target.value })}
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="sk-... (or leave empty)"
                    />
                  </div>
                )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                  <select
                    value={form.aiModel}
                    onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="gpt-4o">GPT-4o (Recommended)</option>
                    <option value="gpt-4o-mini">GPT-4o Mini (Fast)</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
                </div>
              </div>
            )}

            {aiProvider === 'groq' && (
              <div className="space-y-4">
                {/* Free tier notice */}
                <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                  <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Free tier — no credit card required</p>
                    <p className="text-xs text-orange-700 mt-0.5">Groq gives you free API calls with generous rate limits. Perfect for getting started.</p>
                  </div>
                </div>

                {/* API Key */}
                {isAdmin ? (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-800">
                      <span className="font-semibold">API keys configured via .env</span><br />
                      <span className="text-xs text-orange-700 mt-1 block">Admin users use system-wide keys from environment variables. Individual tenants can configure their own keys if needed.</span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Groq API Key <span className="text-xs text-gray-400">(optional — leave blank to use default)</span></label>
                    <input
                      type="password"
                      value={form.aiApiKey}
                      onChange={(e) => setForm({ ...form, aiApiKey: e.target.value })}
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="gsk_... (or leave empty)"
                    />
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      Get your free key at{' '}
                      <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline inline-flex items-center gap-0.5">
                        console.groq.com <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                  </div>
                )}
                </div>

                {/* Model selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Model</label>
                  <div className="grid grid-cols-1 gap-2">
                    {GROQ_MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleModelChange(m.id)}
                        className={`flex items-center justify-between p-3 rounded-lg border text-left transition ${
                          selectedModel === m.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800">{m.label}</p>
                          <p className="text-xs text-gray-400">{m.best}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.speed === 'Very Fast' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>{m.speed}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                  API endpoint: <code className="font-mono">https://api.groq.com/openai/v1</code>
                </div>
              </div>
            )}

            {aiProvider === 'claude' && (
              <div className="space-y-4">
                {/* Claude API Key */}
                {isAdmin ? (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm text-purple-800">
                      <span className="font-semibold">API keys configured via .env</span><br />
                      <span className="text-xs text-purple-700 mt-1 block">Admin users use system-wide keys from environment variables. Individual tenants can configure their own keys if needed.</span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Claude API Key <span className="text-xs text-gray-400">(optional — leave blank to use default)</span></label>
                    <input
                      type="password"
                      value={(form as any).claudeApiKey ?? ''}
                      onChange={(e) => setForm({ ...form, claudeApiKey: e.target.value } as any)}
                      className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="sk-ant-... (or leave empty)"
                    />
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      Get your key at{' '}
                      <a href="https://console.anthropic.com/account/keys" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline inline-flex items-center gap-0.5">
                        console.anthropic.com <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                  </div>
                )}
                </div>

                {/* Claude Model Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Claude Model</label>
                  <select
                    value={(form as any).claudeModel ?? 'claude-3-5-sonnet-20241022'}
                    onChange={(e) => setForm({ ...form, claudeModel: e.target.value } as any)}
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Latest, Recommended)</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Faster, Cheaper)</option>
                    <option value="claude-3-opus-20240229">Claude 3 Opus (Most Powerful)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Sonnet offers the best balance of speed and quality for most tasks.</p>
                </div>

                <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 text-sm text-purple-900 space-y-2">
                  <p className="font-medium">💜 About Claude</p>
                  <ul className="text-xs space-y-1 list-disc list-inside text-purple-800">
                    <li>Advanced reasoning and long-context understanding</li>
                    <li>Excellent at complex tasks, analysis, and code</li>
                    <li>Requires paid API access (no free tier)</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Dual AI Fallback (Groq + Ollama) */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-800">Fallback AI Model</h3>
                <label className="flex items-center gap-2 ml-auto">
                  <input
                    type="checkbox"
                    checked={(form as any).fallbackAiEnabled ?? true}
                    onChange={(e) => setForm({ ...form, fallbackAiEnabled: e.target.checked } as any)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable Fallback</span>
                </label>
              </div>
              <p className="text-sm text-gray-500">
                If the primary model fails, automatically retry with this fallback. Best for reliability.
              </p>
            </div>

            {(form as any).fallbackAiEnabled && (
              <>
                {/* Fallback Model Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Fallback Model</label>
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                    {OLLAMA_MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setForm({ ...form, fallbackAiModel: m.id } as any)}
                        className={`flex items-center justify-between p-3 rounded-lg border-2 text-left transition ${
                          (form as any).fallbackAiModel === m.id
                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div>
                          <p className={`text-sm font-medium ${(form as any).fallbackAiModel === m.id ? 'text-blue-700' : 'text-gray-800'}`}>
                            {m.label}
                          </p>
                          <p className="text-xs text-gray-400">{m.best}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.speed === 'Very Fast' ? 'bg-green-100 text-green-700' :
                          m.speed === 'Fast' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{m.speed}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fallback API URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fallback API URL</label>
                  <input
                    type="text"
                    value={(form as any).fallbackAiUrl ?? ''}
                    onChange={(e) => setForm({ ...form, fallbackAiUrl: e.target.value } as any)}
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. http://localhost:11434/v1"
                  />
                  <p className="text-xs text-gray-400 mt-1">For Ollama: http://localhost:11434/v1</p>
                </div>

                {/* Fallback API Key */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fallback API Key</label>
                  <input
                    type="text"
                    value={(form as any).fallbackAiKey ?? ''}
                    onChange={(e) => setForm({ ...form, fallbackAiKey: e.target.value } as any)}
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. ollama for local Ollama"
                  />
                  <p className="text-xs text-gray-400 mt-1">For Ollama: use "ollama"</p>
                </div>

                {/* Fallback Timeout */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fallback Timeout (ms)</label>
                  <input
                    type="number"
                    value={(form as any).fallbackAiTimeout ?? 8000}
                    onChange={(e) => setForm({ ...form, fallbackAiTimeout: Number(e.target.value) } as any)}
                    className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={1000}
                    max={30000}
                    step={1000}
                  />
                  <p className="text-xs text-gray-400 mt-1">How long to wait for fallback response (8000ms = 8 seconds)</p>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  ✅ Recommended: Use Ollama locally for fallback. Runs free on your machine, no API keys needed.
                </div>
              </>
            )}
          </div>

          {/* Response Settings */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Response Behaviour</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Response Delay (ms)</label>
                <input
                  type="number"
                  value={form.responseDelay}
                  onChange={(e) => setForm({ ...form, responseDelay: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={0}
                  max={10000}
                />
                <p className="text-xs text-gray-400 mt-1">Delay before sending (humanizes responses)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Conversation Length</label>
                <input
                  type="number"
                  value={form.maxConversationLength}
                  onChange={(e) => setForm({ ...form, maxConversationLength: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min={5}
                  max={200}
                />
                <p className="text-xs text-gray-400 mt-1">Max messages before auto-escalate</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Tab */}
      {tab === 'whatsapp' && <WhatsAppTab form={form} setForm={setForm} />}

      {/* Voice Tab */}
      {tab === 'voice' && (
        <div className="space-y-5">
          {/* Voice Transcription */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">🎤 Voice Message Transcription</h3>
                <p className="text-xs text-gray-500 mt-0.5">Convert incoming voice notes to text before AI processing</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer"
                  checked={form.enableVoiceTranscription}
                  onChange={e => setForm({ ...form, enableVoiceTranscription: e.target.checked })} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>
            {form.enableVoiceTranscription && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Requires <strong>OpenAI API key</strong> (Whisper model). Set your API key in the <strong>AI & Model</strong> tab using the OpenAI provider. Does not work with Ollama.</p>
              </div>
            )}
            {form.enableVoiceTranscription && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Whisper API URL <span className="text-gray-400 font-normal">(optional override)</span></label>
                <input
                  value={form.whisperApiUrl}
                  onChange={e => setForm({ ...form, whisperApiUrl: e.target.value })}
                  className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Leave blank to use your AI API URL (default)"
                />
                <p className="text-xs text-gray-400 mt-1">Only set this if your Whisper endpoint is different from your AI API</p>
              </div>
            )}
          </div>

          {/* Voice Response (TTS) */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">🔊 Voice Response (Text-to-Speech)</h3>
                <p className="text-xs text-gray-500 mt-0.5">Reply to voice messages with an audio note instead of text</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer"
                  checked={form.enableVoiceResponse}
                  onChange={e => setForm({ ...form, enableVoiceResponse: e.target.checked })} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>
            {form.enableVoiceResponse && (
              <>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>Requires <strong>OpenAI API key</strong> (TTS model). Voice transcription must also be enabled.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Voice Character</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'alloy', label: 'Alloy', desc: 'Neutral' },
                      { id: 'echo', label: 'Echo', desc: 'Male' },
                      { id: 'fable', label: 'Fable', desc: 'British' },
                      { id: 'onyx', label: 'Onyx', desc: 'Deep male' },
                      { id: 'nova', label: 'Nova', desc: 'Female' },
                      { id: 'shimmer', label: 'Shimmer', desc: 'Soft female' },
                    ].map(v => (
                      <button key={v.id} type="button"
                        onClick={() => setForm({ ...form, ttsVoice: v.id })}
                        className={`p-3 rounded-lg border text-left transition ${form.ttsVoice === v.id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <p className="text-sm font-medium text-gray-800">{v.label}</p>
                        <p className="text-xs text-gray-400">{v.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Language Tab */}
      {tab === 'language' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
          <h3 className="font-semibold text-gray-800">🌍 Language Settings</h3>

          {/* Default language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Response Language</label>
            <select
              value={form.language}
              onChange={e => setForm({ ...form, language: e.target.value })}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[
                { code: 'en', name: 'English' }, { code: 'af', name: 'Afrikaans' },
                { code: 'zu', name: 'Zulu' }, { code: 'xh', name: 'Xhosa' },
                { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
                { code: 'de', name: 'German' }, { code: 'pt', name: 'Portuguese' },
                { code: 'ar', name: 'Arabic' }, { code: 'zh', name: 'Chinese (Mandarin)' },
                { code: 'hi', name: 'Hindi' }, { code: 'it', name: 'Italian' },
                { code: 'nl', name: 'Dutch' }, { code: 'ru', name: 'Russian' },
                { code: 'ja', name: 'Japanese' }, { code: 'ko', name: 'Korean' },
                { code: 'sw', name: 'Swahili' }, { code: 'tr', name: 'Turkish' },
              ].map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Used when auto-detect is off, or as fallback</p>
          </div>

          {/* Auto-detect toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <p className="font-medium text-gray-800 text-sm">Auto-Detect Customer Language</p>
              <p className="text-xs text-gray-500 mt-0.5">Detects each customer's language and always replies in their language</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer"
                checked={form.enableMultiLanguage}
                onChange={e => setForm({ ...form, enableMultiLanguage: e.target.checked })} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>

          {form.enableMultiLanguage && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 space-y-1">
              <p className="font-medium">✅ Auto-detect enabled</p>
              <p>The AI will detect the customer's language from their message and respond in that same language. Supported: English, Afrikaans, Zulu, Xhosa, Spanish, French, German, Portuguese, Arabic, Chinese, and more.</p>
            </div>
          )}

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
            <p className="font-medium mb-1">💡 Tips for best results</p>
            <p>Add your <strong>system prompt</strong> (AI & Model tab) in your primary language. When auto-detect is on, the AI is instructed to match the customer's language. No translation API needed — your AI model handles it all.</p>
          </div>
        </div>
      )}

      {/* Business Hours Tab */}
      {tab === 'hours' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Business Hours</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.businessHoursEnabled}
                onChange={(e) => setForm({ ...form, businessHoursEnabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-600">Enable</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <select
                value={form.businessHoursTimezone}
                onChange={(e) => setForm({ ...form, businessHoursTimezone: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {['Africa/Johannesburg', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Dubai', 'Asia/Kolkata'].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opens</label>
              <input
                type="time"
                value={form.businessHoursStart}
                onChange={(e) => setForm({ ...form, businessHoursStart: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Closes</label>
              <input
                type="time"
                value={form.businessHoursEnd}
                onChange={(e) => setForm({ ...form, businessHoursEnd: e.target.value })}
                className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Open Days</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    form.businessDays.includes(day)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">After-Hours Message</label>
            <textarea
              rows={3}
              value={form.afterHoursMessage}
              onChange={(e) => setForm({ ...form, afterHoursMessage: e.target.value })}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="We're currently closed. Our business hours are Mon-Fri 8am-5pm. We'll respond when we open!"
            />
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {tab === 'notifications' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Escalation Notifications</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.notificationsEnabled}
                onChange={(e) => setForm({ ...form, notificationsEnabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-600">Enable</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Escalation Email</label>
            <input
              type="email"
              value={form.escalationEmail}
              onChange={(e) => setForm({ ...form, escalationEmail: e.target.value })}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="manager@yourbusiness.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Escalation WhatsApp Number</label>
            <input
              value={form.escalationPhone}
              onChange={(e) => setForm({ ...form, escalationPhone: e.target.value })}
              className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+27821234567"
            />
          </div>

          {/* Automated message preferences */}
          <div className="pt-4 border-t border-gray-100">
            <h4 className="font-semibold text-gray-700 text-sm mb-3">Automated Messages</h4>
            <div className="space-y-3">
              {[
                { key: "enableApptConfirmation", label: "Appointment Confirmation", desc: "WhatsApp customer when an appointment is booked" },
                { key: "enableFollowUp", label: "Follow-up Messages", desc: "Ask for a rating 2h after a completed appointment" },
                { key: "enableNoShowNotify", label: "No-show Notifications", desc: "Notify you when a customer doesn't show up" },
                { key: "enableDailySummary", label: "Daily Summary", desc: "WhatsApp you at 8am with today's appointments" },
                { key: "enableWeeklyReport", label: "Weekly Report Email", desc: "Email you every Monday with weekly stats" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={(form as any)[key] ?? true}
                      onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>
              ))}

              {/* Re-engagement */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">Re-engagement Campaigns</p>
                  <p className="text-xs text-gray-400">Auto-message dormant customers</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={form.enableReEngagement ?? false}
                    onChange={(e) => setForm({ ...form, enableReEngagement: e.target.checked })}
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>

              {form.enableReEngagement && (
                <div className="ml-4 space-y-3 bg-blue-50 rounded-lg p-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Days inactive before re-engagement</label>
                    <input
                      type="number"
                      min={7}
                      max={365}
                      value={form.reEngagementDays ?? 30}
                      onChange={(e) => setForm({ ...form, reEngagementDays: parseInt(e.target.value) || 30 })}
                      className="w-24 px-2 py-1 text-sm border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Re-engagement message (use {"{name}"} for personalisation)</label>
                    <textarea
                      rows={2}
                      value={form.reEngagementMessage ?? ""}
                      onChange={(e) => setForm({ ...form, reEngagementMessage: e.target.value })}
                      placeholder="Hi {name}! We miss you — how can we help today?"
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Birthday messages */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-gray-700 text-sm">🎂 Birthday Messages</h4>
                <p className="text-xs text-gray-400">Auto-send a WhatsApp greeting on customer birthdays (requires DOB saved on profile)</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={(form as any).enableBirthdayMessages ?? false}
                  onChange={(e) => setForm({ ...form, enableBirthdayMessages: e.target.checked } as any)}
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
            {(form as any).enableBirthdayMessages && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700">Birthday Message <span className="text-gray-400">(use {"{name}"} for customer name)</span></label>
                <textarea
                  rows={3}
                  value={(form as any).birthdayMessage ?? ""}
                  onChange={(e) => setForm({ ...form, birthdayMessage: e.target.value } as any)}
                  placeholder="🎂 Happy Birthday, {name}! Wishing you a wonderful day from all of us at [Business Name]! 🎉"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400">Sent at 9am on the customer's birthday. Leave blank to use the default message.</p>
              </div>
            )}
          </div>

          {/* Conversation auto-close */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-gray-700 text-sm">🧹 Conversation Auto-close</h4>
                <p className="text-xs text-gray-400">Automatically archive inactive non-escalated conversations</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={(form as any).enableConversationAutoClose ?? false}
                  onChange={(e) => setForm({ ...form, enableConversationAutoClose: e.target.checked } as any)}
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
            {(form as any).enableConversationAutoClose && (
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-700 flex-shrink-0">Close after</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={(form as any).autoCloseDays ?? 7}
                  onChange={(e) => setForm({ ...form, autoCloseDays: parseInt(e.target.value) || 7 } as any)}
                  className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                />
                <label className="text-xs text-gray-500">days of inactivity</label>
              </div>
            )}
          </div>

          {/* Outbound webhook */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-gray-700 text-sm">Outbound Webhook</h4>
                <p className="text-xs text-gray-400">POST events to Zapier, Make, or your own endpoint</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={form.enableWebhook ?? false}
                  onChange={(e) => setForm({ ...form, enableWebhook: e.target.checked })}
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
            {form.enableWebhook && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700">Webhook URL</label>
                <input
                  type="url"
                  value={form.webhookUrl ?? ""}
                  onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400">Events fired: <code className="bg-gray-100 px-1 rounded">appointment.booked</code> · <code className="bg-gray-100 px-1 rounded">appointment.status_changed</code> · <code className="bg-gray-100 px-1 rounded">conversation.escalated</code></p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
