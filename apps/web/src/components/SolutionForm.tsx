"use client";
/* eslint-disable complexity, max-lines-per-function */

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Card, CardBody, Input } from "./ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface SolutionFormProps {
  problemId?: string;
  onSuccess?: (solutionId: string) => void;
}

interface FormData {
  problemId: string;
  title: string;
  description: string;
  approach: string;
  estimatedCost: string;
  expectedImpact: string;
}

export function SolutionForm({ problemId, onSuccess }: SolutionFormProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    problemId: problemId ?? "",
    title: "",
    description: "",
    approach: "",
    estimatedCost: "",
    expectedImpact: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch(`${API_BASE}/api/v1/solutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: data.problemId,
          title: data.title,
          description: data.description,
          approach: data.approach,
          estimatedCost: data.estimatedCost
            ? { estimate: data.estimatedCost }
            : undefined,
          expectedImpact: data.expectedImpact
            ? { description: data.expectedImpact }
            : { description: "To be determined" },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message ?? "Failed to submit solution");
      }

      return res.json();
    },
    onSuccess: (data) => {
      onSuccess?.(data.data?.id);
    },
  });

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validateStep = (s: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (s === 1 && !formData.problemId) {
      newErrors.problemId = "Problem ID is required";
    }
    if (s === 2) {
      if (!formData.title || formData.title.length < 10)
        newErrors.title = "Title must be at least 10 characters";
      if (!formData.description || formData.description.length < 50)
        newErrors.description = "Description must be at least 50 characters";
      if (!formData.approach || formData.approach.length < 50)
        newErrors.approach = "Approach must be at least 50 characters";
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
    if (validateStep(step)) {
      mutation.mutate(formData);
    }
  };

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
              {s}
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
          {/* Step 1: Problem Selection */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-charcoal mb-4">
                Select Problem
              </h2>
              <Input
                label="Problem ID"
                placeholder="Problem ID (UUID)"
                value={formData.problemId}
                onChange={(e) => updateField("problemId", e.target.value)}
              />
              {errors.problemId && (
                <p className="text-error text-sm mt-1">{errors.problemId}</p>
              )}
              {problemId && (
                <p className="text-sm text-charcoal-light mt-2">
                  Pre-filled from problem page
                </p>
              )}
            </div>
          )}

          {/* Step 2: Description */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-charcoal mb-4">
                Describe Your Solution
              </h2>
              <div>
                <Input
                  label="Title"
                  placeholder="Solution title (min 10 characters)"
                  value={formData.title}
                  onChange={(e) => updateField("title", e.target.value)}
                />
                {errors.title && (
                  <p className="text-error text-sm mt-1">{errors.title}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Description
                </label>
                <textarea
                  className="w-full h-24 px-3 py-2 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal resize-none focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  placeholder="Describe your solution (min 50 characters)"
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                />
                {errors.description && (
                  <p className="text-error text-sm mt-1">
                    {errors.description}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Approach
                </label>
                <textarea
                  className="w-full h-32 px-3 py-2 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal resize-none focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  placeholder="How will you implement this solution? (min 50 characters)"
                  value={formData.approach}
                  onChange={(e) => updateField("approach", e.target.value)}
                />
                {errors.approach && (
                  <p className="text-error text-sm mt-1">{errors.approach}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Cost & Impact */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-charcoal mb-4">
                Cost & Impact
              </h2>
              <div>
                <Input
                  label="Estimated Cost (optional)"
                  placeholder="e.g., $5,000 - $10,000"
                  value={formData.estimatedCost}
                  onChange={(e) =>
                    updateField("estimatedCost", e.target.value)
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium text-charcoal mb-1 block">
                  Expected Impact
                </label>
                <textarea
                  className="w-full h-24 px-3 py-2 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal resize-none focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                  placeholder="Describe the expected impact of your solution"
                  value={formData.expectedImpact}
                  onChange={(e) =>
                    updateField("expectedImpact", e.target.value)
                  }
                />
              </div>
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-charcoal mb-4">
                Review & Submit
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-medium text-charcoal">Problem:</span>{" "}
                  <span className="text-charcoal-light">
                    {formData.problemId}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-charcoal">Title:</span>{" "}
                  <span className="text-charcoal-light">{formData.title}</span>
                </div>
                <div>
                  <span className="font-medium text-charcoal">
                    Description:
                  </span>
                  <p className="text-charcoal-light mt-1">
                    {formData.description}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-charcoal">Approach:</span>
                  <p className="text-charcoal-light mt-1">
                    {formData.approach}
                  </p>
                </div>
                {formData.estimatedCost && (
                  <div>
                    <span className="font-medium text-charcoal">
                      Estimated Cost:
                    </span>{" "}
                    <span className="text-charcoal-light">
                      {formData.estimatedCost}
                    </span>
                  </div>
                )}
              </div>

              {mutation.isError && (
                <div className="mt-4 p-3 rounded-lg bg-error/10 text-error text-sm">
                  {mutation.error?.message ?? "Submission failed"}
                </div>
              )}

              {mutation.isSuccess && (
                <div className="mt-4 p-3 rounded-lg bg-success/10 text-success text-sm">
                  Solution submitted successfully! It will be reviewed by the
                  guardrail system.
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <Button
              variant="secondary"
              onClick={prevStep}
              disabled={step === 1}
            >
              Previous
            </Button>
            {step < 4 ? (
              <Button onClick={nextStep}>Next</Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={mutation.isPending || mutation.isSuccess}
              >
                {mutation.isPending ? "Submitting..." : "Submit Solution"}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
