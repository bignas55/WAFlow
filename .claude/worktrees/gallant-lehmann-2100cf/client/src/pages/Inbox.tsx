import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare, Search, Bot, User, Send, UserCheck,
  RefreshCw, Phone, ChevronLeft, AlertTriangle, Wifi,
  WifiOff, Clock, CheckCheck, Sparkles, X, Download,
  CalendarDays, FileText, StickyNote, Tag, Save, Plus,
  ChevronDown, ChevronUp, Square, CheckSquare, Check,
  MousePointer, Trash2, Paperclip, ImageIcon, FileDown,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import { useWhatsAppSocket } from "../hooks/useWhatsAppSocket";

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

function timeStamp(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Thread {
  id: number;
  customerPhone: string;
  customerName: string | null;
  lastMessage: string;
  lastMessageAt: Date | string | null;
  isEscalated: boolean;
  aiHandled: boolean;
}

interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  source: string;
  createdAt: Date | string;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "audio" | "document" | "sticker" | null;
  mediaCaption?: string | null;
}

// ── Thread List Item ───────────────────────────────────────────────────────

function ThreadItem({
  thread,
  selected,
  onClick,
  isSelecting,
  isChecked,
  onToggleCheck,
  hasUnread,
}: {
  thread: Thread;
  selected: boolean;
  onClick: () => void;
  isSelecting: boolean;
  isChecked: boolean;
  onToggleCheck: (phone: string) => void;
  hasUnread: boolean;
}) {
  const displayName = thread.customerName || thread.customerPhone;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div
      className={`w-full text-left px-3 py-3 flex items-start gap-2 border-b border-gray-800 transition-colors cursor-pointer ${
        selected ? "bg-[#25D366]/10 border-l-2 border-l-[#25D366]" : "hover:bg-gray-800/50"
      }`}
      onClick={() => {
        if (isSelecting) onToggleCheck(thread.customerPhone);
        else onClick();
      }}
    >
      {/* Checkbox (selection mode) */}
      {isSelecting && (
        <div
          className="flex-shrink-0 mt-1"
          onClick={(e) => { e.stopPropagation(); onToggleCheck(thread.customerPhone); }}
        >
          {isChecked
            ? <CheckSquare className="w-4 h-4 text-[#25D366]" />
            : <Square className="w-4 h-4 text-gray-500" />
          }
        </div>
      )}

      {/* Avatar with unread dot */}
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-semibold text-white">
          {initials}
        </div>
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#25D366] rounded-full border-2 border-gray-900" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${hasUnread ? "font-semibold text-white" : "font-medium text-white"}`}>
            {displayName}
          </span>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {thread.lastMessageAt ? timeAgo(thread.lastMessageAt) : ""}
          </span>
        </div>
        <p className={`text-xs truncate mt-0.5 ${hasUnread ? "text-gray-200 font-medium" : "text-gray-400"}`}>
          {thread.lastMessage || "—"}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          {thread.isEscalated ? (
            <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded font-medium">
              Human
            </span>
          ) : (
            <span className="text-[10px] bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 px-1.5 py-0.5 rounded font-medium">
              AI
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chat Message Bubble ────────────────────────────────────────────────────

function Bubble({ msg }: { msg: ChatMessage }) {
  const isOut = msg.direction === "outbound";
  const isAI = isOut && msg.source === "ai";
  const isAgent = isOut && msg.source === "agent";

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-3`}>
      {!isOut && (
        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center mr-2 flex-shrink-0 self-end">
          <Phone className="w-3.5 h-3.5 text-gray-400" />
        </div>
      )}

      <div className={`max-w-[72%] ${isOut ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Label */}
        <span className={`text-[10px] font-medium px-1 ${isAI ? "text-[#25D366]" : isAgent ? "text-blue-400" : "text-gray-500"}`}>
          {isAI ? "AI Receptionist" : isAgent ? "You" : "Customer"}
        </span>

        <div className={`rounded-2xl text-sm leading-relaxed break-words overflow-hidden ${
          isOut
            ? isAI
              ? "bg-[#25D366]/20 text-[#25D366] rounded-br-sm border border-[#25D366]/20"
              : "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700"
        }`}>
          {/* Media attachment */}
          {msg.mediaUrl && (
            <div className="w-full">
              {msg.mediaType === "image" || msg.mediaType === "sticker" ? (
                <img
                  src={msg.mediaUrl}
                  alt={msg.mediaCaption || "Image"}
                  className="max-w-xs rounded-t-2xl object-cover cursor-pointer"
                  onClick={() => window.open(msg.mediaUrl!, "_blank")}
                />
              ) : msg.mediaType === "video" ? (
                <video
                  src={msg.mediaUrl}
                  controls
                  className="max-w-xs rounded-t-2xl"
                />
              ) : msg.mediaType === "audio" ? (
                <audio src={msg.mediaUrl} controls className="w-full px-3 py-2" />
              ) : (
                <a
                  href={msg.mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3.5 py-2.5 hover:opacity-80 transition"
                >
                  <FileDown className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm underline truncate max-w-[200px]">
                    {msg.mediaCaption || "Download file"}
                  </span>
                </a>
              )}
            </div>
          )}
          {/* Text content */}
          {(msg.content || (msg.mediaUrl && msg.mediaCaption)) && (
            <div className="px-3.5 py-2.5 whitespace-pre-wrap">
              {msg.mediaUrl && msg.mediaCaption && !msg.content ? msg.mediaCaption : msg.content}
            </div>
          )}
        </div>

        <span className="text-[10px] text-gray-600 px-1">{timeStamp(msg.createdAt)}</span>
      </div>

      {isOut && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ml-2 flex-shrink-0 self-end ${isAI ? "bg-[#25D366]/10" : "bg-blue-600/10"}`}>
          {isAI ? <Bot className="w-3.5 h-3.5 text-[#25D366]" /> : <User className="w-3.5 h-3.5 text-blue-400" />}
        </div>
      )}
    </div>
  );
}

// ── Contact Notes Drawer ───────────────────────────────────────────────────

function ContactNotesDrawer({
  phoneNumber,
  onClose,
}: {
  phoneNumber: string;
  onClose: () => void;
}) {
  const [noteText, setNoteText] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [saved, setSaved] = useState(false);

  const { data, refetch } = trpc.conversations.getContactNote.useQuery(
    { phoneNumber },
    { enabled: !!phoneNumber }
  );

  const updateNote = trpc.conversations.updateContactNote.useMutation({
    onSuccess: () => { setSaved(true); refetch(); setTimeout(() => setSaved(false), 2000); },
  });

  const updateLabels = trpc.conversations.updateContactLabels.useMutation({
    onSuccess: () => refetch(),
  });

  useEffect(() => {
    if (data) setNoteText(data.notes ?? "");
  }, [data]);

  const currentLabels: string[] = Array.isArray(data?.tags) ? (data!.tags as string[]) : [];

  function addLabel() {
    const lbl = labelInput.trim();
    if (!lbl || currentLabels.includes(lbl)) { setLabelInput(""); return; }
    updateLabels.mutate({ phoneNumber, tags: [...currentLabels, lbl] });
    setLabelInput("");
  }

  function removeLabel(lbl: string) {
    updateLabels.mutate({ phoneNumber, tags: currentLabels.filter((l) => l !== lbl) });
  }

  return (
    <div className="flex flex-col w-72 border-l border-gray-800 bg-gray-900 flex-shrink-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <StickyNote className="w-4 h-4 text-yellow-400" />
          Contact Notes
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Contact info */}
        <div className="text-xs text-gray-500">
          <p className="font-medium text-gray-300">{data?.name || phoneNumber}</p>
          <p>+{phoneNumber}</p>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-gray-400 mb-1 block">Notes</label>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add notes about this contact…"
            rows={5}
            className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-xs border border-gray-700 focus:outline-none focus:border-[#25D366] resize-none"
          />
          <button
            onClick={() => updateNote.mutate({ phoneNumber, notes: noteText })}
            disabled={updateNote.isPending}
            className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-xs bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            {saved ? <CheckCheck className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? "Saved!" : "Save Note"}
          </button>
        </div>

        {/* Labels */}
        <div>
          <label className="text-xs font-medium text-gray-400 mb-1 block flex items-center gap-1">
            <Tag className="w-3 h-3" /> Labels
          </label>
          <div className="flex flex-wrap gap-1 mb-2 min-h-[24px]">
            {currentLabels.map((lbl) => (
              <span
                key={lbl}
                className="flex items-center gap-1 text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full"
              >
                {lbl}
                <button
                  onClick={() => removeLabel(lbl)}
                  className="text-gray-500 hover:text-red-400 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
            {currentLabels.length === 0 && (
              <p className="text-[10px] text-gray-600 italic">No labels yet</p>
            )}
          </div>
          <div className="flex gap-1">
            <input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLabel()}
              placeholder="Add label…"
              className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 rounded-lg px-2 py-1.5 text-xs border border-gray-700 focus:outline-none focus:border-[#25D366]"
            />
            <button
              onClick={addLabel}
              className="w-7 h-7 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template Picker ────────────────────────────────────────────────────────

function TemplatePicker({
  onSelect,
  onClose,
}: {
  onSelect: (text: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const { data } = trpc.conversations.listTemplates.useQuery();
  const templates = (data ?? []).filter(
    (t: any) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="border-t border-gray-800 bg-gray-900 px-4 pt-2 pb-3 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          Quick Reply Templates
        </span>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search templates…"
        className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-1.5 text-xs border border-gray-700 focus:outline-none focus:border-[#25D366] mb-2"
        autoFocus
      />
      <div className="max-h-40 overflow-y-auto space-y-1">
        {templates.length === 0 ? (
          <p className="text-xs text-gray-600 italic text-center py-2">No templates found</p>
        ) : (
          templates.map((t: any) => (
            <button
              key={t.id}
              onClick={() => { onSelect(t.content); onClose(); }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors group"
            >
              <p className="text-xs font-medium text-gray-300 group-hover:text-white">{t.name}</p>
              <p className="text-[11px] text-gray-500 truncate mt-0.5">{t.content}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Inbox Page ────────────────────────────────────────────────────────

export default function Inbox() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ai" | "human" | "closed">("all");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  // Date filter
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Template picker
  const [showTemplates, setShowTemplates] = useState(false);
  // Contact notes
  const [showNotes, setShowNotes] = useState(false);
  // Bulk selection
  const [isSelecting, setIsSelecting] = useState(false);
  const [checkedPhones, setCheckedPhones] = useState<Set<string>>(new Set());
  // Unread tracking: phone → timestamp when last viewed
  const [viewedAt, setViewedAt] = useState<Record<string, number>>({});

  const bottomRef    = useRef<HTMLDivElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);
  const { lastMessage } = useWhatsAppSocket();

  const summarizeMutation = trpc.conversations.summarize.useMutation({
    onSuccess: (data: any) => { setSummary(data.summary ?? ""); setShowSummary(true); },
  });

  const exportQuery = trpc.conversations.exportCsv.useQuery(
    { status: filter === "human" ? "escalated" : filter === "closed" ? "closed" : filter === "ai" ? "ai" : "all", days: 90 },
    { enabled: false }
  );
  const handleExport = async () => {
    const result = await exportQuery.refetch();
    if (!result.data?.csv) return;
    const blob = new Blob([result.data.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Data ────────────────────────────────────────────────────────────────

  const serverStatus = filter === "human" ? "escalated" : filter === "ai" ? "ai" : filter === "closed" ? "closed" : "all";
  const { data: listData, refetch: refetchList } = trpc.conversations.list.useQuery(
    { limit: 100, page: 1, status: serverStatus as any },
    { refetchInterval: filter === "closed" ? 30000 : 5000 }
  );

  const { data: thread, refetch: refetchThread } = trpc.conversations.getThread.useQuery(
    { phoneNumber: selectedPhone! },
    { enabled: !!selectedPhone, refetchInterval: 3000 }
  );

  const { data: waStatus } = trpc.whatsapp.qrStatus.useQuery(undefined, { refetchInterval: 10000 });
  const isWaConnected = waStatus?.status === "connected";

  const setEscalated = trpc.conversations.setEscalated.useMutation({
    onSuccess: () => { refetchList(); refetchThread(); },
  });
  const sendMessage = trpc.conversations.sendMessage.useMutation({
    onSuccess: () => { setInputText(""); refetchThread(); refetchList(); },
  });

  // ── Media send ──────────────────────────────────────────────────────────
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaUrl, setMediaUrl]             = useState('');
  const [mediaType, setMediaType]           = useState<'image'|'video'|'audio'|'document'>('image');
  const [mediaCaption, setMediaCaption]     = useState('');

  const sendMediaMessage = trpc.conversations.sendMediaMessage.useMutation({
    onSuccess: () => {
      setShowMediaModal(false);
      setMediaUrl('');
      setMediaCaption('');
      refetchThread();
      refetchList();
    },
  });

  function handleSendMedia() {
    if (!selectedPhone || !mediaUrl.trim()) return;
    sendMediaMessage.mutate({
      phoneNumber: selectedPhone,
      mediaUrl: mediaUrl.trim(),
      mediaType,
      caption: mediaCaption.trim() || undefined,
    });
  }

  // ── Bulk actions ────────────────────────────────────────────────────────
  const [bulkPending, setBulkPending] = useState(false);
  const utils = trpc.useUtils();

  async function bulkHandToAI() {
    if (!checkedPhones.size || bulkPending) return;
    setBulkPending(true);
    for (const phone of checkedPhones) {
      await utils.client.conversations.setEscalated.mutate({ phoneNumber: phone, escalated: false });
    }
    setBulkPending(false);
    setCheckedPhones(new Set());
    setIsSelecting(false);
    refetchList();
  }

  async function bulkHandToHuman() {
    if (!checkedPhones.size || bulkPending) return;
    setBulkPending(true);
    for (const phone of checkedPhones) {
      await utils.client.conversations.setEscalated.mutate({ phoneNumber: phone, escalated: true });
    }
    setBulkPending(false);
    setCheckedPhones(new Set());
    setIsSelecting(false);
    refetchList();
  }

  function toggleCheck(phone: string) {
    setCheckedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }

  function toggleSelectAll() {
    if (checkedPhones.size === threads.length) {
      setCheckedPhones(new Set());
    } else {
      setCheckedPhones(new Set(threads.map((t) => t.customerPhone)));
    }
  }

  useEffect(() => {
    if (lastMessage) {
      refetchList();
      if (selectedPhone && lastMessage.phoneNumber === selectedPhone) refetchThread();
    }
  }, [lastMessage]);

  useEffect(() => {
    userScrolled.current = false;
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [selectedPhone]);

  useEffect(() => {
    if (!userScrolled.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread]);

  // Mark phone as viewed when selected
  useEffect(() => {
    if (selectedPhone) {
      setViewedAt((prev) => ({ ...prev, [selectedPhone]: Date.now() }));
    }
  }, [selectedPhone]);

  // ── Derived data ────────────────────────────────────────────────────────

  const threads: Thread[] = (listData?.conversations ?? []).filter((t) => {
    if (search && !t.customerName?.toLowerCase().includes(search.toLowerCase()) && !t.customerPhone.includes(search)) return false;
    // Date range filter
    if (dateFrom && t.lastMessageAt) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (new Date(t.lastMessageAt) < from) return false;
    }
    if (dateTo && t.lastMessageAt) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(t.lastMessageAt) > to) return false;
    }
    return true;
  });

  const selectedThread = threads.find((t) => t.customerPhone === selectedPhone)
    ?? listData?.conversations.find((t) => t.customerPhone === selectedPhone);
  const isEscalated = selectedThread?.isEscalated ?? false;

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't fire if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Escape") {
        if (isSelecting) { setIsSelecting(false); setCheckedPhones(new Set()); }
        else setSelectedPhone(null);
        return;
      }

      if (!threads.length) return;
      const currentIdx = threads.findIndex((t) => t.customerPhone === selectedPhone);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = threads[currentIdx + 1] ?? threads[0];
        setSelectedPhone(next.customerPhone);
        setShowSidebar(false);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = threads[currentIdx - 1] ?? threads[threads.length - 1];
        setSelectedPhone(prev.customerPhone);
        setShowSidebar(false);
        return;
      }
      // R → toggle escalation on current thread
      if (e.key === "r" && selectedPhone && selectedThread) {
        setEscalated.mutate({ phoneNumber: selectedPhone, escalated: !isEscalated });
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [threads, selectedPhone, selectedThread, isEscalated, isSelecting]);

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleSend() {
    const text = inputText.trim();
    if (!text || !selectedPhone) return;
    sendMessage.mutate({ phoneNumber: selectedPhone, text });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasDateFilter = !!(dateFrom || dateTo);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-48px)] -m-6 overflow-hidden bg-gray-950">

      {/* ── Left: Thread List ─────────────────────────────────────────── */}
      <div className={`${showSidebar ? "flex" : "hidden"} md:flex flex-col w-full md:w-80 lg:w-96 border-r border-gray-800 bg-gray-900 flex-shrink-0`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#25D366]" />
              Inbox
              {threads.length > 0 && (
                <span className="text-xs bg-[#25D366]/10 text-[#25D366] px-2 py-0.5 rounded-full font-normal">
                  {threads.length}
                </span>
              )}
            </h1>
            <div className="flex items-center gap-2">
              {/* Select mode toggle */}
              <button
                onClick={() => { setIsSelecting((v) => !v); setCheckedPhones(new Set()); }}
                title={isSelecting ? "Cancel selection" : "Select conversations"}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                  isSelecting
                    ? "bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                <MousePointer className="w-3 h-3" />
                {isSelecting ? "Cancel" : "Select"}
              </button>
              <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${isWaConnected ? "bg-[#25D366]/10 text-[#25D366]" : "bg-red-500/10 text-red-400"}`}>
                {isWaConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isWaConnected ? "Connected" : "Offline"}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="w-full bg-gray-800 text-gray-100 placeholder-gray-500 rounded-lg pl-9 pr-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-[#25D366]"
            />
          </div>

          {/* Filter pills + export + date */}
          <div className="flex gap-1 mt-2 flex-wrap items-center">
            {(["all", "ai", "human", "closed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelectedPhone(null); }}
                className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${
                  filter === f ? "bg-[#25D366] text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {f === "all" ? "All" : f === "ai" ? "AI" : f === "human" ? "Human" : "Closed"}
              </button>
            ))}
            {/* Date filter toggle */}
            <button
              onClick={() => setShowDateFilter((v) => !v)}
              title="Filter by date"
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors flex-shrink-0 ${
                hasDateFilter
                  ? "bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleExport}
              title="Export conversations to CSV"
              className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors flex-shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Date range inputs */}
          {showDateFilter && (
            <div className="mt-2 p-3 bg-gray-800 rounded-xl border border-gray-700 space-y-2">
              <p className="text-[11px] text-gray-400 font-medium">Filter by last message date</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 block mb-0.5">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full bg-gray-700 text-gray-100 rounded-lg px-2 py-1 text-xs border border-gray-600 focus:outline-none focus:border-[#25D366]"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 block mb-0.5">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full bg-gray-700 text-gray-100 rounded-lg px-2 py-1 text-xs border border-gray-600 focus:outline-none focus:border-[#25D366]"
                  />
                </div>
              </div>
              {hasDateFilter && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear date filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bulk actions bar */}
        {isSelecting && (
          <div className="px-3 py-2 bg-gray-800/60 border-b border-gray-700 flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {checkedPhones.size === threads.length
                ? <CheckSquare className="w-3.5 h-3.5 text-[#25D366]" />
                : <Square className="w-3.5 h-3.5" />}
              {checkedPhones.size === threads.length ? "Deselect all" : "Select all"}
            </button>
            {checkedPhones.size > 0 && (
              <>
                <span className="text-xs text-gray-500 ml-1">{checkedPhones.size} selected</span>
                <div className="flex-1" />
                <button
                  onClick={bulkHandToAI}
                  disabled={bulkPending}
                  className="flex items-center gap-1 text-xs bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {bulkPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
                  Hand to AI
                </button>
                <button
                  onClick={bulkHandToHuman}
                  disabled={bulkPending}
                  className="flex items-center gap-1 text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {bulkPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                  Take Over
                </button>
              </>
            )}
          </div>
        )}

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm gap-2">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p>No conversations yet</p>
            </div>
          ) : (
            threads.map((t) => {
              const lastMsgTs = t.lastMessageAt ? new Date(t.lastMessageAt).getTime() : 0;
              const viewedTs = viewedAt[t.customerPhone] ?? 0;
              const hasUnread = lastMsgTs > viewedTs && t.customerPhone !== selectedPhone;
              return (
              <ThreadItem
                key={t.customerPhone}
                thread={t}
                selected={selectedPhone === t.customerPhone}
                onClick={() => {
                  setSelectedPhone(t.customerPhone);
                  setShowSidebar(false);
                }}
                isSelecting={isSelecting}
                isChecked={checkedPhones.has(t.customerPhone)}
                onToggleCheck={toggleCheck}
                hasUnread={hasUnread}
              />
              );
            })
          )}
        </div>
      </div>

      {/* ── Center: Chat View ─────────────────────────────────────────── */}
      <div className={`${!showSidebar || selectedPhone ? "flex" : "hidden"} md:flex flex-col flex-1 min-w-0`}>
        {!selectedPhone ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
            <MessageSquare className="w-16 h-16 opacity-20" />
            <p className="text-lg font-medium">Select a conversation</p>
            <p className="text-sm">Choose a chat from the left to view it here</p>
            <div className="flex items-center gap-3 text-xs text-gray-700 mt-2">
              <span className="flex items-center gap-1"><kbd className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded text-[10px] font-mono">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded text-[10px] font-mono">R</kbd> toggle agent</span>
              <span className="flex items-center gap-1"><kbd className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded text-[10px] font-mono">Esc</kbd> close</span>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
              <button
                className="md:hidden text-gray-400 hover:text-white"
                onClick={() => setShowSidebar(true)}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
                {((selectedThread?.customerName || selectedThread?.customerPhone || "?").slice(0, 2)).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {selectedThread?.customerName || selectedPhone}
                </p>
                <p className="text-xs text-gray-500 truncate">+{selectedPhone}</p>
              </div>

              {/* Notes toggle */}
              <button
                onClick={() => setShowNotes((v) => !v)}
                title="Contact notes & labels"
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors font-medium flex-shrink-0 ${
                  showNotes
                    ? "bg-yellow-400/20 text-yellow-400 border border-yellow-400/30"
                    : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700"
                }`}
              >
                <StickyNote className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Notes</span>
              </button>

              {/* Summarize button */}
              <button
                onClick={() => { setSummary(null); summarizeMutation.mutate({ phoneNumber: selectedPhone! }); }}
                disabled={summarizeMutation.isPending}
                className="flex items-center gap-1.5 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-3 py-1.5 rounded-lg transition-colors font-medium flex-shrink-0"
                title="Summarise this conversation"
              >
                {summarizeMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Summarise</span>
              </button>

              {/* Escalation */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {isEscalated ? (
                  <>
                    <span className="hidden sm:flex items-center gap-1 text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-full">
                      <UserCheck className="w-3 h-3" /> Human handling
                    </span>
                    <button
                      onClick={() => setEscalated.mutate({ phoneNumber: selectedPhone, escalated: false })}
                      disabled={setEscalated.isPending}
                      className="flex items-center gap-1.5 text-xs bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      Hand back to AI
                    </button>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:flex items-center gap-1 text-xs bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 px-2 py-1 rounded-full">
                      <Bot className="w-3 h-3" /> AI handling
                    </span>
                    <button
                      onClick={() => setEscalated.mutate({ phoneNumber: selectedPhone, escalated: true })}
                      disabled={setEscalated.isPending}
                      className="flex items-center gap-1.5 text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Take Over
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Notices */}
            {isEscalated && (
              <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/5 border-b border-orange-500/10 text-orange-400 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                You are handling this conversation — the AI will not reply until you hand it back.
              </div>
            )}
            {!isWaConnected && (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-500/5 border-b border-red-500/10 text-red-400 text-xs">
                <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
                WhatsApp is not connected — you can view messages but cannot send.
              </div>
            )}

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-1"
              onScroll={() => {
                const el = scrollRef.current;
                if (!el) return;
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                userScrolled.current = !nearBottom;
              }}
            >
              {!thread || thread.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2 text-sm">
                  <Clock className="w-8 h-8 opacity-30" />
                  <p>No messages yet</p>
                </div>
              ) : (
                thread.map((msg) => <Bubble key={msg.id} msg={msg as ChatMessage} />)
              )}
              <div ref={bottomRef} />
            </div>

            {/* Template Picker (slides in above input) */}
            {showTemplates && isEscalated && (
              <TemplatePicker
                onSelect={(text) => setInputText(text)}
                onClose={() => setShowTemplates(false)}
              />
            )}

            {/* Message Input */}
            <div className="px-4 py-3 border-t border-gray-800 bg-gray-900 flex-shrink-0">
              {!isEscalated && (
                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  AI is handling this chat. Take over to send a message manually.
                </p>
              )}
              <div className="flex items-end gap-2">
                {/* Template icon button */}
                {isEscalated && (
                  <button
                    onClick={() => setShowTemplates((v) => !v)}
                    title="Quick reply templates"
                    className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors flex-shrink-0 ${
                      showTemplates
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700"
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                )}
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isEscalated ? "Type a message… (Enter to send)" : "Take over to send a message"}
                  disabled={!isEscalated || !isWaConnected}
                  rows={1}
                  className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm resize-none border border-gray-700 focus:outline-none focus:border-[#25D366] disabled:opacity-40 disabled:cursor-not-allowed max-h-32 overflow-y-auto"
                  style={{ minHeight: "42px" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 128) + "px";
                  }}
                />
                <button
                  onClick={() => setShowMediaModal(true)}
                  disabled={!isEscalated || !isWaConnected}
                  title="Send media"
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || !isEscalated || !isWaConnected || sendMessage.isPending}
                  className="w-10 h-10 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
                >
                  {sendMessage.isPending
                    ? <RefreshCw className="w-4 h-4 text-white animate-spin" />
                    : <Send className="w-4 h-4 text-white" />
                  }
                </button>
              </div>
              {sendMessage.isError && (
                <p className="text-xs text-red-400 mt-1">{sendMessage.error?.message}</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Right: Contact Notes Drawer ───────────────────────────────── */}
      {showNotes && selectedPhone && (
        <ContactNotesDrawer
          phoneNumber={selectedPhone}
          onClose={() => setShowNotes(false)}
        />
      )}

      {/* Media send modal */}
      {showMediaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowMediaModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-[#25D366]" />
                <h2 className="font-semibold text-white">Send Media</h2>
              </div>
              <button onClick={() => setShowMediaModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Media type selector */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Media Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['image','video','audio','document'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setMediaType(type)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                        mediaType === type
                          ? 'bg-[#25D366] text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              {/* URL input */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Media URL</label>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={e => setMediaUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-3 py-2.5 bg-gray-800 text-gray-100 placeholder-gray-500 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-[#25D366]"
                  autoFocus
                />
              </div>
              {/* Caption */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Caption <span className="text-gray-600">(optional)</span></label>
                <input
                  type="text"
                  value={mediaCaption}
                  onChange={e => setMediaCaption(e.target.value)}
                  placeholder="Add a caption…"
                  className="w-full px-3 py-2.5 bg-gray-800 text-gray-100 placeholder-gray-500 text-sm border border-gray-700 rounded-xl focus:outline-none focus:border-[#25D366]"
                />
              </div>
              {/* Preview for images */}
              {mediaType === 'image' && mediaUrl && (
                <div className="rounded-xl overflow-hidden border border-gray-700">
                  <img
                    src={mediaUrl}
                    alt="Preview"
                    className="w-full max-h-48 object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              {sendMediaMessage.isError && (
                <p className="text-xs text-red-400">{sendMediaMessage.error?.message}</p>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button onClick={() => setShowMediaModal(false)} className="flex-1 px-4 py-2.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSendMedia}
                disabled={!mediaUrl.trim() || sendMediaMessage.isPending}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {sendMediaMessage.isPending
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
                  : <><Send className="w-4 h-4" /> Send Media</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary modal */}
      {showSummary && summary !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h2 className="font-semibold text-white">Conversation Summary</h2>
              </div>
              <button onClick={() => setShowSummary(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-300 text-sm leading-relaxed">{summary || "No summary available."}</p>
            </div>
            <div className="px-6 pb-5">
              <button onClick={() => setShowSummary(false)} className="btn-secondary w-full">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
