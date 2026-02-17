# API Contract: Learning Pathways & Case Studies

**Base Path**: `/api/v1`
**Auth**: `humanAuth()` for mutations; public read for published case studies

## Learning Pathway Endpoints

### POST /learning-pathways/:domain/enroll

Enroll in a domain learning pathway.

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "humanId": "uuid",
    "domain": "clean_water_sanitation",
    "currentLevel": "observer",
    "progressPercent": 0,
    "enrolledAt": "ISO8601"
  }
}
```

**Errors**: `409` if already enrolled in this domain.

### GET /learning-pathways/me

Get all pathways the current user is enrolled in.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "pathways": [
      {
        "id": "uuid",
        "domain": "clean_water_sanitation",
        "currentLevel": "practitioner",
        "progressPercent": 65,
        "missionsCompleted": 4,
        "peerReviewsCompleted": 3,
        "caseStudiesRead": 2,
        "enrolledAt": "ISO8601",
        "levelReachedAt": "ISO8601"
      }
    ]
  }
}
```

### GET /learning-pathways/:domain/progress

Get detailed progress for a specific domain pathway.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "domain": "clean_water_sanitation",
    "currentLevel": "practitioner",
    "progressPercent": 65,
    "levels": [
      {
        "level": "observer",
        "status": "completed",
        "requirements": [
          { "type": "missions_completed", "target": 2, "current": 2, "done": true },
          { "type": "case_studies_read", "target": 2, "current": 2, "done": true }
        ]
      },
      {
        "level": "practitioner",
        "status": "in_progress",
        "requirements": [
          { "type": "missions_completed", "target": 5, "current": 4, "done": false },
          { "type": "mission_types_count", "target": 3, "current": 3, "done": true },
          { "type": "peer_reviews_completed", "target": 5, "current": 3, "done": false },
          { "type": "evidence_submitted", "target": 1, "current": 1, "done": true }
        ]
      },
      {
        "level": "specialist_candidate",
        "status": "locked",
        "requirements": [
          { "type": "cross_city_missions", "target": 1, "current": 0, "done": false },
          { "type": "review_accuracy", "target": 0.75, "current": 0.68, "done": false },
          { "type": "debates_participated", "target": 1, "current": 0, "done": false }
        ]
      },
      {
        "level": "specialist",
        "status": "locked",
        "requirements": [
          { "type": "f1_score", "target": 0.80, "current": 0.68, "done": false }
        ]
      }
    ]
  }
}
```

### POST /learning-pathways/:domain/case-studies/:caseStudyId/mark-read

Mark a case study as read for pathway progress.

**Response** `200`:
```json
{
  "ok": true,
  "data": { "caseStudiesRead": 3, "progressUpdated": true }
}
```

## Case Study Endpoints

### GET /case-studies

Browse published case studies.

**Auth**: Public (no auth required).

**Query**: `?domain=string&cursor=string&limit=20`

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "caseStudies": [
      {
        "id": "uuid",
        "missionId": "uuid",
        "domain": "clean_water_sanitation",
        "title": "string",
        "summary": "string",
        "contributorCount": 3,
        "readCount": 42,
        "publishedAt": "ISO8601"
      }
    ],
    "nextCursor": "string|null"
  }
}
```

### GET /case-studies/:id

Get full case study details.

**Auth**: Public.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "missionId": "uuid",
    "domain": "clean_water_sanitation",
    "title": "string",
    "summary": "string",
    "context": "string",
    "approach": "string",
    "evidenceQuality": "string",
    "keyLearnings": "string",
    "contributors": [
      {
        "humanId": "uuid",
        "displayName": "string",
        "tier": "string",
        "role": "claimer|buddy|helper"
      }
    ],
    "readCount": 42,
    "publishedAt": "ISO8601"
  }
}
```

### GET /admin/case-studies/drafts

Admin: Get draft case studies awaiting review.

**Auth**: Admin only.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "drafts": [
      {
        "id": "uuid",
        "missionId": "uuid",
        "domain": "string",
        "title": "string",
        "summary": "string",
        "createdAt": "ISO8601"
      }
    ]
  }
}
```

### POST /admin/case-studies/:id/publish

Admin: Publish a draft case study.

**Auth**: Admin only.

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "status": "published",
    "publishedAt": "ISO8601"
  }
}
```

**Side Effects**: Visible on domain page. Contributors earn 2 teaching tokens each.
