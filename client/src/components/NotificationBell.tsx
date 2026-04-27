import { useState, useEffect, useRef } from "react";
import { Bell, AlertTriangle, MessageSquare, Bot, X } from "lucide-react";
import { trpc } from "../lib/trpc";

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60)   return "just now";
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen]       = useState(false);
  const [seenAt, setSeenAt]   = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { data: activities } = trpc.conversations.recentActivity.useQuery(undefined, { refetchInterval: 15000 });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const items = activities ?? [];
  const escalations = items.filter((i) => i.type === "escalation");
  const unread = seenAt
    ? items.filter((i) => new Date(i.updatedAt) > new Date(seenAt)).length
    : items.length;

  function handleOpen() {
    setOpen((o) => !o);
    if (!open) setSeenAt(new Date().toISOString());
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={handleOpen}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700">
        <Bell className="w-4.5 h-4.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl border border-gray-200 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            <div className="flex items-center gap-2">
              {escalations.length > 0 && (
                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                  {escalations.length} escalation{escalations.length !== 1 ? "s" : ""}
                </span>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[340px] overflow-y-auto divide-y divide-gray-50">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No recent activity
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      item.type === "escalation"  ? "bg-orange-100" :
                      item.type === "new_message" ? "bg-blue-100" : "bg-green-100"
                    }`}>
                      {item.type === "escalation"
                        ? <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                        : item.type === "new_message"
                        ? <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        : <Bot className="w-3.5 h-3.5 text-green-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {item.type === "escalation"
                          ? `Escalated: ${item.name || item.phone}`
                          : item.type === "new_message"
                          ? `New message from ${item.name || item.phone}`
                          : `AI replied to ${item.name || item.phone}`}
                      </p>
                      {item.lastMsg && (
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">{item.lastMsg}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(item.updatedAt)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-center">
              <span className="text-[10px] text-gray-400">Showing last 24 hours</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
