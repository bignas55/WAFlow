import { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";

// Persistent session ID for this browser tab
function getSessionId(): string {
  let id = sessionStorage.getItem("receptionist_session");
  if (!id) {
    id = `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("receptionist_session", id);
  }
  return id;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function ReceptionistWidget() {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! 👋 I'm the WAFlow AI receptionist. Ask me anything about the platform, pricing, or how to get started!",
      timestamp: new Date(),
    },
  ]);
  const [leadSaved, setLeadSaved]       = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadName, setLeadName]         = useState("");
  const [leadEmail, setLeadEmail]       = useState("");
  const [unread, setUnread]             = useState(0);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const sessionId  = getSessionId();

  const chatMutation = trpc.liveReceptionist.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, timestamp: new Date() },
      ]);
      if (data.leadCaptured) setLeadSaved(true);
      if (!open) setUnread((n) => n + 1);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I'm having a moment. Try again!", timestamp: new Date() },
      ]);
    },
  });

  const saveLeadMutation = trpc.liveReceptionist.saveLead.useMutation({
    onSuccess: () => {
      setLeadSaved(true);
      setShowLeadForm(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Thanks ${leadName}! We'll be in touch at ${leadEmail}. In the meantime, feel free to sign up at /register — it's free! 🚀`,
          timestamp: new Date(),
        },
      ]);
    },
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: text, timestamp: new Date() }]);
    setInput("");
    chatMutation.mutate({ sessionId, message: text });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const submitLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadEmail.trim()) return;
    saveLeadMutation.mutate({ sessionId, name: leadName, email: leadEmail });
  };

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all duration-300 hover:scale-110"
        style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" }}
        aria-label="Open AI receptionist"
      >
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unread}
          </span>
        )}
        <svg
          className={`w-7 h-7 text-white transition-transform duration-300 ${open ? "rotate-45 scale-90" : ""}`}
          fill="currentColor" viewBox="0 0 24 24"
        >
          {open ? (
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          ) : (
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          )}
        </svg>
      </button>

      {/* ── Chat window ─────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-24 right-6 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 transition-all duration-300 origin-bottom-right ${
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        }`}
        style={{ width: 360, height: 520 }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-t-2xl text-white flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" }}
        >
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">WAFlow Assistant</p>
            <p className="text-xs text-white/80 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-300 rounded-full inline-block"></span>
              Online now
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-white/70 hover:text-white transition-colors p-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full flex-shrink-0 mr-2 mt-1 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" }}>
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.26 4.88L2 22l5.24-1.24C8.58 21.55 10.25 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
                  </svg>
                </div>
              )}
              <div
                className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
                style={msg.role === "user" ? { background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" } : {}}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {chatMutation.isPending && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" }}>
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.26 4.88L2 22l5.24-1.24C8.58 21.55 10.25 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
                </svg>
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}/>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}/>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}/>
              </div>
            </div>
          )}

          {/* Lead capture form */}
          {showLeadForm && !leadSaved && (
            <form onSubmit={submitLead} className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-green-800">Leave your details and we'll reach out 👇</p>
              <input
                type="text" placeholder="Your name" value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-green-500"
                required
              />
              <input
                type="email" placeholder="Email address" value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-green-500"
                required
              />
              <div className="flex gap-2">
                <button type="submit" disabled={saveLeadMutation.isPending}
                  className="flex-1 py-1.5 text-xs font-semibold text-white rounded-lg transition-opacity disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" }}>
                  {saveLeadMutation.isPending ? "Saving..." : "Send"}
                </button>
                <button type="button" onClick={() => setShowLeadForm(false)}
                  className="px-3 text-xs text-gray-500 hover:text-gray-700">
                  Skip
                </button>
              </div>
            </form>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Quick actions */}
        {messages.length <= 2 && !chatMutation.isPending && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
            {["How does it work?", "What does it cost?", "Can I try for free?", "Book a demo"].map((q) => (
              <button key={q} onClick={() => { setInput(q); setTimeout(send, 50); }}
                className="text-xs px-2.5 py-1 rounded-full border border-green-300 text-green-700 hover:bg-green-50 transition-colors">
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="px-3 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me anything..."
              className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
              disabled={chatMutation.isPending}
            />
            {!leadSaved && messages.length > 4 && (
              <button
                onClick={() => setShowLeadForm(true)}
                className="text-gray-400 hover:text-green-600 transition-colors flex-shrink-0"
                title="Leave your details"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
            )}
            <button
              onClick={send}
              disabled={!input.trim() || chatMutation.isPending}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-40 flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)" }}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-1.5">Powered by WAFlow AI</p>
        </div>
      </div>
    </>
  );
}
