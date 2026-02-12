"use client";

/**
 * Production Shift Admin Page (Sprint 12 — T043)
 *
 * Composes ProductionShiftDashboard + EconomicHealthPanel + DecisionGateTracker
 * into a single admin page for monitoring the Phase 3 production shift.
 */

import DecisionGateTracker from "../../../../src/components/admin/DecisionGateTracker";
import EconomicHealthPanel from "../../../../src/components/admin/EconomicHealthPanel";
import ProductionShiftDashboard from "../../../../src/components/admin/ProductionShiftDashboard";
import SpotCheckPanel from "../../../../src/components/admin/SpotCheckPanel";

export default function ProductionShiftPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-charcoal">Phase 3: Production Shift</h1>
        <p className="text-charcoal-light mt-1">
          Monitor the transition from Layer B to peer consensus validation
        </p>
      </div>

      {/* Main Dashboard */}
      <ProductionShiftDashboard />

      {/* Economic Health + Decision Gate side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <EconomicHealthPanel />
        <DecisionGateTracker />
      </div>

      {/* Spot Check Quality Assurance */}
      <SpotCheckPanel />
    </div>
  );
}
