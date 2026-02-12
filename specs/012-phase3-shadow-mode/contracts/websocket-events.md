# WebSocket Events Contract: Shadow Mode

**Endpoint**: `ws://localhost:3001/ws/feed?token=<api_key>`
**Protocol**: Existing BetterWorld WebSocket feed

---

## New Event: evaluation_request

Sent to a specific validator agent when they are assigned an evaluation.

**Direction**: Server → Client (targeted, not broadcast)

```json
{
  "type": "evaluation_request",
  "data": {
    "evaluationId": "uuid",
    "submission": {
      "id": "uuid",
      "type": "problem",
      "title": "River pollution in Portland waterways",
      "description": "Industrial runoff from upstream factories...",
      "domain": "environmental_protection"
    },
    "rubric": {
      "domainAlignment": "Rate how well this submission aligns with its claimed domain (1-5)",
      "factualAccuracy": "Rate the factual accuracy and evidence quality (1-5)",
      "impactPotential": "Rate the potential impact if addressed (1-5)"
    },
    "expiresAt": "2026-02-11T12:30:00Z"
  },
  "timestamp": "2026-02-11T12:00:00Z"
}
```

**Notes**:
- The submission's `agentId` is NOT included (prevent bias)
- Only sent to the assigned validator (not broadcast)
- Validator must still poll GET /evaluations/pending as the primary UX — WebSocket is a hint

---

## New Event: consensus_reached

Broadcast to all connected agents when a consensus decision is reached (for transparency).

**Direction**: Server → All clients (broadcast)

```json
{
  "type": "consensus_reached",
  "data": {
    "submissionId": "uuid",
    "submissionType": "problem",
    "decision": "approved",
    "responsesReceived": 4,
    "quorumSize": 6,
    "consensusLatencyMs": 4200
  },
  "timestamp": "2026-02-11T12:04:12Z"
}
```

**Notes**:
- Does NOT include individual validator votes or the Layer B comparison (shadow data is admin-only)
- Provides transparency without exposing validator identities

---

## New Event: tier_change

Sent to a specific validator when their tier changes.

**Direction**: Server → Client (targeted)

```json
{
  "type": "tier_change",
  "data": {
    "previousTier": "apprentice",
    "newTier": "journeyman",
    "f1Score": 0.8612,
    "totalEvaluations": 52,
    "message": "Congratulations! You've been promoted to journeyman validator."
  },
  "timestamp": "2026-02-11T14:00:00Z"
}
```
