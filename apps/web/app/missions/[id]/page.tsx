"use client";

import type { MissionDetail as MissionDetailBase } from "@betterworld/shared";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import MissionClaimButton from "@/components/missions/MissionClaimButton";
import MissionStatusBadge from "@/components/missions/MissionStatusBadge";
import { difficultyColors, formatDomain, formatDuration, timeRemaining } from "@/lib/mission-utils";

// JSON-serialized variant of MissionDetail (Date fields become strings)
type MissionDetailJSON = Omit<MissionDetailBase, "expiresAt" | "createdAt" | "updatedAt" | "myClaim"> & {
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  myClaim: { id: string; status: string; claimedAt: string; deadlineAt: string; progressPercent: number } | null;
};

const Map = dynamic(() => import("@/components/ui/Map"), { ssr: false, loading: () => <div className="h-64 bg-gray-100" /> });

function ClaimSection({ mission }: { mission: MissionDetailJSON }) {
  if (mission.myClaim) {
    return (
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h2 className="mb-2 text-lg font-semibold text-blue-900">Your Claim</h2>
        <div className="grid grid-cols-3 gap-4">
          <div><p className="text-xs text-blue-600">Status</p><MissionStatusBadge status={mission.myClaim.status} /></div>
          <div><p className="text-xs text-blue-600">Progress</p><p className="font-medium">{mission.myClaim.progressPercent}%</p></div>
          <div><p className="text-xs text-blue-600">Deadline</p><p className="font-medium">{new Date(mission.myClaim.deadlineAt).toLocaleDateString()}</p></div>
        </div>
      </div>
    );
  }
  if (mission.status === "open") {
    return <MissionClaimButton missionId={mission.id} slotsAvailable={mission.slotsAvailable} />;
  }
  return null;
}

export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mission, setMission] = useState<MissionDetailJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMission = async () => {
      try {
        const res = await fetch(`/api/v1/missions/${id}`, { credentials: "include" });
        const data = await res.json();
        if (data.ok) {
          setMission(data.data);
        } else {
          setError(data.error?.message || "Mission not found");
        }
      } catch {
        setError("Failed to load mission");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchMission();
  }, [id]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-gray-400">Loading...</p></div>;
  if (error || !mission) return <div className="flex min-h-screen items-center justify-center"><p className="text-red-500">{error || "Mission not found"}</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <button onClick={() => router.back()} className="mb-4 text-sm text-blue-600 hover:underline">&larr; Back to marketplace</button>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <MissionStatusBadge status={mission.status} size="md" />
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColors[mission.difficulty] ?? "bg-gray-100"}`}>{mission.difficulty}</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{mission.title}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {formatDomain(mission.domain)} · Created by {mission.createdByAgent.name}
                {mission.solution && <> · From: <span className="text-blue-600">{mission.solution.title}</span></>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-600">{mission.tokenReward} IT</p>
              {mission.bonusForQuality > 0 && <p className="text-sm text-gray-500">+{mission.bonusForQuality} bonus</p>}
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Description</h2>
            <p className="whitespace-pre-wrap text-gray-700">{mission.description}</p>
          </div>

          {/* Details grid */}
          <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 sm:grid-cols-4">
            <div><p className="text-xs text-gray-500">Duration</p><p className="font-medium">{formatDuration(mission.estimatedDurationMinutes)}</p></div>
            <div><p className="text-xs text-gray-500">Slots</p><p className="font-medium">{mission.slotsAvailable} / {mission.maxClaims}</p></div>
            <div><p className="text-xs text-gray-500">Time Left</p><p className="font-medium">{timeRemaining(mission.expiresAt)}</p></div>
            <div><p className="text-xs text-gray-500">Location</p><p className="font-medium">{mission.requiredLocationName || "Remote"}</p></div>
          </div>

          {/* Instructions */}
          <div className="mb-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Instructions</h2>
            <ol className="space-y-2">
              {(mission.instructions as Array<{ step: number; text: string; optional: boolean }>).map((inst) => (
                <li key={inst.step} className={`flex gap-3 rounded p-2 ${inst.optional ? "bg-gray-50" : ""}`}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-800">{inst.step}</span>
                  <span className="text-gray-700">{inst.text} {inst.optional && <span className="text-xs text-gray-400">(optional)</span>}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Evidence Required */}
          <div className="mb-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Evidence Required</h2>
            <ul className="space-y-1">
              {(mission.evidenceRequired as Array<{ type: string; description: string; required: boolean }>).map((ev) => (
                <li key={`${ev.type}-${ev.description.slice(0, 30)}`} className="flex items-start gap-2 text-gray-700">
                  <span className="mt-0.5 text-xs">{ev.required ? "\u2713" : "\u25CB"}</span>
                  <span><strong className="capitalize">{ev.type}:</strong> {ev.description}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Skills */}
          {mission.requiredSkills.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">Required Skills</h2>
              <div className="flex flex-wrap gap-2">
                {mission.requiredSkills.map((skill) => (
                  <span key={skill} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{skill}</span>
                ))}
              </div>
            </div>
          )}

          {/* Map */}
          {mission.location.latitude !== null && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">
                Location {!mission.location.isExact && <span className="text-sm font-normal text-gray-500">(approximate -- claim for exact)</span>}
              </h2>
              <div className="h-64 overflow-hidden rounded-lg border border-gray-200">
                <Map
                  center={[mission.location.latitude, mission.location.longitude!]}
                  zoom={mission.location.isExact ? 15 : 12}
                  markers={[{ id: mission.id, lat: mission.location.latitude, lng: mission.location.longitude!, title: mission.title }]}
                />
              </div>
            </div>
          )}

          {/* Claim status or CTA */}
          <ClaimSection mission={mission} />
        </div>
      </div>
    </div>
  );
}
