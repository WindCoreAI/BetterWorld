"use client";

/**
 * People Discovery Page (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Browse people by domain and city, with follow/connect actions.
 */
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { PersonCard } from "@/components/discover/PersonCard";
import { domainLabels } from "@/constants/domains";
import { useDiscoverPeople } from "@/hooks/useDiscover";
import { getHumanToken } from "@/lib/api";
import { connectionsApi, followsApi } from "@/lib/humanApi";

const CITIES = ["San Francisco", "New York", "Seattle"] as const;

interface Person {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  city: string | null;
  primaryDomain: string | null;
  tier: string | null;
  totalMissionsCompleted: number | null;
}

function DiscoverFilters({
  domain,
  city,
  onDomainChange,
  onCityChange,
}: {
  domain: string;
  city: string;
  onDomainChange: (value: string) => void;
  onCityChange: (value: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <select
        value={domain}
        onChange={(e) => onDomainChange(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">All Domains</option>
        {Object.entries(domainLabels).map(([slug, label]) => (
          <option key={slug} value={slug}>{label}</option>
        ))}
      </select>
      <select
        value={city}
        onChange={(e) => onCityChange(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">All Cities</option>
        {CITIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

export default function DiscoverPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const [domain, setDomain] = useState("");
  const [city, setCity] = useState("");
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const peopleQuery = useDiscoverPeople({
    domain: domain || undefined,
    city: city || undefined,
  });

  const followMutation = useMutation({
    mutationFn: (humanId: string) => followsApi.follow(humanId),
    onSuccess: (res, humanId) => {
      if (res.ok) {
        setActionError(null);
        setFollowedIds((prev) => new Set(prev).add(humanId));
      } else {
        setActionError("Could not follow. Please try again.");
      }
    },
    onError: () => setActionError("Could not follow. Please try again."),
  });

  const connectMutation = useMutation({
    mutationFn: (humanId: string) => connectionsApi.sendRequest(humanId),
    onSuccess: (res, humanId) => {
      if (res.ok) {
        setActionError(null);
        setConnectedIds((prev) => new Set(prev).add(humanId));
      } else {
        setActionError("Could not send connection request. Please try again.");
      }
    },
    onError: () => setActionError("Could not send connection request. Please try again."),
  });

  const isLoggedIn = isMounted && !!getHumanToken();
  const people: Person[] = peopleQuery.data?.ok ? peopleQuery.data.data?.people ?? [] : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Discover People</h1>
      <p className="text-gray-600 mb-6">
        Find and connect with people who share your interests and goals.
      </p>

      <DiscoverFilters
        domain={domain}
        city={city}
        onDomainChange={setDomain}
        onCityChange={setCity}
      />

      {isMounted && !isLoggedIn && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          <a href="/auth/human/login" className="font-medium underline">Sign in</a> to discover and connect with people.
        </div>
      )}

      {actionError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoggedIn && peopleQuery.isLoading && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 col-span-full">
            Loading people...
          </div>
        )}

        {isLoggedIn && !peopleQuery.isLoading && people.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 col-span-full">
            No people found for these filters. Try broadening your search.
          </div>
        )}

        {people.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            onFollow={
              followedIds.has(person.id)
                ? undefined
                : () => followMutation.mutate(person.id)
            }
            onConnect={
              connectedIds.has(person.id)
                ? undefined
                : () => connectMutation.mutate(person.id)
            }
          />
        ))}
      </div>
    </div>
  );
}
