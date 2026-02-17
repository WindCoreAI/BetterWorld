"use client";

import { useState } from "react";

interface BuddyInviteProps {
  claimId: string;
  connections: Array<{ id: string; displayName: string }>;
  onInvite: (connectionId: string) => void;
}

export function BuddyInvite({ claimId: _claimId, connections, onInvite }: BuddyInviteProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Claim with Buddy</h3>
      <p className="text-xs text-gray-500 mb-3">
        Invite a connected friend to co-complete this mission. Rewards split 60/40.
      </p>
      {connections.length === 0 ? (
        <p className="text-xs text-gray-400">No connections available. Connect with others first.</p>
      ) : (
        <div className="space-y-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select a buddy...</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
          <button
            onClick={() => selectedId && onInvite(selectedId)}
            disabled={!selectedId}
            className="w-full rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Send Buddy Invitation
          </button>
        </div>
      )}
    </div>
  );
}
