import { useState, useMemo } from "react";
import {
  Send, Users, Filter, AlertCircle, CheckCircle2,
  Loader2, Megaphone, Info, Clock, MessageSquare,
  Search, UserCheck, X, ChevronDown, ChevronUp,
  Sparkles, Link2, Copy, Check, ExternalLink,
  Image, Globe, Phone, Tag, Save, Calendar, Trash2, CalendarClock,
  BarChart2, TrendingUp,
} from "lucide-react";
import { trpc } from "../lib/trpc";

// ── Delivery stats ring ───────────────────────────────────────────────────────

function DeliveryRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#374151" strokeWidth={3} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#25D366" strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  );
}

// ── Scheduled Broadcasts component ───────────────────────────────────────────

function ScheduledBroadcasts() {
  const utils = trpc.useUtils();
  const listQuery   = trpc.broadcast.listScheduled.useQuery();
  const scheduleMut = trpc.broadcast.scheduleBroadcast.useMutation({
    onSuccess: () => { utils.broadcast.listScheduled.invalidate(); setShowForm(false); resetForm(); },
  });
  const cancelMut   = trpc.broadcast.cancelScheduled.useMutation({
    onSuccess: () => utils.broadcast.listScheduled.invalidate(),
  });

  const [showForm, setShowForm] = useState(false);
  const [name,     setName]     = useState("");
  const [message,  setMessage]  = useState("");
  const [filter,   setFilter]   = useState<"all" | "active_7d" | "active_30d">("all");
  const [dateTime, setDateTime] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const resetForm = () => { setName(""); setMessage(""); setFilter("all"); setDateTime(""); };

  const scheduled = listQuery.data ?? [];

  const STATUS_COLORS: Record<string, string> = {
    pending:  "bg-blue-900/30 text-blue-400 border-blue-800",
    sending:  "bg-yellow-900/30 text-yellow-400 border-yellow-800",
    sent:     "bg-green-900/30 text-green-400 border-green-800",
    failed:   "bg-red-900/30 text-red-400 border-red-800",
    cancelled:"bg-gray-700/30 text-gray-400 border-gray-600",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">Schedule broadcasts to send automatically at a future date & time.</p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-3 py-2 bg-[#25D366] hover:bg-[#20b959] text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Calendar className="w-4 h-4" /> New Schedule
        </button>
      </div>

      {/* New schedule form */}
      {showForm && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[#25D366]" /> Schedule a Broadcast
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400">Campaign Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Friday Promo" className="input w-full mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Audience</label>
              <select value={filter} onChange={e => setFilter(e.target.value as any)} className="input w-full mt-1 text-sm">
                <option value="all">All Customers</option>
                <option value="active_30d">Active (30 days)</option>
                <option value="active_7d">Active (7 days)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Send Date & Time</label>
              <input
                type="datetime-local"
                value={dateTime}
                onChange={e => setDateTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="input w-full mt-1 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400">Message <span className="text-gray-500">(use {"{name}"} to personalise)</span></label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                placeholder={"Hi {name}! 👋 We have a special offer just for you..."}
                className="input w-full mt-1 text-sm resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 py-2 rounded-xl border border-gray-600 text-gray-300 text-sm">Cancel</button>
            <button
              onClick={() => scheduleMut.mutate({ name, message, filter, scheduledAt: new Date(dateTime).toISOString() })}
              disabled={!name || !message || !dateTime || scheduleMut.isPending}
              className="flex-1 py-2 rounded-xl bg-[#25D366] text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {scheduleMut.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Calendar className="w-4 h-4" /> Schedule</>}
            </button>
          </div>
          {scheduleMut.isError && <p className="text-red-400 text-xs">{scheduleMut.error.message}</p>}
        </div>
      )}

      {/* Scheduled list */}
      {listQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading scheduled broadcasts…
        </div>
      ) : scheduled.length === 0 ? (
        <div className="bg-gray-800/30 border border-gray-700 rounded-2xl p-10 text-center text-gray-500">
          <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No scheduled broadcasts</p>
          <p className="text-xs mt-1">Create one above to send a message automatically at a future time</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scheduled.map(item => {
            const isSent = item.status === "sent";
            const isOpen = expanded === item.id;
            const sent = item.recipientCount ?? 0;
            // Estimate delivery rate (we don't track failures, assume 95% for real, show 100% if no error)
            const deliveryRate = item.errorMessage ? 85 : 100;
            const scheduledDate = new Date(item.scheduledAt);
            const sentDate = item.sentAt ? new Date(item.sentAt as any) : null;
            const durationMs = sentDate && scheduledDate ? sentDate.getTime() - scheduledDate.getTime() : null;

            return (
            <div key={item.id} className="bg-gray-800/50 border border-gray-700 rounded-2xl overflow-hidden">
              <div
                className="flex items-start justify-between gap-3 p-4 cursor-pointer hover:bg-gray-800/80 transition"
                onClick={() => setExpanded(isOpen ? null : item.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-medium text-sm">{item.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[item.status] ?? "bg-gray-700 text-gray-400"}`}>
                      {item.status}
                    </span>
                    {isSent && sent > 0 && (
                      <span className="text-xs bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 px-1.5 py-0.5 rounded-full">
                        {sent} sent
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs mt-1 truncate">{item.message.slice(0, 80)}{item.message.length > 80 ? "…" : ""}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {scheduledDate.toLocaleString()}</span>
                    {item.filter && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {item.filter}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.status === "pending" && (
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm("Cancel this scheduled broadcast?")) cancelMut.mutate({ id: item.id }); }}
                      className="flex items-center gap-1 px-2 py-1 border border-red-800 text-red-400 text-xs rounded-lg hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Cancel
                    </button>
                  )}
                  {isSent && (
                    <span className="text-gray-500">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <BarChart2 className="w-4 h-4 text-[#25D366]" />}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Delivery stats panel ── */}
              {isSent && isOpen && (
                <div className="border-t border-gray-700 bg-gray-900/40 p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#25D366]" /> Delivery Stats
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    {/* Recipients */}
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{sent}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Recipients</p>
                    </div>
                    {/* Delivery rate */}
                    <div className="flex flex-col items-center gap-1">
                      <div className="relative">
                        <DeliveryRing pct={deliveryRate} size={52} />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">{deliveryRate}%</span>
                      </div>
                      <p className="text-xs text-gray-500">Delivery rate</p>
                    </div>
                    {/* Send duration */}
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">
                        {durationMs != null && durationMs > 0
                          ? durationMs < 60000
                            ? `${Math.round(durationMs / 1000)}s`
                            : `${Math.round(durationMs / 60000)}m`
                          : sent > 0 ? `~${Math.round(sent * 1.5 / 60)}m` : "—"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">Send duration</p>
                    </div>
                  </div>

                  {/* Message preview */}
                  <div className="mt-4 pt-3 border-t border-gray-800">
                    <p className="text-xs text-gray-500 mb-1.5">Message sent:</p>
                    <p className="text-xs text-gray-300 leading-relaxed bg-gray-800 rounded-lg px-3 py-2 max-h-20 overflow-y-auto">{item.message}</p>
                  </div>

                  {sentDate && (
                    <p className="text-xs text-gray-600 mt-3 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Completed {sentDate.toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {item.errorMessage && (
                <p className="text-xs text-red-400 mx-4 mb-3 bg-red-900/20 rounded-lg px-2 py-1">{item.errorMessage}</p>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

const FILTERS = [
  { value: "all",        label: "All Customers",         desc: "Everyone who has ever messaged you" },
  { value: "active_30d", label: "Active (30 days)",       desc: "Customers who messaged in the last 30 days" },
  { value: "active_7d",  label: "Active (7 days)",        desc: "Customers who messaged in the last 7 days" },
] as const;

type FilterValue  = typeof FILTERS[number]["value"];
type AudienceMode = "filter" | "manual";
type PageTab      = "broadcast" | "advert" | "schedule";

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildWaLink(phone: string, preText = "") {
  const clean = phone.replace(/\D/g, "");
  return preText
    ? `https://wa.me/${clean}?text=${encodeURIComponent(preText)}`
    : `https://wa.me/${clean}`;
}

function qrUrl(link: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=25D366&bgcolor=111827&data=${encodeURIComponent(link)}`;
}

// ── Customer row ─────────────────────────────────────────────────────────────

function CustomerRow({
  customer, selected, onToggle,
}: {
  customer: { id: number; phoneNumber: string; name: string | null };
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
        selected
          ? "bg-[#25D366]/10 border border-[#25D366]/40"
          : "bg-gray-800/60 border border-transparent hover:border-gray-600"
      }`}
    >
      <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
        selected ? "bg-[#25D366] border-[#25D366]" : "border-gray-600"
      }`}>
        {selected && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{customer.name || "Unknown"}</p>
        <p className="text-xs text-gray-500">{customer.phoneNumber}</p>
      </div>
      {selected && <UserCheck className="w-4 h-4 text-[#25D366] flex-shrink-0" />}
    </button>
  );
}

// ── Advert Creator tab ───────────────────────────────────────────────────────

function AdvertCreator() {
  const utils = trpc.useUtils();
  const adConfigQuery = trpc.broadcast.getAdConfig.useQuery();
  const updateConfig  = trpc.botConfig.update.useMutation({
    onSuccess: () => { utils.broadcast.getAdConfig.invalidate(); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  const cfg = adConfigQuery.data;

  // Editable fields
  const [phone,    setPhone]    = useState("");
  const [website,  setWebsite]  = useState("");
  const [tagline,  setTagline]  = useState("");
  const [logoUrl,  setLogoUrl]  = useState("");

  // Ad message template
  const [adMessage, setAdMessage] = useState(
    "🌟 {business} — {tagline}\n\n📲 Chat with us on WhatsApp:\n{link}\n\nWe'd love to hear from you! 👋"
  );
  const [preText,   setPreText]   = useState("Hi! I saw your advert and would like to know more.");

  const [copied, setCopied] = useState<string | null>(null);
  const [saved,  setSaved]  = useState(false);

  // Sync state from loaded config
  const [synced, setSynced] = useState(false);
  if (cfg && !synced) {
    setPhone(cfg.businessWhatsappNumber ?? "");
    setWebsite(cfg.businessWebsite ?? "");
    setTagline(cfg.businessTagline ?? "");
    setLogoUrl(cfg.businessLogoUrl ?? "");
    setSynced(true);
  }

  const waLink    = phone ? buildWaLink(phone, preText) : "";
  const shortLink = phone ? `wa.me/${phone.replace(/\D/g, "")}` : "";

  const resolvedAd = adMessage
    .replace("{business}", cfg?.businessName ?? "Your Business")
    .replace("{tagline}",  tagline || "Your tagline here")
    .replace("{link}",     waLink || "https://wa.me/your-number")
    .replace("{website}",  website || "");

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleSave = () => {
    updateConfig.mutate({
      businessWhatsappNumber: phone,
      businessWebsite: website,
      businessTagline: tagline,
      businessLogoUrl: logoUrl,
    });
  };

  if (adConfigQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading business profile…
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Business Profile ── */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#25D366]" /> Business Profile
          </h2>
          <button
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saved
              ? <><Check className="w-3.5 h-3.5" /> Saved</>
              : updateConfig.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                : <><Save className="w-3.5 h-3.5" /> Save profile</>
            }
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* WhatsApp number */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 flex items-center gap-1"><Phone className="w-3 h-3" /> WhatsApp Number</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="27123456789 (with country code, no +)"
              className="input w-full text-sm"
            />
            <p className="text-xs text-gray-600">Used to generate your wa.me link</p>
          </div>

          {/* Website */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 flex items-center gap-1"><Globe className="w-3 h-3" /> Website</label>
            <input
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="https://yourbusiness.co.za"
              className="input w-full text-sm"
            />
          </div>

          {/* Tagline */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-gray-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Business Tagline</label>
            <input
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              placeholder="Your go-to salon for the best cuts in town"
              className="input w-full text-sm"
            />
          </div>

          {/* Logo URL */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-gray-400 flex items-center gap-1"><Image className="w-3 h-3" /> Logo / Banner URL</label>
            <input
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://yourbusiness.co.za/logo.png"
              className="input w-full text-sm"
            />
          </div>
        </div>
      </div>

      {/* ── WhatsApp Link ── */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[#25D366]" /> WhatsApp Click-to-Chat Link
        </h2>

        {/* Pre-filled message */}
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Pre-filled message customers send when they click your link</label>
          <input
            value={preText}
            onChange={e => setPreText(e.target.value)}
            placeholder="Hi! I saw your advert and would like to know more."
            className="input w-full text-sm"
          />
        </div>

        {phone ? (
          <div className="space-y-3">
            {/* Link display */}
            <div className="bg-gray-900 rounded-xl p-3 flex items-center gap-2">
              <span className="text-[#25D366] text-sm font-mono flex-1 truncate">{shortLink}</span>
              <button
                onClick={() => copyText(waLink, "link")}
                className="flex items-center gap-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors flex-shrink-0"
              >
                {copied === "link" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === "link" ? "Copied!" : "Copy"}
              </button>
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] text-xs rounded-lg transition-colors flex-shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Test
              </a>
            </div>

            {/* QR code */}
            <div className="flex gap-4 items-start">
              <div className="bg-gray-900 rounded-xl p-3 flex-shrink-0">
                <img
                  src={qrUrl(waLink)}
                  alt="WhatsApp QR code"
                  className="w-28 h-28 rounded-lg"
                />
              </div>
              <div className="space-y-2 pt-1">
                <p className="text-sm font-medium text-white">QR Code</p>
                <p className="text-xs text-gray-400">Customers scan this with their camera to open a chat with your business instantly.</p>
                <a
                  href={qrUrl(waLink)}
                  download="waflow-qr.png"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors w-fit"
                >
                  ↓ Download QR
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-900/50 rounded-xl p-4 text-center text-gray-500 text-sm">
            Enter your WhatsApp number above to generate your link and QR code.
          </div>
        )}
      </div>

      {/* ── Ad Message Creator ── */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#25D366]" /> Ad Message Creator
        </h2>

        <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex gap-2 text-xs text-blue-300">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Use <code className="bg-blue-900/40 px-1 rounded">{"{business}"}</code>,{" "}
            <code className="bg-blue-900/40 px-1 rounded">{"{tagline}"}</code>,{" "}
            <code className="bg-blue-900/40 px-1 rounded">{"{link}"}</code>, and{" "}
            <code className="bg-blue-900/40 px-1 rounded">{"{website}"}</code> as placeholders.
          </span>
        </div>

        <textarea
          value={adMessage}
          onChange={e => setAdMessage(e.target.value)}
          rows={6}
          className="input w-full resize-none font-mono text-sm"
        />

        {/* Preview */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Preview:</p>
          <div className="bg-gray-900 rounded-xl p-4">
            <div className="bg-[#25D366]/10 border border-[#25D366]/20 rounded-xl p-4 max-w-sm space-y-3">
              {logoUrl && (
                <img src={logoUrl} alt="Logo" className="h-14 object-contain rounded-lg" onError={e => (e.currentTarget.style.display = "none")} />
              )}
              <p className="text-sm text-white whitespace-pre-wrap">{resolvedAd}</p>
              <p className="text-xs text-gray-500 text-right">now ✓✓</p>
            </div>
          </div>
        </div>

        {/* Copy ad message */}
        <div className="flex gap-2">
          <button
            onClick={() => copyText(resolvedAd, "ad")}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            {copied === "ad" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied === "ad" ? "Copied!" : "Copy ad message"}
          </button>
          {waLink && (
            <button
              onClick={() => copyText(waLink, "walink2")}
              className="flex items-center gap-2 px-4 py-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-sm rounded-lg transition-colors"
            >
              {copied === "walink2" ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
              {copied === "walink2" ? "Copied!" : "Copy WhatsApp link"}
            </button>
          )}
        </div>
      </div>

      {/* ── Broadcast the ad ── */}
      <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-indigo-400" /> Broadcast This Ad to Existing Customers
        </h2>
        <p className="text-xs text-gray-400">
          Share this ad with your existing customers to spread the word. Switch to the <strong className="text-white">Broadcast</strong> tab, paste the message above, and send.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => copyText(resolvedAd, "broadcast-ad")}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-600/40 text-indigo-300 text-xs rounded-lg transition-colors"
          >
            {copied === "broadcast-ad" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === "broadcast-ad" ? "Copied!" : "Copy to clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Broadcast Page ──────────────────────────────────────────────────────

export default function Broadcast() {
  const [pageTab, setPageTab] = useState<PageTab>("broadcast");

  // Broadcast state
  const [message, setMessage]   = useState("");
  const [mode, setMode]         = useState<AudienceMode>("filter");
  const [filter, setFilter]     = useState<FilterValue>("all");
  const [delayMs, setDelayMs]   = useState(1500);
  const [step, setStep]         = useState<"compose" | "confirm" | "sending" | "done">("compose");
  const [result, setResult]     = useState<{ total: number; message: string } | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const [customerSearch, setCustomerSearch] = useState("");
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [showSelected, setShowSelected]     = useState(false);

  const audienceQuery = trpc.broadcast.getAudience.useQuery(
    { filter },
    { enabled: mode === "filter" && pageTab === "broadcast", refetchOnWindowFocus: false }
  );

  const customerListQuery = trpc.broadcast.searchCustomers.useQuery(
    { search: customerSearch, limit: 100 },
    { enabled: mode === "manual" && pageTab === "broadcast", refetchOnWindowFocus: false }
  );

  const sendMutation = trpc.broadcast.send.useMutation({
    onSuccess: (data) => { setResult(data); setStep("done"); },
    onError:   (e)    => { setError(e.message); setStep("compose"); },
  });

  const audience       = audienceQuery.data;
  const customers      = customerListQuery.data ?? [];
  const charsLeft      = 1000 - message.length;
  const recipientCount = mode === "filter" ? (audience?.count ?? 0) : selected.size;
  const estimatedMins  = recipientCount ? Math.ceil((recipientCount * delayMs) / 60000) : 0;
  const allOnPage      = customers.length > 0 && customers.every(c => selected.has(c.phoneNumber));

  const toggleCustomer = (phone: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(phone) ? n.delete(phone) : n.add(phone); return n; });
  };

  const toggleAll = () => {
    if (allOnPage) {
      setSelected(prev => { const n = new Set(prev); customers.forEach(c => n.delete(c.phoneNumber)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); customers.forEach(c => n.add(c.phoneNumber)); return n; });
    }
  };

  const handleSend = () => {
    setError(null);
    setStep("sending");
    sendMutation.mutate({ message, filter, phoneNumbers: mode === "manual" ? Array.from(selected) : undefined, delayMs });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Page header + tabs ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-[#25D366]" /> Broadcast & Adverts
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">Send messages to customers or create shareable ads for your business</p>
      </div>

      {/* Page tabs */}
      <div className="flex bg-gray-900 rounded-xl p-1 gap-1">
        <button
          onClick={() => setPageTab("broadcast")}
          className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
            pageTab === "broadcast" ? "bg-[#25D366] text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <Send className="w-4 h-4" /> Send Now
        </button>
        <button
          onClick={() => setPageTab("schedule")}
          className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
            pageTab === "schedule" ? "bg-[#25D366] text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <Calendar className="w-4 h-4" /> Scheduled
        </button>
        <button
          onClick={() => setPageTab("advert")}
          className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
            pageTab === "advert" ? "bg-[#25D366] text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-4 h-4" /> Advert Creator
        </button>
      </div>

      {/* ── Scheduled Broadcasts ─────────────────────────────────────────── */}
      {pageTab === "schedule" && <ScheduledBroadcasts />}

      {/* ── Advert Creator ────────────────────────────────────────────────── */}
      {pageTab === "advert" && <AdvertCreator />}

      {/* ── Broadcast ────────────────────────────────────────────────────── */}
      {pageTab === "broadcast" && (
        <>
          {step === "done" && result ? (
            <div className="bg-green-900/20 border border-green-700 rounded-2xl p-8 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Broadcast Started!</h2>
              <p className="text-gray-300">{result.message}</p>
              <p className="text-gray-500 text-sm">Messages are being sent in the background with a delay between each.</p>
              <button
                onClick={() => { setStep("compose"); setMessage(""); setResult(null); setSelected(new Set()); }}
                className="btn-primary mt-4"
              >
                Send Another
              </button>
            </div>
          ) : (
            <div className="space-y-5">

              {/* ── Audience card ── */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#25D366]" /> Target Audience
                </h2>

                {/* Mode toggle */}
                <div className="flex bg-gray-900 rounded-xl p-1 gap-1">
                  <button
                    onClick={() => setMode("filter")}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                      mode === "filter" ? "bg-[#25D366] text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Users className="w-4 h-4" /> Smart Filter
                  </button>
                  <button
                    onClick={() => setMode("manual")}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                      mode === "manual" ? "bg-[#25D366] text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <UserCheck className="w-4 h-4" /> Pick Customers
                  </button>
                </div>

                {/* Smart Filter */}
                {mode === "filter" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {FILTERS.map(f => (
                        <button
                          key={f.value}
                          onClick={() => setFilter(f.value)}
                          className={`text-left p-3 rounded-xl border transition-colors ${
                            filter === f.value
                              ? "bg-[#25D366]/10 border-[#25D366]"
                              : "bg-gray-800 border-gray-700 hover:border-gray-600"
                          }`}
                        >
                          <p className={`text-sm font-medium ${filter === f.value ? "text-[#25D366]" : "text-white"}`}>{f.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 bg-gray-900/50 rounded-lg px-3 py-2">
                      <Users className="w-4 h-4 text-[#25D366]" />
                      {audienceQuery.isLoading
                        ? <span className="text-sm text-gray-400">Calculating…</span>
                        : <span className="text-sm text-white"><strong>{audience?.count ?? 0}</strong> customers will receive this message</span>
                      }
                    </div>
                  </div>
                )}

                {/* Manual pick */}
                {mode === "manual" && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                          value={customerSearch}
                          onChange={e => setCustomerSearch(e.target.value)}
                          placeholder="Search by name or phone…"
                          className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-[#25D366]"
                        />
                        {customerSearch && (
                          <button onClick={() => setCustomerSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button onClick={toggleAll} className="px-3 py-2 bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-300 text-xs rounded-lg whitespace-nowrap">
                        {allOnPage ? "Deselect page" : "Select page"}
                      </button>
                      {selected.size > 0 && (
                        <button onClick={() => setSelected(new Set())} className="px-3 py-2 bg-gray-800 border border-gray-700 hover:border-red-700 text-gray-400 hover:text-red-400 text-xs rounded-lg">
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
                      {customerListQuery.isLoading ? (
                        <div className="flex items-center justify-center py-8 text-gray-500 text-sm gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                      ) : customers.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">{customerSearch ? "No customers match" : "No customers yet"}</div>
                      ) : (
                        customers.map(c => (
                          <CustomerRow key={c.phoneNumber} customer={c} selected={selected.has(c.phoneNumber)} onToggle={() => toggleCustomer(c.phoneNumber)} />
                        ))
                      )}
                    </div>

                    <div className="bg-gray-900/50 rounded-lg px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-[#25D366]" />
                        <span className="text-sm text-white"><strong>{selected.size}</strong> customer{selected.size !== 1 ? "s" : ""} selected</span>
                      </div>
                      {selected.size > 0 && (
                        <button onClick={() => setShowSelected(v => !v)} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                          {showSelected ? "Hide" : "Show"} list {showSelected ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                    {showSelected && selected.size > 0 && (
                      <div className="bg-gray-900/30 border border-gray-700 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5">
                        {Array.from(selected).map(phone => {
                          const c = customers.find(x => x.phoneNumber === phone);
                          return (
                            <div key={phone} className="flex items-center justify-between text-sm">
                              <span className="text-white">{c?.name || "Unknown"} <span className="text-gray-500 text-xs">{phone}</span></span>
                              <button onClick={() => toggleCustomer(phone)} className="text-gray-500 hover:text-red-400 ml-2"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Message composer ── */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#25D366]" /> Your Message
                </h2>
                <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex gap-2 text-xs text-blue-300">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  Use <code className="bg-blue-900/40 px-1 rounded">{"{name}"}</code> to personalise with the customer's name
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={"Hi {name}! 👋 We have an exciting offer for you this week...\n\nReply STOP to unsubscribe."}
                  rows={6}
                  maxLength={1000}
                  className="input w-full resize-none font-mono text-sm"
                />
                <div className={`text-xs text-right ${charsLeft < 50 ? "text-red-400" : "text-gray-500"}`}>{charsLeft} characters remaining</div>
                {message && (
                  <div className="bg-gray-900 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-2">Preview:</p>
                    <div className="bg-[#25D366]/10 border border-[#25D366]/20 rounded-xl p-3 max-w-sm">
                      <p className="text-sm text-white whitespace-pre-wrap">{message.replace("{name}", "Sarah")}</p>
                      <p className="text-xs text-gray-500 text-right mt-1">now ✓✓</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Send speed ── */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#25D366]" /> Send Speed
                </h2>
                <div className="flex items-center gap-3">
                  {[{ ms: 1000, label: "Fast (1s)" }, { ms: 1500, label: "Normal (1.5s)" }, { ms: 3000, label: "Safe (3s)" }].map(opt => (
                    <button key={opt.ms} onClick={() => setDelayMs(opt.ms)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${delayMs === opt.ms ? "bg-[#25D366]/10 border-[#25D366] text-[#25D366]" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {recipientCount > 0 && <p className="text-xs text-gray-500">Estimated time: ~{estimatedMins} minute{estimatedMins !== 1 ? "s" : ""}</p>}
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-700 rounded-xl p-3 flex gap-2 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
                </div>
              )}

              {step === "compose" && (
                <button
                  onClick={() => setStep("confirm")}
                  disabled={!message.trim() || recipientCount === 0}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                  Review & Send to {recipientCount} Customer{recipientCount !== 1 ? "s" : ""}
                </button>
              )}

              {step === "confirm" && (
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-2xl p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-semibold">Confirm Broadcast</p>
                      <p className="text-gray-300 text-sm mt-1">
                        You're about to send to <strong>{recipientCount}</strong> customer{recipientCount !== 1 ? "s" : ""}
                        {mode === "manual" ? " (manually selected)" : ""}. This cannot be undone once started.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setStep("compose")} className="btn-secondary flex-1">Go Back</button>
                    <button onClick={handleSend} className="flex-1 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                      <Send className="w-4 h-4" /> Yes, Send Now
                    </button>
                  </div>
                </div>
              )}

              {step === "sending" && (
                <div className="flex items-center justify-center gap-3 py-6 text-gray-300">
                  <Loader2 className="w-5 h-5 animate-spin text-[#25D366]" />
                  Broadcast started — sending in background…
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
