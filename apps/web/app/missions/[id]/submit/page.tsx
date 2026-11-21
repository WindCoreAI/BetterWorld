"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

import { EvidenceChecklist } from "../../../../src/components/evidence/EvidenceChecklist";
import { EvidencePreview } from "../../../../src/components/evidence/EvidencePreview";
import { EvidenceSubmitForm } from "../../../../src/components/evidence/EvidenceSubmitForm";
import { GPSIndicator } from "../../../../src/components/evidence/GPSIndicator";
import { getHumanToken } from "../../../../src/lib/api";
import { missionsApi } from "../../../../src/lib/humanApi";
import { useOnboardingGuard } from "../../../../src/lib/onboardingGuard";
import { rememberReturnTo } from "../../../../src/lib/returnTo";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function SubmitEvidencePage() {
  const params = useParams();
  const router = useRouter();
  const { shouldRedirect: needsOnboarding, redirectTo, isChecking: onboardingChecking } = useOnboardingGuard();
  const missionId = params.id as string;

  const [gpsStatus, setGpsStatus] = useState<"detecting" | "detected" | "denied" | "unavailable">("detecting");
  const [latitude, setLatitude] = useState<number>();
  const [longitude, setLongitude] = useState<number>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(!!getHumanToken());
  }, []);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude);
          setLongitude(pos.coords.longitude);
          setGpsStatus("detected");
        },
        () => setGpsStatus("denied"),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      setGpsStatus("unavailable");
    }
  }, []);

  // FR-023: Redirect to profile creation or onboarding if not completed
  useEffect(() => {
    if (!onboardingChecking && needsOnboarding) {
      rememberReturnTo(`/missions/${missionId}/submit`);
      router.push(redirectTo);
    }
  }, [onboardingChecking, needsOnboarding, redirectTo, router, missionId]);

  // Declared before any early return: hooks must run in the same order on every
  // render. (This callback used to sit below the "Loading..." return, which made
  // the page crash with "Rendered more hooks than during the previous render"
  // as soon as the onboarding check finished.)
  const handleSubmit = useCallback(async (formData: FormData) => {
    if (latitude !== undefined && longitude !== undefined) {
      formData.append("latitude", String(latitude));
      formData.append("longitude", String(longitude));
    }

    const res = await missionsApi.submitEvidence(missionId, formData);
    if (!res.ok) {
      throw new Error(res.error?.message || "Submission failed");
    }

    setSubmitted(true);
    setTimeout(() => router.push(`/missions/${missionId}`), 2000);
  }, [missionId, latitude, longitude, router]);

  if (onboardingChecking || needsOnboarding || signedIn === null) {
    return <div className="py-12 text-center text-gray-400">Loading...</div>;
  }

  if (!signedIn) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center space-y-4">
        <h1 className="text-2xl font-bold">Submit Evidence</h1>
        <p className="text-gray-600">Sign in to submit evidence for a mission you have claimed.</p>
        <Link
          href="/auth/human/login"
          onClick={() => rememberReturnTo(`/missions/${missionId}/submit`)}
          className="inline-block rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center" role="status">
        <div className="text-green-600 text-xl font-medium mb-2">
          Evidence Submitted!
        </div>
        <p className="text-gray-600">
          Your evidence is being verified. Redirecting...
        </p>
      </div>
    );
  }

  // Location helps verification but is not required (except for missions with a
  // set radius, which the server enforces), so it is shown as optional here.
  const checklistItems = [
    { label: "Photo selected", passed: selectedFile !== null },
    { label: "File under 10MB", passed: selectedFile ? selectedFile.size <= MAX_FILE_BYTES : false },
  ];

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <div>
        <Link href={`/missions/${missionId}`} className="text-sm text-blue-600 hover:underline">&larr; Back to mission</Link>
        <h1 className="mt-2 text-2xl font-bold">Submit Evidence</h1>
      </div>

      <GPSIndicator
        status={gpsStatus}
        latitude={latitude}
        longitude={longitude}
      />

      <EvidenceChecklist items={checklistItems} />

      <EvidencePreview
        file={selectedFile}
        latitude={latitude}
        longitude={longitude}
      />

      <EvidenceSubmitForm
        missionId={missionId}
        claimId=""
        onSubmit={handleSubmit}
        onFileSelected={setSelectedFile}
      />
    </div>
  );
}
