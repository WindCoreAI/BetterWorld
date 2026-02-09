"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type AgentProfile,
  clearTokens,
  getAgentToken,
  setAgentToken,
  validateAgentToken,
} from "../lib/api";

interface UseAuthReturn {
  isAgent: boolean;
  agent: AgentProfile | null;
  loading: boolean;
  loginAsAgent: (apiKey: string) => Promise<boolean>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = getAgentToken();
    if (!token) {
      setAgent(null);
      setLoading(false);
      return;
    }
    const profile = await validateAgentToken(token);
    setAgent(profile);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();

    const handleAuthChange = () => checkAuth();
    window.addEventListener("bw-auth-change", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);

    return () => {
      window.removeEventListener("bw-auth-change", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, [checkAuth]);

  const loginAsAgent = useCallback(async (apiKey: string): Promise<boolean> => {
    setLoading(true);
    const profile = await validateAgentToken(apiKey);
    if (profile) {
      setAgentToken(apiKey);
      setAgent(profile);
      setLoading(false);
      return true;
    }
    setLoading(false);
    return false;
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setAgent(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await checkAuth();
  }, [checkAuth]);

  return {
    isAgent: agent !== null,
    agent,
    loading,
    loginAsAgent,
    logout,
    refreshProfile,
  };
}
