"use client";

import { useState } from "react";

interface QueueItem {
  id: string;
  contentId: string;
  contentType: string;
  status: string;
  createdAt: string;
}

interface ModeratorQueueProps {
  items: QueueItem[];
  onDecide: (itemId: string, decision: "approved" | "rejected" | "escalated", reason?: string) => void;
}

export function ModeratorQueue({ items, onDecide }: ModeratorQueueProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-8 text-center text-gray-500">
        No items in queue. All caught up!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-medium">{item.contentType}</span>
              <span className="ml-2 text-xs text-gray-500">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
              {item.status}
            </span>
          </div>
          {expandedId === item.id ? (
            <div className="mt-3 space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)..."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { onDecide(item.id, "approved", reason); setExpandedId(null); setReason(""); }}
                  className="rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => { onDecide(item.id, "rejected", reason); setExpandedId(null); setReason(""); }}
                  className="rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700"
                >
                  Reject
                </button>
                <button
                  onClick={() => { onDecide(item.id, "escalated", reason); setExpandedId(null); setReason(""); }}
                  className="rounded bg-yellow-600 px-3 py-1.5 text-xs text-white hover:bg-yellow-700"
                >
                  Escalate
                </button>
                <button
                  onClick={() => setExpandedId(null)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setExpandedId(item.id)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Review
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
