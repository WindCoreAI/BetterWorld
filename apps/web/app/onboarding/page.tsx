"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Step1Constitution,
  Step2Domains,
  Step3Missions,
  Step4Evidence,
  Step5Tokens,
} from "../../src/components/onboarding/OrientationSteps";
import { Card, CardBody } from "../../src/components/ui";
import { useHumanAuth } from "../../src/hooks/useHumanAuth";
import { profileApi, tokensApi } from "../../src/lib/humanApi";

const STEP_LABELS = ["Constitution", "Domains", "Missions", "Evidence", "Tokens"];
const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useHumanAuth();

  const [step, setStep] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);

  // Check if orientation already completed
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/auth/human/login");
      return;
    }

    async function checkStatus() {
      const res = await profileApi.get();
      if (res.ok && res.data?.orientationCompletedAt) {
        router.push("/dashboard");
        return;
      }
      setCheckingProfile(false);
    }
    checkStatus();
  }, [authLoading, isAuthenticated, router]);

  const handleClaim = async () => {
    setClaiming(true);
    const res = await tokensApi.claimOrientationReward();
    setClaiming(false);

    if (res.ok) {
      setClaimed(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    }
    // If already claimed, also redirect
    if (res.error?.code === "REWARD_ALREADY_CLAIMED") {
      setClaimed(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    }
  };

  if (authLoading || checkingProfile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-charcoal-light">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-2xl mx-auto">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    i <= step
                      ? "bg-terracotta text-cream"
                      : "bg-charcoal/10 text-charcoal-light"
                  }`}
                >
                  {i < step ? "\u2713" : i + 1}
                </div>
                <span
                  className={`text-xs mt-1 hidden sm:block ${
                    i <= step ? "text-terracotta font-medium" : "text-charcoal-light"
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-charcoal/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-terracotta rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        <Card>
          <CardBody>
            {step === 0 && (
              <Step1Constitution onNext={() => setStep(1)} />
            )}
            {step === 1 && (
              <Step2Domains
                onNext={() => setStep(2)}
                onBack={() => setStep(0)}
              />
            )}
            {step === 2 && (
              <Step3Missions
                onNext={() => setStep(3)}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && (
              <Step4Evidence
                onNext={() => setStep(4)}
                onBack={() => setStep(2)}
              />
            )}
            {step === 4 && (
              <Step5Tokens
                onBack={() => setStep(3)}
                onClaim={handleClaim}
                claiming={claiming}
                claimed={claimed}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
