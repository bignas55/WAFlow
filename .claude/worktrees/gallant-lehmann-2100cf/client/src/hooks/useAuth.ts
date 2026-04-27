import { createContext, useContext, ReactNode, createElement } from "react";
import { trpc } from "../lib/trpc";

interface User { id: number; email: string; name: string; role: string; }
interface AuthContextType { user: User | null; isLoading: boolean; logout: () => void; }

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/login"; },
    onError: () => { window.location.href = "/login"; },  // redirect even if server errors
  });
  return createElement(AuthContext.Provider, {
    value: { user: user || null, isLoading, logout: () => logoutMutation.mutate() },
    children,
  });
}

export function useAuth() { return useContext(AuthContext); }
