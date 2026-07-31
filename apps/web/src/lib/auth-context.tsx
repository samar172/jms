"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch, setAccessToken, setUnauthorizedHandler, refreshAccessToken, ApiError } from "./api";
import type { Role } from "@jms/shared";

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  role: Role;
  karigarId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// FR-11.07: idle sessions are terminated after this period of inactivity.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = async () => {
    setAccessToken(null);
    setUser(null);
    try {
      await apiFetch("/api/auth/logout", { method: "POST", skipAuthRetry: true });
    } catch {
      // best-effort
    }
  };

  const login = async (email: string, password: string) => {
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setAccessToken(null);
    });
    (async () => {
      try {
        const token = await refreshAccessToken();
        if (token) {
          const me = await apiFetch<AuthUser>("/api/auth/me");
          setUser(me);
        }
      } catch (e) {
        if (!(e instanceof ApiError)) console.error("Auth init error:", e);
      } finally {
        setLoading(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!user) return;
    const resetTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        void logout();
      }, IDLE_TIMEOUT_MS);
    };
    const events = ["mousemove", "keydown", "click", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
