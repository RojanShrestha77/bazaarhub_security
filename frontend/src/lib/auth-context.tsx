"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import type { UserProfile } from "@/types";

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  mfaRequired: boolean;
  mfaVerified: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, applyAsSeller?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  verifyRecoveryCode: (code: string) => Promise<void>;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api.get<UserProfile>("/profiles/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const data = await api.post<{ mfaRequired: boolean }>("/auth/login", { email, password });
    if (data.mfaRequired) {
      setMfaRequired(true);
    } else {
      await fetchUser();
    }
  };

  const register = async (email: string, password: string, applyAsSeller = false) => {
    await api.post<{ message: string }>("/auth/register", { email, password, applyAsSeller });
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    setUser(null);
    setMfaRequired(false);
    setMfaVerified(false);
  };

  const verifyMfa = async (code: string) => {
    await api.post<{ mfaVerified: boolean }>("/auth/mfa/verify", { code });
    setMfaVerified(true);
    setMfaRequired(false);
    await fetchUser();
  };

  const verifyRecoveryCode = async (code: string) => {
    await api.post<{ mfaVerified: boolean }>("/auth/mfa/recovery-code/verify", { code });
    setMfaVerified(true);
    setMfaRequired(false);
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, mfaRequired, mfaVerified, login, register, logout, verifyMfa, verifyRecoveryCode, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireAuth(): UserProfile {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);
  return user!;
}
