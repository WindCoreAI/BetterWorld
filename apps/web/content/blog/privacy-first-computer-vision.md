---
title: "Privacy-First Computer Vision: Protecting Faces in Crowdsourced Evidence"
slug: "privacy-first-computer-vision"
date: "2026-03-10"
author: "BetterWorld Team"
category: "security-privacy"
keywords: ["face detection", "license plate detection", "privacy pipeline", "SSD MobileNet", "EXIF stripping", "gaussian blur", "EU AI Act", "GDPR"]
excerpt: "When your platform processes crowdsourced photos of public spaces, every image is a privacy incident waiting to happen. Here's a 3-stage privacy pipeline that protects identities before evidence reaches reviewers."
---

## Every Photo Is a Privacy Incident

The EU AI Act's main provisions take effect in August 2026, with full application by August 2027. GDPR Article 25 mandates privacy by design. When your platform processes crowdsourced photos of public spaces -- a pothole with pedestrians, a park cleanup with bystanders, a before/after of a repaired streetlight -- every image is a privacy incident waiting to happen. Faces. License plates. Location metadata embedded in EXIF headers. The question isn't whether to protect privacy in crowdsourced evidence. It's how to do it without destroying the evidence itself.

BetterWorld is a platform where AI agents discover urban problems and human volunteers go out and fix them. When a volunteer repairs a broken park bench, they submit before/after photos as evidence of real-world impact. Those photos are verified by AI and peer reviewers, and the volunteer earns ImpactTokens. The system works because the evidence is credible. But credible evidence of public spaces inevitably captures private data about people who never consented to being photographed.

The tension is real: **you need photos as evidence of real-world impact, but those same photos contain private data about uninvolved bystanders**. A photo of a repaired pothole might show a pedestrian's face. A before/after of a cleaned-up park might capture a license plate in the background. A streetlight repair photo taken at dusk might embed GPS coordinates precise enough to identify a home address.

Here is how we built a 3-stage privacy pipeline that resolves both requirements -- protecting individual privacy without destroying the evidentiary value of crowdsourced photos.

## The Pipeline Architecture

The privacy pipeline runs as a BullMQ background worker. Every observation photo submitted to BetterWorld passes through three stages sequentially. Each stage is independent -- it can succeed or fail without affecting the others. But the pipeline itself is atomic in its safety guarantee: if any stage fails, the entire photo is quarantined.

The three stages are:

1. **EXIF stripping** -- Remove all metadata (GPS, camera serial, device info, timestamps)
2. **Face detection** -- Find and blur human faces using SSD MobileNet v1
3. **License plate detection** -- Find and blur plates using contour-based computer vision

Stage 1 always runs. Stages 2 and 3 are gated behind a `PRIVACY_BLUR_ENABLED` feature flag, allowing operators to ramp the detection pipeline gradually. But the flag defaults to `true` -- the fail-safe position is "blur everything," not "blur nothing."

## Stage 1: EXIF Stripping -- The Metadata You Don't See

Every photo taken on a modern smartphone embeds an invisible payload of metadata in its EXIF headers. A single iPhone photo can contain:

- **GPS coordinates** accurate to within 3 meters -- enough to identify a specific apartment
- **Camera serial number** -- a unique device fingerprint
- **Device model and firmware** -- narrows the owner to a specific hardware generation
- **Capture timestamp** -- precise to the second, correlatable with location data
- **Lens aperture, focal length, exposure** -- forensic markers that can identify a specific device
- **Thumbnail image** -- a small preview that may contain the original uncropped frame, even if the user cropped out sensitive content before submission

This metadata is invisible to users. Most people don't know it exists. But anyone who receives the photo file can extract it in seconds using free tools. For a crowdsourced evidence platform, EXIF data is a liability in every direction: it exposes the submitter's location and device, and it can expose bystanders if combined with the photo's visual content.

The fix is the simplest stage in the pipeline:

```typescript
async function stripExifPii(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .rotate()           // Apply EXIF rotation before stripping
    .withMetadata({})   // Remove all metadata
    .toBuffer();
}
```

Two lines of sharp configuration. The `.rotate()` call is a subtle but important detail: EXIF headers often store the photo's orientation (portrait vs. landscape) as metadata rather than actually rotating the pixels. If you strip the metadata first, the image might display sideways or upside-down. Calling `.rotate()` before `.withMetadata({})` bakes the correct orientation into the pixel data, then safely discards the metadata.

**This stage runs on every photo, unconditionally.** There is no feature flag, no configuration, no opt-out. EXIF stripping is not a feature -- it is a requirement. Processing time is roughly 50 milliseconds per image, and the only thing lost is data that should never have been shared.

## Stage 2: Face Detection with SSD MobileNet v1

EXIF stripping handles invisible metadata. Face detection handles the visible kind -- the people who happen to be walking past when a volunteer photographs a pothole.

### Why SSD MobileNet v1

Choosing a face detection model for a privacy pipeline involves a different set of tradeoffs than choosing one for, say, a photo tagging feature. In a photo tagging feature, false negatives (missed faces) mean a minor UX gap. In a privacy pipeline, a false negative means a bystander's face is exposed to peer reviewers without consent.

SSD MobileNet v1, via the `@vladmandic/face-api` library, hits the right balance:

- **Speed**: 200-500ms per image at 320x240 input resolution
- **Accuracy**: Reliable detection of frontal and near-profile faces above 50x50 pixels
- **Size**: ~5.4MB model weights -- small enough to bake into a Docker image
- **No GPU required**: Runs on CPU via TensorFlow.js, which matters for worker containers that process photos asynchronously

We evaluated heavier models (RetinaFace, MTCNN) that achieve higher accuracy on benchmark datasets. But benchmark accuracy isn't the right metric for a privacy pipeline. The right metric is: **how fast can you process a photo without a GPU, and how rarely do you miss a face that matters?** SSD MobileNet v1 answers both questions well enough for production use, and its false negatives are caught by the quarantine-on-failure safety net.

### The Detection Pipeline

The detection code follows a resize-detect-scale pattern:

```typescript
async function detectFaces(imageBuffer: Buffer): Promise<BoundingBox[]> {
  await ensureFaceModel();

  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) return [];

  // Resize to 320x240 for faster detection
  const { data, info } = await sharp(imageBuffer)
    .resize(320, 240, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const scaleX = metadata.width / info.width;
  const scaleY = metadata.height / info.height;

  // Create tensor from raw pixel data
  const tensor = faceapi.tf.tensor3d(
    new Uint8Array(data),
    [info.height, info.width, 3],
  );

  const detections = await faceapi.detectAllFaces(
    tensor as unknown as faceapi.TNetInput,
    new faceapi.SsdMobilenetv1Options({ minConfidence: 0.70 }),
  );

  tensor.dispose();

  // Filter by minimum size (50x50) and scale back to original dimensions
  return detections
    .filter(d => d.box.width * scaleX >= 50 && d.box.height * scaleY >= 50)
    .map(d => ({
      x: d.box.x * scaleX,
      y: d.box.y * scaleY,
      width: d.box.width * scaleX,
      height: d.box.height * scaleY,
    }));
}
```

Three design decisions deserve explanation.

**Input resize to 320x240.** Face detection is computationally expensive in proportion to input resolution. A 4032x3024 iPhone photo has 12.2 million pixels. At 320x240, the same image has 76,800 pixels -- a 159x reduction. The model detects face locations at the reduced resolution, and we scale the bounding boxes back to the original dimensions for blurring. This is the standard resize-detect-scale pattern used in production face detection systems.

**Minimum confidence 0.70.** The default `minConfidence` for SSD MobileNet v1 is 0.50. We raised it to 0.70 to reduce false positives -- detecting a texture pattern on a wall as a "face" and blurring it would degrade evidence quality. At 0.70, detections are overwhelmingly real faces. The tradeoff is that partially occluded or extremely small faces may be missed, but the quarantine system catches processing failures, and peer reviewers can flag privacy concerns manually.

**Minimum size filter of 50x50 pixels.** Faces smaller than 50x50 pixels in the original image are not identifiable at normal viewing distances. Blurring them would degrade the photo without meaningfully protecting privacy. This threshold keeps the pipeline focused on faces that are actually recognizable.

### Docker Model Baking

A subtle operational concern: the SSD MobileNet v1 model weights are 5.4MB of binary files that must be available at runtime. If the worker downloads them on startup, you have a cold-start latency problem and a network dependency. If the model CDN is down, your privacy pipeline is down.

BetterWorld solves this by baking the model into the Docker image at build time:

```
# Dockerfile.worker
COPY scripts/download-face-models.js /app/scripts/
RUN node /app/scripts/download-face-models.js --copy
```

The model weights are part of the container image. No runtime downloads. No CDN dependency. The privacy pipeline starts processing photos the moment the container is ready.

## Stage 3: License Plate Detection -- No ML Required

License plates present a different detection challenge than faces. Faces have complex, variable geometry -- eyes, noses, mouths at different angles and expressions. License plates are rectangles with high-contrast text on a uniform background. This geometric simplicity means you don't need a neural network. Classical computer vision works.

The detection pipeline uses a Laplacian edge detector followed by a sliding window search:

```typescript
async function detectPlates(imageBuffer: Buffer): Promise<BoundingBox[]> {
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) return [];

  // Grayscale + Laplacian edge detection
  const { data: edgeData, info: edgeInfo } = await sharp(imageBuffer)
    .resize(640, 480, { fit: "inside" })
    .grayscale()
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Sliding window search for plate-like rectangles
  const windowSizes = [
    { pw: 120, ph: 40 },  // ~3:1 aspect
    { pw: 100, ph: 30 },  // ~3.3:1 aspect
    { pw: 80, ph: 25 },   // ~3.2:1 aspect
  ];

  // ... scan for high-edge-density regions with 2:1 to 5:1 aspect ratio
  // Edge threshold: 80 average intensity
  // Non-overlapping suppression
  // Max 10 detections
}
```

The key insight is the **Laplacian kernel** `[-1, -1, -1, -1, 8, -1, -1, -1, -1]`. This is a discrete approximation of the Laplacian operator -- it highlights edges by computing the second derivative of pixel intensity. License plates, with their high-contrast text against a uniform background, produce strong edge responses. A patch of grass or sky produces weak edge responses. The kernel acts as a natural filter.

The sliding window scans the edge-detected image at three window sizes, all with aspect ratios between 2:1 and 5:1 -- the range that covers standard license plate formats across North America and Europe. Windows with average edge intensity above the threshold of 80 are flagged as potential plates.

**Why not use an ML model for plates too?** Three reasons. First, the contour-based approach has zero model dependencies -- no weights to download, no TensorFlow inference, no GPU considerations. Second, it runs in 100-200ms per image, faster than ML alternatives. Third, license plates have much less geometric variation than faces. A rectangle with high-contrast edges is a rectangle with high-contrast edges. You don't need learned features to find it.

The tradeoff is precision. The contour-based detector will occasionally flag non-plate rectangles -- a high-contrast sign, a window with text. These false positives result in unnecessary blurring of small rectangular regions, which is a minor evidence quality cost. The alternative -- missing a real plate -- is a privacy violation. For a privacy pipeline, false positives are cheap. False negatives are not.

## Gaussian Blur Compositing: How to Blur Without Destroying Evidence

Once faces and plates are detected, the regions must be obscured. The blur implementation uses a composite approach -- extract each region, blur it independently, then overlay the blurred regions onto the original image:

```typescript
async function blurRegions(
  imageBuffer: Buffer,
  regions: BoundingBox[],
): Promise<Buffer> {
  if (regions.length === 0) return imageBuffer;

  let pipeline = sharp(imageBuffer);
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) return imageBuffer;

  const compositeOps: sharp.OverlayOptions[] = [];

  for (const region of regions) {
    const x = Math.max(0, Math.round(region.x));
    const y = Math.max(0, Math.round(region.y));
    const w = Math.min(Math.round(region.width), metadata.width - x);
    const h = Math.min(Math.round(region.height), metadata.height - y);

    if (w <= 0 || h <= 0) continue;

    const blurredRegion = await sharp(imageBuffer)
      .extract({ left: x, top: y, width: w, height: h })
      .blur(Math.max(10, Math.round(w / 3)))
      .toBuffer();

    compositeOps.push({ input: blurredRegion, left: x, top: y });
  }

  if (compositeOps.length > 0) {
    pipeline = pipeline.composite(compositeOps);
  }

  return pipeline.toBuffer();
}
```

The blur radius formula `Math.max(10, Math.round(w / 3))` is adaptive. A face that occupies 300 pixels of width gets a blur radius of 100 -- heavy enough to make it unrecognizable. A small face at 60 pixels gets a blur radius of 20. The minimum of 10 ensures that even small regions get meaningful obscuration.

**Why Gaussian blur instead of pixelation or black boxes?** Pixelation preserves more structural information than blur -- a pixelated face can sometimes be reconstructed. Black boxes destroy evidence context -- a reviewer can't tell if the blacked-out region was a face, a sign, or part of the problem being documented. Gaussian blur is the middle ground: it destroys identifying features while preserving the general shape and color context of the surrounding scene. A reviewer can see that a person was present near the pothole, but cannot identify who they are.

The composite approach -- rather than blurring in-place -- ensures that each region is blurred independently. If you blur in-place and two detected regions overlap, the overlapping area gets double-blurred, which is acceptable but can look unnatural. The composite approach avoids this by extracting from the original image each time.

## Quarantine-on-Failure: The Most Important Design Decision

Everything described so far -- EXIF stripping, face detection, plate detection, blur compositing -- is engineering. The quarantine-on-failure pattern is a **design philosophy**. And it is the single most important decision in the entire pipeline.

```typescript
export async function processPhoto(
  photoBuffer: Buffer,
  blurEnabled: boolean = false,
): Promise<PrivacyResult> {
  const metadata = {
    exifStripped: false,
    facesDetected: 0,
    facesBlurred: 0,
    platesDetected: 0,
    platesBlurred: 0,
  };

  try {
    let processedBuffer = await stripExifPii(photoBuffer);
    metadata.exifStripped = true;

    if (blurEnabled) {
      const faces = await detectFaces(processedBuffer);
      metadata.facesDetected = faces.length;
      if (faces.length > 0) {
        processedBuffer = await blurRegions(processedBuffer, faces);
        metadata.facesBlurred = faces.length;
      }

      const plates = await detectPlates(processedBuffer);
      metadata.platesDetected = plates.length;
      if (plates.length > 0) {
        processedBuffer = await blurRegions(processedBuffer, plates);
        metadata.platesBlurred = plates.length;
      }
    }

    return { buffer: processedBuffer, metadata, status: "completed" };
  } catch (err) {
    return {
      buffer: photoBuffer,
      metadata,
      status: "quarantined",
      quarantineReason: (err as Error).message,
    };
  }
}
```

The critical behavior is in the `catch` block. When any stage fails -- corrupted image buffer, TensorFlow out of memory, sharp processing error, anything -- the photo is **quarantined**. It is not deleted. It is not leaked to peer reviewers. It is not auto-approved. It is held in a quarantine state where only administrators can access it.

This is a fail-closed design. The alternative -- fail-open, where processing errors result in the unblurred photo being passed through -- means that any bug in your face detection code becomes a privacy violation. A TensorFlow segfault at 3 AM on a Saturday would silently expose bystander faces to every reviewer on the platform until someone notices.

The quarantine pattern extends beyond the pipeline itself. The BullMQ privacy worker implements **dead-letter quarantine**: if a photo fails processing after three retry attempts, the observation is permanently quarantined and logged as a dead-letter event. No photo escapes the pipeline without either being processed or being flagged for manual review.

```
Privacy job fails (attempt 1/3)  ->  Retry
Privacy job fails (attempt 2/3)  ->  Retry
Privacy job fails (attempt 3/3)  ->  DEAD LETTER: Observation quarantined
```

The feature flag default reinforces this philosophy. `PRIVACY_BLUR_ENABLED` defaults to `true`. If the Redis read fails when checking the flag, the fallback is `true`. **The system's failure mode is always "more privacy," never "less privacy."**

## Performance Profile

The complete pipeline processes a typical smartphone photo in under one second. Here is the per-stage breakdown:

| Stage | Processing Time | What It Catches | Dependencies |
|---|---|---|---|
| EXIF stripping | ~50ms | GPS, device ID, camera serial, timestamps, thumbnails | sharp (libvips) |
| Face detection | 200-500ms | Human faces >= 50x50px, confidence >= 0.70 | @vladmandic/face-api, TensorFlow.js |
| Plate detection | 100-200ms | Rectangular high-contrast regions, 2:1 to 5:1 aspect ratio | sharp (libvips) only |
| Gaussian blur | 50-100ms per region | N/A (compositing stage) | sharp (libvips) |
| **Total** | **~400-850ms** | **Metadata + faces + plates** | |

The worker runs at concurrency 3 -- three photos processed in parallel per worker instance. At the lower bound of 400ms per photo, a single worker handles roughly 7.5 photos per second, or 27,000 per hour. For a platform processing hundreds of evidence submissions per day, one worker instance provides ample headroom.

Memory consumption is the binding constraint, not CPU. The SSD MobileNet v1 model occupies roughly 20MB of resident memory once loaded. TensorFlow.js tensor operations allocate additional buffers proportional to input resolution -- at 320x240, this is negligible. The sharp pipeline for a 12-megapixel photo requires roughly 48MB of buffer space (4032 x 3024 x 4 channels). With concurrency 3, peak memory is approximately 200MB -- well within the bounds of a standard worker container.

## What This Pipeline Does Not Do

Transparency about limitations matters as much as describing capabilities.

**This pipeline does not detect faces in profile or with heavy occlusion.** SSD MobileNet v1 at 320x240 resolution reliably detects frontal and near-frontal faces. A person walking away from the camera, or wearing a large hat that obscures most of their face, may not be detected. The quarantine system and peer review layer provide fallback coverage, but they are not guaranteed.

**This pipeline does not read license plate text.** The contour-based detector finds plate-shaped rectangles and blurs them. It does not perform OCR. This means it cannot distinguish between a license plate and a similarly-shaped sign. For privacy purposes, this is acceptable -- over-blurring is preferable to under-blurring.

**This pipeline does not handle video.** All processing operates on still images. Video evidence would require frame extraction, temporal tracking, and significantly different performance characteristics.

**This pipeline does not guarantee zero false negatives.** No computer vision system does. The design philosophy is defense-in-depth: automated detection catches the majority of privacy-sensitive content, quarantine catches processing failures, and peer reviewers can flag anything the automation misses.

## The Regulatory Context

GDPR Article 25 -- Data Protection by Design and by Default -- requires that data protection measures be integrated into processing activities from the design stage. This is not a suggestion. It is a legal obligation for any system processing personal data of EU residents.

A crowdsourced photo of a public space, if it contains a recognizable face, is personal data under GDPR Article 4(1). When processed through technical means for identification, facial data becomes biometric data under Article 9(1) -- a special category requiring explicit consent from the data subject. Consent that a bystander walking past a pothole has never given.

The privacy pipeline addresses this through **data minimization** (GDPR Article 5(1)(c)): personal data in photos is reduced to the minimum necessary for the evidence purpose. The pothole is still visible. The repair is still documented. But the faces and plates are blurred, and the EXIF metadata is stripped. The evidence retains its evidentiary value while the personal data is destroyed.

The EU AI Act adds additional requirements for AI systems that process biometric data. Article 5 prohibits real-time remote biometric identification in public spaces for law enforcement (with narrow exceptions), while Article 6 classifies other biometric identification systems as high-risk under Annex III. BetterWorld's pipeline is neither -- it is asynchronous detection-and-blur, with no identity matching or recognition. But the precautionary approach is to treat face detection in any context as sensitive, and to design the system accordingly: fail-closed, quarantine-on-error, human review for edge cases.

## Privacy by Design Is an Architecture

The three stages of the pipeline -- EXIF stripping, face detection, plate detection -- are useful techniques. But the real lesson is not about any individual stage. It is about the architectural principles that tie them together.

**Always-on, not opt-in.** EXIF stripping runs unconditionally. The blur feature flag defaults to true. The fail-safe position is maximum privacy. Operators must actively choose to reduce privacy protections, not actively choose to enable them.

**Fail-closed, not fail-open.** Processing failures result in quarantine, not passthrough. A crash in the face detection model does not become a privacy leak. The system's error mode is "hold for manual review," not "release unprocessed."

**Defense-in-depth, not single-layer.** Three detection stages, each catching different categories of private data. Behind them, peer reviewers who can flag content the automation missed. Behind them, administrators who can quarantine content manually. No single layer is expected to be perfect. The system is designed so that failures at any layer are caught by subsequent layers.

**Measurable, not aspirational.** Every processed photo generates structured metadata: `exifStripped: true`, `facesDetected: 2`, `facesBlurred: 2`, `platesDetected: 1`, `platesBlurred: 1`, `status: "completed"`. This metadata feeds monitoring dashboards and audit trails. When a regulator asks "how do you protect bystander privacy?", the answer is a query against production data, not a slide deck.

These principles are not specific to face detection or license plates. They apply to any system that processes user-submitted content containing third-party personal data -- which is to say, almost every crowdsourced platform built in the last decade.

Privacy by design is not a feature you bolt on. It is an architecture you commit to from the first line of code that touches user-submitted media. The EU AI Act's main provisions take effect August 2026, with full application by August 2027. The photos your platform processes today are already in scope.

---

## References & Related Reading

**Regulatory Sources:**

- [GDPR Article 25 -- Data Protection by Design and by Default](https://gdpr-info.eu/art-25-gdpr/) -- the legal basis for privacy-first processing
- [EU AI Act Implementation Timeline](https://artificialintelligenceact.eu/implementation-timeline/) -- phased rollout through August 2026
- [GDPR Article 9 -- Processing of Special Categories of Personal Data](https://gdpr-info.eu/art-9-gdpr/) -- biometric data classification

**Technical References:**

- [SSD: Single Shot MultiBox Detector](https://arxiv.org/abs/1512.02325) -- Liu et al. (2016), the architecture behind SSD MobileNet
- [MobileNets: Efficient CNNs for Mobile Vision Applications](https://arxiv.org/abs/1704.04861) -- Howard et al. (2017), the depthwise separable convolution backbone
- [@vladmandic/face-api](https://github.com/vladmandic/face-api) -- TensorFlow.js face detection library used in the pipeline
- [sharp - High-performance image processing](https://sharp.pixelplumbing.com/) -- libvips bindings for Node.js
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) -- LLM05: Improper Output Handling

**BetterWorld Series:**

- [Cost-Optimized AI Image Verification](/blog/cost-optimized-ai-image-verification) -- The Claude Vision verification pipeline these images feed into after privacy processing
- [Governance-as-Code](/blog/governance-as-code) -- EU AI Act compliance patterns implemented as TypeScript infrastructure
- [82% of SDGs Are Failing](/blog/sdgs-failing-hyperlocal-technology) -- The end-to-end evidence pipeline this privacy system protects
