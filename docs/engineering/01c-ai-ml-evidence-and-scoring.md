> **AI/ML Architecture** — Part 3 of 5 | [Overview & Guardrails](01a-ai-ml-overview-and-guardrails.md) · [Search & Decomposition](01b-ai-ml-search-and-decomposition.md) · [Evidence & Scoring](01c-ai-ml-evidence-and-scoring.md) · [Models & Pipeline](01d-ai-ml-models-and-pipeline.md) · [Monitoring & Ethics](01e-ai-ml-monitoring-and-ethics.md)

# AI/ML Architecture — Evidence & Scoring

## 5. Evidence Verification Pipeline

When a human completes a mission and submits evidence, the Evidence Verification Pipeline determines whether the evidence is genuine, sufficient, and matches the mission requirements.

### 5.1 Cascading 6-Stage Pipeline Architecture

The evidence pipeline uses a cascading design where each stage gates the next. Failures at early (cheap) stages skip expensive later stages. This ordering is intentional: approximately 60% of fraudulent submissions are caught by Stages 1-2, which are the cheapest to run.

```
Human submits evidence
       │
       ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Stage 1: Metadata Extraction (EXIF, GPS, timestamps)           │
  │   Cost: ~$0.00  │  Latency: ~50ms  │  Runs: always            │
  │   Extract EXIF data, GPS coords, capture timestamp, device ID  │
  └──────────────────────────┬──────────────────────────────────────┘
       │ pass                │ fail → REJECT (missing/stripped metadata)
       ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Stage 2: Plausibility Check                                    │
  │   Cost: ~$0.00  │  Latency: ~100ms  │  Runs: if Stage 1 pass  │
  │   Location vs mission area, capture time vs deadline,          │
  │   device consistency, timezone sanity                          │
  └──────────────────────────┬──────────────────────────────────────┘
       │ pass                │ fail → REJECT (location/time mismatch)
       ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Stage 3: Perceptual Hashing                                    │
  │   Cost: ~$0.00  │  Latency: ~200ms  │  Runs: if Stage 2 pass  │
  │   Duplicate/near-duplicate detection against evidence DB,      │
  │   reverse image search for stock photos                        │
  └──────────────────────────┬──────────────────────────────────────┘
       │ pass                │ fail → REJECT (duplicate/stock image)
       ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Stage 4: Anomaly Detection                                     │
  │   Cost: ~$0.00  │  Latency: ~300ms  │  Runs: if Stage 3 pass  │
  │   Statistical outliers in submission patterns: burst frequency, │
  │   unusual geolocations, device fingerprint anomalies           │
  └──────────────────────────┬──────────────────────────────────────┘
       │ pass                │ fail → FLAG for manual review
       ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Stage 5: Peer Review (async)                                   │
  │   Cost: 5 IT/reviewer  │  Latency: hours  │  Runs: async      │
  │   Human validation with incentivized reviewers (1-3 reviewers) │
  │   Majority vote determines outcome                             │
  └──────────────────────────┬──────────────────────────────────────┘
       │ pass                │ fail → REJECT (peer consensus)
       ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Stage 6: AI Vision Analysis (Claude Vision)                    │
  │   Cost: ~$0.002  │  Latency: ~2s  │  Runs: only if 1-5 pass   │
  │   Content verification, tampering detection, mission match     │
  │   Uses tool_use structured output (see Section 5.2)            │
  └──────────────────────────┬──────────────────────────────────────┘
       │ pass                │ fail → REJECT with explanation
       ▼
  AUTO-APPROVE: evidence verified
```

**Cost summary per evidence submission:**

| Stage | Compute Cost | Latency | % of Fraud Caught | Cumulative |
|-------|-------------|---------|-------------------|------------|
| 1. Metadata Extraction | ~$0.00 | ~50ms | ~30% | ~30% |
| 2. Plausibility Check | ~$0.00 | ~100ms | ~30% | ~60% |
| 3. Perceptual Hashing | ~$0.00 | ~200ms | ~15% | ~75% |
| 4. Anomaly Detection | ~$0.00 | ~300ms | ~10% | ~85% |
| 5. Peer Review | 5-15 IT | hours | ~10% | ~95% |
| 6. AI Vision Analysis | ~$0.002 | ~2s | ~5% | ~100% |

The cascading design means the expensive AI Vision call (Stage 6) only runs on submissions that passed all prior checks. At scale, this reduces vision API costs by ~60-75% compared to a flat pipeline that runs all checks on every submission.

**Evidence Quality Scoring Algorithm** *(0-10 scale — intentionally separate from 0-100 solution scoring; used only for internal evidence pipeline decisions)*:

```
evidence_quality_score = (
  0.3 × photo_clarity_score +    // Claude Vision: 0-10 scale
  0.2 × gps_accuracy_score +      // Within 100m of mission location: 10, 500m: 5, >1km: 0
  0.2 × timestamp_freshness +     // Within 1h of claim: 10, 24h: 5, >48h: 0
  0.15 × metadata_completeness +  // EXIF present: 10, partial: 5, stripped: 2
  0.15 × peer_review_score        // Average peer rating: 0-10
)
Threshold: evidence_quality_score >= 6.0 for auto-approval
```

### 5.2 Claude Vision API Integration

```typescript
// packages/evidence/src/vision.ts

import Anthropic from '@anthropic-ai/sdk';

interface VisualAnalysisResult {
  description: string;           // What the image shows
  matches_mission: boolean;      // Does it match the mission requirements?
  match_confidence: number;      // 0.0-1.0
  detected_elements: string[];   // Objects/features detected
  quality_issues: string[];      // Blur, darkness, obstruction, etc.
  tampering_indicators: string[]; // Signs of photo manipulation
  reasoning: string;
}

// Tool schema for structured vision analysis output
const evidenceAnalysisTool = {
  name: 'analyze_evidence',
  description: 'Analyze submitted evidence image against mission requirements',
  input_schema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'What the image shows' },
      matches_mission: { type: 'boolean' },
      match_confidence: { type: 'number', minimum: 0, maximum: 1 },
      detected_elements: { type: 'array', items: { type: 'string' } },
      quality_issues: { type: 'array', items: { type: 'string' } },
      tampering_indicators: { type: 'array', items: { type: 'string' } },
      reasoning: { type: 'string' },
    },
    required: [
      'description', 'matches_mission', 'match_confidence',
      'detected_elements', 'quality_issues', 'tampering_indicators', 'reasoning',
    ],
  },
};

async function analyzeEvidenceImage(
  imageUrl: string,
  mission: Mission,
  client: Anthropic
): Promise<VisualAnalysisResult> {
  const response = await client.messages.create({
    model: process.env.VISION_MODEL!,
    max_tokens: 1024,
    tools: [evidenceAnalysisTool],
    tool_choice: { type: 'tool', name: 'analyze_evidence' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: imageUrl },
          },
          {
            type: 'text',
            text: `You are verifying evidence for a BetterWorld mission.

Mission title: ${mission.title}
Mission description: ${mission.description}
Evidence requirements: ${JSON.stringify(mission.evidence_required)}
Expected location: ${mission.required_location_name || 'Not specified'}

Analyze this image and determine:
1. What does the image show? Describe the key elements.
2. Does it match the mission's evidence requirements?
3. Are there any quality issues (blur, darkness, obstruction)?
4. Are there any signs of photo manipulation or AI generation?
5. Does the scene appear consistent with the expected location?

Call the analyze_evidence tool with your assessment.`,
          },
        ],
      },
    ],
  });

  // Extract structured result from tool_use — no JSON.parse() needed
  const toolUseBlock = response.content.find(
    (block) => block.type === 'tool_use' && block.name === 'analyze_evidence'
  );

  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    throw new Error('No analyze_evidence tool_use block in response');
  }

  return toolUseBlock.input as VisualAnalysisResult;
}
```

### 5.3 GPS/Timestamp Cross-Validation

```typescript
// packages/evidence/src/geospatial.ts

interface GeoTemporalValidation {
  location_valid: boolean;
  distance_from_target_km: number;
  timestamp_valid: boolean;
  hours_since_claim: number;
  hours_before_deadline: number;
  cross_validation_score: number; // 0.0-1.0
  issues: string[];
}

function validateGeoTemporal(
  evidence: Evidence,
  mission: Mission
): GeoTemporalValidation {
  const issues: string[] = [];

  // Location validation
  let locationValid = true;
  let distanceKm = 0;

  if (mission.required_latitude && mission.required_longitude && mission.location_radius_km) {
    if (!evidence.latitude || !evidence.longitude) {
      locationValid = false;
      issues.push('Evidence has no GPS coordinates but mission requires location verification');
    } else {
      distanceKm = haversineDistance(
        evidence.latitude, evidence.longitude,
        mission.required_latitude, mission.required_longitude
      );

      if (distanceKm > mission.location_radius_km) {
        locationValid = false;
        issues.push(
          `Evidence location (${distanceKm.toFixed(1)}km from target) ` +
          `exceeds mission radius (${mission.location_radius_km}km)`
        );
      }
    }
  }

  // Timestamp validation
  let timestampValid = true;
  const claimedAt = new Date(mission.claimed_at!);
  const capturedAt = evidence.captured_at ? new Date(evidence.captured_at) : null;
  const deadline = mission.deadline ? new Date(mission.deadline) : null;

  if (!capturedAt) {
    issues.push('Evidence has no capture timestamp');
    timestampValid = false;
  } else {
    // Evidence should be captured AFTER mission was claimed
    if (capturedAt < claimedAt) {
      timestampValid = false;
      issues.push('Evidence was captured before mission was claimed - possible reuse of old media');
    }

    // Evidence should be captured BEFORE deadline
    if (deadline && capturedAt > deadline) {
      timestampValid = false;
      issues.push('Evidence was captured after mission deadline');
    }

    // Evidence should not be from the far future
    if (capturedAt > new Date(Date.now() + 3600000)) {
      timestampValid = false;
      issues.push('Evidence timestamp is in the future - possible manipulation');
    }
  }

  const hoursSinceClaim = capturedAt
    ? (capturedAt.getTime() - claimedAt.getTime()) / 3600000
    : -1;

  const hoursBeforeDeadline = deadline && capturedAt
    ? (deadline.getTime() - capturedAt.getTime()) / 3600000
    : -1;

  // Cross-validation score
  let score = 1.0;
  if (!locationValid) score -= 0.4;
  if (!timestampValid) score -= 0.4;
  if (issues.length > 0) score -= 0.1 * Math.min(issues.length, 2);
  score = Math.max(0, score);

  return {
    location_valid: locationValid,
    distance_from_target_km: distanceKm,
    timestamp_valid: timestampValid,
    hours_since_claim: hoursSinceClaim,
    hours_before_deadline: hoursBeforeDeadline,
    cross_validation_score: score,
    issues,
  };
}

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
```

### 5.4 Multi-Modal Verification Combiner

```typescript
// packages/evidence/src/combiner.ts

interface VerificationResult {
  overall_score: number;          // 0.0-1.0
  decision: 'auto_approve' | 'peer_review' | 'reject';
  component_scores: {
    visual_analysis: number | null;   // From Claude Vision
    geo_temporal: number;             // From GPS/timestamp check
    text_completeness: number | null; // From text report analysis
  };
  reasoning: string;
  issues: string[];
  peer_review_needed: boolean;
  suggested_peer_count: number;    // 1-3
}

function combineVerificationSignals(
  visual: VisualAnalysisResult | null,
  geoTemporal: GeoTemporalValidation,
  textAnalysis: TextAnalysisResult | null,
  mission: Mission
): VerificationResult {
  const scores: number[] = [];
  const weights: number[] = [];
  const issues: string[] = [...geoTemporal.issues];

  // Visual score (weight depends on whether photos were required)
  if (visual) {
    scores.push(visual.match_confidence);
    weights.push(mission.evidence_required?.types?.includes('photo') ? 0.4 : 0.2);
    issues.push(...visual.quality_issues, ...visual.tampering_indicators);
  }

  // Geo-temporal score (always weighted)
  scores.push(geoTemporal.cross_validation_score);
  weights.push(0.3);

  // Text completeness score
  if (textAnalysis) {
    scores.push(textAnalysis.completeness_score);
    weights.push(mission.evidence_required?.types?.includes('text_report') ? 0.3 : 0.1);
    issues.push(...textAnalysis.issues);
  }

  // Weighted average
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const overallScore = scores.reduce(
    (sum, score, i) => sum + score * weights[i], 0
  ) / totalWeight;

  // Decision routing
  let decision: 'auto_approve' | 'peer_review' | 'reject';
  let suggestedPeerCount = 0;

  if (overallScore >= 0.85 && issues.length === 0) {
    decision = 'auto_approve';
  } else if (overallScore >= 0.5) {
    decision = 'peer_review';
    suggestedPeerCount = overallScore >= 0.7 ? 1 : overallScore >= 0.6 ? 2 : 3;
  } else {
    decision = 'reject';
  }

  return {
    overall_score: overallScore,
    decision,
    component_scores: {
      visual_analysis: visual?.match_confidence ?? null,
      geo_temporal: geoTemporal.cross_validation_score,
      text_completeness: textAnalysis?.completeness_score ?? null,
    },
    reasoning: buildVerificationReasoning(overallScore, issues, decision),
    issues,
    peer_review_needed: decision === 'peer_review',
    suggested_peer_count: suggestedPeerCount,
  };
}
```

### 5.5 Peer Review Integration

```typescript
// packages/evidence/src/peer-review.ts

interface PeerReviewRequest {
  evidence_id: string;
  mission_id: string;
  mission_title: string;
  evidence_preview: {
    photos: string[];       // Thumbnail URLs
    text_excerpt: string;   // First 200 chars of text report
    location_description: string;
  };
  review_questions: string[];  // Specific questions for the reviewer
  token_reward: number;        // IT reward for completing the review (5 IT)
  deadline: Date;              // 48 hours from creation
  required_reviews: number;    // 1-3
}

interface PeerReview {
  reviewer_human_id: string;
  evidence_id: string;
  verdict: 'approve' | 'reject' | 'unsure';
  confidence: number;          // 0.0-1.0
  notes: string;
  time_spent_seconds: number;  // Track to detect rubber-stamping
  created_at: Date;
}

function resolvePeerReviews(reviews: PeerReview[]): PeerReviewOutcome {
  // Require minimum time spent to count (prevent rubber-stamping)
  const validReviews = reviews.filter(r => r.time_spent_seconds >= 30);

  if (validReviews.length === 0) {
    return { outcome: 'inconclusive', reason: 'No valid reviews (all too fast)' };
  }

  const approvals = validReviews.filter(r => r.verdict === 'approve').length;
  const rejections = validReviews.filter(r => r.verdict === 'reject').length;
  const total = validReviews.length;

  // Weighted by reviewer confidence
  const weightedApproval = validReviews
    .filter(r => r.verdict === 'approve')
    .reduce((sum, r) => sum + r.confidence, 0);
  const weightedTotal = validReviews.reduce((sum, r) => sum + r.confidence, 0);
  const weightedApprovalRate = weightedApproval / weightedTotal;

  if (weightedApprovalRate >= 0.6) {
    return { outcome: 'approved', reason: `${approvals}/${total} reviewers approved` };
  } else if (rejections > approvals) {
    return { outcome: 'rejected', reason: `${rejections}/${total} reviewers rejected` };
  } else {
    return { outcome: 'escalate', reason: 'No clear consensus - escalating to admin' };
  }
}
```

---

## 6. Quality Scoring System

Every problem and solution receives composite quality scores that determine visibility, priority, and token reward multipliers. Scores are computed asynchronously after content passes guardrails.

### 6.1 Impact Score

The Impact Score estimates the potential positive impact of a problem being solved or a solution being implemented.

```typescript
// packages/guardrails/src/scoring/impact.ts

interface ImpactScoreInputs {
  affected_population_estimate: number;  // People affected
  severity: 'low' | 'medium' | 'high' | 'critical';
  geographic_scope: 'local' | 'regional' | 'national' | 'global';
  evidence_strength: number;    // 0.0-1.0 from evidence quality assessment
  urgency: 'low' | 'medium' | 'high' | 'immediate';
}

function computeImpactScore(inputs: ImpactScoreInputs): number {
  // Population factor: logarithmic scale to prevent extreme values
  // from dominating. log10(100) = 2, log10(1M) = 6, log10(1B) = 9
  const popFactor = Math.log10(Math.max(inputs.affected_population_estimate, 1)) / 9;

  // Severity multiplier
  const severityMultiplier: Record<string, number> = {
    low: 0.25,
    medium: 0.5,
    high: 0.75,
    critical: 1.0,
  };

  // Geographic scope multiplier (larger scope = higher impact potential)
  const scopeMultiplier: Record<string, number> = {
    local: 0.4,
    regional: 0.6,
    national: 0.8,
    global: 1.0,
  };

  // Urgency multiplier
  const urgencyMultiplier: Record<string, number> = {
    low: 0.5,
    medium: 0.7,
    high: 0.9,
    immediate: 1.0,
  };

  // Weighted combination
  const rawScore =
    popFactor * 0.30 +
    severityMultiplier[inputs.severity] * 0.25 +
    scopeMultiplier[inputs.geographic_scope] * 0.15 +
    inputs.evidence_strength * 0.20 +
    urgencyMultiplier[inputs.urgency] * 0.10;

  // Normalize to 0-100 scale
  return Math.round(rawScore * 100 * 100) / 100;
}

// Example calculations:
// Rural school water access (2.3M affected, high severity, national, strong evidence, high urgency)
// popFactor = log10(2_300_000) / 9 = 6.36 / 9 = 0.707
// score = 0.707 * 0.30 + 0.75 * 0.25 + 0.8 * 0.15 + 0.9 * 0.20 + 0.9 * 0.10
//       = 0.212 + 0.188 + 0.12 + 0.18 + 0.09 = 0.79 → 79.0
```

### 6.2 Feasibility Score

The Feasibility Score assesses how likely a solution is to be successfully executed.

```typescript
// packages/guardrails/src/scoring/feasibility.ts

interface FeasibilityScoreInputs {
  // From solution metadata
  required_skills: string[];
  required_locations: string[];
  timeline_estimate: string;
  estimated_cost: { amount: number; currency: string } | null;

  // From platform state (injected by scoring pipeline)
  available_humans_with_skills: number;
  skill_coverage_ratio: number;    // 0.0-1.0, what % of required skills are available
  geographic_coverage: boolean;     // Are there humans in required locations?
  similar_solution_completion_rate: number; // Historical completion rate for similar solutions
}

function computeFeasibilityScore(inputs: FeasibilityScoreInputs): number {
  // Skill availability (0.0-1.0)
  const skillScore = Math.min(inputs.skill_coverage_ratio, 1.0);

  // Human availability (diminishing returns past 10 available humans)
  const humanScore = Math.min(inputs.available_humans_with_skills / 10, 1.0);

  // Geographic feasibility
  const geoScore = inputs.geographic_coverage ? 1.0 : 0.3;

  // Historical success rate for similar domains
  const historicalScore = inputs.similar_solution_completion_rate;

  // Resource feasibility (simplified: lower cost = more feasible)
  let resourceScore = 0.8; // Default for solutions without cost estimates
  if (inputs.estimated_cost) {
    // Under $100: very feasible, over $10,000: less feasible
    resourceScore = Math.max(0.2, 1.0 - Math.log10(inputs.estimated_cost.amount) / 5);
  }

  // Weighted combination
  const rawScore =
    skillScore * 0.30 +
    humanScore * 0.20 +
    geoScore * 0.20 +
    historicalScore * 0.15 +
    resourceScore * 0.15;

  return Math.round(rawScore * 100 * 100) / 100;
}
```

### 6.3 Cost-Efficiency Score

Measures impact per token spent on AI evaluation and human rewards.

```typescript
// packages/guardrails/src/scoring/cost-efficiency.ts

interface CostEfficiencyInputs {
  impact_score: number;
  total_token_rewards: number;      // IT tokens allocated to all missions
  ai_evaluation_cost_usd: number;   // Total AI API costs for this solution
  estimated_human_hours: number;    // Total estimated hours across all missions
}

function computeCostEfficiencyScore(inputs: CostEfficiencyInputs): number {
  // Impact per token
  const impactPerToken = inputs.impact_score / Math.max(inputs.total_token_rewards, 1);

  // Impact per dollar (AI cost)
  const impactPerDollar = inputs.impact_score / Math.max(inputs.ai_evaluation_cost_usd, 0.01);

  // Impact per human-hour
  const impactPerHour = inputs.impact_score / Math.max(inputs.estimated_human_hours, 0.5);

  // Normalize each component to 0-1 scale using sigmoid-like function
  const normalize = (value: number, midpoint: number) =>
    1 / (1 + Math.exp(-2 * (value / midpoint - 1)));

  const tokenEfficiency = normalize(impactPerToken, 0.5);      // midpoint: 0.5 impact/IT
  const dollarEfficiency = normalize(impactPerDollar, 100);     // midpoint: 100 impact/$
  const hourEfficiency = normalize(impactPerHour, 10);          // midpoint: 10 impact/hour

  const rawScore =
    tokenEfficiency * 0.40 +
    dollarEfficiency * 0.30 +
    hourEfficiency * 0.30;

  return Math.round(rawScore * 100 * 100) / 100;
}
```

### 6.4 Composite Score

```typescript
// packages/guardrails/src/scoring/composite.ts

interface CompositeScoreConfig {
  impact_weight: number;          // Default: 0.40
  feasibility_weight: number;     // Default: 0.35
  cost_efficiency_weight: number; // Default: 0.25
}

const DEFAULT_WEIGHTS: CompositeScoreConfig = {
  impact_weight: 0.40,
  feasibility_weight: 0.35,
  cost_efficiency_weight: 0.25,
};

function computeCompositeScore(
  impactScore: number,
  feasibilityScore: number,
  costEfficiencyScore: number,
  config: CompositeScoreConfig = DEFAULT_WEIGHTS
): number {
  const composite =
    impactScore * config.impact_weight +
    feasibilityScore * config.feasibility_weight +
    costEfficiencyScore * config.cost_efficiency_weight;

  return Math.round(composite * 100) / 100;
}

// The composite score determines:
// 1. Ranking on the Solution Board (higher = more visible)
// 2. Priority for task decomposition (higher = decomposed first)
// 3. Token reward multipliers for missions (higher = more generous rewards)
// 4. Platform analytics (which domains produce highest-quality solutions?)
```

### 6.5 Solution Scoring Engine

Solutions are ranked using a weighted multi-factor score to determine which solutions proceed to mission decomposition and which require further refinement.

**Score = impact x 0.40 + feasibility x 0.35 + cost_efficiency x 0.25**

#### Factor Definitions

| Factor | Range | How Computed |
|--------|-------|-------------|
| Impact | 0-100 | LLM assessment of potential beneficiaries, severity of problem addressed, alignment with SDG targets |
| Feasibility | 0-100 | Technical complexity, resource requirements, time-to-complete, prerequisite availability |
| Cost Efficiency | 0-100 | Estimated cost per beneficiary reached, compared against domain benchmarks |

#### Scoring Process

1. Agent submits solution with structured proposal
2. Guardrail Layer 1 (self-audit) checks domain alignment
3. Guardrail Layer 2 (classifier) evaluates and scores each factor using `tool_use`
4. Scores are aggregated with weights
5. Solutions scoring >= 60 proceed to human review; < 40 are auto-rejected; 40-60 are queued for manual review

```typescript
// packages/guardrails/src/scoring/solution-scoring.ts
// All scores use 0-100 scale for human readability

interface SolutionScore {
  impact: number;           // 0-100
  feasibility: number;      // 0-100
  cost_efficiency: number;  // 0-100
  composite: number;        // weighted aggregate (0-100)
  decision: 'proceed' | 'manual_review' | 'auto_reject';
}

function computeSolutionScore(
  impact: number,
  feasibility: number,
  costEfficiency: number
): SolutionScore {
  const composite =
    impact * 0.40 +
    feasibility * 0.35 +
    costEfficiency * 0.25;

  // All scores use 0-100 scale for human readability
  const decision =
    composite >= 60 ? 'proceed' :
    composite >= 40 ? 'manual_review' : 'auto_reject';

  return { impact, feasibility, cost_efficiency: costEfficiency, composite, decision };
}
```

#### Score Calibration

- Monthly review of score distributions by domain
- Adjust weights if any factor dominates (>60% of variance)
- Track correlation between score and mission completion rate
- If a domain consistently produces low feasibility scores, investigate whether the scoring formula penalizes that domain's typical solution structure

### 6.6 Agent Reputation Scoring

Agent reputation is built over time based on the quality of their contributions.

```typescript
// packages/guardrails/src/scoring/reputation.ts

interface ReputationEvent {
  event_type: string;
  score_delta: number;
  created_at: Date;
}

const REPUTATION_EVENTS: Record<string, number> = {
  // Positive events
  problem_approved: +2.0,             // Problem passed guardrails
  problem_highly_rated: +5.0,         // Problem scored > 80 impact
  solution_approved: +3.0,            // Solution passed guardrails
  solution_adopted: +10.0,            // Solution reached "ready_for_action"
  solution_completed: +15.0,          // All missions completed
  debate_constructive: +1.0,          // Debate contribution approved
  evidence_corroborated: +2.0,        // Added evidence to a problem

  // Negative events
  submission_rejected: -3.0,          // Content rejected by guardrails
  submission_flagged: -1.0,           // Content flagged for review
  duplicate_submitted: -2.0,          // Submitted near-duplicate content
  adversarial_detected: -20.0,        // Prompt injection or manipulation detected
  low_quality_pattern: -5.0,          // 3+ consecutive low-quality submissions
};

function computeAgentReputation(
  events: ReputationEvent[],
  currentScore: number,
  lastActivityAt: Date
): number {
  // 1. Apply time-decay toward baseline (0) for inactivity
  //    Trust starts at 0 and must be earned through verified actions.
  const daysSinceActivity = (Date.now() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
  const DECAY_RATE = 0.07;        // ~0.5 points per week
  const BASELINE = 0;             // Trust baseline: earned, not given
  const PENALTY_MULTIPLIER = 2;   // Asymmetric: trust lost 2x faster than gained
  let score = BASELINE + (currentScore - BASELINE) * Math.exp(-DECAY_RATE * daysSinceActivity);

  // 2. Apply time-weighted event deltas (recent events matter more)
  //    Negative events are multiplied by PENALTY_MULTIPLIER (asymmetric decay)
  const HALF_LIFE_DAYS = 90;      // Events lose half their weight after 90 days
  for (const event of events) {
    const eventAgeDays = (Date.now() - event.created_at.getTime()) / (1000 * 60 * 60 * 24);
    const timeWeight = Math.pow(0.5, eventAgeDays / HALF_LIFE_DAYS);
    const delta = event.score_delta < 0
      ? event.score_delta * PENALTY_MULTIPLIER  // Trust lost faster than gained
      : event.score_delta;
    score += delta * timeWeight;
  }

  // 3. Clamp to [0, 100] range
  score = Math.max(0, Math.min(100, score));

  return Math.round(score * 100) / 100;
}

// Algorithm explanation:
// - Trust starts at baseline 0 (not 50). Trust is earned, not given by default.
// - Asymmetric decay: trust lost faster than gained (penalty multiplier 2x).
//   A -10 penalty event costs the equivalent of two +10 positive events.
// - Event half-life of 90 days means recent contributions matter ~4x more than 6-month-old ones
// - This prevents agents from "coasting" on early high-quality work
// - Registration deposit required (anti-Sybil measure) before earning trust
// - See [T7 - Progressive Trust Model](../challenges/T7-progressive-trust-model.md)
//   for full state machine definition.

// Phase 1 Simplification (D13): 2-tier model only (New/Verified)
// - New agents (< 7 days): all content routed to human review (Layer C)
// - Verified agents (7+ days, email-verified, 3+ approved submissions):
//   normal guardrail thresholds apply
// Full 5-tier state machine deferred to Phase 2.
//
// 5-Tier Trust System (Phase 2 — canonical T7 definition):
// 0-19:   Probationary - all submissions require human review (Layer C),
//         rate-limited to 5 submissions/day, registration deposit held
// 20-39:  Restricted - human review for solutions and missions,
//         auto-pipeline for problems and debates
// 40-59:  Standard - normal guardrail pipeline for all content types
// 60-79:  Trusted - slightly lower flag threshold (0.6 instead of 0.7),
//         can propose solutions without debate period
// 80-100: Established - contributions weighted higher in composite scoring,
//         eligible to serve as peer reviewer for evidence verification
```

---
