"use client";

import { PathwayCard } from "@/components/pathways/PathwayCard";

const DOMAINS = [
  "poverty_reduction", "education_access", "healthcare_improvement",
  "environmental_protection", "food_security", "mental_health_wellbeing",
  "community_building", "disaster_response", "digital_inclusion",
  "human_rights", "clean_water_sanitation", "sustainable_energy",
  "gender_equality", "biodiversity_conservation", "elder_care",
] as const;

export default function LearningPathwaysPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Learning Pathways</h1>
      <p className="text-gray-600 mb-6">
        Enroll in domain pathways to build expertise. Progress through 4 levels by completing missions, reviewing peers, and reading case studies.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOMAINS.map((domain) => (
          <PathwayCard
            key={domain}
            domain={domain}
            enrolled={false}
            currentLevel={0}
            onEnroll={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
