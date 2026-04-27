import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Activity, MessageSquare, Users, UserCheck, BarChart2, LogOut, Zap, Menu, CalendarDays, UserCog, UsersRound, Shield, Bot, Inbox, Database, Settings, Calendar, CreditCard, Server, Megaphone, ContactRound, ShieldCheck, UserRound, Sun, Moon, Award, Star, TrendingUp, Webhook, Sparkles, Ticket, GitBranch, Search, Command } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useWhatsAppSocket } from "../hooks/useWhatsAppSocket";
import { trpc } from "../lib/trpc";
import { GlobalSearch, SearchTrigger } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { WAFlowLogo } from "./WAFlowLogo";
import { TrialBanner } from "./TrialBanner";

// Admin-only nav
const ADMIN_NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/inbox", icon: Inbox, label: "My Inbox" },
  { to: "/appointments", icon: Calendar, label: "Appointments" },
  { to: "/monitoring", icon: Activity, label: "Monitoring" },
  { to: "/tenant-setup", icon: Users, label: "Tenant Setup" },
  { to: "/user-management", icon: UsersRound, label: "Users" },
  { to: "/knowledge-base", icon: Database, label: "Train AI" },
  { to: "/templates", icon: MessageSquare, label: "Templates" },
  { to: "/configuration", icon: Settings, label: "Configuration" },
  { to: "/analytics", icon: BarChart2, label: "Analytics" },
  { to: "/broadcast", icon: Megaphone, label: "Broadcast" },
  { to: "/loyalty", icon: Award, label: "Loyalty" },
  { to: "/feedback", icon: Star, label: "Feedback" },
  { to: "/billing", icon: CreditCard, label: "Billing" },
  { to: "/instances", icon: Server, label: "Instances" },
  { to: "/receptionist-setup", icon: Bot, label: "My Receptionist" },
  { to: "/business-rules", icon: Zap, label: "Business Rules" },
];

// Per-tenant (non-admin) nav
const TENANT_NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/inbox", icon: Inbox, label: "Inbox" },
  { to: "/appointments", icon: CalendarDays, label: "Appointments" },
  { to: "/staff", icon: UserRound, label: "Staff" },
  { to: "/crm", icon: Users, label: "CRM" },
  { to: "/customers", icon: ContactRound, label: "Customers" },
  { to: "/agents", icon: UserCheck, label: "Agents" },
  { to: "/analytics", icon: BarChart2, label: "Analytics" },
  { to: "/broadcast", icon: Megaphone, label: "Broadcast" },
  { to: "/loyalty", icon: Award, label: "Loyalty" },
  { to: "/feedback", icon: Star, label: "Feedback" },
  { to: "/staff-performance", icon: TrendingUp, label: "Performance" },
  { to: "/webhooks", icon: Webhook, label: "Webhooks" },
  { to: "/tickets", icon: Ticket, label: "IT Tickets" },
  { to: "/flow-builder", icon: GitBranch, label: "Flow Builder" },
  { to: "/business-rules", icon: Zap, label: "Business Rules" },
  { to: "/audit-log", icon: ShieldCheck, label: "Audit Log" },
  { to: "/billing", icon: CreditCard, label: "Billing" },
  { to: "/pricing", icon: Sparkles, label: "Upgrade Plan" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { isConnected } = useWhatsAppSocket();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem("theme");
    return stored !== "light";
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.remove("light-mode");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.add("light-mode");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  const isAdmin = user?.role === "admin";
  const NAV = isAdmin ? ADMIN_NAV : TENANT_NAV;

  // Escalation badge — count threads that are escalated and need attention
  const { data: escalationCount } = trpc.conversations.getEscalatedCount.useQuery(
    undefined,
    { refetchInterval: 15_000 }
  );

  // For non-admin users, show their own WhatsApp connection status
  const { data: qrStatus } = trpc.whatsapp.qrStatus.useQuery(
    undefined,
    { refetchInterval: 10_000, enabled: !isAdmin }
  );

  const waConnected = !isAdmin && qrStatus?.status === "connected";

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {open && <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 w-64 bg-gray-900 border-r border-gray-800 z-30 flex flex-col transform transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex items-center gap-3 p-4 border-b border-gray-800">
          <WAFlowLogo size="sm" theme="dark" />
          <p className="text-xs text-gray-500">{isAdmin ? "Admin Dashboard" : "AI Receptionist"}</p>
        </div>

        {/* Status pill — admin sees platform badge, tenants see their WA status */}
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-gray-800/50 flex items-center gap-2">
          {isAdmin ? (
            <>
              <Shield className="w-3 h-3 text-[#25D366]" />
              <span className="text-xs text-gray-400">Admin View</span>
            </>
          ) : (
            <>
              <div className={`w-2 h-2 rounded-full ${waConnected ? "bg-[#25D366] animate-pulse" : "bg-red-500"}`} />
              <span className="text-xs text-gray-400 truncate">
                {waConnected ? `WhatsApp Connected` : "WhatsApp Disconnected"}
              </span>
            </>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const isInbox = item.to === "/inbox";
            const badge = isInbox && escalationCount && escalationCount > 0 ? escalationCount : null;
            return (
              <NavLink key={item.to} to={item.to} end={(item as any).end}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badge && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <button
              onClick={() => { navigate("/profile"); setOpen(false); }}
              className="w-8 h-8 bg-[#25D366]/20 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-[#25D366]/30 transition-colors"
              title="Edit profile"
            >
              <span className="text-[#25D366] font-semibold text-sm">{user?.name?.charAt(0).toUpperCase()}</span>
            </button>
            <button
              onClick={() => { navigate("/profile"); setOpen(false); }}
              className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
              title="Edit profile"
            >
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </button>
            <button
              onClick={() => setDarkMode(v => !v)}
              className="text-gray-500 hover:text-yellow-400 transition-colors"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { navigate("/profile"); setOpen(false); }}
              className="text-gray-500 hover:text-[#25D366] transition-colors"
              title="Profile settings"
            >
              <UserCog className="w-4 h-4" />
            </button>
            <button onClick={logout} className="text-gray-500 hover:text-red-400 transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white">
          <button onClick={() => setOpen(o => !o)} className="lg:hidden text-gray-400 hover:text-gray-600">
            <Menu className="w-5 h-5" />
          </button>
          <div className="lg:hidden flex items-center gap-2">
            <WAFlowLogo size="sm" theme="light" />
          </div>
          <div className="flex-1" />
          <SearchTrigger />
          <NotificationBell />
        </div>
        <TrialBanner />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Global search modal */}
      <GlobalSearch />
    </div>
  );
}
