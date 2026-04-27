import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MessageSquare, Users, FileText, X, Command, ArrowRight } from "lucide-react";
import { trpc } from "../lib/trpc";

// ── Debounce ───────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Search modal ───────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const navigate  = useNavigate();
  const dq        = useDebounce(query.trim(), 280);

  const { data, isFetching } = trpc.conversations.globalSearch.useQuery(
    { q: dq },
    { enabled: dq.length >= 1, staleTime: 5000 }
  );

  // ── Keyboard shortcut ────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); setQuery(""); setCursor(0); }
  }, [open]);

  // ── Flatten results for keyboard nav ─────────────────────────────────────
  type ResultItem =
    | { type: "conversation"; id: number; name: string | null; phone: string; lastMessage: string | null }
    | { type: "customer";     id: number; name: string | null; phone: string; email: string | null }
    | { type: "template";     id: number; name: string; category: string | null };

  const items: ResultItem[] = [
    ...(data?.conversations ?? []),
    ...(data?.customers ?? []),
    ...(data?.templates ?? []),
  ];

  function go(item: ResultItem) {
    if (item.type === "conversation") navigate("/inbox");
    else if (item.type === "customer") navigate("/crm");
    else if (item.type === "template") navigate("/templates");
    setOpen(false);
  }

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === "Enter" && items[cursor]) go(items[cursor]);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, cursor, items]);

  if (!open) return null;

  const hasResults = items.length > 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200"
        onClick={(e) => e.stopPropagation()}>

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            placeholder="Search conversations, customers, templates…"
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent"
          />
          {isFetching && (
            <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
          )}
          {query && (
            <button onClick={() => setQuery("")} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto py-2">
          {!dq && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Start typing to search across all your data
            </div>
          )}
          {dq && !hasResults && !isFetching && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No results for "<span className="text-gray-600 font-medium">{dq}</span>"
            </div>
          )}

          {/* Conversations */}
          {(data?.conversations ?? []).length > 0 && (
            <Section title="Conversations" icon={<MessageSquare className="w-3.5 h-3.5" />}>
              {data!.conversations.map((item, i) => {
                const globalIdx = i;
                return (
                  <ResultRow
                    key={`conv-${item.id}`}
                    icon={<MessageSquare className="w-4 h-4 text-blue-500" />}
                    primary={item.name || item.phone}
                    secondary={item.phone}
                    tertiary={item.lastMessage ?? undefined}
                    selected={cursor === globalIdx}
                    onClick={() => go(item)}
                  />
                );
              })}
            </Section>
          )}

          {/* Customers */}
          {(data?.customers ?? []).length > 0 && (
            <Section title="Customers" icon={<Users className="w-3.5 h-3.5" />}>
              {data!.customers.map((item, i) => {
                const globalIdx = (data?.conversations?.length ?? 0) + i;
                return (
                  <ResultRow
                    key={`cust-${item.id}`}
                    icon={<Users className="w-4 h-4 text-purple-500" />}
                    primary={item.name || item.phone}
                    secondary={item.email ?? item.phone}
                    selected={cursor === globalIdx}
                    onClick={() => go(item)}
                  />
                );
              })}
            </Section>
          )}

          {/* Templates */}
          {(data?.templates ?? []).length > 0 && (
            <Section title="Templates" icon={<FileText className="w-3.5 h-3.5" />}>
              {data!.templates.map((item, i) => {
                const globalIdx = (data?.conversations?.length ?? 0) + (data?.customers?.length ?? 0) + i;
                return (
                  <ResultRow
                    key={`tpl-${item.id}`}
                    icon={<FileText className="w-4 h-4 text-green-500" />}
                    primary={item.name}
                    secondary={item.category ?? "General"}
                    selected={cursor === globalIdx}
                    onClick={() => go(item)}
                  />
                );
              })}
            </Section>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">↵</kbd> open</span>
          </div>
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Command className="w-3 h-3" />K to toggle
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function ResultRow({
  icon, primary, secondary, tertiary, selected, onClick,
}: {
  icon: React.ReactNode; primary: string | null; secondary?: string | null;
  tertiary?: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        selected ? "bg-blue-50 border-l-2 border-blue-500" : "hover:bg-gray-50 border-l-2 border-transparent"
      }`}>
      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{primary || "—"}</p>
        {secondary && <p className="text-xs text-gray-400 truncate">{secondary}</p>}
        {tertiary   && <p className="text-[10px] text-gray-400 truncate mt-0.5 italic">{tertiary}</p>}
      </div>
      {selected && <ArrowRight className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
    </button>
  );
}

// ── Trigger button (for the header) ───────────────────────────────────────

export function SearchTrigger() {
  return (
    <button
      onClick={() => {
        const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
        window.dispatchEvent(event);
      }}
      className="flex items-center gap-2 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
    >
      <Search className="w-3.5 h-3.5" />
      <span>Search</span>
      <kbd className="flex items-center gap-0.5 text-gray-400">
        <Command className="w-3 h-3" />K
      </kbd>
    </button>
  );
}
