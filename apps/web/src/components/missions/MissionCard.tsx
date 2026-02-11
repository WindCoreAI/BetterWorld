"use client";

import Link from "next/link";

import { difficultyColors, formatDomain, formatDuration, timeRemaining } from "@/lib/mission-utils";

interface MissionCardProps {
  id: string;
  title: string;
  domain: string;
  requiredSkills: string[];
  tokenReward: number;
  bonusForQuality?: number;
  difficulty: string;
  requiredLocationName?: string | null;
  slotsAvailable: number;
  estimatedDurationMinutes: number;
  distance?: number;
  expiresAt: string;
  description: string;
}

export default function MissionCard({
  id, title, domain, requiredSkills, tokenReward, bonusForQuality,
  difficulty, requiredLocationName, slotsAvailable, estimatedDurationMinutes,
  distance, expiresAt, description,
}: MissionCardProps) {
  return (
    <Link href={`/missions/${id}`} className="block">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">{title}</h3>
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            {tokenReward} IT{bonusForQuality ? ` +${bonusForQuality}` : ""}
          </span>
        </div>

        <p className="mb-3 text-sm text-gray-600 line-clamp-2">{description}</p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
            {formatDomain(domain)}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColors[difficulty] ?? "bg-gray-100 text-gray-800"}`}>
            {difficulty}
          </span>
        </div>

        {requiredSkills.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {requiredSkills.slice(0, 3).map((skill) => (
              <span key={skill} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{skill}</span>
            ))}
            {requiredSkills.length > 3 && (
              <span className="text-xs text-gray-400">+{requiredSkills.length - 3}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            {requiredLocationName && <span>{requiredLocationName}</span>}
            {distance !== undefined && <span>{distance} km</span>}
            <span>{formatDuration(estimatedDurationMinutes)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>{slotsAvailable} slot{slotsAvailable !== 1 ? "s" : ""}</span>
            <span>{timeRemaining(expiresAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
