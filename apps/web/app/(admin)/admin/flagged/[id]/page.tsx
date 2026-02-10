"use client";
/* eslint-disable complexity, max-lines-per-function */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ReviewDecisionForm } from "../../../../../src/components/admin/ReviewDecisionForm";
import { Badge } from "../../../../../src/components/ui/badge";
import { Card, CardHeader, CardBody } from "../../../../../src/components/ui/card";
import { contentTypeIcons, contentTypeColors } from "../../../../../src/constants/content-types";
import { API_BASE, getAdminToken, getAuthHeaders } from "../../../../../src/lib/api";

interface FlaggedDetail {
  id: string;
  evaluationId: string;
  contentId: string;
  contentType: string;
  agentId: string;
  status: string;
  assignedAdminId: string | null;
  evaluation: {
    submittedContent: Record<string, unknown>;
    layerAResult: { passed: boolean; forbiddenPatterns: string[]; executionTimeMs: number };
    layerBResult: {
      alignedDomain: string;
      alignmentScore: number;
      harmRisk: string;
      feasibility: string;
      quality: string;
      decision: string;
      reasoning: string;
    } | null;
    alignmentScore: number | null;
    alignmentDomain: string | null;
    trustTier: string;
  } | null;
}

interface FlaggedDetailResponse {
  ok: boolean;
  data: FlaggedDetail;
  error?: { message: string };
}

interface ReviewResponse {
  ok: boolean;
  error?: { message: string };
}

const trustTierColors: Record<string, string> = {
  new: "bg-warning/15 text-warning",
  verified: "bg-success/15 text-success",
};

function getScoreColor(score: number): string {
  if (score >= 0.7) return "bg-success";
  if (score >= 0.4) return "bg-warning";
  return "bg-error";
}

function getHarmRiskColor(risk: string): string {
  const normalized = risk.toLowerCase();
  if (normalized === "low" || normalized === "none") return "text-success";
  if (normalized === "medium" || normalized === "moderate") return "text-warning";
  return "text-error";
}

export default function FlaggedContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<FlaggedDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(`${API_BASE}/api/v1/admin/flagged/${id}`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<FlaggedDetailResponse>;
      })
      .then((data) => {
        setDetail(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleDecision = async (decision: "approve" | "reject", notes: string) => {
    setSubmitting(true);
    try {
      const token = getAdminToken();
      const reqHeaders = getAuthHeaders(token);

      const res = await fetch(`${API_BASE}/api/v1/admin/flagged/${id}/review`, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({ decision, notes }),
      });

      if (!res.ok) {
        const errorData = (await res.json()) as ReviewResponse;
        setResult(`Error: ${errorData.error?.message ?? "Review submission failed"}`);
        return;
      }

      const data = (await res.json()) as ReviewResponse;
      if (data.ok) {
        setResult(`Content ${decision}d successfully`);
      }
    } catch {
      setResult("Error submitting review");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <p className="text-charcoal-light">Loading...</p>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-charcoal">Flagged Content Not Found</h1>
          <Link href="/admin/flagged" className="text-sm text-terracotta hover:underline mt-2 inline-block">
            Back to flagged queue
          </Link>
        </div>
      </main>
    );
  }

  const evaluation = detail.evaluation;
  const layerA = evaluation?.layerAResult;
  const layerB = evaluation?.layerBResult;
  const alignmentScore = evaluation?.alignmentScore ?? layerB?.alignmentScore ?? null;
  const typeIcon = contentTypeIcons[detail.contentType] ?? "?";
  const typeColor = contentTypeColors[detail.contentType] ?? "bg-charcoal/10 text-charcoal";
  const tierColor = trustTierColors[evaluation?.trustTier ?? ""] ?? "bg-charcoal/10 text-charcoal";

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back link */}
        <Link href="/admin/flagged" className="text-sm text-terracotta hover:underline inline-flex items-center gap-1">
          &larr; Back to flagged queue
        </Link>

        <h1 className="text-3xl font-bold text-charcoal">Review Flagged Content</h1>

        {/* Agent Context */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-charcoal">Agent Context</h2>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-charcoal-light">Trust Tier:</span>
                <Badge size="sm" className={tierColor}>
                  {evaluation?.trustTier ?? "unknown"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-charcoal-light">Content Type:</span>
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${typeColor}`}
                >
                  {typeIcon}
                </span>
                <span className="text-sm font-medium text-charcoal">{detail.contentType}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-charcoal-light">Status:</span>
                <Badge variant="status" status={detail.status === "pending_review" ? "flagged" : detail.status === "approved" ? "approved" : "rejected"}>
                  {detail.status.replaceAll("_", " ")}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-charcoal-light">Agent:</span>
                <span className="font-mono text-xs text-charcoal">{detail.agentId.slice(0, 12)}...</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Submitted Content */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-charcoal">Submitted Content</h2>
          </CardHeader>
          <CardBody>
            <pre className="bg-charcoal/5 rounded-lg p-4 text-sm overflow-auto max-h-64">
              {JSON.stringify(evaluation?.submittedContent, null, 2)}
            </pre>
          </CardBody>
        </Card>

        {/* Layer A Result */}
        {layerA && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-charcoal">Layer A — Pattern Filter</h2>
              <Badge
                variant="status"
                status={layerA.passed ? "approved" : "rejected"}
              >
                {layerA.passed ? "Passed" : "Failed"}
              </Badge>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-charcoal-light">Execution time:</span>
                  <span className="font-mono">{layerA.executionTimeMs}ms</span>
                </div>

                {layerA.passed ? (
                  <p className="text-sm text-success font-medium">
                    No forbidden patterns detected. Content passed Layer A self-audit.
                  </p>
                ) : (
                  <div>
                    <p className="text-sm text-charcoal-light mb-2">Forbidden patterns matched:</p>
                    <div className="flex flex-wrap gap-2">
                      {layerA.forbiddenPatterns.map((pattern) => (
                        <span
                          key={pattern}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-error/10 text-error border border-error/20"
                        >
                          {pattern}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Layer B Result */}
        {layerB && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-charcoal">Layer B — AI Classifier</h2>
              <Badge
                variant="status"
                status={layerB.decision === "approve" ? "approved" : layerB.decision === "reject" ? "rejected" : "flagged"}
              >
                {layerB.decision}
              </Badge>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                {/* Alignment Score Bar */}
                {alignmentScore !== null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal-light">Alignment Score</span>
                      <span className="text-sm font-mono font-bold text-charcoal">
                        {alignmentScore.toFixed(2)}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-charcoal/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getScoreColor(alignmentScore)}`}
                        style={{ width: `${Math.min(alignmentScore * 100, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-charcoal-light">
                      <span>0.00</span>
                      <span className="text-warning">0.40</span>
                      <span className="text-success">0.70</span>
                      <span>1.00</span>
                    </div>
                  </div>
                )}

                {/* Score Breakdown Grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-charcoal/5 rounded-lg">
                    <span className="text-charcoal-light block text-xs mb-1">Domain</span>
                    <span className="font-medium text-charcoal">
                      {layerB.alignedDomain ?? evaluation?.alignmentDomain ?? "N/A"}
                    </span>
                  </div>
                  <div className="p-3 bg-charcoal/5 rounded-lg">
                    <span className="text-charcoal-light block text-xs mb-1">Harm Risk</span>
                    <span className={`font-medium ${getHarmRiskColor(layerB.harmRisk)}`}>
                      {layerB.harmRisk}
                    </span>
                  </div>
                  <div className="p-3 bg-charcoal/5 rounded-lg">
                    <span className="text-charcoal-light block text-xs mb-1">Feasibility</span>
                    <span className="font-medium text-charcoal">{layerB.feasibility}</span>
                  </div>
                  <div className="p-3 bg-charcoal/5 rounded-lg">
                    <span className="text-charcoal-light block text-xs mb-1">Quality</span>
                    <span className="font-medium text-charcoal">{layerB.quality}</span>
                  </div>
                </div>

                {/* Classifier Reasoning */}
                {layerB.reasoning && (
                  <div className="p-3 bg-charcoal/5 rounded-lg">
                    <p className="text-xs font-medium text-charcoal mb-1">Classifier Reasoning</p>
                    <p className="text-sm text-charcoal-light">{layerB.reasoning}</p>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Show minimal info if no evaluation data */}
        {!evaluation && (
          <Card>
            <CardBody>
              <p className="text-sm text-charcoal-light">
                No evaluation data available for this flagged item.
              </p>
            </CardBody>
          </Card>
        )}

        {/* Review Form */}
        {detail.status === "pending_review" && !result && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-charcoal">Your Decision</h2>
            </CardHeader>
            <CardBody>
              <ReviewDecisionForm
                flaggedId={detail.id}
                onSubmit={handleDecision}
                loading={submitting}
              />
            </CardBody>
          </Card>
        )}

        {result && (
          <div className={`p-4 rounded-lg font-medium ${result.startsWith("Error") ? "bg-error/10 text-error" : "bg-success/10 text-success"}`}>
            {result}
          </div>
        )}
      </div>
    </main>
  );
}
