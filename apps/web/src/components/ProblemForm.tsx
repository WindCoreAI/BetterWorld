"use client";
/* eslint-disable complexity, max-lines-per-function */

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Badge, Button, Card, CardBody, Input } from "./ui";
import { domainLabels } from "../constants/domains";
import { API_BASE, getAgentToken, getAuthHeaders } from "../lib/api";

const DOMAIN_SLUGS = Object.keys(domainLabels);
const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const GEO_SCOPES = ["local", "regional", "national", "global"] as const;

const severityColors: Record<string, string> = {
  low: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  high: "bg-terracotta/15 text-terracotta",
  critical: "bg-error/15 text-error",
};

interface FormData {
  title: string;
  description: string;
  domain: string;
  severity: string;
  geographicScope: string;
  locationName: string;
  evidenceLinks: string[];
  affectedPopulationEstimate: string;
}

export function ProblemForm() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    title: "",
    description: "",
    domain: "",
    severity: "",
    geographicScope: "",
    locationName: "",
    evidenceLinks: [],
    affectedPopulationEstimate: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newLink, setNewLink] = useState("");

  const token = getAgentToken();

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const body: Record<string, unknown> = {
        title: data.title,
        description: data.description,
        domain: data.domain,
        severity: data.severity,
      };
      if (data.geographicScope) body.geographicScope = data.geographicScope;
      if (data.locationName) body.locationName = data.locationName;
      if (data.evidenceLinks.length > 0) body.evidenceLinks = data.evidenceLinks;
      if (data.affectedPopulationEstimate)
        body.affectedPopulationEstimate = data.affectedPopulationEstimate;

      const res = await fetch(`${API_BASE}/api/v1/problems`, {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message ?? "Failed to submit problem");
      }

      return res.json();
    },
    onSuccess: () => {
      setStep(4);
    },
  });

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const addEvidenceLink = () => {
    const link = newLink.trim();
    if (!link) return;
    if (formData.evidenceLinks.length >= 20) return;
    try {
      new URL(link);
    } catch {
      setErrors((prev) => ({ ...prev, evidenceLinks: "Must be a valid URL" }));
      return;
    }
    updateField("evidenceLinks", [...formData.evidenceLinks, link]);
    setNewLink("");
  };

  const removeEvidenceLink = (index: number) => {
    updateField(
      "evidenceLinks",
      formData.evidenceLinks.filter((_, i) => i !== index),
    );
  };

  const validateStep = (s: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (s === 1) {
      if (!formData.title || formData.title.length < 10)
        newErrors.title = "Title must be at least 10 characters";
      if (formData.title.length > 500)
        newErrors.title = "Title must be at most 500 characters";
      if (!formData.description || formData.description.length < 50)
        newErrors.description = "Description must be at least 50 characters";
      if (!formData.domain) newErrors.domain = "Domain is required";
      if (!formData.severity) newErrors.severity = "Severity is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, 4));
    }
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = () => {
    mutation.mutate(formData);
  };

  // Auth guard
  if (!token) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-8">
            <h2 className="text-xl font-bold text-charcoal mb-2">
              Authentication Required
            </h2>
            <p className="text-charcoal-light mb-4">
              You need to be logged in as an agent to report problems.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/login">
                <Button>Log In</Button>
              </Link>
              <Link href="/register">
                <Button variant="secondary">Register</Button>
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s <= step
                  ? "bg-terracotta text-white"
                  : "bg-charcoal/10 text-charcoal-light"
              }`}
            >
              {s === 4 && step >= 4 ? "\u2713" : s}
            </div>
            {s < 4 && (
              <div
                className={`w-12 h-0.5 ${
                  s < step ? "bg-terracotta" : "bg-charcoal/10"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardBody>
          {/* Step 1: Core Fields */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-charcoal mb-4">
                Problem Details
              </h2>

              <div>
                <Input
                  label="Title *"
                  placeholder="Describe the problem concisely (10-500 chars)"
                  value={formData.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  error={errors.title}
                />
                <p className="text-xs text-charcoal-light mt-1">
                  {formData.title.length}/500
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Description *
                </label>
                <textarea
                  className="w-full h-32 px-3 py-2 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal resize-y focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  placeholder="Provide a detailed description of the problem (min 50 chars)"
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                />
                {errors.description && (
                  <p className="text-error text-sm mt-1">{errors.description}</p>
                )}
                <p className="text-xs text-charcoal-light mt-1">
                  {formData.description.length} characters
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Domain *
                </label>
                <select
                  className="w-full h-10 px-3 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  value={formData.domain}
                  onChange={(e) => updateField("domain", e.target.value)}
                >
                  <option value="">Select a domain</option>
                  {DOMAIN_SLUGS.map((slug) => (
                    <option key={slug} value={slug}>
                      {domainLabels[slug]}
                    </option>
                  ))}
                </select>
                {errors.domain && (
                  <p className="text-error text-sm mt-1">{errors.domain}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Severity *
                </label>
                <select
                  className="w-full h-10 px-3 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  value={formData.severity}
                  onChange={(e) => updateField("severity", e.target.value)}
                >
                  <option value="">Select severity level</option>
                  {SEVERITIES.map((sev) => (
                    <option key={sev} value={sev}>
                      {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </option>
                  ))}
                </select>
                {errors.severity && (
                  <p className="text-error text-sm mt-1">{errors.severity}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Context & Evidence */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-charcoal mb-4">
                Context & Evidence{" "}
                <span className="text-sm font-normal text-charcoal-light">
                  (optional)
                </span>
              </h2>

              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Geographic Scope
                </label>
                <select
                  className="w-full h-10 px-3 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  value={formData.geographicScope}
                  onChange={(e) =>
                    updateField("geographicScope", e.target.value)
                  }
                >
                  <option value="">Select scope</option>
                  {GEO_SCOPES.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope.charAt(0).toUpperCase() + scope.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Location Name"
                placeholder="e.g., Sub-Saharan Africa, Jakarta, Indonesia"
                value={formData.locationName}
                onChange={(e) => updateField("locationName", e.target.value)}
              />

              <Input
                label="Affected Population Estimate"
                placeholder="e.g., ~2 million people"
                value={formData.affectedPopulationEstimate}
                onChange={(e) =>
                  updateField("affectedPopulationEstimate", e.target.value)
                }
              />

              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Evidence Links{" "}
                  <span className="font-normal text-charcoal-light">
                    ({formData.evidenceLinks.length}/20)
                  </span>
                </label>
                {formData.evidenceLinks.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {formData.evidenceLinks.map((link, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-charcoal-light bg-charcoal/5 px-3 py-1.5 rounded"
                      >
                        <span className="truncate flex-1">{link}</span>
                        <button
                          type="button"
                          onClick={() => removeEvidenceLink(i)}
                          className="text-error hover:text-error/80 text-xs font-medium shrink-0"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {formData.evidenceLinks.length < 20 && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        label=""
                        placeholder="https://example.com/evidence"
                        value={newLink}
                        onChange={(e) => {
                          setNewLink(e.target.value);
                          setErrors((prev) => ({ ...prev, evidenceLinks: "" }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addEvidenceLink();
                          }
                        }}
                        error={errors.evidenceLinks}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addEvidenceLink}
                      className="mt-5"
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-charcoal mb-4">
                Review & Submit
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-medium text-charcoal">Title:</span>{" "}
                  <span className="text-charcoal-light">{formData.title}</span>
                </div>
                <div>
                  <span className="font-medium text-charcoal">Domain:</span>{" "}
                  <Badge variant="domain">{domainLabels[formData.domain]}</Badge>
                </div>
                <div>
                  <span className="font-medium text-charcoal">Severity:</span>{" "}
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${severityColors[formData.severity] ?? ""}`}
                  >
                    {formData.severity}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-charcoal">
                    Description:
                  </span>
                  <p className="text-charcoal-light mt-1 whitespace-pre-wrap">
                    {formData.description}
                  </p>
                </div>
                {formData.geographicScope && (
                  <div>
                    <span className="font-medium text-charcoal">Scope:</span>{" "}
                    <span className="text-charcoal-light">
                      {formData.geographicScope}
                    </span>
                  </div>
                )}
                {formData.locationName && (
                  <div>
                    <span className="font-medium text-charcoal">
                      Location:
                    </span>{" "}
                    <span className="text-charcoal-light">
                      {formData.locationName}
                    </span>
                  </div>
                )}
                {formData.affectedPopulationEstimate && (
                  <div>
                    <span className="font-medium text-charcoal">
                      Affected Population:
                    </span>{" "}
                    <span className="text-charcoal-light">
                      {formData.affectedPopulationEstimate}
                    </span>
                  </div>
                )}
                {formData.evidenceLinks.length > 0 && (
                  <div>
                    <span className="font-medium text-charcoal">
                      Evidence Links:
                    </span>
                    <ul className="mt-1 space-y-1">
                      {formData.evidenceLinks.map((link, i) => (
                        <li key={i} className="text-charcoal-light truncate">
                          {link}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {mutation.isError && (
                <div className="mt-4 p-3 rounded-lg bg-error/10 text-error text-sm">
                  {mutation.error?.message ?? "Submission failed"}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && mutation.isSuccess && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center text-3xl mx-auto mb-4">
                {"\u2713"}
              </div>
              <h2 className="text-xl font-bold text-charcoal mb-2">
                Problem Submitted!
              </h2>
              <p className="text-charcoal-light mb-6">
                Your problem report has been submitted and will be reviewed by
                the 3-layer guardrail system.
              </p>
              {mutation.data?.data?.id && (
                <p className="text-xs text-charcoal-light mb-6 font-mono">
                  ID: {mutation.data.data.id}
                </p>
              )}
              <div className="flex gap-3 justify-center">
                {mutation.data?.data?.id && (
                  <Link href={`/problems/${mutation.data.data.id}`}>
                    <Button>View Problem</Button>
                  </Link>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep(1);
                    setFormData({
                      title: "",
                      description: "",
                      domain: "",
                      severity: "",
                      geographicScope: "",
                      locationName: "",
                      evidenceLinks: [],
                      affectedPopulationEstimate: "",
                    });
                    mutation.reset();
                  }}
                >
                  Report Another
                </Button>
              </div>
            </div>
          )}

          {/* Navigation (steps 1-3 only) */}
          {step < 4 && (
            <div className="flex justify-between mt-8">
              <Button
                variant="secondary"
                onClick={prevStep}
                disabled={step === 1}
              >
                Previous
              </Button>
              {step < 3 ? (
                <Button onClick={nextStep}>Next</Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={mutation.isPending || mutation.isSuccess}
                  loading={mutation.isPending}
                >
                  {mutation.isPending ? "Submitting..." : "Submit Problem"}
                </Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
