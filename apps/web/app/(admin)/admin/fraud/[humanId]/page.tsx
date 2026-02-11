"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { FraudActions } from "../../../../../src/components/fraud/FraudActions";
import { FraudScoreBreakdown } from "../../../../../src/components/fraud/FraudScoreBreakdown";
import { API_BASE, getAdminToken, getAuthHeaders } from "../../../../../src/lib/api";

interface FraudDetail {
  fraudScore: {
    total: number;
    phash: number;
    velocity: number;
    statistical: number;
    status: string;
    flaggedAt: string | null;
    suspendedAt: string | null;
  };
  events: Array<{
    id: string;
    detectionType: string;
    scoreDelta: number;
    details: unknown;
    evidenceId: string | null;
    createdAt: string;
  }>;
  adminActions: Array<{
    id: string;
    action: string;
    reason: string;
    scoreBefore: number;
    scoreAfter: number;
    adminId: string;
    createdAt: string;
  }>;
  humanProfile: {
    displayName: string;
    joinedAt: string | null;
    reputationScore: number;
    tier: string;
  };
}

export default function AdminFraudDetailPage() {
  const params = useParams<{ humanId: string }>();
  const humanId = params.humanId;
  const [data, setData] = useState<FraudDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = async () => {
    setLoading(true);
    const adminToken = getAdminToken();
    const headers = getAuthHeaders(adminToken);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/fraud/${humanId}`, { headers });
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {
      // fetch failed
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [humanId]); // re-fetch on humanId change

  if (loading) {
    return (
      <main className="px-6 py-10">
        <div className="max-w-4xl mx-auto space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-charcoal/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="px-6 py-10">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-charcoal-light">Fraud data not found for this user.</p>
          <Link href="/admin/fraud" className="text-terracotta hover:underline text-sm mt-2 inline-block">
            Back to queue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin/fraud" className="text-sm text-terracotta hover:underline mb-4 inline-block">
          &larr; Back to queue
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">{data.humanProfile.displayName}</h1>
            <p className="text-sm text-charcoal-light">
              {data.humanProfile.tier} · {data.humanProfile.reputationScore} reputation
              {data.humanProfile.joinedAt && ` · Joined ${new Date(data.humanProfile.joinedAt).toLocaleDateString()}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <FraudScoreBreakdown {...data.fraudScore} />
          <FraudActions
            humanId={humanId}
            currentStatus={data.fraudScore.status}
            onActionComplete={fetchDetail}
          />
        </div>

        {/* Detection Events */}
        <div className="bg-cream rounded-xl shadow-neu-sm p-6 mb-6">
          <h3 className="font-semibold text-charcoal mb-4">Detection Events ({data.events.length})</h3>
          {data.events.length === 0 ? (
            <p className="text-sm text-charcoal-light">No detection events.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data.events.map((evt) => (
                <div key={evt.id} className="flex items-center justify-between p-3 bg-white rounded-lg text-sm">
                  <div>
                    <span className="font-medium text-charcoal">{evt.detectionType}</span>
                    <span className="text-charcoal-light ml-2">+{evt.scoreDelta}</span>
                  </div>
                  <span className="text-xs text-charcoal-light">
                    {new Date(evt.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin Action History */}
        <div className="bg-cream rounded-xl shadow-neu-sm p-6">
          <h3 className="font-semibold text-charcoal mb-4">Admin Actions ({data.adminActions.length})</h3>
          {data.adminActions.length === 0 ? (
            <p className="text-sm text-charcoal-light">No admin actions taken yet.</p>
          ) : (
            <div className="space-y-2">
              {data.adminActions.map((act) => (
                <div key={act.id} className="p-3 bg-white rounded-lg text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-charcoal">{act.action}</span>
                    <span className="text-xs text-charcoal-light">
                      {new Date(act.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-charcoal-light">{act.reason}</p>
                  <p className="text-xs text-charcoal-light mt-1">
                    Score: {act.scoreBefore} → {act.scoreAfter}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
