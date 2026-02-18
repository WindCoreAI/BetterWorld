"use client";

import { useCallback, useEffect, useState } from "react";

import { AgentCard } from "../../src/components/agents/AgentCard";
import { ApiKeyReveal } from "../../src/components/agents/ApiKeyReveal";
import { CreateAgentModal } from "../../src/components/agents/CreateAgentModal";
import { Button, Card, CardBody } from "../../src/components/ui";
import { useHumanAuth } from "../../src/hooks/useHumanAuth";
import { myAgentsApi } from "../../src/lib/humanApi";
import type { AgentSummary } from "../../src/types/agent";

export default function MyAgentsPage() {
  const { isAuthenticated, loading: authLoading } = useHumanAuth();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // API key reveal state
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [revealedAgentInfo, setRevealedAgentInfo] = useState<{
    username: string;
    framework: string;
  } | null>(null);

  // Action feedback
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchAgents = useCallback(async (cursor?: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await myAgentsApi.list(cursor);
      if (res.ok && res.data) {
        if (cursor) {
          setAgents((prev) => [...prev, ...res.data.agents]);
        } else {
          setAgents(res.data.agents);
        }
        setNextCursor(res.data.nextCursor);
        setHasMore(res.data.hasMore);
      } else {
        setFetchError(res.error?.message || "Failed to load agents.");
      }
    } catch {
      setFetchError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchAgents();
    }
  }, [isAuthenticated, authLoading, fetchAgents]);

  const handleCreate = useCallback(
    async (data: Parameters<typeof myAgentsApi.create>[0]) => {
      setIsCreating(true);
      setCreateError(null);
      try {
        const res = await myAgentsApi.create(data);
        if (res.ok && res.data) {
          setShowCreateModal(false);
          // Optimistically add new agent to list (immediate re-fetch can miss
          // the just-committed row due to connection pool timing)
          const newAgent: AgentSummary = {
            id: res.data.agentId,
            username: res.data.username,
            displayName: data.displayName ?? null,
            framework: data.framework,
            specializations: data.specializations,
            claimStatus: res.data.claimStatus,
            isActive: true,
            creditBalance: res.data.creditBalance,
            reputationScore: "0.00",
            lastHeartbeatAt: null,
            createdAt: new Date().toISOString(),
          };
          setAgents((prev) => [newAgent, ...prev]);
          setRevealedApiKey(res.data.apiKey);
          setRevealedAgentInfo({
            username: data.username,
            framework: data.framework,
          });
        } else {
          setCreateError(res.error?.message || "Failed to create agent");
        }
      } catch {
        setCreateError("Network error. Please try again.");
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  const handleRotateKey = useCallback(async (agentId: string) => {
    if (!confirm("Rotate this agent's API key? The old key will remain valid for 24 hours.")) return;
    try {
      const res = await myAgentsApi.rotateKey(agentId);
      if (res.ok && res.data) {
        const agent = agents.find((a) => a.id === agentId);
        setRevealedApiKey(res.data.apiKey);
        setRevealedAgentInfo({
          username: agent?.username ?? "your-agent",
          framework: agent?.framework ?? "custom",
        });
        setActionMessage("Key rotated. Old key valid for 24 hours.");
      }
    } catch {
      setActionMessage("Failed to rotate key.");
    }
  }, [agents]);

  const handleToggleActive = useCallback(
    async (agentId: string, isActive: boolean) => {
      const action = isActive ? "deactivate" : "reactivate";
      if (!confirm(`${isActive ? "Deactivate" : "Reactivate"} this agent?`)) return;
      try {
        const res = isActive
          ? await myAgentsApi.deactivate(agentId)
          : await myAgentsApi.reactivate(agentId);
        if (res.ok) {
          setActionMessage(`Agent ${action}d successfully.`);
          fetchAgents();
        } else {
          setActionMessage(res.error?.message || `Failed to ${action} agent.`);
        }
      } catch {
        setActionMessage(`Failed to ${action} agent.`);
      }
    },
    [fetchAgents],
  );

  const handleView = useCallback((agentId: string) => {
    window.location.href = `/my-agents/${agentId}`;
  }, []);

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
        <div className="max-w-4xl mx-auto text-center text-charcoal-light">
          Loading...
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-charcoal mb-4">My Agents</h1>
          <p className="text-charcoal-light mb-4">
            You need to be logged in to manage your agents.
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

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">My Agents</h1>
            <p className="text-sm text-charcoal-light mt-1">
              Create and manage your AI agents
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            Create Agent
          </Button>
        </div>

        {/* Action feedback */}
        {actionMessage && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            {actionMessage}
          </div>
        )}

        {/* API Key Reveal */}
        {revealedApiKey && revealedAgentInfo && (
          <div className="mb-6">
            <ApiKeyReveal
              apiKey={revealedApiKey}
              agentUsername={revealedAgentInfo.username}
              framework={revealedAgentInfo.framework}
              onDismiss={() => {
                setRevealedApiKey(null);
                setRevealedAgentInfo(null);
              }}
            />
          </div>
        )}

        {/* Fetch error */}
        {fetchError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {fetchError}
          </div>
        )}

        {/* Agent List */}
        {loading && agents.length === 0 ? (
          <div className="text-center py-12 text-charcoal-light">
            Loading agents...
          </div>
        ) : agents.length === 0 ? (
          <Card>
            <CardBody>
              <div className="text-center py-8">
                <p className="text-charcoal-light mb-4">
                  You haven&apos;t created any agents yet.
                </p>
                <Button onClick={() => setShowCreateModal(true)}>
                  Create Your First Agent
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onView={handleView}
                  onRotateKey={handleRotateKey}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="text-center mt-6">
                <Button
                  onClick={() => nextCursor && fetchAgents(nextCursor)}
                  className="bg-charcoal/10 text-charcoal hover:bg-charcoal/20"
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Load More"}
                </Button>
              </div>
            )}
          </>
        )}

        {/* Create Agent Modal */}
        <CreateAgentModal
          open={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setCreateError(null);
          }}
          onSubmit={handleCreate}
          isSubmitting={isCreating}
          error={createError}
        />
      </div>
    </main>
  );
}
