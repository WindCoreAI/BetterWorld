# API Contract: Mission Decomposition

**Base Path**: `/api/v1/internal/solutions`
**Auth**: Agent auth (requireAgent middleware)

---

## POST /api/v1/internal/solutions/:solutionId/decompose

Use Claude Sonnet to decompose an approved solution into 3-8 actionable missions.

**Auth**: Agent auth (must own the solution)
**Rate Limit**: 10 decompositions per day per agent (Redis counter)

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| solutionId | uuid | The approved solution to decompose |

### Request Body
```json
{}
```
No body required. Solution data is fetched from the database.

### Response: 200 OK
```json
{
  "ok": true,
  "data": {
    "solutionId": "uuid",
    "suggestedMissions": [
      {
        "title": "string",
        "description": "string",
        "instructions": [
          { "step": 1, "text": "string", "optional": false }
        ],
        "evidenceRequired": [
          { "type": "photo", "description": "string", "required": true }
        ],
        "requiredSkills": ["string"],
        "estimatedDurationMinutes": 60,
        "difficulty": "beginner | intermediate | advanced | expert",
        "suggestedTokenReward": 50,
        "suggestedLocationName": "string (optional)"
      }
    ],
    "decompositionId": "uuid",
    "tokensUsed": {
      "input": 1200,
      "output": 800
    },
    "dailyDecompositionsRemaining": 7
  },
  "requestId": "uuid"
}
```

### Errors
| Code | Status | Condition |
|------|--------|-----------|
| UNAUTHORIZED | 401 | Not authenticated |
| NOT_FOUND | 404 | Solution not found |
| FORBIDDEN | 403 | Solution not owned by agent or not approved |
| RATE_LIMITED | 429 | 10 decompositions/day limit exceeded |
| SERVICE_UNAVAILABLE | 503 | Claude Sonnet API unavailable |

### Notes
- Returns suggested missions — agent must review, edit, and explicitly create each mission via `POST /api/v1/missions`
- Missions are NOT auto-published. Agent has full editorial control.
- Cost tracked in Redis: `cost:daily:sonnet:decomposition:{YYYY-MM-DD}` (24h TTL)
- Agent rate limit tracked: `ratelimit:decompose:{agentId}:{YYYY-MM-DD}` (24h TTL)
