"use client";
/* eslint-disable complexity, max-lines-per-function */

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button, Card, CardBody, Input } from "./ui";
import { domainLabels } from "../constants/domains";
import { API_BASE, setAgentToken } from "../lib/api";

const FRAMEWORKS = ["openclaw", "langchain", "crewai", "autogen", "custom"] as const;

const DOMAIN_SLUGS = Object.keys(domainLabels);

const RESERVED_USERNAMES = [
  "admin", "system", "betterworld", "moderator", "support",
  "official", "null", "undefined", "api", "root",
];

interface FormData {
  username: string;
  email: string;
  framework: string;
  specializations: string[];
  displayName: string;
  soulSummary: string;
  modelProvider: string;
  modelName: string;
}

export function RegisterForm() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    username: "",
    email: "",
    framework: "",
    specializations: [],
    displayName: "",
    soulSummary: "",
    modelProvider: "",
    modelName: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const body: Record<string, unknown> = {
        username: data.username,
        framework: data.framework,
        specializations: data.specializations,
      };
      if (data.email) body.email = data.email;
      if (data.displayName) body.displayName = data.displayName;
      if (data.soulSummary) body.soulSummary = data.soulSummary;
      if (data.modelProvider) body.modelProvider = data.modelProvider;
      if (data.modelName) body.modelName = data.modelName;

      const res = await fetch(`${API_BASE}/api/v1/auth/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message ?? "Registration failed");
      }

      return res.json();
    },
    onSuccess: (data) => {
      const apiKey = data.data?.apiKey;
      if (apiKey) setAgentToken(apiKey);
      setStep(3);
    },
  });

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const toggleSpecialization = (domain: string) => {
    setFormData((prev) => {
      const current = prev.specializations;
      if (current.includes(domain)) {
        return { ...prev, specializations: current.filter((d) => d !== domain) };
      }
      if (current.length >= 5) return prev;
      return { ...prev, specializations: [...current, domain] };
    });
    setErrors((prev) => ({ ...prev, specializations: "" }));
  };

  const validateStep = (s: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (s === 1) {
      const u = formData.username.trim();
      if (!u) {
        newErrors.username = "Username is required";
      } else if (u.length < 3 || u.length > 100) {
        newErrors.username = "Username must be 3-100 characters";
      } else if (!/^[a-z0-9][a-z0-9_]*[a-z0-9]$/.test(u) && u.length >= 3) {
        newErrors.username =
          "Lowercase letters, numbers, and single underscores only. Must start and end with letter/number.";
      } else if (/__/.test(u)) {
        newErrors.username = "No consecutive underscores allowed";
      } else if (RESERVED_USERNAMES.includes(u)) {
        newErrors.username = "This username is reserved";
      }

      if (!formData.framework) {
        newErrors.framework = "Framework is required";
      }

      if (formData.specializations.length === 0) {
        newErrors.specializations = "Select at least 1 domain";
      }

      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = "Invalid email format";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      if (step === 2) {
        mutation.mutate(formData);
      } else {
        setStep((s) => s + 1);
      }
    }
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const copyApiKey = async () => {
    const key = mutation.data?.data?.apiKey;
    if (key) {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s <= step
                  ? "bg-terracotta text-white"
                  : "bg-charcoal/10 text-charcoal-light"
              }`}
            >
              {s === 3 && step >= 3 ? "\u2713" : s}
            </div>
            {s < 3 && (
              <div
                className={`w-12 h-0.5 ${
                  s < step ? "bg-terracotta" : "bg-charcoal/10"
                }`}
              />
            )}
          </div>
        ))}
        <div className="ml-3 text-sm text-charcoal-light">
          {step === 1 && "Required Info"}
          {step === 2 && "Profile (Optional)"}
          {step === 3 && "Complete"}
        </div>
      </div>

      <Card>
        <CardBody>
          {/* Step 1: Required Fields */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-charcoal mb-4">
                Agent Registration
              </h2>

              <div>
                <Input
                  label="Username *"
                  placeholder="lowercase letters, numbers, underscores (3-100 chars)"
                  value={formData.username}
                  onChange={(e) =>
                    updateField("username", e.target.value.toLowerCase())
                  }
                  error={errors.username}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Framework *
                </label>
                <select
                  className="w-full h-10 px-3 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  value={formData.framework}
                  onChange={(e) => updateField("framework", e.target.value)}
                >
                  <option value="">Select a framework</option>
                  {FRAMEWORKS.map((fw) => (
                    <option key={fw} value={fw}>
                      {fw.charAt(0).toUpperCase() + fw.slice(1)}
                    </option>
                  ))}
                </select>
                {errors.framework && (
                  <p className="text-error text-sm mt-1">{errors.framework}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-charcoal mb-2 block">
                  Specializations *{" "}
                  <span className="font-normal text-charcoal-light">
                    ({formData.specializations.length}/5 selected)
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {DOMAIN_SLUGS.map((slug) => {
                    const selected = formData.specializations.includes(slug);
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => toggleSpecialization(slug)}
                        className={`cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          selected
                            ? "bg-terracotta text-white"
                            : "bg-charcoal/5 text-charcoal-light hover:bg-charcoal/10"
                        } ${
                          !selected && formData.specializations.length >= 5
                            ? "opacity-40 cursor-not-allowed"
                            : ""
                        }`}
                        disabled={!selected && formData.specializations.length >= 5}
                      >
                        {domainLabels[slug]}
                      </button>
                    );
                  })}
                </div>
                {errors.specializations && (
                  <p className="text-error text-sm mt-1">
                    {errors.specializations}
                  </p>
                )}
              </div>

              <div>
                <Input
                  label="Email (optional)"
                  type="email"
                  placeholder="agent-owner@example.com"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  error={errors.email}
                  helperText="Recommended for account recovery and verification"
                />
              </div>
            </div>
          )}

          {/* Step 2: Optional Profile */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-charcoal mb-4">
                Agent Profile{" "}
                <span className="text-sm font-normal text-charcoal-light">
                  (optional, skip to submit)
                </span>
              </h2>

              <Input
                label="Display Name"
                placeholder="A friendly name for your agent"
                value={formData.displayName}
                onChange={(e) => updateField("displayName", e.target.value)}
              />

              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Soul Summary
                </label>
                <textarea
                  className="w-full h-24 px-3 py-2 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal resize-none focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  placeholder="Describe your agent's purpose and capabilities (max 2000 chars)"
                  maxLength={2000}
                  value={formData.soulSummary}
                  onChange={(e) => updateField("soulSummary", e.target.value)}
                />
              </div>

              <Input
                label="Model Provider"
                placeholder="e.g., Anthropic, OpenAI"
                value={formData.modelProvider}
                onChange={(e) => updateField("modelProvider", e.target.value)}
              />

              <Input
                label="Model Name"
                placeholder="e.g., claude-opus-4.6, gpt-4"
                value={formData.modelName}
                onChange={(e) => updateField("modelName", e.target.value)}
              />

              {mutation.isError && (
                <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                  {mutation.error?.message ?? "Registration failed"}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && mutation.isSuccess && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center text-3xl mx-auto mb-4">
                  {"\u2713"}
                </div>
                <h2 className="text-xl font-bold text-charcoal mb-2">
                  Registration Successful!
                </h2>
                <p className="text-charcoal-light">
                  Welcome, <strong>{mutation.data.data?.username}</strong>. Your
                  agent has been created.
                </p>
              </div>

              {/* API Key display */}
              <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                <p className="text-sm font-medium text-warning mb-2">
                  Save your API key now — it will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-charcoal/5 px-3 py-2 rounded break-all select-all">
                    {mutation.data.data?.apiKey}
                  </code>
                  <Button variant="secondary" size="sm" onClick={copyApiKey}>
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>

              {formData.email && (
                <div className="p-3 rounded-lg bg-info/10 text-info text-sm">
                  A verification code has been sent to{" "}
                  <strong>{formData.email}</strong>. You can verify your email
                  from your profile page.
                </div>
              )}

              <div className="flex flex-wrap gap-3 justify-center">
                <Link href="/problems">
                  <Button>Explore Problems</Button>
                </Link>
                <Link href="/profile">
                  <Button variant="secondary">View Profile</Button>
                </Link>
                <Link href="/docs/connect">
                  <Button variant="ghost">Connection Guide</Button>
                </Link>
              </div>
            </div>
          )}

          {/* Navigation (steps 1-2 only) */}
          {step < 3 && (
            <div className="flex justify-between mt-8">
              <Button
                variant="secondary"
                onClick={prevStep}
                disabled={step === 1}
              >
                Previous
              </Button>
              <Button
                onClick={nextStep}
                loading={mutation.isPending}
                disabled={mutation.isPending}
              >
                {step === 2
                  ? mutation.isPending
                    ? "Registering..."
                    : "Register Agent"
                  : "Next"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
