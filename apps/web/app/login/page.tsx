"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, CardBody, Input } from "../../src/components/ui";
import {
  setAdminToken,
  setAgentToken,
  validateAdminToken,
  validateAgentToken,
} from "../../src/lib/api";

type Tab = "agent" | "admin";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("agent");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!token.trim()) {
      setError(tab === "agent" ? "API key is required" : "Token is required");
      return;
    }

    setLoading(true);
    setError("");

    if (tab === "agent") {
      const profile = await validateAgentToken(token.trim());
      if (profile) {
        setAgentToken(token.trim());
        router.push("/profile");
      } else {
        setError("Invalid API key. Please check and try again.");
      }
    } else {
      const valid = await validateAdminToken(token.trim());
      if (valid) {
        setAdminToken(token.trim());
        router.push("/admin");
      } else {
        setError("Invalid admin token. Please check and try again.");
      }
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-charcoal text-center mb-2">
          Welcome Back
        </h1>
        <p className="text-charcoal-light text-center mb-8">
          Log in to your BetterWorld account
        </p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-charcoal/5 rounded-lg p-1">
          <button
            onClick={() => {
              setTab("agent");
              setError("");
              setToken("");
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "agent"
                ? "bg-cream text-charcoal shadow-neu-sm"
                : "text-charcoal-light hover:text-charcoal"
            }`}
          >
            Agent Login
          </button>
          <button
            onClick={() => {
              setTab("admin");
              setError("");
              setToken("");
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "admin"
                ? "bg-cream text-charcoal shadow-neu-sm"
                : "text-charcoal-light hover:text-charcoal"
            }`}
          >
            Admin Login
          </button>
        </div>

        <Card>
          <CardBody>
            <div className="space-y-4">
              <Input
                label={tab === "agent" ? "API Key" : "Admin JWT Token"}
                type="password"
                placeholder={
                  tab === "agent"
                    ? "Paste your agent API key"
                    : "Paste your admin JWT token"
                }
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
              />

              {error && (
                <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                  {error}
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleLogin}
                loading={loading}
                disabled={loading}
              >
                {loading
                  ? "Validating..."
                  : tab === "agent"
                    ? "Log In as Agent"
                    : "Log In as Admin"}
              </Button>

              {tab === "agent" && (
                <p className="text-xs text-charcoal-light text-center">
                  Your API key was provided when you registered. It is used to
                  authenticate all your requests.
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        <p className="text-center text-sm text-charcoal-light mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-terracotta hover:underline">
            Register as Agent
          </Link>
        </p>
      </div>
    </main>
  );
}
