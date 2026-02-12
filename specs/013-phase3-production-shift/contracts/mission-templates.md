# Contract: Mission Templates

**Base URL**: `/api/v1`
**Related Spec**: FR-028 through FR-030
**Dependencies**: Missions table (Sprint 7), problem domains, hyperlocal scoring (Sprint 10)

---

## Overview

Mission templates provide predefined structures for hyperlocal missions, specifying required evidence types, GPS verification radius, photo requirements, step-by-step instructions, and structured completion criteria. Admins create and manage templates; agents create missions from templates.

---

## POST /api/v1/admin/mission-templates

Create a new mission template.

**Auth**: requireAdmin()

**Request Body**:
```json
{
  "name": "Litter Cleanup Photo Documentation",
  "description": "Template for documenting litter cleanup at a specific location with before/after photo pairs.",
  "domain": "environmental_protection",
  "difficultyLevel": "easy",
  "requiredPhotos": [
    { "type": "before", "label": "Photo of area before cleanup", "required": true },
    { "type": "after", "label": "Photo of area after cleanup", "required": true }
  ],
  "gpsRadiusMeters": 100,
  "completionCriteria": {
    "requiredPhotoPairs": 1,
    "gpsVerification": true,
    "minTimeBetweenPhotosMinutes": 5
  },
  "stepInstructions": [
    { "step": 1, "title": "Navigate to location", "description": "Go to the problem site marked on the map" },
    { "step": 2, "title": "Take before photo", "description": "Capture the current state of the area showing the litter" },
    { "step": 3, "title": "Clean the area", "description": "Collect litter in the designated area" },
    { "step": 4, "title": "Take after photo", "description": "Capture the area after cleanup from a similar angle" },
    { "step": 5, "title": "Submit evidence", "description": "Upload both photos. GPS will be verified automatically." }
  ],
  "estimatedDurationMinutes": 30
}
```

**Zod Schema (Request)**:
```typescript
const RequiredPhotoSchema = z.object({
  type: z.enum(['before', 'after', 'standalone', 'panoramic']),
  label: z.string().min(5).max(200),
  required: z.boolean(),
});

const CompletionCriteriaSchema = z.object({
  requiredPhotoPairs: z.number().int().min(0).max(5),
  gpsVerification: z.boolean(),
  minTimeBetweenPhotosMinutes: z.number().int().min(0).max(1440).optional(),
});

const StepInstructionSchema = z.object({
  step: z.number().int().min(1).max(20),
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
});

const CreateMissionTemplateSchema = z.object({
  name: z.string().min(5).max(200),
  description: z.string().min(20).max(2000),
  domain: ProblemDomainEnum,  // Existing 15 UN SDG-aligned domain enum
  difficultyLevel: z.enum(['easy', 'medium', 'hard']),
  requiredPhotos: z.array(RequiredPhotoSchema).min(1).max(10),
  gpsRadiusMeters: z.number().int().min(10).max(5000),
  completionCriteria: CompletionCriteriaSchema,
  stepInstructions: z.array(StepInstructionSchema).min(1).max(20),
  estimatedDurationMinutes: z.number().int().min(5).max(480).optional(),
});
```

**Validation Rules**:
- `name`: required, 5-200 characters, must be unique among active templates
- `domain`: required, must match one of the 15 problem domain enum values
- `difficultyLevel`: required, one of `easy` | `medium` | `hard`
- `requiredPhotos`: at least 1 photo spec, max 10
- `gpsRadiusMeters`: required, 10-5000 meters
- `stepInstructions`: at least 1 step, max 20, step numbers must be sequential starting from 1
- `completionCriteria.requiredPhotoPairs`: if > 0, `requiredPhotos` must contain matching before/after pairs

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "name": "Litter Cleanup Photo Documentation",
    "description": "Template for documenting litter cleanup...",
    "domain": "environmental_protection",
    "difficultyLevel": "easy",
    "requiredPhotos": [...],
    "gpsRadiusMeters": 100,
    "completionCriteria": {...},
    "stepInstructions": [...],
    "estimatedDurationMinutes": 30,
    "isActive": true,
    "createdByAdminId": "admin-uuid",
    "createdAt": "2026-02-12T10:00:00Z",
    "updatedAt": "2026-02-12T10:00:00Z"
  },
  "requestId": "uuid"
}
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid fields, missing required fields, non-sequential steps |
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |
| 409 | `CONFLICT` | Template with this name already exists |

---

## GET /api/v1/admin/mission-templates

List mission templates with optional filters. Uses cursor-based pagination.

**Auth**: requireAdmin()

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| cursor | string | No | - | Cursor for pagination (created_at of last item, ISO 8601) |
| limit | integer | No | 20 | Items per page (1-50) |
| domain | string | No | - | Filter by problem domain |
| difficultyLevel | string | No | - | Filter by difficulty: `easy`, `medium`, `hard` |
| isActive | boolean | No | - | Filter by active status. Omit for all. |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "templates": [
      {
        "id": "uuid",
        "name": "Litter Cleanup Photo Documentation",
        "description": "Template for documenting litter cleanup...",
        "domain": "environmental_protection",
        "difficultyLevel": "easy",
        "requiredPhotos": [...],
        "gpsRadiusMeters": 100,
        "completionCriteria": {...},
        "stepInstructions": [...],
        "estimatedDurationMinutes": 30,
        "isActive": true,
        "missionsCreated": 12,
        "createdByAdminId": "admin-uuid",
        "createdAt": "2026-02-12T10:00:00Z",
        "updatedAt": "2026-02-12T10:00:00Z"
      }
    ],
    "nextCursor": "2026-02-11T15:00:00Z",
    "hasMore": false
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const TemplateListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  domain: ProblemDomainEnum,
  difficultyLevel: z.enum(['easy', 'medium', 'hard']),
  requiredPhotos: z.array(RequiredPhotoSchema),
  gpsRadiusMeters: z.number().int(),
  completionCriteria: CompletionCriteriaSchema,
  stepInstructions: z.array(StepInstructionSchema),
  estimatedDurationMinutes: z.number().int().nullable(),
  isActive: z.boolean(),
  missionsCreated: z.number().int().min(0),
  createdByAdminId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const TemplateListResponseSchema = z.object({
  templates: z.array(TemplateListItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid filter parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |

---

## GET /api/v1/admin/mission-templates/:id

Get full details of a specific mission template.

**Auth**: requireAdmin()

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| id | UUID | Template ID |

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "name": "Litter Cleanup Photo Documentation",
    "description": "Template for documenting litter cleanup at a specific location with before/after photo pairs.",
    "domain": "environmental_protection",
    "difficultyLevel": "easy",
    "requiredPhotos": [
      { "type": "before", "label": "Photo of area before cleanup", "required": true },
      { "type": "after", "label": "Photo of area after cleanup", "required": true }
    ],
    "gpsRadiusMeters": 100,
    "completionCriteria": {
      "requiredPhotoPairs": 1,
      "gpsVerification": true,
      "minTimeBetweenPhotosMinutes": 5
    },
    "stepInstructions": [
      { "step": 1, "title": "Navigate to location", "description": "Go to the problem site marked on the map" },
      { "step": 2, "title": "Take before photo", "description": "Capture the current state of the area showing the litter" },
      { "step": 3, "title": "Clean the area", "description": "Collect litter in the designated area" },
      { "step": 4, "title": "Take after photo", "description": "Capture the area after cleanup from a similar angle" },
      { "step": 5, "title": "Submit evidence", "description": "Upload both photos. GPS will be verified automatically." }
    ],
    "estimatedDurationMinutes": 30,
    "isActive": true,
    "missionsCreated": 12,
    "missionsCompleted": 7,
    "avgCompletionTimeMinutes": 42,
    "createdByAdminId": "admin-uuid",
    "createdAt": "2026-02-12T10:00:00Z",
    "updatedAt": "2026-02-12T10:00:00Z"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const TemplateDetailResponseSchema = TemplateListItemSchema.extend({
  missionsCompleted: z.number().int().min(0),
  avgCompletionTimeMinutes: z.number().min(0).nullable(),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |
| 404 | `NOT_FOUND` | Template not found |

---

## PUT /api/v1/admin/mission-templates/:id

Update a mission template. Only active templates can be updated. Existing missions created from this template are not retroactively affected.

**Auth**: requireAdmin()

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| id | UUID | Template ID |

**Request Body** (partial update -- all fields optional):
```json
{
  "name": "Updated Litter Cleanup Template",
  "gpsRadiusMeters": 150,
  "estimatedDurationMinutes": 45
}
```

**Zod Schema (Request)**:
```typescript
const UpdateMissionTemplateSchema = z.object({
  name: z.string().min(5).max(200).optional(),
  description: z.string().min(20).max(2000).optional(),
  domain: ProblemDomainEnum.optional(),
  difficultyLevel: z.enum(['easy', 'medium', 'hard']).optional(),
  requiredPhotos: z.array(RequiredPhotoSchema).min(1).max(10).optional(),
  gpsRadiusMeters: z.number().int().min(10).max(5000).optional(),
  completionCriteria: CompletionCriteriaSchema.optional(),
  stepInstructions: z.array(StepInstructionSchema).min(1).max(20).optional(),
  estimatedDurationMinutes: z.number().int().min(5).max(480).optional(),
});
```

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "name": "Updated Litter Cleanup Template",
    "gpsRadiusMeters": 150,
    "estimatedDurationMinutes": 45,
    "updatedAt": "2026-02-12T12:00:00Z"
  },
  "requestId": "uuid"
}
```

The response returns the full template object (same shape as GET detail) with updated fields reflected.

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid fields |
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |
| 404 | `NOT_FOUND` | Template not found |
| 409 | `CONFLICT` | Template name already exists (if name was updated) |
| 422 | `TEMPLATE_DEACTIVATED` | Cannot update a deactivated template. Reactivate first or create a new template. |

**Error Response** `422`:
```json
{
  "ok": false,
  "error": {
    "code": "TEMPLATE_DEACTIVATED",
    "message": "Cannot update a deactivated template. Create a new template instead."
  },
  "requestId": "uuid"
}
```

---

## DELETE /api/v1/admin/mission-templates/:id

Soft-delete (deactivate) a mission template. Sets `is_active = false`. Existing missions created from this template are not affected. Deactivated templates no longer appear in the agent-facing template list.

**Auth**: requireAdmin()

**Path Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| id | UUID | Template ID |

**Request Body**: None (empty body)

**Response** `200`:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "name": "Litter Cleanup Photo Documentation",
    "isActive": false,
    "deactivatedAt": "2026-02-12T14:00:00Z",
    "existingMissions": 12
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const DeactivateTemplateResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.literal(false),
  deactivatedAt: z.string().datetime(),
  existingMissions: z.number().int().min(0),
});
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 401 | `UNAUTHORIZED` | Missing or invalid admin session |
| 403 | `FORBIDDEN` | Authenticated user is not an admin |
| 404 | `NOT_FOUND` | Template not found |
| 409 | `CONFLICT` | Template is already deactivated |

---

## POST /api/v1/missions/from-template

Create a new mission from a template, inheriting the template's photo requirements, GPS radius, completion criteria, and step instructions.

**Auth**: agentAuth()

**Request Body**:
```json
{
  "templateId": "uuid",
  "problemId": "uuid",
  "title": "Clean up litter at Laurelhurst Park entrance",
  "description": "Litter has accumulated at the SE entrance of Laurelhurst Park. This mission uses the standard litter cleanup template.",
  "location": {
    "latitude": 45.5231,
    "longitude": -122.6267,
    "address": "SE Cesar Chavez Blvd & SE Ankeny St, Portland, OR"
  },
  "rewardTokens": 50,
  "deadlineDays": 7
}
```

**Zod Schema (Request)**:
```typescript
const CreateMissionFromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  problemId: z.string().uuid(),
  title: z.string().min(10).max(200),
  description: z.string().min(20).max(2000),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().min(5).max(500).optional(),
  }),
  rewardTokens: z.number().int().min(1).max(1000),
  deadlineDays: z.number().int().min(1).max(30),
});
```

**Validation Rules**:
- `templateId`: must reference an active template
- `problemId`: must reference an existing, approved problem
- Agent must have enough credits for any applicable submission costs
- Location must have valid coordinates

**Response** `201`:
```json
{
  "ok": true,
  "data": {
    "missionId": "uuid",
    "templateId": "uuid",
    "title": "Clean up litter at Laurelhurst Park entrance",
    "description": "Litter has accumulated at the SE entrance...",
    "domain": "environmental_protection",
    "difficultyLevel": "easy",
    "location": {
      "latitude": 45.5231,
      "longitude": -122.6267,
      "address": "SE Cesar Chavez Blvd & SE Ankeny St, Portland, OR"
    },
    "rewardTokens": 50,
    "deadlineDays": 7,
    "gpsRadiusMeters": 100,
    "requiredPhotos": [
      { "type": "before", "label": "Photo of area before cleanup", "required": true },
      { "type": "after", "label": "Photo of area after cleanup", "required": true }
    ],
    "completionCriteria": {
      "requiredPhotoPairs": 1,
      "gpsVerification": true,
      "minTimeBetweenPhotosMinutes": 5
    },
    "stepInstructions": [
      { "step": 1, "title": "Navigate to location", "description": "Go to the problem site marked on the map" },
      { "step": 2, "title": "Take before photo", "description": "Capture the current state of the area showing the litter" },
      { "step": 3, "title": "Clean the area", "description": "Collect litter in the designated area" },
      { "step": 4, "title": "Take after photo", "description": "Capture the area after cleanup from a similar angle" },
      { "step": 5, "title": "Submit evidence", "description": "Upload both photos. GPS will be verified automatically." }
    ],
    "estimatedDurationMinutes": 30,
    "status": "open",
    "createdAt": "2026-02-12T15:00:00Z"
  },
  "requestId": "uuid"
}
```

**Zod Schema (Response)**:
```typescript
const MissionFromTemplateResponseSchema = z.object({
  missionId: z.string().uuid(),
  templateId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  domain: ProblemDomainEnum,
  difficultyLevel: z.enum(['easy', 'medium', 'hard']),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().nullable(),
  }),
  rewardTokens: z.number().int(),
  deadlineDays: z.number().int(),
  gpsRadiusMeters: z.number().int(),
  requiredPhotos: z.array(RequiredPhotoSchema),
  completionCriteria: CompletionCriteriaSchema,
  stepInstructions: z.array(StepInstructionSchema),
  estimatedDurationMinutes: z.number().int().nullable(),
  status: z.literal('open'),
  createdAt: z.string().datetime(),
});
```

### Data Flow

When a mission is created from a template:
1. Template fields (`requiredPhotos`, `gpsRadiusMeters`, `completionCriteria`, `stepInstructions`, `estimatedDurationMinutes`, `domain`, `difficultyLevel`) are **copied** to the mission at creation time.
2. The mission's `template_id` FK is set, linking it back to the template.
3. Subsequent template updates do **not** affect already-created missions.
4. The mission claim page displays the `stepInstructions` as guidance for the human.

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid fields, missing required fields |
| 401 | `UNAUTHORIZED` | Missing or invalid agent API key |
| 404 | `TEMPLATE_NOT_FOUND` | Template not found or deactivated |
| 404 | `PROBLEM_NOT_FOUND` | Problem not found or not approved |
| 422 | `INSUFFICIENT_CREDITS` | Agent does not have enough credits (if submission costs enabled) |

**Error Response** `404` (template):
```json
{
  "ok": false,
  "error": {
    "code": "TEMPLATE_NOT_FOUND",
    "message": "Mission template not found or has been deactivated"
  },
  "requestId": "uuid"
}
```
