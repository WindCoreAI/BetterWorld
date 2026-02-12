"use client";

/**
 * Agreement Dashboard Page (Sprint 11 — T032)
 *
 * Admin-gated page showing peer vs Layer B agreement rates.
 */

import { useEffect, useState } from "react";

import AgreementChart from "../../../../src/components/AgreementChart";
import LatencyHistogram from "../../../../src/components/LatencyHistogram";
import { API_BASE, getAdminToken, getAuthHeaders } from "../../../../src/lib/api";

interface AgreementData {
  overall: {
    totalSubmissions: number;
    agreements: number;
    disagreements: number;
    agreementRate: number;
    peerApproveLayerBReject: number;
    peerRejectLayerBApprove: number;
  };
  byDomain: Array<{
    domain: string;
    totalSubmissions: number;
    agreements: number;
    agreementRate: number;
  }>;
  bySubmissionType: Array<{
    submissionType: string;
    totalSubmissions: number;
    agreements: number;
    agreementRate: number;
  }>;
}

interface LatencyData {
  consensusLatency: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    avgMs: number;
    totalSamples: number;
  };
  validatorResponseTime: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    avgMs: number;
    totalResponses: number;
  };
  quorumStats: {
    totalAttempts: number;
    quorumMet: number;
    quorumTimeout: number;
    quorumSuccessRate: number;
  };
}

export default function ShadowDashboardPage() {
  const [agreement, setAgreement] = useState<AgreementData | null>(null);
  const [latency, setLatency] = useState<LatencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const token = getAdminToken();
      const headers = getAuthHeaders(token);

      try {
        const [agRes, latRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/admin/shadow/agreement`, { headers }),
          fetch(`${API_BASE}/api/v1/admin/shadow/latency`, { headers }),
        ]);

        if (agRes.ok) {
          const agData = await agRes.json();
          setAgreement(agData.data);
        }

        if (latRes.ok) {
          const latData = await latRes.json();
          setLatency(latData.data);
        }

        if (!agRes.ok && !latRes.ok) {
          setError("Failed to fetch shadow dashboard data");
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Shadow Mode Dashboard</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Shadow Mode Dashboard</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Shadow Mode Dashboard</h1>

      {/* Overall Agreement Rate */}
      {agreement && (
        <div className="mb-8">
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Overall Agreement Rate</h2>
            <p className="text-5xl font-bold text-blue-600">
              {Math.round(agreement.overall.agreementRate * 100)}%
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {agreement.overall.agreements} / {agreement.overall.totalSubmissions} submissions agree
            </p>
          </div>

          {/* Disagreement Breakdown */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Peer Approve, Layer B Reject</p>
              <p className="text-2xl font-bold text-orange-600">
                {agreement.overall.peerApproveLayerBReject}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Peer Reject, Layer B Approve</p>
              <p className="text-2xl font-bold text-orange-600">
                {agreement.overall.peerRejectLayerBApprove}
              </p>
            </div>
          </div>

          {/* Per-Domain Agreement */}
          <AgreementChart
            title="Agreement by Domain"
            data={agreement.byDomain.map((d) => ({
              label: d.domain.replace(/_/g, " "),
              agreementRate: d.agreementRate,
              totalSubmissions: d.totalSubmissions,
            }))}
          />

          <div className="mt-4" />

          {/* Per-Type Agreement */}
          <AgreementChart
            title="Agreement by Submission Type"
            data={agreement.bySubmissionType.map((t) => ({
              label: t.submissionType,
              agreementRate: t.agreementRate,
              totalSubmissions: t.totalSubmissions,
            }))}
          />
        </div>
      )}

      {/* Latency */}
      {latency && (
        <div className="mt-8">
          <LatencyHistogram
            p50Ms={latency.consensusLatency.p50Ms}
            p95Ms={latency.consensusLatency.p95Ms}
            p99Ms={latency.consensusLatency.p99Ms}
            avgMs={latency.consensusLatency.avgMs}
            totalSamples={latency.consensusLatency.totalSamples}
          />

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Quorum Attempts</p>
              <p className="text-2xl font-bold text-gray-900">{latency.quorumStats.totalAttempts}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Quorum Met</p>
              <p className="text-2xl font-bold text-green-600">{latency.quorumStats.quorumMet}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Quorum Timeout</p>
              <p className="text-2xl font-bold text-red-600">{latency.quorumStats.quorumTimeout}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
