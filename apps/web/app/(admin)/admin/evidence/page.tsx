"use client";

import { useCallback, useEffect, useState } from "react";

import { evidenceReviewApi, type EvidenceReviewItem } from "../../../../src/lib/humanApi";

const MIN_REASONING = 10;

function formatDistance(meters: number | null): string | null {
  if (meters === null) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

function EvidenceCard({ item, onResolved }: { item: EvidenceReviewItem; onResolved: (message: string) => void }) {
  const [reasoning, setReasoning] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (decision: "approve" | "reject") => {
    if (reasoning.trim().length < MIN_REASONING) {
      setError(`Add a short reason (at least ${MIN_REASONING} characters). It is kept in the audit trail.`);
      return;
    }
    setBusy(decision);
    setError(null);
    const res = await evidenceReviewApi.resolve(item.evidenceId, decision, reasoning.trim());
    setBusy(null);
    if (!res.ok) {
      setError(res.error?.message ?? "Could not record the decision");
      return;
    }
    onResolved(
      decision === "approve"
        ? `Approved "${item.missionTitle}"${res.data?.rewardAmount ? ` — ${res.data.rewardAmount} IT paid to ${item.submitterName}` : ""}`
        : `Rejected "${item.missionTitle}" — ${item.submitterName} can submit again before their deadline`,
    );
  };

  const distance = formatDistance(item.gpsDistanceMeters);
  const isImage = item.evidenceType === "photo";
  const reasoningId = `reasoning-${item.evidenceId}`;

  return (
    <article className="bg-cream rounded-xl shadow-neu-sm p-5 space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-charcoal">{item.missionTitle}</h2>
        <p className="text-sm text-charcoal-light">
          Submitted by {item.submitterName} on {new Date(item.submittedAt).toLocaleString()}
        </p>
      </header>

      {item.contentUrl && isImage ? (
        <a href={item.contentUrl} target="_blank" rel="noreferrer" className="block">
          {/* Plain <img>: the source is a short-lived signed URL, not a static asset */}
          <img
            src={item.contentUrl}
            alt={`Evidence photo for ${item.missionTitle}`}
            className="max-h-96 w-full rounded-lg bg-charcoal/5 object-contain"
          />
        </a>
      ) : item.contentUrl ? (
        <a href={item.contentUrl} target="_blank" rel="noreferrer" className="text-terracotta hover:underline">
          Open the submitted {item.evidenceType}
        </a>
      ) : (
        <p className="text-sm text-error">The submitted file could not be loaded.</p>
      )}

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-charcoal-light">Distance from mission location</dt>
          <dd className="font-medium text-charcoal">{distance ?? "No location data"}</dd>
        </div>
        <div>
          <dt className="text-charcoal-light">AI confidence</dt>
          <dd className="font-medium text-charcoal">{item.aiScore !== null ? item.aiScore.toFixed(2) : "Not scored"}</dd>
        </div>
        <div>
          <dt className="text-charcoal-light">Peer reviews</dt>
          <dd className="font-medium text-charcoal">{item.peerReviews.length}</dd>
        </div>
      </dl>

      {item.aiReasoning && (
        <p className="rounded-lg bg-charcoal/5 p-3 text-sm text-charcoal">
          <span className="font-medium">AI notes: </span>
          {item.aiReasoning}
        </p>
      )}
      {item.appealReason && (
        <p className="rounded-lg bg-charcoal/5 p-3 text-sm text-charcoal">
          <span className="font-medium">Why this needs you: </span>
          {item.appealReason}
        </p>
      )}

      <div>
        <label htmlFor={reasoningId} className="mb-1 block text-sm font-medium text-charcoal">
          Reason for your decision
        </label>
        <textarea
          id={reasoningId}
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          rows={2}
          maxLength={5000}
          placeholder="e.g. Photo clearly shows the cleared storm drain at the mission location."
          className="w-full rounded-lg border border-charcoal/20 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta"
        />
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => resolve("approve")}
          disabled={busy !== null}
          className="rounded-lg bg-green-700 px-5 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {busy === "approve" ? "Approving..." : "Approve and pay reward"}
        </button>
        <button
          onClick={() => resolve("reject")}
          disabled={busy !== null}
          className="rounded-lg border border-charcoal/30 px-5 py-2 text-sm font-medium text-charcoal hover:bg-charcoal/5 disabled:opacity-50"
        >
          {busy === "reject" ? "Rejecting..." : "Reject"}
        </button>
      </div>
    </article>
  );
}

export default function AdminEvidenceReviewPage() {
  const [items, setItems] = useState<EvidenceReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await evidenceReviewApi.pending();
    if (res.ok && res.data) {
      setItems(res.data.disputes);
      setError(null);
    } else {
      setError(res.error?.message ?? "Could not load the review queue");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResolved = (message: string) => {
    setNotice(message);
    void load();
  };

  return (
    <main className="px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold text-charcoal">Evidence Review</h1>
        <p className="mb-8 text-charcoal-light">
          Evidence that needs a person: the AI was unsure or unavailable, there were not enough peer reviewers, or the
          submitter appealed a rejection. Approving verifies the mission, closes the claim and pays the reward.
        </p>

        {notice && (
          <p role="status" className="mb-6 rounded-lg bg-green-50 p-3 text-sm text-green-900">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-6 rounded-lg bg-error/10 p-3 text-sm text-error">
            {error}
          </p>
        )}

        {items === null && !error && <p className="text-charcoal-light">Loading...</p>}
        {items !== null && items.length === 0 && (
          <p className="rounded-xl bg-cream p-8 text-center text-charcoal-light shadow-neu-sm">
            Nothing is waiting for review.
          </p>
        )}

        <div className="space-y-6">
          {items?.map((item) => (
            <EvidenceCard key={item.evidenceId} item={item} onResolved={handleResolved} />
          ))}
        </div>
      </div>
    </main>
  );
}
