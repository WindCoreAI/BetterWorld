"use client";

import CrossCityDashboard from "../../../src/components/admin/CrossCityDashboard";
import RateAdjustmentPanel from "../../../src/components/admin/RateAdjustmentPanel";

export default function AdminCrossCityPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Cross-City Insights</h1>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CrossCityDashboard />
        <RateAdjustmentPanel />
      </div>
    </div>
  );
}
