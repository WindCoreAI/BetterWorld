"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

import { EvidenceChecklist } from "../../../../src/components/evidence/EvidenceChecklist";
import { EvidencePreview } from "../../../../src/components/evidence/EvidencePreview";
import { EvidenceSubmitForm } from "../../../../src/components/evidence/EvidenceSubmitForm";
import { GPSIndicator } from "../../../../src/components/evidence/GPSIndicator";

export default function SubmitEvidencePage() {
  const params = useParams();
  const router = useRouter();
  const missionId = params.id as string;

  const [gpsStatus, setGpsStatus] = useState<"detecting" | "detected" | "denied" | "unavailable">("detecting");
  const [latitude, setLatitude] = useState<number>();
  const [longitude, setLongitude] = useState<number>();
  const [selectedFile, _setSelectedFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);

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

  const checklistItems = [
    { label: "Photo selected", passed: selectedFile !== null },
    { label: "GPS detected", passed: gpsStatus === "detected" },
    { label: "File under 10MB", passed: selectedFile ? selectedFile.size <= 10 * 1024 * 1024 : false },
  ];

  const handleSubmit = useCallback(async (formData: FormData) => {
    if (latitude !== undefined && longitude !== undefined) {
      formData.append("latitude", String(latitude));
      formData.append("longitude", String(longitude));
    }

    const res = await fetch(`/api/v1/missions/${missionId}/evidence`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error?.message || "Submission failed");
    }

    setSubmitted(true);
    setTimeout(() => router.push(`/missions/${missionId}`), 2000);
  }, [missionId, latitude, longitude, router]);

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <div className="text-green-600 text-xl font-medium mb-2">
          Evidence Submitted!
        </div>
        <p className="text-gray-600">
          Your evidence is being verified. Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Submit Evidence</h1>

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
      />
    </div>
  );
}
