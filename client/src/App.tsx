import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Monitoring from "./pages/Monitoring";
import Templates from "./pages/Templates";
import Configuration from "./pages/Configuration";
import KnowledgeBase from "./pages/KnowledgeBase";
import CRM from "./pages/CRM";
import AgentDashboard from "./pages/AgentDashboard";
import Analytics from "./pages/Analytics";
import Appointments from "./pages/Appointments";
import Profile from "./pages/Profile";
import UserManagement from "./pages/UserManagement";
import TenantSetup from "./pages/TenantSetup";
import ReceptionistSetup from "./pages/ReceptionistSetup";
import Inbox from "./pages/Inbox";
import Billing from "./pages/Billing";
import Onboarding from "./pages/Onboarding";
import AcceptInvite from "./pages/AcceptInvite";
import ResetPassword from "./pages/ResetPassword";
import Broadcast from "./pages/Broadcast";
import CustomerProfiles from "./pages/CustomerProfiles";
import AuditLog from "./pages/AuditLog";
import StaffManagement from "./pages/StaffManagement";
import BookingPage from "./pages/BookingPage";
import StaffPerformance from "./pages/StaffPerformance";
import Feedback from "./pages/Feedback";
import LoyaltyPage from "./pages/Loyalty";
import ManageBooking from "./pages/ManageBooking";
import PromptAI from "./pages/PromptAI";
import LandingPage from "./pages/LandingPage";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import { trpc } from "./lib/trpc";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ReceptionistWidget from "./components/ReceptionistWidget";
import Pricing from "./pages/Pricing";
import UpgradeRequired from "./pages/UpgradeRequired";
import VerifyEmail from "./pages/VerifyEmail";
import BusinessRules from "./pages/BusinessRules";

// Routes that locked-out users can still access inside the Layout
const ALLOWED_LOCKED_PATHS = ["/billing", "/pricing", "/upgrade", "/profile"];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Check onboarding for non-admin tenants
  const { data: onboardingStatus, isLoading: onboardingLoading } = trpc.botConfig.getOnboardingStatus.useQuery(undefined, {
    enabled: !!user && user.role !== "admin",
    retry: false,
  });

  // Check subscription status for non-admin tenants
  const { data: subStatus, isLoading: subLoading } = trpc.subscription.status.useQuery(undefined, {
    enabled: !!user && user.role !== "admin",
    retry: false,
  });

  if (isLoading || (user && user.role !== "admin" && (onboardingLoading || subLoading))) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // Redirect to onboarding if not completed (skip if already on /onboarding)
  if (
    user.role !== "admin" &&
    onboardingStatus &&
    !onboardingStatus.completed &&
    location.pathname !== "/onboarding"
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  // Redirect to /upgrade when trial expired or account suspended
  // Allow access to billing/pricing/upgrade/profile pages regardless
  const isAllowedPath = ALLOWED_LOCKED_PATHS.some(p => location.pathname.startsWith(p));
  if (
    user.role !== "admin" &&
    subStatus &&
    !subStatus.hasAccess &&
    !isAllowedPath
  ) {
    return <Navigate to="/upgrade" replace />;
  }

  return <>{children}</>;
}

// Redirects non-admin users to the dashboard
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
        <ReceptionistWidget />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      {/* Public marketing pages */}
      <Route path="/home" element={<LandingPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />

      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/forgot-password" element={<ResetPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/book/:slug" element={<BookingPage />} />
      <Route path="/manage/:token" element={<ManageBooking />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
      <Route path="/upgrade" element={<ProtectedRoute><UpgradeRequired /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="monitoring" element={<Monitoring />} />
        <Route path="templates" element={<AdminRoute><Templates /></AdminRoute>} />
        <Route path="knowledge-base" element={<AdminRoute><KnowledgeBase /></AdminRoute>} />
        <Route path="crm" element={<CRM />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="agents" element={<AgentDashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="configuration" element={<AdminRoute><Configuration /></AdminRoute>} />
        <Route path="profile" element={<Profile />} />
        <Route path="user-management" element={<UserManagement />} />
        <Route path="tenant-setup" element={<TenantSetup />} />
        <Route path="receptionist-setup" element={<ReceptionistSetup />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="billing" element={<Billing />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="upgrade" element={<UpgradeRequired />} />
        <Route path="broadcast" element={<Broadcast />} />
        <Route path="customers" element={<CustomerProfiles />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="staff" element={<StaffManagement />} />
        <Route path="staff-performance" element={<StaffPerformance />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="loyalty" element={<LoyaltyPage />} />
        <Route path="prompt-ai" element={<PromptAI />} />
        <Route path="business-rules" element={<BusinessRules />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
