/**
 * Traffic Router Service (Sprint 12 — T020)
 *
 * Determines whether a submission should route to peer consensus
 * or Layer B based on traffic percentage and agent trust tier.
 * Only verified-tier agents are eligible for peer routing.
 */
import type Redis from "ioredis";

import { getFlag } from "./feature-flags.js";
import { shouldRouteToPerConsensus } from "../lib/traffic-hash.js";

export interface RoutingDecision {
  route: "layer_b" | "peer_consensus";
  reason: string;
  trafficPct: number;
}

/**
 * Route a submission to either Layer B or peer consensus.
 *
 * Rules (in order):
 * 1. New-tier agents always use Layer B
 * 2. If PEER_VALIDATION_TRAFFIC_PCT is 0, all go to Layer B
 * 3. Deterministic hash decides based on traffic %
 */
export async function routeSubmission(
  submissionId: string,
  agentTrustTier: string,
  redis: Redis | null,
): Promise<RoutingDecision> {
  const trafficPct = await getFlag(redis, "PEER_VALIDATION_TRAFFIC_PCT");

  // Rule 1: new-tier agents always use Layer B
  if (agentTrustTier !== "verified") {
    return {
      route: "layer_b",
      reason: `${agentTrustTier}-tier agent always uses Layer B`,
      trafficPct,
    };
  }

  // Rule 2: traffic at 0% means all Layer B
  if (trafficPct <= 0) {
    return {
      route: "layer_b",
      reason: "traffic routing disabled (0%)",
      trafficPct,
    };
  }

  // Rule 3: deterministic hash
  if (shouldRouteToPerConsensus(submissionId, trafficPct)) {
    return {
      route: "peer_consensus",
      reason: `hash-routed to peer consensus at ${trafficPct}%`,
      trafficPct,
    };
  }

  return {
    route: "layer_b",
    reason: `hash-routed to Layer B at ${trafficPct}%`,
    trafficPct,
  };
}
