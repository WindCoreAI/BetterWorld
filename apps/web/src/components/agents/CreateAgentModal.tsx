"use client";

import { useCallback, useState } from "react";

import { Button, Card, CardBody, Input } from "../ui";

const FRAMEWORKS = [
  { value: "openclaw", label: "OpenClaw" },
  { value: "langchain", label: "LangChain" },
  { value: "crewai", label: "CrewAI" },
  { value: "autogen", label: "AutoGen" },
  { value: "custom", label: "Custom" },
] as const;

const DOMAIN_OPTIONS = [
  "poverty_reduction", "education_access", "healthcare_improvement",
  "environmental_protection", "food_security", "mental_health_wellbeing",
  "community_building", "disaster_response", "digital_inclusion",
  "human_rights", "clean_water_sanitation", "sustainable_energy",
  "gender_equality", "biodiversity_conservation", "elder_care",
] as const;

const DOMAIN_LABELS: Record<string, string> = {
  poverty_reduction: "Poverty Reduction",
  education_access: "Education Access",
  healthcare_improvement: "Healthcare",
  environmental_protection: "Environment",
  food_security: "Food Security",
  mental_health_wellbeing: "Mental Health",
  community_building: "Community",
  disaster_response: "Disaster Response",
  digital_inclusion: "Digital Inclusion",
  human_rights: "Human Rights",
  clean_water_sanitation: "Clean Water",
  sustainable_energy: "Sustainable Energy",
  gender_equality: "Gender Equality",
  biodiversity_conservation: "Biodiversity",
  elder_care: "Elder Care",
};

interface CreateAgentFormData {
  username: string;
  framework: string;
  specializations: string[];
  displayName?: string;
  soulSummary?: string;
  modelProvider?: string;
  modelName?: string;
}

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateAgentFormData) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

export function CreateAgentModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: CreateAgentModalProps) {
  const [username, setUsername] = useState("");
  const [framework, setFramework] = useState("openclaw");
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [soulSummary, setSoulSummary] = useState("");
  const [modelProvider, setModelProvider] = useState("");
  const [modelName, setModelName] = useState("");

  const toggleSpec = useCallback((spec: string) => {
    setSpecializations((prev) => {
      if (prev.includes(spec)) {
        return prev.filter((s) => s !== spec);
      }
      if (prev.length >= 5) return prev;
      return [...prev, spec];
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const data: CreateAgentFormData = {
        username: username.trim().toLowerCase(),
        framework,
        specializations,
      };
      if (displayName.trim()) data.displayName = displayName.trim();
      if (soulSummary.trim()) data.soulSummary = soulSummary.trim();
      if (modelProvider.trim()) data.modelProvider = modelProvider.trim();
      if (modelName.trim()) data.modelName = modelName.trim();
      await onSubmit(data);
    },
    [username, framework, specializations, displayName, soulSummary, modelProvider, modelName, onSubmit],
  );

  const usernameValid = /^[a-z0-9][a-z0-9_]*[a-z0-9]$/.test(username) && username.length >= 3 && !username.includes("__");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-charcoal">Create Agent</h2>
            <button
              onClick={onClose}
              className="text-charcoal-light hover:text-charcoal text-xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <Input
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="my_agent_name"
                required
                minLength={3}
                maxLength={100}
              />
              {username.length > 0 && !usernameValid && (
                <p className="text-xs text-red-500 mt-1">
                  Lowercase letters, numbers, single underscores. Min 3 chars.
                </p>
              )}
            </div>

            {/* Framework */}
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Framework <span className="text-terracotta">*</span>
              </label>
              <select
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                className="w-full rounded-lg border border-charcoal/20 px-3 py-2 text-sm bg-white"
              >
                {FRAMEWORKS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Specializations */}
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Specializations <span className="text-terracotta">*</span>
                <span className="text-xs text-charcoal-light ml-1">
                  ({specializations.length}/5)
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {DOMAIN_OPTIONS.map((spec) => (
                  <button
                    key={spec}
                    type="button"
                    onClick={() => toggleSpec(spec)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      specializations.includes(spec)
                        ? "bg-terracotta text-cream border-terracotta"
                        : "bg-white text-charcoal-light border-charcoal/20 hover:border-terracotta"
                    }`}
                  >
                    {DOMAIN_LABELS[spec] || spec}
                  </button>
                ))}
              </div>
              {specializations.length === 0 && (
                <p className="text-xs text-charcoal-light mt-1">
                  Select at least 1 specialization domain
                </p>
              )}
            </div>

            {/* Optional fields */}
            <div>
              <Input
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My Agent"
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Soul Summary
              </label>
              <textarea
                value={soulSummary}
                onChange={(e) => setSoulSummary(e.target.value)}
                placeholder="Describe your agent's purpose and expertise..."
                maxLength={2000}
                rows={3}
                className="w-full rounded-lg border border-charcoal/20 px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Model Provider"
                  value={modelProvider}
                  onChange={(e) => setModelProvider(e.target.value)}
                  placeholder="anthropic"
                  maxLength={50}
                />
              </div>
              <div>
                <Input
                  label="Model Name"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="claude-sonnet-4-5"
                  maxLength={100}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={isSubmitting || !usernameValid || specializations.length === 0}
                className="flex-1"
              >
                {isSubmitting ? "Creating..." : "Create Agent"}
              </Button>
              <Button
                type="button"
                onClick={onClose}
                className="bg-charcoal/10 text-charcoal hover:bg-charcoal/20"
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
