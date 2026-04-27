import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "../lib/trpc";
import {
  Send, Trash2, Copy, Check, Sparkles, Brain,
  ChevronDown, Loader2, Wand2, BookOpen,
  BarChart3, Code2, Shield, Layers, BookMarked,
  Star, Download, ThumbsUp, ThumbsDown, X, Search,
  Plus, Library, FileUp, Link2,
  FileText, Globe, AlertCircle, CheckCircle2,
  Zap, FilePlus2, FileCheck2, RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  rating?: number;
}

interface LibraryItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  rating: number;
  createdAt: string;
}

interface ParsedFile {
  name: string;
  text: string;
  chars: number;
  status: "parsing" | "done" | "error";
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const CAPABILITIES = [
  { icon: Wand2,    label: "Write prompts",     hint: "Write me a system prompt for a customer support bot" },
  { icon: BookOpen, label: "Optimize prompts",  hint: "Optimize this prompt for Claude: ..." },
  { icon: BarChart3,label: "Rate & score",      hint: "Rate this prompt out of 10 and explain each score" },
  { icon: Code2,    label: "Platform-specific", hint: "How do I write prompts differently for Midjourney vs DALL-E 3?" },
  { icon: Layers,   label: "Chained prompts",   hint: "Build me a multi-step prompt chain for data extraction" },
  { icon: Shield,   label: "Guardrails",        hint: "Add guardrails to this prompt so it stays on topic" },
  { icon: Brain,    label: "Explain techniques",hint: "Explain Chain-of-Thought prompting with an example" },
  { icon: Zap,      label: "Token optimize",    hint: "How can I reduce the token count of this prompt without losing quality?" },
];

const STARTERS = [
  "Write a world-class system prompt for a WhatsApp customer service bot",
  "Review this prompt and tell me what's weak about it: 'Answer questions helpfully'",
  "What's the difference between zero-shot and few-shot prompting?",
  "Build me a reusable prompt template for summarizing business emails",
];

const ACCEPTED_EXTENSIONS = ".txt,.md,.csv,.json,.html,.xml,.log,.yaml,.yml,.ts,.tsx,.js,.jsx,.py,.sh,.sql,.pdf,.docx,.doc";

// ── Helpers ────────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }
function formatTime(d: Date) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function fmtSize(chars: number) {
  if (chars < 1000) return `${chars} chars`;
  return `${(chars / 1000).toFixed(1)}k chars`;
}

// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-gray-700 bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700">
        <span className="text-xs text-gray-400 font-mono">{lang || "prompt"}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
          {copied ? <><Check className="w-3.5 h-3.5 text-[#25D366]" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
        </button>
      </div>
      <pre className="px-4 py-3 text-sm text-gray-200 font-mono overflow-x-auto whitespace-pre-wrap break-words">{code}</pre>
    </div>
  );
}

function renderContent(text: string) {
  const parts: React.ReactNode[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={last} style={{ whiteSpace: "pre-wrap" }}>{renderBold(text.slice(last, m.index))}</span>);
    parts.push(<CodeBlock key={m.index} lang={m[1]} code={m[2].trim()} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={last} style={{ whiteSpace: "pre-wrap" }}>{renderBold(text.slice(last))}</span>);
  return <>{parts}</>;
}

function renderBold(text: string): React.ReactNode {
  const re = /\*\*(.+?)\*\*/g;
  const out: React.ReactNode[] = [];
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={m.index} className="font-semibold text-white">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ── File icon helper ───────────────────────────────────────────────────────────
function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const color =
    ext === "pdf"  ? "text-red-400" :
    ext === "docx" || ext === "doc" ? "text-blue-400" :
    ext === "csv"  ? "text-green-400" :
    ext === "json" ? "text-yellow-400" : "text-gray-400";
  return <FileText className={`w-4 h-4 flex-shrink-0 ${color}`} />;
}

// ── Library Sidebar ────────────────────────────────────────────────────────────
function LibrarySidebar({ items, onInsert, onDelete, onClose }: {
  items: LibraryItem[];
  onInsert: (content: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = items.filter(i =>
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.content.toLowerCase().includes(search.toLowerCase()) ||
    i.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div className="w-72 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Library className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-white">Prompt Library</span>
          <span className="text-xs bg-purple-600/20 text-purple-300 px-1.5 py-0.5 rounded-full">{items.length}</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-3 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prompts…"
            className="w-full bg-gray-800 text-gray-200 placeholder-gray-600 rounded-lg pl-8 pr-3 py-1.5 text-xs border border-gray-700 focus:outline-none focus:border-purple-600" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-xs">
            {search ? "No matching prompts" : "No saved prompts yet.\nSave any AI reply to see it here."}
          </div>
        ) : filtered.map(item => (
          <div key={item.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-purple-600/50 group transition-colors">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-xs font-medium text-white line-clamp-1">{item.title}</p>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
                <button onClick={() => onInsert(item.content)} title="Use prompt" className="text-purple-400 hover:text-purple-300"><Plus className="w-3.5 h-3.5" /></button>
                <button onClick={() => onDelete(item.id)} title="Delete" className="text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 line-clamp-2 mb-1.5">{item.content}</p>
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map(t => <span key={t} className="text-[9px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">{t}</span>)}
              </div>
            )}
            {item.rating > 0 && (
              <div className="flex mt-1.5">
                {Array.from({ length: item.rating }).map((_, i) => <Star key={i} className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Save Modal ─────────────────────────────────────────────────────────────────
function SaveModal({ content, onSave, onClose }: { content: string; onSave: (title: string, tags: string[]) => void; onClose: () => void }) {
  const [title, setTitle] = useState(content.slice(0, 60));
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const addTag = () => { const t = tagInput.trim().toLowerCase(); if (t && !tags.includes(t)) { setTags(p => [...p, t]); setTagInput(""); } };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><BookMarked className="w-4 h-4 text-purple-400" />Save to Library</h3>
        <label className="block text-xs text-gray-400 mb-1">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
          className="w-full bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-purple-600" />
        <label className="block text-xs text-gray-400 mb-1">Tags</label>
        <div className="flex gap-2 mb-2">
          <input value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="Add tag…" className="flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-600" />
          <button onClick={addTag} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg">Add</button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1 text-xs bg-purple-600/20 text-purple-300 px-2 py-0.5 rounded-full">
                {t}<button onClick={() => setTags(p => p.filter(x => x !== t))}><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 text-sm text-gray-400 hover:text-white border border-gray-700 py-2 rounded-lg">Cancel</button>
          <button onClick={() => onSave(title.trim() || "Untitled Prompt", tags)} className="flex-1 text-sm bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PromptAI() {
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [showCaps, setShowCaps]       = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saveTarget, setSaveTarget]   = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // ── Source builder state ──────────────────────────────────────────────
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [urls, setUrls]               = useState<string[]>([""]);
  const [urlStatuses, setUrlStatuses] = useState<Record<number, "idle" | "loading" | "ok" | "error">>({});
  const [urlTexts, setUrlTexts]       = useState<Record<number, string>>({});
  const [goal, setGoal]               = useState("");
  const [platform, setPlatform]       = useState("any");
  const [isDragging, setIsDragging]   = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatMutation        = trpc.promptExpert.chat.useMutation();
  const parseFileMutation   = trpc.promptExpert.parseFile.useMutation();
  const fetchUrlMutation    = trpc.promptExpert.fetchUrl.useMutation();
  const saveHistoryMutation = trpc.promptExpert.saveHistory.useMutation();
  const rateMessageMutation = trpc.promptExpert.rateMessage.useMutation();
  const saveToLibMutation   = trpc.promptExpert.saveToLibrary.useMutation();
  const deleteFromLibMutation = trpc.promptExpert.deleteFromLibrary.useMutation();
  const clearHistoryMutation  = trpc.promptExpert.clearHistory.useMutation();

  const { data: history }   = trpc.promptExpert.getHistory.useQuery();
  const { data: library, refetch: refetchLibrary } = trpc.promptExpert.getLibrary.useQuery();

  // ── Load history ──────────────────────────────────────────────────────
  useEffect(() => {
    if (history && !historyLoaded) {
      setMessages(history.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
      setHistoryLoaded(true);
    }
  }, [history, historyLoaded]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatMutation.isPending]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  useEffect(() => {
    if (!historyLoaded || messages.length === 0) return;
    const t = setTimeout(() => saveHistoryMutation.mutate({ messages: messages.map(m => ({ ...m, timestamp: m.timestamp.toISOString() })) }), 1000);
    return () => clearTimeout(t);
  }, [messages, historyLoaded]);

  // ── File upload & parsing ─────────────────────────────────────────────
  async function handleFiles(fileList: FileList) {
    const newFiles: ParsedFile[] = Array.from(fileList).map(f => ({
      name: f.name, text: "", chars: 0, status: "parsing",
    }));
    setParsedFiles(prev => [...prev, ...newFiles]);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const localIdx = parsedFiles.length + i;
      try {
        const base64 = await fileToBase64(file);
        const result = await parseFileMutation.mutateAsync({
          filename: file.name,
          mimeType: file.type || guessMime(file.name),
          base64,
        });
        setParsedFiles(prev => prev.map((f, j) =>
          j === localIdx ? { ...f, text: result.text, chars: result.chars, status: "done" } : f
        ));
      } catch (err: any) {
        setParsedFiles(prev => prev.map((f, j) =>
          j === localIdx ? { ...f, status: "error", error: err?.message ?? "Failed to parse file" } : f
        ));
      }
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const result = e.target?.result as string;
        // result is "data:mime;base64,XXXX" — strip the prefix
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(new Error("File read failed"));
      reader.readAsDataURL(file);
    });
  }

  function guessMime(name: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf")  return "application/pdf";
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === "doc")  return "application/msword";
    return "text/plain";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  // ── URL fetch ─────────────────────────────────────────────────────────
  async function fetchUrl(idx: number) {
    const url = urls[idx]?.trim();
    if (!url || !/^https?:\/\//.test(url)) return;
    setUrlStatuses(p => ({ ...p, [idx]: "loading" }));
    try {
      const { text } = await fetchUrlMutation.mutateAsync({ url });
      setUrlTexts(p => ({ ...p, [idx]: text }));
      setUrlStatuses(p => ({ ...p, [idx]: "ok" }));
    } catch {
      setUrlStatuses(p => ({ ...p, [idx]: "error" }));
    }
  }

  // ── Generate prompt from sources ──────────────────────────────────────
  function generateFromSources() {
    const fileParts = parsedFiles
      .filter(f => f.status === "done" && f.text)
      .map(f => `--- FILE: ${f.name} ---\n${f.text.slice(0, 5000)}${f.text.length > 5000 ? "\n[...truncated]" : ""}`);

    const urlParts = urls
      .map((u, i) => urlTexts[i] ? `--- WEBSITE: ${u} ---\n${urlTexts[i].slice(0, 4000)}` : null)
      .filter(Boolean);

    const allContent = [...fileParts, ...urlParts].join("\n\n");
    const platformNote = platform !== "any" ? ` Optimise specifically for **${platform}**.` : "";
    const goalNote = goal.trim() ? `\n\nMy goal / use case: ${goal.trim()}` : "";

    const prompt = [
      `Based on the following source material, create a world-class, production-ready prompt that captures the key information, context, and purpose of these sources.${platformNote}${goalNote}`,
      "",
      allContent || "(No file or URL content provided — create a general-purpose optimised prompt based on the goal above)",
      "",
      "Please:\n1. Analyse what this content is about\n2. Identify the ideal use case and audience\n3. Write the complete optimised prompt inside a code block\n4. Explain the key design decisions",
    ].join("\n");

    send(prompt);
  }

  const hasFiles = parsedFiles.some(f => f.status === "done");
  const hasUrls  = Object.values(urlTexts).some(Boolean);
  const isParsing = parsedFiles.some(f => f.status === "parsing");
  const canGenerate = (hasFiles || hasUrls || goal.trim().length > 0) && !chatMutation.isPending && !isParsing;

  // ── Chat ──────────────────────────────────────────────────────────────
  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || chatMutation.isPending) return;
    setInput("");

    const userMsg: Message = { id: uid(), role: "user", content, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const hist = [...messages, userMsg].slice(-20).map(m => ({ role: m.role, content: m.content }));
      const { reply } = await chatMutation.mutateAsync({ messages: hist });
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: reply, timestamp: new Date() }]);
    } catch {
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: "⚠️ Something went wrong. Please check your AI API key in Configuration and try again.", timestamp: new Date() }]);
    }
  }, [input, messages, chatMutation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const rateMsg = (id: string, rating: number) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, rating } : m));
    rateMessageMutation.mutate({ id, rating });
  };

  const clearChat = () => { setMessages([]); clearHistoryMutation.mutate(); };
  const exportChat = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `waflow-prompts-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToLib = (title: string, tags: string[]) => {
    if (!saveTarget) return;
    saveToLibMutation.mutate({ title, content: saveTarget, tags }, { onSuccess: () => { setSaveTarget(null); refetchLibrary(); } });
  };

  const isEmpty = messages.length === 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-8rem)] max-w-7xl mx-auto gap-0 overflow-hidden">

      {/* ══════════════ LEFT COLUMN: Source Builder ══════════════ */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-gray-900 border border-gray-800 rounded-2xl mr-4 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <FilePlus2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Prompt Sources</p>
            <p className="text-[10px] text-gray-500">Upload files or add URLs → generate prompt</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* ── File upload zone ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5 text-indigo-400" /> Upload Files
            </p>
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-all select-none ${
                isDragging
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-gray-700 hover:border-indigo-600 hover:bg-indigo-600/5"
              }`}
            >
              <FileUp className="w-7 h-7 text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-400 leading-relaxed">
                Drag & drop or <span className="text-indigo-400 font-semibold">click to browse</span>
              </p>
              <p className="text-[10px] text-gray-600 mt-1">PDF · DOCX · TXT · MD · CSV · JSON · HTML · code files</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS}
                className="hidden"
                onChange={e => e.target.files && handleFiles(e.target.files)}
              />
            </div>

            {/* Parsed files list */}
            {parsedFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {parsedFiles.map((f, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
                    f.status === "done"    ? "bg-gray-800 border-gray-700" :
                    f.status === "parsing" ? "bg-gray-800 border-indigo-700/50 animate-pulse" :
                    "bg-red-900/20 border-red-700/50"
                  }`}>
                    <FileIcon name={f.name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 truncate font-medium">{f.name}</p>
                      {f.status === "done"    && <p className="text-[10px] text-gray-500">{fmtSize(f.chars)} extracted</p>}
                      {f.status === "parsing" && <p className="text-[10px] text-indigo-400">Parsing…</p>}
                      {f.status === "error"   && <p className="text-[10px] text-red-400 truncate">{f.error ?? "Parse failed"}</p>}
                    </div>
                    {f.status === "done"    && <FileCheck2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
                    {f.status === "parsing" && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />}
                    {f.status === "error"   && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                    <button
                      onClick={e => { e.stopPropagation(); setParsedFiles(p => p.filter((_, j) => j !== i)); }}
                      className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── URL inputs ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
              <Globe className="w-3.5 h-3.5 text-green-400" /> Website URLs
            </p>
            <div className="space-y-2">
              {urls.map((url, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className={`flex-1 flex items-center gap-1.5 bg-gray-800 border rounded-lg px-2.5 py-2 transition-colors ${
                    urlStatuses[i] === "ok"    ? "border-green-600/50" :
                    urlStatuses[i] === "error" ? "border-red-600/50" :
                    "border-gray-700 focus-within:border-indigo-500"
                  }`}>
                    <Link2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <input
                      value={url}
                      onChange={e => { const u = [...urls]; u[i] = e.target.value; setUrls(u); setUrlStatuses(p => ({ ...p, [i]: "idle" })); }}
                      onBlur={() => fetchUrl(i)}
                      placeholder="https://example.com"
                      className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600 focus:outline-none min-w-0"
                    />
                    {urlStatuses[i] === "loading" && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" />}
                    {urlStatuses[i] === "ok"      && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                    {urlStatuses[i] === "error"   && <span title="Could not fetch"><AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /></span>}
                  </div>
                  {url && urlStatuses[i] === "idle" && (
                    <button onClick={() => fetchUrl(i)} className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-700/50 px-2 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0">
                      Fetch
                    </button>
                  )}
                  {urls.length > 1 && (
                    <button onClick={() => { setUrls(p => p.filter((_, j) => j !== i)); setUrlStatuses(p => { const n = { ...p }; delete n[i]; return n; }); setUrlTexts(p => { const n = { ...p }; delete n[i]; return n; }); }}
                      className="text-gray-600 hover:text-red-400 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {urls.length < 5 && (
                <button onClick={() => setUrls(p => [...p, ""])} className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-indigo-400 transition-colors">
                  <Plus className="w-3 h-3" /> Add URL
                </button>
              )}
            </div>
          </div>

          {/* ── Goal ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Goal / Use Case</p>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              rows={3}
              placeholder="e.g. Create a WhatsApp support bot system prompt from this FAQ document…"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* ── Platform ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Target Platform</p>
            <div className="flex flex-wrap gap-1.5">
              {["any", "GPT-4o", "Claude", "Gemini", "LLaMA", "Mistral", "Midjourney", "Stable Diffusion"].map(p => (
                <button key={p} onClick={() => setPlatform(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors font-medium ${
                    platform === p
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                  }`}>
                  {p === "any" ? "Universal" : p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Generate button */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={generateFromSources}
            disabled={!canGenerate}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-900/30 text-sm"
          >
            {chatMutation.isPending || isParsing
              ? <><Loader2 className="w-4 h-4 animate-spin" />{isParsing ? "Parsing files…" : "Generating…"}</>
              : <><Wand2 className="w-4 h-4" /> Generate Prompt</>
            }
          </button>
          {!hasFiles && !hasUrls && !goal && (
            <p className="text-[10px] text-gray-600 text-center mt-2">Upload a file, add a URL, or describe your use case above</p>
          )}
          {(hasFiles || hasUrls) && (
            <p className="text-[10px] text-green-500 text-center mt-2">
              {[hasFiles && `${parsedFiles.filter(f => f.status === "done").length} file(s)`, hasUrls && `${Object.values(urlTexts).filter(Boolean).length} URL(s)`].filter(Boolean).join(" + ")} ready · click Generate
            </p>
          )}
        </div>
      </div>

      {/* ══════════════ RIGHT COLUMN: Chat ══════════════ */}
      <div className="flex flex-col flex-1 min-w-0 gap-3">

        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-900/40">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Prompt AI</h1>
              <p className="text-xs text-gray-500">WAFlow · World-class Prompt Engineering Expert · Admin only</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={() => setShowCaps(v => !v)}
              className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-colors ${showCaps ? "bg-gray-700 border-gray-500 text-white" : "text-gray-400 hover:text-white border-gray-700"}`}>
              <Brain className="w-3.5 h-3.5" /> Capabilities
              <ChevronDown className={`w-3 h-3 transition-transform ${showCaps ? "rotate-180" : ""}`} />
            </button>
            <button onClick={() => setShowLibrary(v => !v)}
              className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-colors ${showLibrary ? "bg-purple-600/20 border-purple-600 text-purple-300" : "text-gray-400 hover:text-white border-gray-700"}`}>
              <Library className="w-3.5 h-3.5" /> Library
              {(library?.length ?? 0) > 0 && <span className="bg-purple-600 text-white text-[9px] px-1 py-0.5 rounded-full">{library!.length}</span>}
            </button>
            {messages.length > 0 && (
              <>
                <button onClick={exportChat} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
                <button onClick={clearChat} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-800 px-3 py-1.5 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              </>
            )}
          </div>
        </div>

        {/* Capabilities panel */}
        {showCaps && (
          <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0">
            {CAPABILITIES.map(cap => (
              <button key={cap.label} onClick={() => { setInput(cap.hint); setShowCaps(false); textareaRef.current?.focus(); }}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-purple-600 text-left transition-colors group">
                <cap.icon className="w-4 h-4 text-purple-400 flex-shrink-0 group-hover:text-purple-300" />
                <span className="text-xs text-gray-300 group-hover:text-white font-medium leading-tight">{cap.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-4 min-h-0">
          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8 px-4 gap-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-purple-900/50">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Meet WAFlow</h2>
                <p className="text-gray-400 max-w-md text-sm leading-relaxed">
                  Your world-class Prompt Engineering Expert. <span className="text-indigo-300 font-medium">Upload files or add URLs on the left</span> to auto-generate production-ready prompts — or chat directly below.
                </p>
              </div>
              <div className="w-full max-w-lg space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Or try asking…</p>
                {STARTERS.map(starter => (
                  <button key={starter} onClick={() => send(starter)}
                    className="w-full text-left px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-purple-600 text-sm text-gray-300 hover:text-white transition-all group">
                    <span className="text-purple-400 mr-2 group-hover:text-purple-300">→</span>{starter}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"} group`}>
              <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                msg.role === "user" ? "bg-[#25D366]/20 text-[#25D366]" : "bg-gradient-to-br from-purple-600 to-indigo-600 text-white"
              }`}>
                {msg.role === "user" ? "U" : <Sparkles className="w-4 h-4" />}
              </div>
              <div className={`max-w-[82%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#25D366]/10 border border-[#25D366]/20 text-gray-100 rounded-tr-sm"
                    : "bg-gray-800 border border-gray-700 text-gray-200 rounded-tl-sm"
                }`}>
                  {msg.role === "assistant" ? renderContent(msg.content) : <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>}
                </div>
                <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[10px] text-gray-600">{formatTime(msg.timestamp)}</span>
                  {msg.role === "assistant" && (
                    <>
                      <button onClick={() => rateMsg(msg.id, msg.rating === 1 ? 0 : 1)} className={`transition-colors ${msg.rating === 1 ? "text-[#25D366]" : "text-gray-600 hover:text-[#25D366]"}`}><ThumbsUp className="w-3 h-3" /></button>
                      <button onClick={() => rateMsg(msg.id, msg.rating === -1 ? 0 : -1)} className={`transition-colors ${msg.rating === -1 ? "text-red-400" : "text-gray-600 hover:text-red-400"}`}><ThumbsDown className="w-3 h-3" /></button>
                      <button onClick={() => setSaveTarget(msg.content)} title="Save to library" className="text-gray-600 hover:text-purple-400 transition-colors"><BookMarked className="w-3 h-3" /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Chat input */}
        <div className="flex-shrink-0">
          <div className="flex items-end gap-2 bg-gray-900 border border-gray-700 focus-within:border-purple-600 rounded-2xl px-4 py-3 transition-colors">
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Or ask WAFlow to write, fix, or optimize a prompt…" rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-200 placeholder-gray-600 min-h-[24px] max-h-[160px]" />
            <button onClick={() => send()} disabled={!input.trim() || chatMutation.isPending}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-purple-900/30">
              {chatMutation.isPending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          <p className="text-center text-[10px] text-gray-700 mt-2">
            Powered by Groq · History auto-saved · Always review AI-generated prompts before production use
          </p>
        </div>
      </div>

      {/* Library sidebar */}
      {showLibrary && (
        <LibrarySidebar
          items={library ?? []}
          onInsert={content => { setInput(content); textareaRef.current?.focus(); }}
          onDelete={id => deleteFromLibMutation.mutate({ id }, { onSuccess: () => refetchLibrary() })}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* Save modal */}
      {saveTarget && <SaveModal content={saveTarget} onSave={handleSaveToLib} onClose={() => setSaveTarget(null)} />}
    </div>
  );
}
