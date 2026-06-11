"use client";

/**
 * Governance Dashboard Page (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Public transparency dashboard: power distribution audit (Gini,
 * decision concentration, tier distribution) and network health metrics.
 */
import { NetworkHealth } from "@/components/governance/NetworkHealth";
import { PowerDistribution } from "@/components/governance/PowerDistribution";
import { useNetworkHealth, usePowerAudit } from "@/hooks/useGovernance";

interface PowerSnapshot {
  reviewGini: string;
  decisionConcentration: string;
  domainCoverage: string;
  geographicBalance: string;
  tierDistribution: Record<string, number>;
  computedAt: string;
}

interface NetworkHealthData {
  connectionDensity: number;
  totalConnections: number;
  totalParticipants: number;
  totalFollows: number;
  citiesConnected: number;
  reciprocityRate: number;
}

const EMPTY_HEALTH: NetworkHealthData = {
  connectionDensity: 0,
  totalConnections: 0,
  totalParticipants: 0,
  totalFollows: 0,
  citiesConnected: 0,
  reciprocityRate: 0,
};

export default function GovernancePage() {
  const powerAuditQuery = usePowerAudit();
  const networkHealthQuery = useNetworkHealth();

  const snapshot: PowerSnapshot | null = powerAuditQuery.data?.ok
    ? powerAuditQuery.data.data?.latest ?? null
    : null;
  const health: NetworkHealthData = networkHealthQuery.data?.ok
    ? networkHealthQuery.data.data ?? EMPTY_HEALTH
    : EMPTY_HEALTH;

  const isLoading = powerAuditQuery.isLoading || networkHealthQuery.isLoading;
  const hasError = powerAuditQuery.data?.ok === false || networkHealthQuery.data?.ok === false;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Governance Dashboard</h1>
      <p className="text-gray-600 mb-6">
        Transparent power distribution metrics and network health indicators.
        All data is publicly available for community accountability.
      </p>

      {hasError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Some governance metrics could not be loaded. Please try again later.
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          Loading governance metrics...
        </div>
      ) : (
        <div className="space-y-8">
          <PowerDistribution snapshot={snapshot} />
          <NetworkHealth data={health} />
        </div>
      )}
    </div>
  );
}
