"use client";

import { DomainDistribution } from "../../src/components/impact/DomainDistribution";
import { ImpactHeatmap } from "../../src/components/impact/ImpactHeatmap";
import { ImpactMetrics } from "../../src/components/impact/ImpactMetrics";
import { useImpactDashboard, useImpactHeatmap } from "../../src/hooks/useImpactDashboard";

export default function ImpactPage() {
  const { data: dashboardData, isLoading: dashLoading, error: dashError } = useImpactDashboard();
  const { data: heatmapData, isLoading: heatLoading } = useImpactHeatmap();

  const dashboard = dashboardData?.data;
  const heatPoints = heatmapData?.data ?? [];

  if (dashError) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-charcoal mb-4">Impact Dashboard</h1>
          <p className="text-charcoal-light">
            {dashError instanceof Error ? dashError.message : "Failed to load impact data"}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-charcoal">Impact Dashboard</h1>
          <p className="text-charcoal-light mt-1">
            Real-time view of the platform&apos;s collective impact
          </p>
        </div>

        {dashLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-charcoal/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : dashboard ? (
          <>
            <div className="mb-8">
              <ImpactMetrics
                totals={{
                  missionsCompleted: dashboard.totals?.missionsCompleted ?? 0,
                  impactTokensDistributed: dashboard.totals?.impactTokensDistributed ?? 0,
                  activeHumans: dashboard.totals?.activeHumans ?? 0,
                  problemsReported: dashboard.totals?.problemsReported ?? 0,
                  solutionsProposed: dashboard.totals?.solutionsProposed ?? 0,
                }}
              />
            </div>

            {dashboard.domainBreakdown && dashboard.domainBreakdown.length > 0 && (
              <div className="mb-8">
                <DomainDistribution domains={dashboard.domainBreakdown} />
              </div>
            )}
          </>
        ) : null}

        <div className="mb-8">
          <h2 className="text-xl font-semibold text-charcoal mb-4">Global Impact Map</h2>
          {heatLoading ? (
            <div className="h-[400px] bg-charcoal/5 rounded-xl animate-pulse" />
          ) : (
            <ImpactHeatmap points={heatPoints} />
          )}
        </div>
      </div>
    </main>
  );
}
