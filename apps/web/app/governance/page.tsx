"use client";

import { NetworkHealth } from "@/components/governance/NetworkHealth";
import { PowerDistribution } from "@/components/governance/PowerDistribution";

export default function GovernancePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Governance Dashboard</h1>
      <p className="text-gray-600 mb-6">
        Transparent power distribution metrics and network health indicators.
        All data is publicly available for community accountability.
      </p>

      <div className="space-y-8">
        <PowerDistribution snapshot={null} />
        <NetworkHealth
          data={{
            connectionDensity: 0,
            totalConnections: 0,
            totalParticipants: 0,
            totalFollows: 0,
            citiesConnected: 0,
            reciprocityRate: 0,
          }}
        />
      </div>
    </div>
  );
}
