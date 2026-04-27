import { useState, useEffect, useRef } from "react";
import {
  ContactRound, Search, Phone, Mail, MapPin, Tag, MessageSquare,
  CalendarDays, ChevronRight, X, Plus, Save, Clock, TrendingUp,
  AlertCircle, CheckCircle2, User, Edit3, StickyNote, BarChart2, Download,
  Upload, Merge,
} from "lucide-react";
import { trpc } from "../lib/trpc";

function exportCSV(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "never";
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TAG_COLOURS = [
  "bg-purple-900/40 text-purple-300 border-purple-700",
  "bg-blue-900/40 text-blue-300 border-blue-700",
  "bg-green-900/40 text-green-300 border-green-700",
  "bg-yellow-900/40 text-yellow-300 border-yellow-700",
  "bg-pink-900/40 text-pink-300 border-pink-700",
  "bg-orange-900/40 text-orange-300 border-orange-700",
];

function tagColour(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h + tag.charCodeAt(i)) % TAG_COLOURS.length;
  return TAG_COLOURS[h];
}

/* ─── Customer Detail Panel ─── */
function CustomerPanel({ customerId, onClose, onMergeRequest }: {
  customerId: number;
  onClose: () => void;
  onMergeRequest: (id: number) => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [dobValue, setDobValue] = useState<string>("");
  const [dobSaved, setDobSaved] = useState(false);

  const { data, isLoading, refetch } = trpc.crm.customerDetail.useQuery({ customerId });

  useEffect(() => {
    if (data) {
      if (notes === null) setNotes(data.notes ?? "");
      if ((data as any).dateOfBirth) {
        const d = new Date((data as any).dateOfBirth);
        setDobValue(d.toISOString().slice(0, 10));
      }
    }
  }, [data]);

  const addTagMutation = trpc.crm.addTag.useMutation({ onSuccess: () => refetch() });
  const updateDobMutation = trpc.crm.updateDob.useMutation({
    onSuccess: () => { setDobSaved(true); setTimeout(() => setDobSaved(false), 2000); refetch(); },
  });
  const updateNotesMutation = trpc.crm.updateNotes.useMutation({
    onSuccess: () => {
      setSavingNotes(false);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    },
  });

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (!tag) return;
    addTagMutation.mutate({ customerId, tag });
    setNewTag("");
  };

  const handleSaveNotes = () => {
    if (notes === null) return;
    setSavingNotes(true);
    updateNotesMutation.mutate({ customerId, notes });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-500">
      <div className="w-8 h-8 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center h-64 text-gray-500">Customer not found.</div>
  );

  const tags = (data.tags ?? []) as string[];

  return (
    <div className="flex flex-col h-full overflow-y-auto space-y-5 p-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#25D366]/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-[#25D366] font-bold text-lg">
              {(data.name || data.phoneNumber || "?").charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{data.name || "Unknown"}</h2>
            <p className="text-sm text-gray-400">{data.phoneNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMergeRequest(customerId)}
            className="text-xs px-2 py-1.5 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-1"
            title="Merge with another customer"
          >
            <Merge className="w-3.5 h-3.5" /> Merge
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Contact info */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-2">
        {data.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-gray-300">{data.email}</span>
          </div>
        )}
        {(data as any).location && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-gray-300">{(data as any).location}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="text-gray-400">Last contact: <span className="text-gray-200">{formatDate(data.lastContact)} {formatTime(data.lastContact)}</span></span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="text-gray-400">Customer since: <span className="text-gray-200">{formatDate(data.createdAt)}</span></span>
        </div>
        {/* Date of birth — editable */}
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="text-gray-400 flex-shrink-0">Birthday:</span>
          <input
            type="date"
            value={dobValue}
            onChange={e => setDobValue(e.target.value)}
            className="bg-transparent border-b border-gray-600 text-gray-200 text-xs focus:outline-none focus:border-[#25D366] py-0.5 flex-1"
          />
          <button
            onClick={() => updateDobMutation.mutate({ customerId, dateOfBirth: dobValue || null })}
            disabled={updateDobMutation.isPending}
            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors flex-shrink-0"
          >
            {dobSaved ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Messages", value: data.totalMessages, icon: MessageSquare, colour: "text-blue-400" },
          { label: "Appointments", value: data.totalAppointments, icon: CalendarDays, colour: "text-purple-400" },
          { label: "No-shows", value: data.noShows ?? 0, icon: AlertCircle, colour: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-center">
            <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.colour}`} />
            <p className="text-lg font-bold text-white">{s.value ?? 0}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tags */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5" /> Tags
        </h3>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag} className={`text-xs px-2 py-0.5 rounded-full border ${tagColour(tag)}`}>{tag}</span>
          ))}
          {tags.length === 0 && <span className="text-xs text-gray-600">No tags yet</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddTag()}
            placeholder="Add tag…"
            className="input flex-1 text-xs py-1.5"
          />
          <button
            onClick={handleAddTag}
            disabled={!newTag.trim() || addTagMutation.isPending}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <StickyNote className="w-3.5 h-3.5" /> Notes
        </h3>
        <textarea
          rows={4}
          value={notes ?? ""}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add private notes about this customer…"
          className="input w-full resize-none text-sm"
        />
        <button
          onClick={handleSaveNotes}
          disabled={savingNotes || notes === null}
          className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5 ml-auto"
        >
          {notesSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {notesSaved ? "Saved!" : savingNotes ? "Saving…" : "Save Notes"}
        </button>
      </div>

      {/* Recent conversations */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" /> Recent Conversations
        </h3>
        {data.conversations.length === 0 && (
          <p className="text-xs text-gray-600">No conversations yet.</p>
        )}
        <div className="space-y-2">
          {data.conversations.slice(0, 10).map((conv) => (
            <div key={conv.id} className={`rounded-lg p-3 text-xs border ${conv.isEscalated ? "bg-red-900/10 border-red-800" : "bg-gray-900/50 border-gray-700"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`font-medium ${conv.isEscalated ? "text-red-400" : "text-gray-300"}`}>
                  {conv.isEscalated ? "⚠ Escalated" : "Message"}
                </span>
                <span className="text-gray-600">{timeAgo(conv.createdAt)}</span>
              </div>
              <p className="text-gray-400 truncate">{conv.lastMessage}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Merge Dialog ─── */
function MergeDialog({ primaryId, onClose, onMerged }: {
  primaryId: number;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [searchPhone, setSearchPhone] = useState("");
  const [debouncedPhone, setDebouncedPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [selectedSecondaryId, setSelectedSecondaryId] = useState<number | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (v: string) => {
    setSearchPhone(v);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedPhone(v), 300);
  };

  const { data: primaryData } = trpc.crm.customerDetail.useQuery({ customerId: primaryId });
  const { data: searchData } = trpc.crm.customers.useQuery(
    { search: debouncedPhone, limit: 10, page: 1 },
    { enabled: debouncedPhone.length >= 3 }
  );

  const mergeMutation = trpc.crm.merge.useMutation({
    onSuccess: () => { onMerged(); onClose(); },
  });

  const candidates = (searchData?.customers ?? []).filter(c => c.id !== primaryId);
  const selectedCandidate = candidates.find(c => c.id === selectedSecondaryId);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Merge className="w-5 h-5 text-[#25D366]" /> Merge Customer Profiles
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-sm">
          <p className="text-gray-400 text-xs mb-1">Merging INTO (primary — kept):</p>
          <p className="text-white font-medium">{primaryData?.name || "Unknown"}</p>
          <p className="text-gray-400 text-xs">{primaryData?.phoneNumber}</p>
        </div>

        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Search for the duplicate customer to remove:</label>
          <input
            type="text"
            value={searchPhone}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Name or phone number…"
            className="input w-full text-sm"
          />
        </div>

        {candidates.length > 0 && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {candidates.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedSecondaryId(c.id); setConfirmed(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  selectedSecondaryId === c.id
                    ? "bg-red-900/20 border-red-700 text-red-300"
                    : "bg-gray-800/50 border-gray-700 hover:border-gray-600 text-gray-300"
                }`}
              >
                <span className="font-medium">{c.name || "Unknown"}</span>
                <span className="text-gray-500 ml-2 text-xs">{c.phone}</span>
              </button>
            ))}
          </div>
        )}

        {selectedCandidate && (
          <div className="bg-red-900/10 border border-red-800 rounded-xl p-3 text-xs text-red-300 space-y-1">
            <p className="font-semibold">⚠ This will permanently delete "{selectedCandidate.name || selectedCandidate.phone}"</p>
            <p>All their conversations and appointments will be moved to {primaryData?.name || "the primary profile"}.</p>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="rounded" />
              <span>I understand this cannot be undone</span>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => {
              if (selectedSecondaryId) {
                mergeMutation.mutate({ primaryId, secondaryId: selectedSecondaryId });
              }
            }}
            disabled={!selectedSecondaryId || !confirmed || mergeMutation.isPending}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            {mergeMutation.isPending ? "Merging…" : "Merge & Delete Duplicate"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function CustomerProfiles() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "lastContact" | "totalMessages" | "satisfaction">("lastContact");
  const [showImport, setShowImport] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  const handleSearch = (v: string) => {
    setSearch(v);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 300);
  };

  const utils = trpc.useUtils();
  const importMutation = trpc.crm.importCustomers.useMutation({
    onSuccess: (result) => {
      setImportResult(result);
      utils.crm.customers.invalidate();
      setTimeout(() => setImportResult(null), 5000);
    },
  });

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;

      // Detect header row
      const firstLine = lines[0].toLowerCase();
      const hasHeader = firstLine.includes("phone") || firstLine.includes("name") || firstLine.includes("email");
      const dataLines = hasHeader ? lines.slice(1) : lines;

      // Try to parse CSV columns: phone, name, email (flexible order)
      const headers = hasHeader
        ? lines[0].split(",").map(h => h.trim().toLowerCase().replace(/"/g, ""))
        : ["phone", "name", "email"];

      const phoneIdx = headers.findIndex(h => h.includes("phone") || h.includes("mobile") || h.includes("number"));
      const nameIdx = headers.findIndex(h => h.includes("name"));
      const emailIdx = headers.findIndex(h => h.includes("email"));

      const rows = dataLines.map(line => {
        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        return {
          phone: cols[phoneIdx >= 0 ? phoneIdx : 0] ?? "",
          name: nameIdx >= 0 ? cols[nameIdx] : undefined,
          email: emailIdx >= 0 ? cols[emailIdx] : undefined,
        };
      }).filter(r => r.phone);

      if (rows.length) importMutation.mutate({ rows });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const { data, isLoading } = trpc.crm.customers.useQuery({
    page,
    limit: 25,
    search: debouncedSearch || undefined,
    sortBy,
  });

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-5">

      {/* Left panel — list */}
      <div className={`flex flex-col ${selectedId ? "hidden lg:flex lg:w-96 flex-shrink-0" : "flex-1"}`}>

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ContactRound className="w-6 h-6 text-[#25D366]" /> Customer Profiles
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">{total} customers total</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Import result toast */}
            {importResult && (
              <span className="text-xs text-green-400 bg-green-900/20 border border-green-800 px-2 py-1 rounded-lg">
                ✓ {importResult.imported} imported{importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}
              </span>
            )}
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {importMutation.isPending ? "Importing…" : "Import CSV"}
            </button>
            <button
              onClick={() => {
                const rows = customers.map(c => ({
                  name: c.name ?? "",
                  phone: c.phone,
                  email: (c as any).email ?? "",
                  tags: ((c.tags ?? []) as string[]).join(";"),
                  lastContact: c.lastContact ? new Date(c.lastContact).toISOString() : "",
                }));
                exportCSV(`customers-${new Date().toISOString().slice(0,10)}.csv`, rows);
              }}
              disabled={customers.length === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {/* Search + sort */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search name or phone…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="input w-full pl-9 text-sm"
            />
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="input text-sm px-3"
          >
            <option value="lastContact">Last Contact</option>
            <option value="name">Name</option>
            <option value="totalMessages">Most Messages</option>
          </select>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <div className="w-8 h-8 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && customers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <ContactRound className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No customers found</p>
            </div>
          )}

          {customers.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                selectedId === c.id
                  ? "bg-[#25D366]/10 border-[#25D366]"
                  : "bg-gray-800/50 border-gray-700 hover:border-gray-600"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-gray-300">
                    {(c.name || c.phone || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white truncate">{c.name || "Unknown"}</p>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{timeAgo(c.lastContact)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Phone className="w-3 h-3 text-gray-600 flex-shrink-0" />
                    <p className="text-xs text-gray-500 truncate">{c.phone}</p>
                  </div>
                  {c.tags && (c.tags as string[]).length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(c.tags as string[]).slice(0, 3).map(t => (
                        <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border ${tagColour(t)}`}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-gray-800 mt-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs text-gray-400 hover:text-white disabled:opacity-40 transition-colors px-2 py-1"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-xs text-gray-400 hover:text-white disabled:opacity-40 transition-colors px-2 py-1"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Right panel — detail */}
      {selectedId && (
        <div className="flex-1 bg-gray-800/30 border border-gray-700 rounded-2xl overflow-hidden flex flex-col">
          <CustomerPanel
            customerId={selectedId}
            onClose={() => setSelectedId(null)}
            onMergeRequest={(id) => setMergeTargetId(id)}
          />
        </div>
      )}

      {/* Empty state when no customer selected */}
      {!selectedId && (
        <div className="hidden lg:flex flex-1 items-center justify-center text-gray-600 border border-dashed border-gray-700 rounded-2xl flex-col gap-3">
          <ContactRound className="w-12 h-12 opacity-30" />
          <p className="text-sm">Select a customer to view their profile</p>
        </div>
      )}

      {/* Merge dialog */}
      {mergeTargetId && (
        <MergeDialog
          primaryId={mergeTargetId}
          onClose={() => setMergeTargetId(null)}
          onMerged={() => {
            setMergeTargetId(null);
            setSelectedId(null);
            utils.crm.customers.invalidate();
          }}
        />
      )}
    </div>
  );
}
