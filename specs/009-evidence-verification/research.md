# Research: Evidence Verification & Completion Workflow

**Date**: 2026-02-10
**Branch**: `009-evidence-verification`

## R1: EXIF Extraction Library

**Decision**: `exifr` (pure JS, zero native dependencies)

**Rationale**: Lightweight, fast, browser + Node.js compatible, extracts GPS/timestamp/camera model without native bindings. Unlike `exiftool` (CLI wrapper requiring system binary), `exifr` is a pure JS parser that works in Docker without additional installs. It supports JPEG, PNG, HEIC, and TIFF.

**Alternatives considered**:
- `exiftool-vendored` — wraps CLI `exiftool`, requires Perl binary, heavyweight (~30MB), overkill for extracting 3 fields
- `piexif` — write-capable (unnecessary, we only read), less maintained
- `sharp` metadata — only extracts basic EXIF, not GPS sub-IFD reliably

**Usage pattern**:
```typescript
import exifr from "exifr";
const { latitude, longitude, DateTimeOriginal, Make, Model } = await exifr.parse(buffer, {
  pick: ["latitude", "longitude", "DateTimeOriginal", "Make", "Model"],
});
```

## R2: Image Processing Library

**Decision**: `sharp` (image resizing, format conversion, thumbnail generation)

**Rationale**: Already battle-tested in Node.js ecosystem, uses libvips (fast, low memory). Needed for: (1) WebP conversion on upload (20-30% smaller), (2) thumbnail generation (200x200), (3) medium-resolution copy (1920x1080 max), (4) image dimension validation. Already commonly used with Hono/Express.

**Alternatives considered**:
- `jimp` — pure JS, slower, higher memory usage
- `canvas` — requires native cairo build, overkill
- Supabase Image Transformations — requires Pro plan, adds latency

## R3: Perceptual Hashing Library (pHash Spike)

**Decision**: `sharp` + `blockhash-core` (pure JS, no native bindings)

**Rationale**: Per S8-T4 spike requirement. `blockhash-core` computes perceptual hashes purely in JS using pixel data from `sharp`. No native compilation needed (simpler Docker build). Performance: >100 images/sec on commodity hardware. Hamming distance <5 = duplicate, >10 = different. Phase 3 can switch to `imghash` (native pHash C library) if performance insufficient at >10K images/sec scale.

**Alternatives considered**:
- `imghash` — faster (native C bindings), but requires compilation in Docker, adds build complexity
- Custom implementation — unnecessary, `blockhash-core` is well-tested

## R4: File Upload Strategy

**Decision**: Multipart upload via Hono's built-in `FormData` API → server-side processing → Supabase Storage signed URLs

**Rationale**: Hono natively supports `c.req.formData()` for multipart uploads. Server-side processing allows: (1) file type validation before storage, (2) EXIF extraction + PII stripping, (3) image resizing/conversion, (4) virus scanning (future). Supabase Storage provides S3-compatible API with signed URLs for secure access.

**Upload flow**:
1. Client sends multipart POST with evidence files + metadata
2. Server validates file type (MIME allowlist), size (10MB max), rate limit (10/hr)
3. Server extracts EXIF, strips PII, resizes images
4. Server uploads processed files to Supabase Storage bucket
5. Server stores Supabase URL + metadata in `evidence` table
6. Server enqueues BullMQ job for AI verification

**Alternatives considered**:
- Direct client → Supabase Storage (signed upload URL) — skips server-side EXIF extraction and validation, less secure
- Base64 encoding in JSON body — inefficient for large files, doubles payload size
- Resumable uploads (tus) — overkill for 10MB limit at Phase 2 scale

## R5: AI Verification Strategy (Claude Vision)

**Decision**: Claude Sonnet 4.5 Vision via BullMQ async worker with structured tool_use output

**Rationale**: Follows existing decomposition pattern (Sprint 7 `decompose.ts`). Evidence verification requires understanding visual content (is this a photo of tree planting?) and structured output (confidence score, GPS match assessment, requirement checklist). Using `tool_use` with forced `tool_choice` ensures consistent JSON output.

**Verification checks** (single Vision API call per evidence):
1. **Photo relevance**: Does the image show the activity described in the mission?
2. **GPS plausibility**: Is the location consistent with the photo's visual context (urban vs rural, terrain)?
3. **Timestamp plausibility**: Does lighting/shadows match the claimed time of day?
4. **Authenticity**: Are there signs of AI generation, heavy editing, or stock photo characteristics?
5. **Mission requirement check**: Does the evidence satisfy each `evidenceRequired` item from the mission?

**Cost model**: ~$0.01-0.05/image. Budget: $37/day (500 images/day). Check-then-increment pattern: GET cost counter first, only INCR after successful API call.

**Alternatives considered**:
- Open-source vision models (LLaVA, InternVL2) — 60-70% accuracy vs Claude's ~90%, not ready for Phase 2 quality requirements
- Multi-model cascade (cheap model first, Claude for ambiguous) — adds complexity, defer to Phase 3

## R6: Peer Review Assignment Algorithm

**Decision**: SQL-based stranger-only selection with 2-hop transitive exclusion via `review_history` table

**Rationale**: The `review_history` table tracks all (reviewer_id, submitter_id) pairs. To prevent collusion chains (A reviews B, B reviews C, so A cannot review C), we query 2 hops:

```sql
-- Find humans who are NOT in the 2-hop exclusion set for submitter X
SELECT h.id FROM humans h
WHERE h.id != :submitterId
  AND h.id NOT IN (
    -- Direct: anyone who reviewed X or was reviewed by X
    SELECT reviewer_id FROM review_history WHERE submitter_id = :submitterId
    UNION
    SELECT submitter_id FROM review_history WHERE reviewer_id = :submitterId
    UNION
    -- 2-hop: if A→B exists and B→X exists, exclude A
    SELECT rh1.reviewer_id FROM review_history rh1
    JOIN review_history rh2 ON rh1.submitter_id = rh2.reviewer_id
    WHERE rh2.submitter_id = :submitterId
    UNION
    -- 2-hop reverse: if X→B exists and B→A exists, exclude A
    SELECT rh2.submitter_id FROM review_history rh1
    JOIN review_history rh2 ON rh1.reviewer_id = rh2.submitter_id
    WHERE rh1.submitter_id = :submitterId
  )
  AND h.is_active = true
ORDER BY RANDOM()
LIMIT 3;
```

**Edge case**: If fewer than 2 eligible reviewers exist, escalate directly to admin review (log reason in audit trail).

**Alternatives considered**:
- Pre-computed exclusion arrays in JSONB — faster reads but stale data, complex updates
- Graph database (Neo4j) — overkill for Phase 2 scale (<5K users)
- Application-level filtering — risk of TOCTOU race conditions vs SQL atomicity

## R7: Offline Evidence Submission Strategy

**Decision**: Service Worker + IndexedDB queue with exponential backoff retry

**Rationale**: Field workers may have intermittent connectivity. Service Worker intercepts failed upload requests, stores them in IndexedDB with full FormData payload, and retries with exponential backoff (1s, 2s, 4s, 8s, max 32s) when connectivity returns. Navigator.onLine API + periodic fetch checks for connectivity detection.

**Implementation approach**:
1. Register service worker in Next.js (via `next-pwa` or manual registration)
2. Service worker intercepts POST to `/api/v1/evidence/*`
3. On network failure: serialize request to IndexedDB
4. On connectivity restored: replay queued requests in order
5. Show queue count badge in UI ("2 submissions pending")

**Alternatives considered**:
- Background Sync API — limited browser support (Chrome only), not cross-platform
- localStorage — 5MB limit insufficient for images
- No offline support — unacceptable for field work (constitution Principle V: Human Agency)

## R8: Supabase Storage Integration

**Decision**: Server-generated signed upload URLs with RLS policies, organized by mission/claim

**Rationale**: Server generates signed URLs after validating the upload request (auth, rate limit, file type). This prevents unauthorized uploads. Files stored at path `evidence/{missionId}/{claimId}/{filename}`. RLS ensures humans can only upload to their own claim paths.

**Storage structure**:
```
evidence/
├── {missionId}/
│   ├── {claimId}/
│   │   ├── original/          # Full-size original (PII-stripped EXIF)
│   │   ├── medium/            # 1920x1080 max (WebP)
│   │   └── thumbnail/         # 200x200 (WebP)
```

**Signed URL expiry**: 1 hour for uploads, 24 hours for reads (evidence viewing in peer review).

## R9: Honeypot Mission Design

**Decision**: 5 seeded impossible missions, indistinguishable from real missions, stored with `isHoneypot: true` flag in missions table

**Rationale**: Adding a boolean column to the existing `missions` table is simpler than a separate `honeypot_missions` table. The flag is never exposed via API. Honeypot missions have: (1) GPS coordinates in the ocean, (2) future timestamps, (3) non-existent locations, (4) physically impossible tasks.

**Detection flow**:
1. Human claims honeypot mission (normal claim flow)
2. Human submits evidence → system checks `isHoneypot` flag
3. If honeypot: auto-reject, increment fraud counter in Redis (`fraud:honeypot:{humanId}`), log to audit trail
4. If counter >= 3: flag account for admin review

**Alternatives considered**:
- Separate `honeypot_missions` table — additional join complexity, harder to keep indistinguishable
- Client-side detection — defeats the purpose of honeypots

## R10: Transaction Type Extensions

**Decision**: Add new `transactionTypeEnum` values for evidence-related rewards

**New types**:
- `earn_evidence_verified` — reward for verified evidence submission
- `earn_peer_review` — reward for completing a peer review

**Rationale**: Extends existing `transactionTypeEnum` (Sprint 6). Follows naming convention (`earn_*` for positive amounts). Keeps token accounting consistent with double-entry pattern.
