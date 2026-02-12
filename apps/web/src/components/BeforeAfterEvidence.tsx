"use client";

import { useState, useCallback } from "react";

import { Card, CardBody } from "./ui";

interface BeforeAfterEvidenceProps {
  missionId: string;
  claimId: string;
}

function PhotoColumn({
  label,
  preview,
  uploaded,
  onSelect,
}: {
  label: string;
  preview: string | null;
  uploaded: boolean;
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.5rem" }}>
        {label}
      </label>
      {preview ? (
        <div style={{ position: "relative" }}>
          <img src={preview} alt={label} style={{ width: "100%", height: "200px", objectFit: "cover", borderRadius: "0.5rem", border: "2px solid #e5e7eb" }} />
          {uploaded && (
            <span style={{ position: "absolute", top: "0.5rem", right: "0.5rem", background: "#10b981", color: "white", padding: "0.125rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.75rem" }}>
              Uploaded
            </span>
          )}
        </div>
      ) : (
        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", border: "2px dashed #d1d5db", borderRadius: "0.5rem", cursor: "pointer", background: "#f9fafb" }}>
          <span style={{ fontSize: "2rem" }}>+</span>
          <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Select {label.toLowerCase()}</span>
          <input type="file" accept="image/*" onChange={onSelect} style={{ display: "none" }} />
        </label>
      )}
    </div>
  );
}

/**
 * BeforeAfterEvidence (Sprint 12 — T058)
 *
 * Two-photo upload component for before/after evidence pairs.
 * Generates a shared pairId and displays GPS + comparison status.
 */
export default function BeforeAfterEvidence({
  missionId,
  claimId: _claimId,
}: BeforeAfterEvidenceProps) {
  const [pairId] = useState(() => crypto.randomUUID());
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [beforePreview, setBeforePreview] = useState<string | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [beforeUploaded, setBeforeUploaded] = useState(false);
  const [afterUploaded, setAfterUploaded] = useState(false);

  const handleFileSelect = useCallback(
    (type: "before" | "after") => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const preview = URL.createObjectURL(file);
      if (type === "before") {
        setBeforeFile(file);
        setBeforePreview(preview);
      } else {
        setAfterFile(file);
        setAfterPreview(preview);
      }
    },
    [],
  );

  const uploadPhoto = useCallback(
    async (file: File, sequenceType: "before" | "after") => {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("pairId", pairId);
      formData.append("photoSequenceType", sequenceType);

      // Try to get GPS from browser
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
          }),
        );
        formData.append("latitude", String(pos.coords.latitude));
        formData.append("longitude", String(pos.coords.longitude));
      } catch {
        // GPS not available - OK
      }

      const resp = await fetch(
        `/api/v1/missions/${missionId}/evidence`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        },
      );

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(
          (data as { error?: { message?: string } }).error?.message ||
            `Upload failed (${resp.status})`,
        );
      }

      return resp.json();
    },
    [missionId, pairId],
  );

  const handleUpload = useCallback(async () => {
    if (!beforeFile || !afterFile) {
      setError("Both before and after photos are required");
      return;
    }

    setUploading(true);
    setError(null);
    setStatus("Uploading before photo...");

    try {
      await uploadPhoto(beforeFile, "before");
      setBeforeUploaded(true);
      setStatus("Uploading after photo...");

      await uploadPhoto(afterFile, "after");
      setAfterUploaded(true);
      setStatus("Photos uploaded! AI comparison in progress...");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed",
      );
      setStatus(null);
    } finally {
      setUploading(false);
    }
  }, [beforeFile, afterFile, uploadPhoto]);

  return (
    <Card>
      <CardBody>
        <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          Before &amp; After Evidence
        </h3>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Upload a before photo, then an after photo to show the improvement.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          <PhotoColumn label="Before Photo" preview={beforePreview} uploaded={beforeUploaded} onSelect={handleFileSelect("before")} />
          <PhotoColumn label="After Photo" preview={afterPreview} uploaded={afterUploaded} onSelect={handleFileSelect("after")} />
        </div>

        {/* Pair ID display */}
        <p
          style={{
            fontSize: "0.75rem",
            color: "#9ca3af",
            marginBottom: "0.75rem",
          }}
        >
          Pair ID: {pairId}
        </p>

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!beforeFile || !afterFile || uploading}
          style={{
            width: "100%",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            border: "none",
            background:
              !beforeFile || !afterFile || uploading
                ? "#d1d5db"
                : "#2563eb",
            color: "white",
            fontWeight: 500,
            cursor:
              !beforeFile || !afterFile || uploading
                ? "not-allowed"
                : "pointer",
          }}
        >
          {uploading ? "Uploading..." : "Upload Before & After"}
        </button>

        {/* Status */}
        {status && (
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              color: "#2563eb",
            }}
          >
            {status}
          </p>
        )}

        {/* Error */}
        {error && (
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              color: "#ef4444",
            }}
          >
            {error}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
