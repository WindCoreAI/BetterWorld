"use client";

/**
 * Circles Page (Sprint 18: Cooperative Depth & Governance — US9)
 *
 * Browse community circles by domain and create new circles
 * (25 ImpactTokens, max 3 circles per person, 50 members each).
 */
import { useEffect, useState } from "react";

import { domainLabels } from "@/constants/domains";
import { useCircles, useCircleMutations } from "@/hooks/useCircles";
import { getHumanToken } from "@/lib/api";

const CIRCLE_CREATION_COST = 25;

interface CircleSummary {
  id: string;
  name: string;
  description: string | null;
  domain: string | null;
  memberCount: number;
  createdAt: string;
}

function CreateCircleForm({ onClose }: { onClose: () => void }) {
  const { create } = useCircleMutations();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    create.mutate(
      { name, description: description || undefined, domain: domain || undefined },
      {
        onSuccess: (res) => {
          if (res.ok) {
            onClose();
          } else {
            const code = (res as { error?: { code?: string } | string }).error;
            const codeStr = typeof code === "string" ? code : code?.code;
            setError(
              codeStr === "INSUFFICIENT_BALANCE"
                ? `You need ${CIRCLE_CREATION_COST} ImpactTokens to create a circle.`
                : codeStr === "CIRCLE_LIMIT"
                  ? "You can be a member of at most 3 circles."
                  : "Could not create the circle. Please try again.",
            );
          }
        },
        onError: () => setError("Could not create the circle. Please try again."),
      },
    );
  };

  return (
    <div className="mb-6 rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold mb-3">Create a Circle ({CIRCLE_CREATION_COST} tokens)</h2>
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Circle name"
          maxLength={100}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this circle about? (optional)"
          maxLength={2000}
          rows={2}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">No specific domain</option>
          {Object.entries(domainLabels).map(([slug, label]) => (
            <option key={slug} value={slug}>{label}</option>
          ))}
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={name.trim().length === 0 || create.isPending}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {create.isPending ? "Creating..." : "Create Circle"}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CirclesPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const [domain, setDomain] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const circlesQuery = useCircles(domain || undefined);

  const isLoggedIn = isMounted && !!getHumanToken();
  const circles: CircleSummary[] = circlesQuery.data?.ok
    ? circlesQuery.data.data?.items ?? []
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-2xl font-bold">Circles</h1>
        {isLoggedIn && !showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            + New Circle
          </button>
        )}
      </div>
      <p className="text-gray-600 mb-6">
        Small groups (up to 50 members) working together on shared causes — with their own
        discussions, shared missions, and collective metrics.
      </p>

      {showCreate && <CreateCircleForm onClose={() => setShowCreate(false)} />}

      {isMounted && !isLoggedIn && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          <a href="/auth/human/login" className="font-medium underline">Sign in</a> to join or create circles.
        </div>
      )}

      <div className="mb-6">
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Domains</option>
          {Object.entries(domainLabels).map(([slug, label]) => (
            <option key={slug} value={slug}>{label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {circlesQuery.isLoading && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 col-span-full">
            Loading circles...
          </div>
        )}

        {!circlesQuery.isLoading && circles.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 col-span-full">
            No circles yet{domain ? " in this domain" : ""}. Be the first to create one!
          </div>
        )}

        {circles.map((circle) => (
          <a
            key={circle.id}
            href={`/circles/${circle.id}`}
            className="block rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-sm font-semibold">{circle.name}</h3>
              {circle.domain && (
                <span className="ml-2 shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                  {domainLabels[circle.domain] ?? circle.domain}
                </span>
              )}
            </div>
            {circle.description && (
              <p className="text-xs text-gray-600 line-clamp-2 mb-2">{circle.description}</p>
            )}
            <span className="text-xs text-gray-400">
              {circle.memberCount} member{circle.memberCount === 1 ? "" : "s"}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
