"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ReviewDecisionForm } from "../../../../../src/components/admin/ReviewDecisionForm";
import { Badge } from "../../../../../src/components/ui/badge";
import { Card, CardHeader, CardBody } from "../../../../../src/components/ui/card";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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

export default function FlaggedContentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [detail, setDetail] = useState<FlaggedDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/admin/flagged/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setDetail(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleDecision = async (decision: "approve" | "reject", notes: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/flagged/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes }),
      });
      const data = await res.json();
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
        </div>
      </main>
    );
  }

  const evaluation = detail.evaluation;

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-charcoal">Review Flagged Content</h1>

        {/* Content Details */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-charcoal">Submitted Content</h2>
            <Badge variant="status" status="flagged">{detail.status.replace("_", " ")}</Badge>
          </CardHeader>
          <CardBody>
            <pre className="bg-charcoal/5 rounded-lg p-4 text-sm overflow-auto max-h-64">
              {JSON.stringify(evaluation?.submittedContent, null, 2)}
            </pre>
          </CardBody>
        </Card>

        {/* Evaluation Results */}
        {evaluation && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-charcoal">Evaluation Results</h2>
              <Badge size="sm">Trust: {evaluation.trustTier}</Badge>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-charcoal-light">Alignment Score:</span>
                  <span className="ml-2 font-mono font-bold">
                    {evaluation.alignmentScore?.toFixed(2) ?? "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-charcoal-light">Domain:</span>
                  <span className="ml-2">{evaluation.alignmentDomain ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-charcoal-light">Layer A Passed:</span>
                  <span className="ml-2">
                    {evaluation.layerAResult.passed ? "Yes" : "No"}
                  </span>
                </div>
                <div>
                  <span className="text-charcoal-light">Harm Risk:</span>
                  <span className="ml-2">{evaluation.layerBResult?.harmRisk ?? "N/A"}</span>
                </div>
              </div>

              {evaluation.layerBResult?.reasoning && (
                <div className="mt-4 p-3 bg-charcoal/5 rounded-lg">
                  <p className="text-sm font-medium text-charcoal mb-1">Classifier Reasoning:</p>
                  <p className="text-sm text-charcoal-light">{evaluation.layerBResult.reasoning}</p>
                </div>
              )}
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
          <div className="p-4 rounded-lg bg-success/10 text-success font-medium">
            {result}
          </div>
        )}
      </div>
    </main>
  );
}
