"use client";

import { useState } from "react";

import { formatDomain } from "@/lib/mission-utils";

const DOMAINS = [
  "poverty_reduction", "education_access", "healthcare_improvement", "environmental_protection",
  "food_security", "mental_health_wellbeing", "community_building", "disaster_response",
  "digital_inclusion", "human_rights", "clean_water_sanitation", "sustainable_energy",
  "gender_equality", "biodiversity_conservation", "elder_care",
];

const DIFFICULTIES = ["beginner", "intermediate", "advanced", "expert"];

interface MissionFiltersProps {
  onFilterChange: (filters: Record<string, string | undefined>) => void;
}

export default function MissionFilters({ onFilterChange }: MissionFiltersProps) {
  const [domain, setDomain] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [minReward, setMinReward] = useState("");
  const [maxReward, setMaxReward] = useState("");
  const [maxDuration, setMaxDuration] = useState("");
  const [skills, setSkills] = useState("");
  const [nearMe, setNearMe] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const applyFilters = () => {
    onFilterChange({
      domain: domain || undefined,
      difficulty: difficulty || undefined,
      minReward: minReward || undefined,
      maxReward: maxReward || undefined,
      maxDuration: maxDuration || undefined,
      skills: skills || undefined,
      nearMe: nearMe ? "true" : undefined,
    });
  };

  const resetFilters = () => {
    setDomain(""); setDifficulty(""); setMinReward(""); setMaxReward(""); setMaxDuration(""); setSkills(""); setNearMe(false);
    onFilterChange({});
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between p-4 text-left font-medium text-gray-900 md:hidden">
        Filters {isOpen ? "\u25B2" : "\u25BC"}
      </button>
      <div className={`space-y-4 p-4 ${isOpen ? "block" : "hidden"} md:block`}>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Domain</label>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">All domains</option>
            {DOMAINS.map((d) => <option key={d} value={d}>{formatDomain(d)}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Difficulty</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Skills (comma-separated)</label>
          <input type="text" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="photography, data analysis" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Min Reward</label>
            <input type="number" value={minReward} onChange={(e) => setMinReward(e.target.value)} placeholder="0" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Max Reward</label>
            <input type="number" value={maxReward} onChange={(e) => setMaxReward(e.target.value)} placeholder="Any" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Max Duration (minutes)</label>
          <input type="number" value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} placeholder="Any" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={nearMe} onChange={(e) => setNearMe(e.target.checked)} className="rounded" />
          <span className="text-sm text-gray-700">Near Me</span>
        </label>
        <div className="flex gap-2">
          <button onClick={applyFilters} className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Apply</button>
          <button onClick={resetFilters} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Reset</button>
        </div>
      </div>
    </div>
  );
}
