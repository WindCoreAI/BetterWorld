---
title: "Cost-Optimized AI Image Verification: A Cascading Pipeline That Saves 75%"
slug: "cost-optimized-ai-image-verification"
date: "2026-03-05"
author: "BetterWorld Team"
category: "ai-safety"
keywords: ["Claude Vision", "image verification", "fraud detection", "cascading pipeline", "pHash", "EXIF", "cost optimization", "evidence verification"]
excerpt: "Running every uploaded image through Claude Vision costs $0.05 per image. A 6-stage cascading pipeline catches 75% of issues before Vision ever runs — cutting verification costs by 60-75%."
---

## The $0.05 Problem

When your platform processes thousands of crowdsourced photos as evidence for real-world missions, you face a cost problem. Claude Vision can verify anything -- a pothole repair, a community garden planting, a broken streetlight fix -- but at approximately $0.05 per image, running every upload through an LLM gets expensive fast.

At 1,000 images per day, that is $50. At 10,000, it is $500. At 100,000 -- the kind of scale a platform operating across multiple cities reaches -- it is $5,000 per day. Just for image verification.

The insight that changed our architecture: **most fraudulent or low-quality submissions fail much simpler checks.** A duplicate photo fails a perceptual hash comparison in 15 milliseconds. A photo with no GPS data fails a metadata check in 50 milliseconds. A user submitting 30 photos in 10 minutes fails a velocity check against Redis in under 5 milliseconds.

These checks cost effectively nothing to run. And they catch 60-75% of problematic submissions before Claude Vision ever sees them.

This is the cascading pipeline pattern: arrange your verification stages from cheapest and fastest to most expensive and slowest, so the costly AI inference only runs on images that survive every cheaper check first.

## The Cascade Principle

The core idea is simple but the execution matters. Every stage in the pipeline has a clear job:

1. **Catch the obvious failures early** -- before anything expensive runs
2. **Let good submissions fall through quickly** -- don't penalize legitimate users with slow pipelines
3. **Reserve AI inference for genuinely ambiguous cases** -- the ones where only a vision model can make the call

Each stage acts as a filter. An image enters the pipeline and either gets rejected (with a clear reason), gets flagged for human review, or passes to the next stage. Only images that survive all the cheap checks reach the expensive one.

The order is deliberate:

| Stage | What It Does | Cost | Latency | Catch Rate |
|-------|-------------|------|---------|------------|
| 1. EXIF Metadata | Extract and validate GPS, timestamp, camera data | ~$0 | ~50ms | ~15-20% |
| 2. Perceptual Hash | Detect duplicate/near-duplicate images | ~$0 | ~15ms | ~15-25% |
| 3. Velocity & Statistical | Detect rapid-fire submissions, coordinated fraud | ~$0 | ~5ms | ~5-10% |
| 4. Privacy Pipeline | Face/plate detection and blur (runs on all) | ~$0 | ~200ms | N/A (privacy) |
| 5. Peer Review | Stranger-only human validation | Staff time | Async | Variable |
| 6. Claude Vision | Full AI verification with structured scoring | ~$0.05 | ~3s | Final arbiter |

Stages 1-3 collectively eliminate 30-50% of submissions that would otherwise consume Vision API budget. The privacy pipeline runs regardless -- it is not a filter but a transformation. Peer review handles the ambiguous middle ground. Claude Vision only processes the remainder.

Let's walk through each stage.

## Stage 1: EXIF Metadata Extraction (~50ms)

Every digital photo carries metadata. Camera make and model, GPS coordinates, timestamps, orientation, focal length. This metadata is the cheapest signal you have about whether a submission is legitimate.

BetterWorld extracts EXIF data using the `exifr` library, pulling exactly the fields needed for verification:

```typescript
export async function extractExif(buffer: Buffer): Promise<ExtractedExif> {
  const exifr = await import("exifr");
  const parsed = await exifr.default.parse(buffer, {
    pick: ["latitude", "longitude", "DateTimeOriginal", "Make", "Model"],
  });

  if (!parsed) return {};

  return {
    latitude: parsed.latitude ?? undefined,
    longitude: parsed.longitude ?? undefined,
    dateTime: parsed.DateTimeOriginal
      ? new Date(parsed.DateTimeOriginal)
      : undefined,
    make: parsed.Make ?? undefined,
    model: parsed.Model ?? undefined,
  };
}
```

This runs in under 50 milliseconds. The extracted data feeds multiple validation checks:

**Missing GPS coordinates.** A mission requires evidence from a specific location. If the photo has no GPS data at all, it cannot be verified geographically. The submission gets flagged immediately -- not rejected outright, since some phones strip GPS by default, but flagged for additional scrutiny.

**Impossible timestamps.** A photo timestamped three years ago, or three hours in the future, is suspicious. The `DateTimeOriginal` field is checked against the mission claim date and a reasonable window.

**Missing camera metadata.** Stock photos and AI-generated images often lack the `Make` and `Model` fields that a real camera phone produces. Their absence is not proof of fraud, but it is a signal that feeds the scoring pipeline.

**GPS distance validation.** When GPS data exists, a Haversine distance calculation checks whether the photo was taken within a reasonable radius of the mission location:

```typescript
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

A photo claimed to be from a San Francisco park but geotagged in Chicago does not need Claude Vision to flag it. The Haversine formula handles that for free.

**The key principle: EXIF validation does not replace AI verification -- it prevents wasting AI budget on submissions that fail basic sanity checks.**

## Stage 2: Perceptual Hashing (pHash) Duplicate Detection (~15ms)

The second cheapest check is perceptual hashing. Unlike cryptographic hashes (SHA-256), which change completely if a single pixel changes, perceptual hashes capture the visual structure of an image. Two photos of the same scene from slightly different angles produce similar hashes. A photo and its resized, cropped, or lightly filtered version produce nearly identical hashes.

BetterWorld uses an average hash (aHash) algorithm built on sharp:

```typescript
export async function calculatePhash(imageBuffer: Buffer): Promise<string> {
  // Resize to 8x8 grayscale
  const pixels = await sharp(imageBuffer)
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  // Calculate mean pixel value
  let sum = 0;
  for (let i = 0; i < 64; i++) {
    sum += pixels[i]!;
  }
  const mean = sum / 64;

  // Build hash: each pixel above mean = 1, below = 0
  // 64 bits encoded as 16 hex characters
  let hash = "";
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) {
      if (pixels[i + j]! >= mean) {
        nibble |= 1 << (3 - j);
      }
    }
    hash += nibble.toString(16);
  }

  return hash;
}
```

The algorithm reduces any image to a 64-bit fingerprint. Two fingerprints are compared using Hamming distance -- the number of bits that differ:

```typescript
export function hammingDistance(hash1: string, hash2: string): number {
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i]!, 16) ^ parseInt(hash2[i]!, 16);
    let bits = xor;
    while (bits) {
      distance++;
      bits &= bits - 1; // Brian Kernighan's bit-counting
    }
  }
  return distance;
}
```

A Hamming distance of 0 means identical images. A distance under 6 means near-duplicates -- the same photo with minor edits. A distance under 10 is suspicious. Above 10, the images are meaningfully different.

**This is where before/after fraud detection lives.** When a user submits a "before" photo and an "after" photo for a mission, pHash comparison runs first:

```typescript
const [beforeHash, afterHash] = await Promise.all([
  calculatePhash(beforeBuf), calculatePhash(afterBuf),
]);
const distance = hammingDistance(beforeHash, afterHash);
if (distance < 5) {
  // Before/after photos too similar — flagging as potential fraud
  logger.warn({ pairId, distance },
    "Before/after photos suspiciously similar");
}
```

If someone submits the same photo twice -- or the same photo with a color filter applied -- the Hamming distance catches it in 15 milliseconds. No AI budget spent. The submission routes directly to peer review with a clear flag.

**The fraud economics matter here.** Each evidence submission costs credits. A fraudster trying to earn rewards by resubmitting the same photo burns credits on every attempt, while pHash catches the duplicates before any expensive processing occurs. The cascading pipeline makes fraud unprofitable at multiple levels.

## Stage 3: Velocity and Statistical Fraud Detection (~5ms)

Individual submissions can look legitimate in isolation. The fraud patterns emerge at scale -- and they emerge in time series data.

BetterWorld's fraud detection engine uses three statistical methods, all running against Redis and PostgreSQL:

### Velocity Checks (Redis Sorted Sets)

Redis sorted sets track submission timestamps across three sliding windows:

```typescript
export async function checkVelocity(
  redis: Redis,
  humanId: string,
): Promise<VelocityResult[]> {
  const now = Date.now();
  const results: VelocityResult[] = [];

  for (const [windowName, config] of Object.entries(VELOCITY_WINDOWS)) {
    const key = `fraud:velocity:${humanId}:${windowName}`;
    const windowStart = now - config.windowMinutes * 60 * 1000;

    // Add current timestamp
    await redis.zadd(key, now.toString(), uniqueMember);
    // Remove entries outside window
    await redis.zremrangebyscore(key, "-inf", windowStart.toString());
    // Set TTL to auto-clean
    await redis.expire(key, config.windowMinutes * 60 + 60);

    const count = await redis.zcard(key);
    if (count >= config.threshold) {
      results.push({
        flagged: true,
        count,
        window: windowName,
        scoreDelta: deltas[windowName],
      });
    }
  }
  return results;
}
```

Three windows catch different fraud patterns. The short window (10 minutes) catches automated scripts firing submissions in rapid sequence. The medium window (1 hour) catches sustained manual gaming. The long window (24 hours) catches coordinated campaigns that spread submissions across a day to avoid short-window detection.

Each flagged velocity violation increments a fraud score. Scores accumulate: 50 points triggers a flag for admin review; 150 triggers automatic suspension.

### GPS Variance Analysis (SQL VARIANCE)

If every submission from a user comes from the exact same GPS coordinates, something is wrong. Real-world missions happen in different locations. A user who submits evidence for 15 different missions -- all geotagged to the same spot -- is likely spoofing their location.

```typescript
export async function analyzeGpsVariance(
  db: PostgresJsDatabase,
  humanId: string,
): Promise<StatisticalResult | null> {
  const result = await db
    .select({
      varianceLat: sql<number>`COALESCE(VARIANCE(CAST(${evidence.latitude} AS float)), 0)`,
      varianceLng: sql<number>`COALESCE(VARIANCE(CAST(${evidence.longitude} AS float)), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(evidence)
    .where(eq(evidence.submittedByHumanId, humanId));

  // Flag if variance is near-zero across 5+ submissions
  if (varLat < threshold && varLng < threshold) {
    return { flagged: true, type: "gps_clustering", scoreDelta: delta };
  }
  return null;
}
```

### Timing Pattern Analysis (Coefficient of Variation)

Automated submission tools produce suspiciously regular timing. A human submitting photos does so at irregular intervals -- 3 minutes here, 45 minutes there, a day gap. A bot submits at exact intervals.

The coefficient of variation (standard deviation divided by mean) quantifies this regularity. A CV below 0.1 means the intervals are nearly identical -- a strong signal of automation:

```typescript
const intervals: number[] = [];
for (let i = 1; i < submissions.length; i++) {
  intervals.push(
    submissions[i - 1]!.createdAt.getTime() -
    submissions[i]!.createdAt.getTime()
  );
}

const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
const variance = intervals.reduce((sum, v) =>
  sum + Math.pow(v - mean, 2), 0) / intervals.length;
const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;

if (cv < 0.1) {
  // Suspiciously uniform submission timing
  return { flagged: true, type: "timing_pattern" };
}
```

**These three statistical checks run against data you already have -- Redis timestamps and PostgreSQL evidence records. The marginal cost is zero.** They catch coordinated fraud rings, automated scripts, and GPS spoofing before any AI processing occurs.

## Stage 4: The Privacy Pipeline (Runs on Every Image)

Stage 4 is different from the others. It is not a filter -- it is a transformation. Every image that enters the pipeline gets privacy processing, regardless of whether it will ultimately be verified by AI or peer review.

The privacy pipeline has three sub-stages:

### Stage 4a: EXIF PII Stripping

Before any image is stored, all metadata is stripped. Camera serial numbers, owner names, software versions, GPS tracks -- everything that could identify the photographer beyond what is needed for verification:

```typescript
async function stripExifPii(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .rotate()           // Apply EXIF rotation before stripping
    .withMetadata({})   // Remove all metadata
    .toBuffer();
}
```

The `.rotate()` call is a subtlety that matters. EXIF orientation tags tell image viewers how to display the photo. If you strip metadata without applying the rotation first, portrait photos display sideways. The rotation is baked into the pixel data before the metadata is removed.

### Stage 4b: Face Detection (SSD MobileNet v1)

Crowdsourced photos of public spaces inevitably contain bystanders. The privacy pipeline detects faces using `@vladmandic/face-api` with the SSD MobileNet v1 model:

```typescript
async function detectFaces(imageBuffer: Buffer): Promise<BoundingBox[]> {
  await ensureFaceModel();

  // Resize to 320x240 for performance
  const { data, info } = await sharp(imageBuffer)
    .resize(320, 240, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const scaleX = metadata.width / info.width;
  const scaleY = metadata.height / info.height;

  const tensor = faceapi.tf.tensor3d(
    new Uint8Array(data),
    [info.height, info.width, 3],
  );

  const detections = await faceapi.detectAllFaces(
    tensor,
    new faceapi.SsdMobilenetv1Options({ minConfidence: 0.70 }),
  );

  // Filter by minimum size (50x50 in original coordinates)
  // Map detection coordinates back to original image dimensions
  return detections
    .filter(det => det.box.width * scaleX >= 50)
    .map(det => ({
      x: det.box.x * scaleX,
      y: det.box.y * scaleY,
      width: det.box.width * scaleX,
      height: det.box.height * scaleY,
    }));
}
```

Detection runs at 320x240 resolution for speed, but bounding boxes are mapped back to original image coordinates for accurate blurring. The 0.70 confidence threshold and 50x50 minimum size filter out false positives -- we would rather miss a face than blur a fire hydrant.

### Stage 4c: License Plate Detection (Contour Analysis)

License plates are detected using a heuristic approach -- not ML-based, but sharp's convolution with a Laplacian edge detection kernel:

```typescript
async function detectPlates(imageBuffer: Buffer): Promise<BoundingBox[]> {
  // Laplacian edge detection
  const { data: edgeData } = await sharp(imageBuffer)
    .resize(640, 480, { fit: "inside" })
    .grayscale()
    .convolve({
      width: 3, height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Sliding window search for rectangular high-edge-density regions
  // Aspect ratio 2:1 to 5:1 matches standard plate proportions
  const windowSizes = [
    { pw: 120, ph: 40 },  // ~3:1
    { pw: 100, ph: 30 },  // ~3.3:1
    { pw: 80, ph: 25 },   // ~3.2:1
  ];

  // Scan image, find regions where average edge intensity > threshold
  // Non-maximum suppression via overlap check (> 50% overlap = skip)
  // Limit to 10 detections to avoid over-blurring
}
```

The Laplacian kernel highlights edges. License plates are rectangular regions with high edge density (text characters on a contrasting background) at predictable aspect ratios. The heuristic catches most plates in well-lit photos -- and at zero ML inference cost.

### Gaussian Blur Compositing

Detected faces and plates are blurred using sharp's composite pipeline:

```typescript
async function blurRegions(
  imageBuffer: Buffer,
  regions: BoundingBox[],
): Promise<Buffer> {
  const compositeOps: sharp.OverlayOptions[] = [];

  for (const region of regions) {
    const blurredRegion = await sharp(imageBuffer)
      .extract({ left: x, top: y, width: w, height: h })
      .blur(Math.max(10, Math.round(w / 3)))
      .toBuffer();

    compositeOps.push({ input: blurredRegion, left: x, top: y });
  }

  return sharp(imageBuffer).composite(compositeOps).toBuffer();
}
```

The blur radius scales with the detected region width -- `max(10, width/3)` -- ensuring larger faces and plates get proportionally stronger blurring. The compositing approach overlays blurred regions onto the original image in a single pass.

### The Quarantine-on-Failure Principle

**If any stage of the privacy pipeline fails, the image is quarantined -- not leaked.** This is the critical safety design. A face detection model crash does not result in unblurred faces being stored. The image is held with a quarantine reason, and a human reviews it before it enters the system:

```typescript
try {
  let processedBuffer = await stripExifPii(photoBuffer);
  // ... face detection, plate detection, blur ...
  return { buffer: processedBuffer, status: "completed" };
} catch (err) {
  return {
    buffer: photoBuffer, // Original, not processed
    status: "quarantined",
    quarantineReason: reason,
  };
}
```

**Privacy is not a filter in the cascade -- it is a non-negotiable transformation.** Every image gets processed. The question is never "should we protect privacy?" but "did the privacy processing succeed?"

## Stage 5: Peer Review (2-Hop Stranger Exclusion, Async)

For submissions that pass the cheap automated checks but score in the ambiguous range on AI verification (0.50-0.80), or when the Vision API budget is exhausted, the pipeline routes to human peer review.

The peer assignment algorithm enforces a **stranger-only policy with 2-hop transitive exclusion**. Reviewers cannot be anyone connected to the submitter -- not directly, and not through a mutual connection:

```typescript
export async function selectPeerReviewers(
  db: PostgresJsDatabase,
  submitterHumanId: string,
  count: number = 3,
  minRequired: number = 2,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT h.id FROM humans h
    WHERE h.id != ${submitterHumanId}
      AND h.is_active = true
      AND h.id NOT IN (
        -- Direct: anyone who reviewed or was reviewed by submitter
        SELECT reviewer_human_id FROM review_history
          WHERE submitter_human_id = ${submitterHumanId}
        UNION
        SELECT submitter_human_id FROM review_history
          WHERE reviewer_human_id = ${submitterHumanId}
        UNION
        -- 2-hop: if A reviewed B and B reviewed submitter, exclude A
        SELECT rh1.reviewer_human_id FROM review_history rh1
          JOIN review_history rh2
            ON rh1.submitter_human_id = rh2.reviewer_human_id
          WHERE rh2.submitter_human_id = ${submitterHumanId}
        UNION
        -- 2-hop reverse
        SELECT rh2.submitter_human_id FROM review_history rh1
          JOIN review_history rh2
            ON rh1.reviewer_human_id = rh2.submitter_human_id
          WHERE rh1.submitter_human_id = ${submitterHumanId}
      )
    ORDER BY RANDOM()
    LIMIT ${count}
  `);
  return reviewerIds;
}
```

The 4-UNION subquery is backed by composite indexes on the `review_history` table. The `ORDER BY RANDOM()` ensures fair rotation across the reviewer pool. If fewer than the minimum required reviewers are available (because the exclusion graph is too dense), the submission escalates to admin review.

**Peer review is not a cost optimization -- it is an accuracy mechanism.** Strangers have no incentive to approve fraudulent evidence from someone they have never interacted with. The 2-hop exclusion prevents collusion rings where friends review each other's submissions.

In the context of cost optimization, peer review serves as the fallback when the Vision API budget runs out. Rather than silently dropping submissions or queueing them indefinitely, the system routes to human validators who earn credits for accurate reviews.

## Stage 6: Claude Vision AI Verification ($0.05/image)

Only images that survive every earlier stage reach Claude Vision. By this point, the pipeline has already eliminated duplicates (pHash), obvious metadata failures (EXIF), velocity anomalies (Redis), and privacy-processed the image (face/plate blur). What remains are submissions that look legitimate but need a vision model to verify.

The verification uses Claude's `tool_use` interface for structured output -- not free-form text:

```typescript
const VERIFY_TOOL: Anthropic.Tool = {
  name: "verify_evidence",
  description: "Verify evidence submission for mission completion",
  input_schema: {
    type: "object",
    properties: {
      relevanceScore:        { type: "number" }, // 0-1
      gpsPlausibility:       { type: "number" }, // 0-1
      timestampPlausibility: { type: "number" }, // 0-1
      authenticityScore:     { type: "number" }, // 0-1
      requirementChecklist:  {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string" },
            met:         { type: "boolean" },
          },
        },
      },
      overallConfidence: { type: "number" },  // 0-1
      reasoning:         { type: "string" },
    },
  },
};
```

The tool schema forces Claude to return structured scores, not prose. Each dimension -- relevance, GPS plausibility, timestamp plausibility, authenticity -- gets a bounded 0-1 score. The `requirementChecklist` maps each mission evidence requirement to a boolean. The `reasoning` field captures the model's explanation for the audit trail.

### Routing by Score

The `overallConfidence` score determines what happens next:

```typescript
if (score >= 0.80) {
  // Auto-approve: high confidence, store in audit log
  await db.update(evidence).set({
    verificationStage: "verified",
    finalVerdict: "verified",
    finalConfidence: String(score.toFixed(2)),
  });
} else if (score < 0.50) {
  // Auto-reject: low confidence
  await db.update(evidence).set({
    verificationStage: "rejected",
    finalVerdict: "rejected",
  });
} else {
  // 0.50-0.80: ambiguous — route to peer review
  await routeToPeerReview(db, evidenceId, submitterHumanId, reasoning);
}
```

The thresholds are deliberately asymmetric. Auto-approval requires high confidence (0.80+) because a false approval wastes real-world resources -- someone gets rewarded for work that was not done. Auto-rejection requires low confidence (below 0.50) because false rejections discourage legitimate contributors. The wide middle band (0.50-0.80) routes to peer review, where humans make the final call.

### Budget Protection

A Redis counter tracks daily Vision API spend:

```typescript
async function checkVisionBudget(redis: Redis): Promise<boolean> {
  const budgetCents = parseInt(
    process.env.VISION_DAILY_BUDGET_CENTS || "3700", 10
  );
  const date = new Date().toISOString().slice(0, 10);
  const key = `cost:daily:vision:evidence:${date}`;
  const current = await redis.get(key);
  return (current ? parseInt(current, 10) : 0) < budgetCents;
}
```

The default budget is $37 per day (3700 cents), enough for approximately 740 Vision calls. When the budget is exhausted, new submissions route to peer review instead of being dropped. The system degrades gracefully -- verification continues, just with humans instead of AI.

## The Cost Comparison

Here is what this cascade looks like at 1,000 daily submissions:

| Stage | Submissions Entering | Filtered Out | Cost Per Check | Daily Cost |
|-------|---------------------|-------------|----------------|------------|
| 1. EXIF Metadata | 1,000 | ~150 (15%) | ~$0 | $0.00 |
| 2. pHash Duplicate | 850 | ~170 (20%) | ~$0 | $0.00 |
| 3. Velocity/Statistical | 680 | ~50 (7%) | ~$0 | $0.00 |
| 4. Privacy Pipeline | 630 | 0 (transform only) | ~$0 | $0.00 |
| 5. Peer Review | ~190 (ambiguous scores) | Variable | Staff time | Variable |
| 6. Claude Vision | ~440 | Final arbiter | $0.05/image | **$22.00** |

**Without the cascade: 1,000 images x $0.05 = $50/day.**

**With the cascade: ~440 images x $0.05 = $22/day.**

That is a **56% cost reduction** at a modest filtering rate. In practice, the filtering rate is higher -- duplicate submissions are more common than you expect, and velocity checks catch automated scripts that would otherwise burn through budget. At realistic filtering rates of 60-75%, the daily cost drops to $12.50-$20.00.

At 10,000 daily submissions, the savings are $280-$375 per day. At 100,000, they are $2,800-$3,750. **The cascade pays for itself within the first day of operation.**

The non-monetary savings matter too. Each Vision API call takes approximately 3 seconds. Eliminating 600 calls per 1,000 submissions saves 30 minutes of pipeline latency. Legitimate submissions get verified faster because they are not queued behind obvious frauds waiting for their turn with the Vision model.

## The Safety Net: Zod Validation on All AI Responses

Cost optimization creates a risk. If you are running fewer Vision calls, each one matters more. A single malformed response that corrupts your database or makes a wrong routing decision has outsized impact.

This is why every Claude Vision response passes through a **strict Zod schema** before any data is stored -- a defense against [OWASP LLM05:2025 (Improper Output Handling)](/blog/governance-as-code):

```typescript
export const visionVerificationResponseSchema = z
  .object({
    relevanceScore: z.number().min(0).max(1),
    gpsPlausibility: z.number().min(0).max(1),
    timestampPlausibility: z.number().min(0).max(1),
    authenticityScore: z.number().min(0).max(1),
    requirementChecklist: z.array(
      z.object({
        requirement: z.string(),
        met: z.boolean(),
      }),
    ),
    overallConfidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })
  .strict();
```

The `.strict()` modifier rejects any field the schema does not explicitly define. If Claude hallucinates an `admin_override: true` or `bypass_review: true` field, Zod catches it and the response fails validation. The submission routes to peer review -- the system becomes more conservative, not less.

```typescript
const parseResult = visionVerificationResponseSchema.safeParse(toolUse.input);
if (!parseResult.success) {
  logger.error(
    { evidenceId, zodErrors: parseResult.error.flatten() },
    "Vision verification response failed Zod validation"
  );
  // Route to manual review — never store unvalidated LLM output
  await routeToPeerReview(db, evidenceId, submitterHumanId, "Zod validation failed");
  return;
}
```

**Every failure path in the pipeline is fail-closed.** Validation failure does not crash the system or drop the submission. It routes to human review with full context about why the AI response was rejected. The audit log records the Zod error, the response preview, and the routing decision.

This is the same pattern applied across all four of BetterWorld's AI integration points -- [the guardrail classifier, vision verification, before/after comparison, and mission decomposition](/blog/governance-as-code). Strict schema validation is not optional when you are making decisions based on LLM output.

## Before/After Photo Comparison: Cascading Within a Stage

The before/after comparison flow demonstrates cascading within a single verification context. When a user claims they cleaned up a vacant lot, they submit a "before" photo (the mess) and an "after" photo (the clean lot). The pipeline needs to verify both that the photos are authentic and that real improvement occurred.

The cascade within this flow:

**Step 1: pHash comparison.** If the before and after photos are perceptually identical (Hamming distance below 5), the submission is flagged as potential fraud immediately. No Vision API call needed.

**Step 2: Budget check.** If the daily Vision budget is exhausted, route to peer review.

**Step 3: Claude Vision comparison.** If the photos pass pHash and budget is available, Claude Sonnet analyzes both images together, scoring improvement and confidence.

**Step 4: Routing.** The same 0.80/0.50 thresholds apply: high confidence auto-approves, low confidence auto-rejects, the middle routes to peers.

The pHash pre-check is particularly effective here because before/after fraud is one of the most common gaming patterns. Submitting the same photo twice, or the same photo with a filter, is the lowest-effort fraud attempt -- and it is caught by the cheapest check.

## Architecture Lessons

The cascading pipeline pattern extends beyond image verification. It is an architecture principle:

**1. Order your checks by cost, not by accuracy.** The most accurate check (Claude Vision) is also the most expensive. Running it first wastes money on submissions that would fail cheaper checks. Running it last means you only pay for the accuracy you actually need.

**2. Every stage must have a clear fail path.** Stages do not just pass or fail -- they produce a specific result (rejected, flagged, escalated, passed) with a specific reason. This reason feeds the audit trail and the next stage's decision context.

**3. Transformations are not filters.** The privacy pipeline runs on every image because privacy is not optional. Not every stage in a cascade needs to reduce volume. Some stages transform content for downstream compliance.

**4. Budget exhaustion is not an error.** When the Vision API budget runs out, the system routes to peer review. This is a designed degradation path, not a bug. The system continues operating -- just with humans instead of AI for the remainder of the day.

**5. Statistical detection complements per-item detection.** EXIF and pHash check individual submissions. Velocity and timing analysis check patterns across submissions. The combination catches both one-off fraud and coordinated campaigns.

**6. Validate every AI response before acting on it.** The Zod strict schema validation is the last line of defense before an LLM's output enters your system. In a cost-optimized pipeline where each AI call matters more, this validation is not optional -- it is the [difference between a controlled system and an injection vector](/blog/governance-as-code).

## The Broader Pattern

BetterWorld's evidence verification pipeline processes crowdsourced photos for [missions that map to real-world impact across 15 UN SDG-aligned domains](/blog/sdgs-failing-hyperlocal-technology). The same cascading principle appears in our [3-layer content guardrail pipeline](/blog/ai-slop-constitutional-content-pipeline): regex catches obvious violations in milliseconds before the LLM classifier runs, and trust tiers determine which submissions need human review.

The pattern is the same everywhere expensive AI inference is involved: **do not run the expensive thing until you have exhausted every cheap check that could make it unnecessary.**

At scale, the difference between a flat pipeline (run Vision on everything) and a cascading pipeline (run Vision only on what survives) is not marginal. It is the difference between a cost structure that scales linearly with submission volume and one that scales with the rate of genuinely ambiguous submissions. The former grows with every user. The latter grows only with the hard cases.

That is what cost-optimized AI verification looks like: not a cheaper model, not a lower-quality check, but a smarter ordering of checks you would run anyway -- so the expensive one only handles what actually needs it.

---

## References & Related Reading

**Technical References:**

- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) -- LLM05: Improper Output Handling
- [sharp documentation](https://sharp.pixelplumbing.com/) -- Image processing pipeline
- [@vladmandic/face-api](https://github.com/vladmandic/face-api) -- SSD MobileNet v1 face detection
- [Anthropic Claude Vision](https://docs.anthropic.com/en/docs/build-with-claude/vision) -- Structured tool_use for image analysis

**BetterWorld Series:**

- [AI Slop Is Killing Open Source](/blog/ai-slop-constitutional-content-pipeline) -- The 3-layer guardrail pipeline that applies cascading to content moderation
- [Governance-as-Code](/blog/governance-as-code) -- Zod strict schemas for validating all LLM output before storage
- [82% of SDGs Are Failing](/blog/sdgs-failing-hyperlocal-technology) -- The evidence verification pipeline in context: from municipal data to verified neighborhood impact
