"use client";

import { useState, useEffect, useCallback } from "react";

type StatusType = "confirmed" | "resolved" | "not_found";

interface AttestationCounts {
  confirmed: number;
  resolved: number;
  not_found: number;
  total: number;
}

interface AttestationButtonProps {
  problemId: string;
}

const STATUS_OPTIONS: { value: StatusType; label: string; color: string }[] = [
  { value: "confirmed", label: "Still exists", color: "#ef4444" },
  { value: "resolved", label: "Resolved", color: "#10b981" },
  { value: "not_found", label: "Not found", color: "#6b7280" },
];

/**
 * AttestationButton (Sprint 12 — T072)
 *
 * Displays attestation counts and lets users confirm/resolve/not_found a problem.
 */
export default function AttestationButton({ problemId }: AttestationButtonProps) {
  const [counts, setCounts] = useState<AttestationCounts | null>(null);
  const [userStatus, setUserStatus] = useState<StatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch(
        `/api/v1/problems/${problemId}/attestations`,
        { credentials: "include" },
      );
      if (resp.ok) {
        const json = await resp.json();
        setCounts(json.data.counts);
        setUserStatus(json.data.userAttestation?.statusType ?? null);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAttest = useCallback(
    async (statusType: StatusType) => {
      if (submitting) return;
      setSubmitting(true);

      try {
        if (userStatus === statusType) {
          // Remove attestation
          const resp = await fetch(
            `/api/v1/problems/${problemId}/attestations`,
            { method: "DELETE", credentials: "include" },
          );
          if (resp.ok) {
            setUserStatus(null);
            await fetchData();
          }
        } else {
          // Submit attestation
          const resp = await fetch(
            `/api/v1/problems/${problemId}/attestations`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ statusType }),
              credentials: "include",
            },
          );
          if (resp.ok) {
            const json = await resp.json();
            setCounts(json.data.counts);
            setUserStatus(statusType);
          }
        }
      } catch {
        // Ignore errors
      } finally {
        setSubmitting(false);
      }
    },
    [problemId, userStatus, submitting, fetchData],
  );

  if (loading) {
    return (
      <div style={{ padding: "0.5rem", color: "#9ca3af", fontSize: "0.875rem" }}>
        Loading attestations...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 500 }}>
        Community Attestation ({counts?.total ?? 0} total)
      </p>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        {STATUS_OPTIONS.map((opt) => {
          const isSelected = userStatus === opt.value;
          const count =
            counts?.[opt.value as keyof Omit<AttestationCounts, "total">] ?? 0;

          return (
            <button
              key={opt.value}
              onClick={() => handleAttest(opt.value)}
              disabled={submitting}
              style={{
                padding: "0.375rem 0.75rem",
                borderRadius: "0.375rem",
                border: `1px solid ${isSelected ? opt.color : "#d1d5db"}`,
                background: isSelected ? opt.color : "white",
                color: isSelected ? "white" : "#374151",
                fontSize: "0.8125rem",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>
    </div>
  );
}
