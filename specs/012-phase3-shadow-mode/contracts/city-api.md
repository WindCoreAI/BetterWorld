# API Contract: City Dashboards

**Base path**: `/api/v1/city`
**Auth**: None (public endpoints)

---

## GET /api/v1/city/:city/metrics

Get pre-aggregated city dashboard metrics.

**Auth**: None (public endpoint)

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| city | string | City identifier (e.g., "portland", "chicago") |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "city": "portland",
    "displayName": "Portland, OR",
    "metrics": {
      "problemsByCategory": [
        { "domain": "environmental_protection", "count": 45 },
        { "domain": "community_building", "count": 32 },
        { "domain": "clean_water_sanitation", "count": 18 }
      ],
      "avgResolutionTimeDays": 12.5,
      "activeLocalValidators": 8,
      "totalProblems": 156,
      "totalObservations": 89
    },
    "heatmap": [
      { "lat": 45.5152, "lng": -122.6784, "intensity": 0.8 },
      { "lat": 45.5231, "lng": -122.6765, "intensity": 0.5 }
    ],
    "lastAggregatedAt": "2026-02-11T06:00:00Z"
  },
  "requestId": "uuid"
}
```

**Response** `404` (unknown city):
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "City 'seattle' is not configured for local dashboard"
  },
  "requestId": "uuid"
}
```

---

## GET /api/v1/city/list

List available cities for local dashboards.

**Auth**: None (public endpoint)

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "cities": [
      {
        "id": "portland",
        "displayName": "Portland, OR",
        "center": { "lat": 45.5152, "lng": -122.6784 },
        "totalProblems": 156
      },
      {
        "id": "chicago",
        "displayName": "Chicago, IL",
        "center": { "lat": 41.8781, "lng": -87.6298 },
        "totalProblems": 234
      }
    ]
  },
  "requestId": "uuid"
}
```
