"use client";

import { useState } from "react";

import { Input } from "./ui";

const DOMAINS = [
  { value: "", label: "All Domains" },
  { value: "poverty_reduction", label: "Poverty Reduction" },
  { value: "education_access", label: "Education Access" },
  { value: "healthcare_improvement", label: "Healthcare" },
  { value: "environmental_protection", label: "Environment" },
  { value: "food_security", label: "Food Security" },
  { value: "mental_health_wellbeing", label: "Mental Health" },
  { value: "community_building", label: "Community" },
  { value: "disaster_response", label: "Disaster Response" },
  { value: "digital_inclusion", label: "Digital Inclusion" },
  { value: "human_rights", label: "Human Rights" },
  { value: "clean_water_sanitation", label: "Clean Water" },
  { value: "sustainable_energy", label: "Sustainable Energy" },
  { value: "gender_equality", label: "Gender Equality" },
  { value: "biodiversity_conservation", label: "Biodiversity" },
  { value: "elder_care", label: "Elder Care" },
];

const SEVERITIES = [
  { value: "", label: "All Severities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const SCOPES = [
  { value: "", label: "All Scopes" },
  { value: "local", label: "Local" },
  { value: "regional", label: "Regional" },
  { value: "national", label: "National" },
  { value: "global", label: "Global" },
];

interface ProblemFiltersProps {
  onFilterChange: (filters: {
    domain?: string;
    severity?: string;
    geographicScope?: string;
    search?: string;
  }) => void;
}

export function ProblemFilters({ onFilterChange }: ProblemFiltersProps) {
  const [domain, setDomain] = useState("");
  const [severity, setSeverity] = useState("");
  const [scope, setScope] = useState("");
  const [search, setSearch] = useState("");

  const handleChange = (
    field: string,
    value: string,
    setter: (v: string) => void,
  ) => {
    setter(value);
    const filters = {
      domain: field === "domain" ? value : domain,
      severity: field === "severity" ? value : severity,
      geographicScope: field === "scope" ? value : scope,
      search: field === "search" ? value : search,
    };
    onFilterChange(
      Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== ""),
      ),
    );
  };

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <select
        className="h-10 px-3 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/30"
        value={domain}
        onChange={(e) => handleChange("domain", e.target.value, setDomain)}
      >
        {DOMAINS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      <select
        className="h-10 px-3 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/30"
        value={severity}
        onChange={(e) =>
          handleChange("severity", e.target.value, setSeverity)
        }
      >
        {SEVERITIES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        className="h-10 px-3 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/30"
        value={scope}
        onChange={(e) => handleChange("scope", e.target.value, setScope)}
      >
        {SCOPES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <div className="flex-1 min-w-[200px]">
        <Input
          label="Search"
          placeholder="Search problems..."
          value={search}
          onChange={(e) => handleChange("search", e.target.value, setSearch)}
        />
      </div>
    </div>
  );
}
