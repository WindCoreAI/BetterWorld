"use client";

/**
 * ImpactChain Component (Sprint 16: Social Fabric Foundation)
 *
 * Chain visualization showing problem -> solutions -> missions -> evidence flow
 * with participant cards, click-through to profiles, depth truncation at 5 levels.
 */
import Link from "next/link";

import { useImpactChain } from "../../hooks/useImpact";
import { Badge, Card, CardBody } from "../ui";

interface ImpactChainProps {
  problemId: string;
}

export function ImpactChain({ problemId }: ImpactChainProps) {
  const { data, isLoading } = useImpactChain(problemId);

  const chain = data?.ok ? data.data : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-charcoal/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!chain) {
    return (
      <div className="text-center py-12 text-charcoal-light">
        <p className="text-lg mb-2">Impact chain not found</p>
        <p className="text-sm">This problem may not exist or has no downstream activity yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Problem node */}
      <Card>
        <CardBody>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-terracotta/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-terracotta text-sm font-bold">P</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-charcoal-light uppercase tracking-wide">Problem</p>
              <h3 className="text-sm font-semibold text-charcoal">{chain.problem.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge size="sm">{chain.problem.domain.replace(/_/g, " ")}</Badge>
                {chain.problem.city && (
                  <span className="text-xs text-charcoal-light">{chain.problem.city}</span>
                )}
              </div>
              <p className="text-xs text-charcoal-light mt-1">
                Reported by {chain.problem.reportedBy.name}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Connector */}
      {chain.solutions.length > 0 && (
        <div className="flex justify-center">
          <div className="w-0.5 h-6 bg-charcoal/20" />
        </div>
      )}

      {/* Solutions */}
      {chain.solutions.map((solution: { id: string; title: string; proposedBy: { name: string }; missionCount: number }) => (
        <div key={solution.id}>
          <Card>
            <CardBody>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-sage/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sage text-sm font-bold">S</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-charcoal-light uppercase tracking-wide">Solution</p>
                  <h4 className="text-sm font-semibold text-charcoal">{solution.title}</h4>
                  <p className="text-xs text-charcoal-light mt-1">
                    Proposed by {solution.proposedBy.name} &middot; {solution.missionCount} missions
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
          <div className="flex justify-center">
            <div className="w-0.5 h-4 bg-charcoal/20" />
          </div>
        </div>
      ))}

      {/* Missions */}
      {chain.missions.length > 0 && (
        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light uppercase tracking-wide mb-3">
              Missions ({chain.missions.length})
            </p>
            <div className="space-y-2">
              {chain.missions.slice(0, 5).map((mission: { id: string; title: string; status: string; claimedBy: { humanId: string; displayName: string } | null }) => (
                <div key={mission.id} className="flex items-center justify-between py-1.5 border-b border-charcoal/5 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full ${mission.status === "completed" ? "bg-sage" : "bg-charcoal/20"}`} />
                    <span className="text-sm text-charcoal truncate">{mission.title}</span>
                  </div>
                  {mission.claimedBy && (
                    <Link
                      href={`/portfolio/${mission.claimedBy.humanId}`}
                      className="text-xs text-terracotta hover:underline flex-shrink-0 ml-2"
                    >
                      {mission.claimedBy.displayName}
                    </Link>
                  )}
                </div>
              ))}
              {chain.missions.length > 5 && (
                <p className="text-xs text-charcoal-light text-center pt-1">
                  +{chain.missions.length - 5} more missions
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Evidence */}
      {chain.evidence.length > 0 && (
        <>
          <div className="flex justify-center">
            <div className="w-0.5 h-4 bg-charcoal/20" />
          </div>
          <Card>
            <CardBody>
              <p className="text-xs text-charcoal-light uppercase tracking-wide mb-3">
                Evidence ({chain.evidence.length})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {chain.evidence.slice(0, 6).map((ev: { id: string; status: string; reviewerCount: number }) => (
                  <div key={ev.id} className="flex items-center gap-2 text-xs">
                    <Badge
                      variant="status"
                      size="sm"
                      status={ev.status === "approved" ? "approved" : ev.status === "rejected" ? "rejected" : "pending"}
                    >
                      {ev.status}
                    </Badge>
                    <span className="text-charcoal-light">{ev.reviewerCount} reviewers</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {/* Attestations */}
      {chain.attestations.count > 0 && (
        <>
          <div className="flex justify-center">
            <div className="w-0.5 h-4 bg-charcoal/20" />
          </div>
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-charcoal-light uppercase tracking-wide">Community Attestations</p>
                  <p className="text-lg font-bold text-charcoal">{chain.attestations.count}</p>
                </div>
                {chain.attestations.urgencyBoostApplied && (
                  <Badge size="sm" variant="status" status="approved">
                    Urgency boost applied
                  </Badge>
                )}
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {/* Summary */}
      <Card>
        <CardBody>
          <p className="text-xs text-charcoal-light uppercase tracking-wide mb-3">Impact Summary</p>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xl font-bold text-charcoal">{chain.summary.totalParticipants}</p>
              <p className="text-xs text-charcoal-light">Participants</p>
            </div>
            <div>
              <p className="text-xl font-bold text-charcoal">{chain.summary.totalCities}</p>
              <p className="text-xs text-charcoal-light">Cities</p>
            </div>
            <div>
              <p className="text-xl font-bold text-charcoal">{chain.summary.totalMissionsCompleted}</p>
              <p className="text-xs text-charcoal-light">Completed</p>
            </div>
            <div>
              <p className="text-xl font-bold text-charcoal">{chain.summary.totalEvidenceVerified}</p>
              <p className="text-xs text-charcoal-light">Verified</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Empty chain message */}
      {chain.solutions.length === 0 && chain.missions.length === 0 && (
        <div className="text-center py-8 text-charcoal-light">
          <p className="text-sm">No downstream activity yet for this problem.</p>
          <p className="text-xs mt-1">Solutions and missions will appear here as the community responds.</p>
        </div>
      )}
    </div>
  );
}
