"use client";

import { useCallback, useEffect, useState } from "react";

import {
  clearHumanTokens,
  getHumanToken,
  setHumanTokens,
} from "../lib/api";
import { dashboardApi, humanAuthApi } from "../lib/humanApi";
import type { HumanUser } from "../types/human";

interface UseHumanAuthReturn {
  user: HumanUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginWithOAuthCode: (code: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export function useHumanAuth(): UseHumanAuthReturn {
  const [user, setUser] = useState<HumanUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = getHumanToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await dashboardApi.get();
      if (res.ok && res.data) {
        setUser(res.data.user);
      } else {
        clearHumanTokens();
        setUser(null);
      }
    } catch {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();

    const handleAuthChange = () => checkAuth();
    window.addEventListener("bw-human-auth-change", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);

    return () => {
      window.removeEventListener("bw-human-auth-change", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, [checkAuth]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      setLoading(true);
      const res = await humanAuthApi.login(email, password);
      if (res.ok && res.data) {
        setHumanTokens(res.data.accessToken, res.data.refreshToken);
        if (res.data.user) setUser(res.data.user);
        setLoading(false);
        return { ok: true };
      }
      setLoading(false);
      return { ok: false, error: res.error?.message ?? "Login failed" };
    },
    [],
  );

  const loginWithOAuthCode = useCallback(
    async (code: string): Promise<{ ok: boolean; error?: string }> => {
      setLoading(true);
      const res = await humanAuthApi.exchangeOAuthCode(code);
      if (res.ok && res.data) {
        setHumanTokens(res.data.accessToken, res.data.refreshToken);
        // Fetch user info since exchange doesn't return it
        await checkAuth();
        setLoading(false);
        return { ok: true };
      }
      setLoading(false);
      return { ok: false, error: res.error?.message ?? "OAuth login failed" };
    },
    [checkAuth],
  );

  const logout = useCallback(async () => {
    await humanAuthApi.logout();
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: user !== null,
    loading,
    login,
    loginWithOAuthCode,
    logout,
  };
}
