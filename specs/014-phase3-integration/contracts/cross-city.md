# Contract: Cross-City Comparison

**Base URL**: `/api/v1`
**Related Spec**: Sprint 13 — Phase 3 Integration (Cross-City Analytics)
**Dependencies**: City dashboards (Sprint 11), city-metrics worker (Sprint 11), Open311 ingestion (Sprint 10), problem_clusters (Sprint 10)

---

## Overview

Cross-city comparison provides normalized, per-capita metrics across all active cities in the BetterWorld network (Portland, Chicago, Denver). These endpoints enable side-by-side comparison of problem density, resolution speed, category distribution, and validator coverage. All data is pre-aggregated by the existing city-metrics worker and served from cached results.

### Population Data

Population data is stored in the city config as a static constant (updated periodically). Used for per-capita normalization.

| City | Population (est.) | Source |
|------|------------------|--------|
| Portland | 652,503 | US Census 2024 estimate |
| Chicago | 2,665,039 | US Census 2024 estimate |
| Denver | 715,522 | US Census 2024 estimate |

---

## GET /api/v1/city/compare

Get high-level comparison metrics across all active cities.

**Auth**: None (public endpoint)

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| period | string | No | 30d | Time period: `7d`, `30d`, `90d`, `all` |

**Zod Schema (Query)**:
```typescript
const CrossCityCompareQuerySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
});
```

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "period": "30d",
    "cities": [
      {
        "city": "portland",
        "displayName": "Portland, OR",
        "population": 652503,
        "metrics": {
          "totalProblems": 156,
          "problemsPerCapita": 0.000239,
          "totalObservations": 89,
          "avgResolutionTimeDays": 12.5,
          "activeValidators": 8,
          "validatorsPerCapita": 0.0000123,
          "activeMissions": 23,
          "completedMissions": 67,
          "missionCompletionRate": 0.74,
          "totalAttestations": 45
        }
      },
      {
        "city": "chicago",
        "displayName": "Chicago, IL",
        "population": 2665039,
        "metrics": {
          "totalProblems": 234,
          "problemsPerCapita": 0.0000878,
          "totalObservations": 145,
          "avgResolutionTimeDays": 18.2,
          "activeValidators": 12,
          "validatorsPerCapita": 0.0000045,
          "activeMissions": 34,
          "completedMissions": 89,
          "missionCompletionRate": 0.72,
          "totalAttestations": 62
        }
      },
      {
        "city": "denver",
        "displayName": "City and County of Denver",
        "population": 715522,
        "metrics": {
          "totalProblems": 42,
          "problemsPerCapita": 0.0000589,
          "totalObservations": 18,
          "avgResolutionTimeDays": null,
          "activeValidators": 3,
          "validatorsPerCapita": 0.0000042,
          "activeMissions": 5,
          "completedMissions": 2,
          "missionCompletionRate": 0.29,
          "totalAttestations": 8
        }
      }
    ],
    "lastAggregatedAt": "2026-02-13T06:00:00Z"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const CityCompareMetricsSchema = z.object({
  totalProblems: z.number().int().min(0),
  problemsPerCapita: z.number().min(0),
  totalObservations: z.number().int().min(0),
  avgResolutionTimeDays: z.number().min(0).nullable(),
  activeValidators: z.number().int().min(0),
  validatorsPerCapita: z.number().min(0),
  activeMissions: z.number().int().min(0),
  completedMissions: z.number().int().min(0),
  missionCompletionRate: z.number().min(0).max(1),
  totalAttestations: z.number().int().min(0),
});

const CityCompareItemSchema = z.object({
  city: z.string(),
  displayName: z.string(),
  population: z.number().int().min(0),
  metrics: CityCompareMetricsSchema,
});

const CrossCityCompareResponseSchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]),
  cities: z.array(CityCompareItemSchema),
  lastAggregatedAt: z.string().datetime(),
});
```

### Notes

- Cities with no data yet (e.g., recently added Denver) still appear with zero or null metrics
- `avgResolutionTimeDays` is `null` if no problems have been resolved in the period
- `missionCompletionRate` = `completedMissions / (completedMissions + activeMissions)`, or 0 if no missions
- Data is served from the city-metrics worker cache (refreshed daily at 6:00 AM UTC)

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid period parameter |

---

## GET /api/v1/city/compare/:metric

Get a detailed breakdown for a specific metric across all cities. Enables deeper drill-down into a single dimension.

**Auth**: None (public endpoint)

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| metric | string | One of: `problems_per_capita`, `resolution_time`, `category_distribution`, `validator_density` |

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| period | string | No | 30d | Time period: `7d`, `30d`, `90d`, `all` |

**Zod Schema (Params + Query)**:
```typescript
const MetricCompareParamsSchema = z.object({
  metric: z.enum([
    "problems_per_capita",
    "resolution_time",
    "category_distribution",
    "validator_density",
  ]),
});

const MetricCompareQuerySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
});
```

### Response: `problems_per_capita`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "metric": "problems_per_capita",
    "period": "30d",
    "cities": [
      {
        "city": "portland",
        "displayName": "Portland, OR",
        "population": 652503,
        "totalProblems": 156,
        "problemsPerCapita": 0.000239,
        "trend": [
          { "date": "2026-02-13", "count": 8, "perCapita": 0.0000123 },
          { "date": "2026-02-12", "count": 12, "perCapita": 0.0000184 },
          { "date": "2026-02-11", "count": 5, "perCapita": 0.0000077 }
        ]
      },
      {
        "city": "chicago",
        "displayName": "Chicago, IL",
        "population": 2665039,
        "totalProblems": 234,
        "problemsPerCapita": 0.0000878,
        "trend": [
          { "date": "2026-02-13", "count": 15, "perCapita": 0.0000056 },
          { "date": "2026-02-12", "count": 10, "perCapita": 0.0000038 },
          { "date": "2026-02-11", "count": 11, "perCapita": 0.0000041 }
        ]
      },
      {
        "city": "denver",
        "displayName": "City and County of Denver",
        "population": 715522,
        "totalProblems": 42,
        "problemsPerCapita": 0.0000589,
        "trend": [
          { "date": "2026-02-13", "count": 3, "perCapita": 0.0000042 },
          { "date": "2026-02-12", "count": 5, "perCapita": 0.0000070 }
        ]
      }
    ]
  },
  "requestId": "uuid"
}
```

### Response: `resolution_time`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "metric": "resolution_time",
    "period": "30d",
    "cities": [
      {
        "city": "portland",
        "displayName": "Portland, OR",
        "avgDays": 12.5,
        "medianDays": 10.0,
        "p95Days": 28.0,
        "resolvedCount": 89,
        "byDomain": [
          { "domain": "environmental_protection", "avgDays": 8.2, "count": 34 },
          { "domain": "community_building", "avgDays": 15.1, "count": 22 },
          { "domain": "clean_water_sanitation", "avgDays": 18.5, "count": 12 }
        ]
      },
      {
        "city": "chicago",
        "displayName": "Chicago, IL",
        "avgDays": 18.2,
        "medianDays": 15.0,
        "p95Days": 42.0,
        "resolvedCount": 134,
        "byDomain": [
          { "domain": "environmental_protection", "avgDays": 12.4, "count": 56 },
          { "domain": "healthcare_improvement", "avgDays": 22.0, "count": 18 },
          { "domain": "community_building", "avgDays": 20.3, "count": 28 }
        ]
      },
      {
        "city": "denver",
        "displayName": "City and County of Denver",
        "avgDays": null,
        "medianDays": null,
        "p95Days": null,
        "resolvedCount": 0,
        "byDomain": []
      }
    ]
  },
  "requestId": "uuid"
}
```

### Response: `category_distribution`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "metric": "category_distribution",
    "period": "30d",
    "cities": [
      {
        "city": "portland",
        "displayName": "Portland, OR",
        "totalProblems": 156,
        "categories": [
          { "domain": "environmental_protection", "count": 52, "percentage": 0.333 },
          { "domain": "community_building", "count": 38, "percentage": 0.244 },
          { "domain": "clean_water_sanitation", "count": 22, "percentage": 0.141 },
          { "domain": "healthcare_improvement", "count": 18, "percentage": 0.115 },
          { "domain": "food_security", "count": 12, "percentage": 0.077 },
          { "domain": "digital_inclusion", "count": 8, "percentage": 0.051 },
          { "domain": "poverty_reduction", "count": 6, "percentage": 0.038 }
        ]
      },
      {
        "city": "chicago",
        "displayName": "Chicago, IL",
        "totalProblems": 234,
        "categories": [
          { "domain": "environmental_protection", "count": 78, "percentage": 0.333 },
          { "domain": "healthcare_improvement", "count": 45, "percentage": 0.192 },
          { "domain": "community_building", "count": 40, "percentage": 0.171 },
          { "domain": "clean_water_sanitation", "count": 32, "percentage": 0.137 },
          { "domain": "food_security", "count": 20, "percentage": 0.085 },
          { "domain": "poverty_reduction", "count": 12, "percentage": 0.051 },
          { "domain": "digital_inclusion", "count": 7, "percentage": 0.030 }
        ]
      },
      {
        "city": "denver",
        "displayName": "City and County of Denver",
        "totalProblems": 42,
        "categories": [
          { "domain": "environmental_protection", "count": 20, "percentage": 0.476 },
          { "domain": "community_building", "count": 10, "percentage": 0.238 },
          { "domain": "clean_water_sanitation", "count": 8, "percentage": 0.190 },
          { "domain": "healthcare_improvement", "count": 4, "percentage": 0.095 }
        ]
      }
    ]
  },
  "requestId": "uuid"
}
```

### Response: `validator_density`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "metric": "validator_density",
    "period": "30d",
    "cities": [
      {
        "city": "portland",
        "displayName": "Portland, OR",
        "population": 652503,
        "activeValidators": 8,
        "validatorsPerCapita": 0.0000123,
        "byTier": {
          "apprentice": 3,
          "journeyman": 4,
          "expert": 1
        },
        "avgResponseRate": 0.92,
        "avgF1Score": 0.8450,
        "specialistCount": 3
      },
      {
        "city": "chicago",
        "displayName": "Chicago, IL",
        "population": 2665039,
        "activeValidators": 12,
        "validatorsPerCapita": 0.0000045,
        "byTier": {
          "apprentice": 5,
          "journeyman": 5,
          "expert": 2
        },
        "avgResponseRate": 0.88,
        "avgF1Score": 0.8120,
        "specialistCount": 4
      },
      {
        "city": "denver",
        "displayName": "City and County of Denver",
        "population": 715522,
        "activeValidators": 3,
        "validatorsPerCapita": 0.0000042,
        "byTier": {
          "apprentice": 2,
          "journeyman": 1,
          "expert": 0
        },
        "avgResponseRate": 0.95,
        "avgF1Score": 0.7800,
        "specialistCount": 0
      }
    ]
  },
  "requestId": "uuid"
}
```

### Zod Schemas (All Metric Responses)

```typescript
// problems_per_capita
const ProblemsPerCapitaCitySchema = z.object({
  city: z.string(),
  displayName: z.string(),
  population: z.number().int(),
  totalProblems: z.number().int().min(0),
  problemsPerCapita: z.number().min(0),
  trend: z.array(z.object({
    date: z.string(),
    count: z.number().int().min(0),
    perCapita: z.number().min(0),
  })),
});

// resolution_time
const ResolutionTimeDomainSchema = z.object({
  domain: z.string(),
  avgDays: z.number().min(0),
  count: z.number().int().min(0),
});

const ResolutionTimeCitySchema = z.object({
  city: z.string(),
  displayName: z.string(),
  avgDays: z.number().min(0).nullable(),
  medianDays: z.number().min(0).nullable(),
  p95Days: z.number().min(0).nullable(),
  resolvedCount: z.number().int().min(0),
  byDomain: z.array(ResolutionTimeDomainSchema),
});

// category_distribution
const CategoryItemSchema = z.object({
  domain: z.string(),
  count: z.number().int().min(0),
  percentage: z.number().min(0).max(1),
});

const CategoryDistributionCitySchema = z.object({
  city: z.string(),
  displayName: z.string(),
  totalProblems: z.number().int().min(0),
  categories: z.array(CategoryItemSchema),
});

// validator_density
const ValidatorDensityCitySchema = z.object({
  city: z.string(),
  displayName: z.string(),
  population: z.number().int(),
  activeValidators: z.number().int().min(0),
  validatorsPerCapita: z.number().min(0),
  byTier: z.object({
    apprentice: z.number().int().min(0),
    journeyman: z.number().int().min(0),
    expert: z.number().int().min(0),
  }),
  avgResponseRate: z.number().min(0).max(1),
  avgF1Score: z.number().min(0).max(1),
  specialistCount: z.number().int().min(0),
});

// Generic wrapper for all metric responses
const MetricCompareResponseSchema = z.object({
  metric: z.enum(["problems_per_capita", "resolution_time", "category_distribution", "validator_density"]),
  period: z.enum(["7d", "30d", "90d", "all"]).optional(),
  cities: z.array(z.unknown()), // Shape depends on metric
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid metric or period parameter |
| 404 | `NOT_FOUND` | Unknown metric name |

**Error Response** `404`:
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Unknown metric: 'unknown_metric'. Valid metrics: problems_per_capita, resolution_time, category_distribution, validator_density"
  },
  "requestId": "uuid"
}
```
