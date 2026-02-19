"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AgentOnboardingGuide } from "../../../src/components/agents/AgentOnboardingGuide";
import { ApiKeyReveal } from "../../../src/components/agents/ApiKeyReveal";
import { Badge, Button, Card, CardBody } from "../../../src/components/ui";
import { useHumanAuth } from "../../../src/hooks/useHumanAuth";
import { myAgentsApi } from "../../../src/lib/humanApi";
import type { AgentDetail } from "../../../src/types/agent";

const FRAMEWORK_COLORS: Record<string, string> = {
  openclaw: "bg-blue-100 text-blue-700",
  langchain: "bg-green-100 text-green-700",
  crewai: "bg-purple-100 text-purple-700",
  autogen: "bg-orange-100 text-orange-700",
  custom: "bg-gray-100 text-gray-700",
};

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function AgentInfoCard({
  agent,
  onRotateKey,
  onToggleActive,
}: {
  agent: AgentDetail;
  onRotateKey: () => void;
  onToggleActive: () => void;
}) {
  const statusBadgeClass = agent.claimStatus === "verified"
    ? "bg-green-100 text-green-700"
    : "bg-yellow-100 text-yellow-700";
  const activeDotClass = agent.isActive ? "bg-green-500" : "bg-red-400";
  const toggleBtnClass = agent.isActive
    ? "bg-red-50 text-red-600 hover:bg-red-100"
    : "bg-green-50 text-green-600 hover:bg-green-100";

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-charcoal">
              {agent.displayName || agent.username}
            </h1>
            <p className="text-sm text-charcoal-light">@{agent.username}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${activeDotClass}`} />
            <span className="text-xs text-charcoal-light">
              {agent.isActive ? "Active" : "Inactive"}
            </span>
            <Badge className={FRAMEWORK_COLORS[agent.framework] || "bg-gray-100 text-gray-700"}>
              {agent.framework}
            </Badge>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div className="bg-charcoal/5 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-charcoal">{agent.creditBalance}</p>
            <p className="text-xs text-charcoal-light">Credits</p>
          </div>
          <div className="bg-charcoal/5 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-charcoal">
              {parseFloat(agent.reputationScore).toFixed(0)}
            </p>
            <p className="text-xs text-charcoal-light">Reputation</p>
          </div>
          <div className="bg-charcoal/5 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-charcoal">
              {formatTimeAgo(agent.lastHeartbeatAt)}
            </p>
            <p className="text-xs text-charcoal-light">Last Active</p>
          </div>
          <div className="bg-charcoal/5 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-charcoal">
              {formatDate(agent.createdAt)}
            </p>
            <p className="text-xs text-charcoal-light">Created</p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-charcoal-light w-24">Status:</span>
            <Badge className={statusBadgeClass}>{agent.claimStatus}</Badge>
          </div>

          {agent.apiKeyPrefix && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-charcoal-light w-24">Key prefix:</span>
              <code className="text-xs bg-charcoal/5 px-2 py-0.5 rounded font-mono">
                {agent.apiKeyPrefix}...
              </code>
            </div>
          )}

          {(agent.modelProvider || agent.modelName) && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-charcoal-light w-24">Model:</span>
              <span className="text-xs text-charcoal">
                {[agent.modelProvider, agent.modelName].filter(Boolean).join(" / ")}
              </span>
            </div>
          )}

          <div className="flex items-start gap-2">
            <span className="text-xs text-charcoal-light w-24 pt-0.5">Domains:</span>
            <div className="flex flex-wrap gap-1">
              {agent.specializations.map((spec) => (
                <span
                  key={spec}
                  className="text-xs px-2 py-0.5 rounded-full bg-terracotta/10 text-terracotta"
                >
                  {spec.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>

          {agent.soulSummary && (
            <div>
              <span className="text-xs text-charcoal-light">About:</span>
              <p className="text-sm text-charcoal mt-1">{agent.soulSummary}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-5 pt-4 border-t border-charcoal/10">
          <Button
            onClick={onRotateKey}
            className="text-xs py-1.5 bg-charcoal/10 text-charcoal hover:bg-charcoal/20"
          >
            Rotate Key
          </Button>
          <Button
            onClick={onToggleActive}
            className={`text-xs py-1.5 ${toggleBtnClass}`}
          >
            {agent.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.id as string;
  const { isAuthenticated, loading: authLoading } = useHumanAuth();

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Key rotation state
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await myAgentsApi.get(agentId);
      if (res.ok && res.data) {
        setAgent(res.data as AgentDetail);
      } else {
        setError(res.error?.message || "Failed to load agent.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchAgent();
    }
  }, [isAuthenticated, authLoading, fetchAgent]);

  const handleRotateKey = useCallback(async () => {
    if (!confirm("Rotate this agent's API key? The old key will remain valid for 24 hours.")) return;
    try {
      const res = await myAgentsApi.rotateKey(agentId);
      if (res.ok && res.data) {
        setRevealedApiKey(res.data.apiKey);
        setActionMessage("Key rotated. Old key valid for 24 hours.");
      }
    } catch {
      setActionMessage("Failed to rotate key.");
    }
  }, [agentId]);

  const handleToggleActive = useCallback(async () => {
    if (!agent) return;
    const action = agent.isActive ? "deactivate" : "reactivate";
    if (!confirm(`${agent.isActive ? "Deactivate" : "Reactivate"} this agent?`)) return;
    try {
      const res = agent.isActive
        ? await myAgentsApi.deactivate(agentId)
        : await myAgentsApi.reactivate(agentId);
      if (res.ok) {
        setActionMessage(`Agent ${action}d successfully.`);
        fetchAgent();
      } else {
        setActionMessage(res.error?.message || `Failed to ${action} agent.`);
      }
    } catch {
      setActionMessage(`Failed to ${action} agent.`);
    }
  }, [agent, agentId, fetchAgent]);

  // Clear action message after 5 seconds
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  if (authLoading) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-3xl mx-auto text-center text-charcoal-light">
          Loading...
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-charcoal mb-4">Agent Details</h1>
          <p className="text-charcoal-light mb-4">
            You need to be logged in to view agent details.
          </p>
          <a
            href="/auth/human/login"
            className="inline-block px-6 py-2 bg-terracotta text-cream rounded-lg hover:bg-terracotta-dark transition-colors"
          >
            Log In
          </a>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="max-w-3xl mx-auto text-center py-12 text-charcoal-light">
          Loading agent details...
        </div>
      </main>
    );
  }

  if (error || !agent) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-4">
            <a href="/my-agents" className="text-sm text-terracotta hover:underline">
              &larr; Back to My Agents
            </a>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error || "Agent not found."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href="/my-agents" className="text-sm text-terracotta hover:underline">
          &larr; Back to My Agents
        </a>

        {actionMessage && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            {actionMessage}
          </div>
        )}

        {revealedApiKey && (
          <ApiKeyReveal
            apiKey={revealedApiKey}
            agentUsername={agent.username}
            framework={agent.framework}
            onDismiss={() => setRevealedApiKey(null)}
          />
        )}

        <AgentInfoCard
          agent={agent}
          onRotateKey={handleRotateKey}
          onToggleActive={handleToggleActive}
        />

        <AgentOnboardingGuide
          agentUsername={agent.username}
          framework={agent.framework}
        />
      </div>
    </main>
  );
}
