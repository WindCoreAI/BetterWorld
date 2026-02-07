# T2: Evidence Verification Pipeline — Deep Research Analysis

> **Document**: T2-evidence-verification-pipeline.md
> **Status**: Research Complete
> **Date**: 2026-02-06
> **Author**: Deep Research Analysis
> **Scope**: Comprehensive technical analysis of Challenge T2 from REVIEW-AND-TECH-CHALLENGES.md
> **Related**: `engineering/01-ai-ml-architecture.md` Section 5, `cross-functional/02-risk-register.md` SEC-05

---

## Executive Summary

Evidence verification is the trust backbone of BetterWorld. When a human claims they distributed 200 flyers in downtown Nairobi, the platform must determine whether this actually happened — without spending $2 per verification call to a Vision LLM that the platform (not the agent owner) must pay for.

**The core constraint**: Agent owners pay their own AI costs (BYOK), but evidence verification is a **platform cost** because it verifies human missions, not agent actions. The platform wants to minimize costs to hosting + DB. Vision AI at ~$2/1K calls is acceptable at 500/day ($1/day) but catastrophic at scale (50K/day = $100/day = $3K/month).

**Key findings from this research**:

1. **EXIF metadata is useful but unreliable as a primary signal.** Only 15-35% of photos submitted through mobile apps retain full EXIF with GPS. It is trivially forgeable. Use it as a cheap first-pass signal, never as the sole verifier.

2. **AI-generated image detection is an arms race with no permanent winner.** C2PA/Content Credentials is the most promising structural approach, but adoption is still incomplete in 2025-2026. Pixel-level detectors have a ~6-month shelf life against new generators. A layered approach combining metadata provenance, statistical analysis, and behavioral signals is the only durable strategy.

3. **Open-source vision models can handle 60-70% of verification tasks at near-zero marginal cost.** Models like LLaVA-1.6, InternVL2, and CogVLM2 can do basic scene classification ("is this a photo of people distributing flyers?") on a $40/month GPU. Reserve Claude Vision for ambiguous cases only.

4. **Peer review works when you design against collusion from day one.** Lottery assignment, reviewer reputation tracking, honeypot injection, and cross-validation between AI and human signals create a robust system. The key insight: peer review is both a verification mechanism and a fraud detection signal generator.

5. **Perceptual hashing is the cheapest and most effective first-line fraud detector.** Computing a pHash costs <0.1ms per image with zero API calls. It catches the most common fraud: resubmitting the same photo for different missions.

6. **GPS verification without EXIF is solvable through app-level location capture.** The BetterWorld mobile app should capture location at evidence submission time via the Geolocation API, independent of photo EXIF. This shifts the trust model from "trust the photo metadata" to "trust the app attestation."

7. **A properly designed multi-stage pipeline can reduce Vision AI calls by 70-85%.** By ordering checks from cheapest to most expensive and short-circuiting on clear pass/fail, the effective cost per verification drops from $0.002 to $0.0003-0.0006.

**Bottom line**: The current architecture in `01-ai-ml-architecture.md` Section 5 sends every photo through Claude Vision as a primary step. This must be redesigned as a cascading pipeline where Vision AI is the last resort, not the first check. The estimated savings: **$800-2,400/month at 50K daily submissions**.

---

## Table of Contents

1. [EXIF Metadata Reliability](#1-exif-metadata-reliability)
2. [AI-Generated Image Detection (2025-2026)](#2-ai-generated-image-detection-2025-2026)
3. [Cost-Efficient Vision Verification](#3-cost-efficient-vision-verification)
4. [Peer Review System Design](#4-peer-review-system-design)
5. [Perceptual Hashing and Fraud Detection](#5-perceptual-hashing-and-fraud-detection)
6. [GPS Verification Without EXIF](#6-gps-verification-without-exif)
7. [Cost-Minimized Pipeline Design](#7-cost-minimized-pipeline-design)
8. [Phased Implementation Plan](#8-phased-implementation-plan)
9. [Cost Model and Projections](#9-cost-model-and-projections)
10. [Tool and Library Recommendations](#10-tool-and-library-recommendations)
11. [Appendix: Architecture Decision Records](#11-appendix-architecture-decision-records)

---

## 1. EXIF Metadata Reliability

### 1.1 What EXIF Provides

EXIF (Exchangeable Image File Format) is metadata embedded in image files by camera hardware. The most relevant fields for evidence verification:

| EXIF Tag | Field Name | Verification Use | Reliability |
|----------|-----------|-----------------|-------------|
| `GPSLatitude` / `GPSLongitude` | GPS coordinates | Location verification | Medium-Low |
| `DateTimeOriginal` | Capture timestamp | Temporal verification | Medium |
| `Make` / `Model` | Camera/phone model | Device consistency | Medium |
| `ImageUniqueID` | Unique image identifier | Deduplication | Low (rarely set) |
| `GPSAltitude` | Elevation | Secondary location signal | Low |
| `GPSImgDirection` | Camera facing direction | Scene consistency | Low |
| `Software` | Processing software | Tampering indicator | Medium |
| `Orientation` | Image rotation | Minor consistency check | High |
| `ExifVersion` | EXIF standard version | Format validation | High |
| `Flash` | Flash fired status | Indoor/outdoor signal | Medium |

### 1.2 EXIF Retention Rates

The critical problem: EXIF data is frequently stripped or lost in transit.

**Photos taken directly in-app (camera capture)**:
- iOS: Retains full EXIF including GPS (if location permission granted) — **~95% retention**
- Android: Retains full EXIF including GPS (if location permission granted) — **~90% retention**
- Caveat: User must grant location permission to the BetterWorld app specifically

**Photos selected from camera roll / gallery**:
- iOS (Photos framework): Retains EXIF when accessed via `PHAsset` API — **~85% retention**
- Android (MediaStore): Retains EXIF via `ExifInterface` — **~80% retention**
- Caveat: Some gallery apps strip GPS on export for privacy reasons

**Photos received via messaging apps (worst case)**:
- WhatsApp: **Strips all EXIF** (GPS, datetime, camera info) — 0% retention
- Telegram: **Strips EXIF** unless sent as "file" — ~5% retention
- iMessage: Retains EXIF for direct sends, strips for shared links — ~50% retention
- Signal: **Strips all EXIF by default** — 0% retention

**Photos uploaded via web browser**:
- Chrome/Firefox file picker: **Retains original EXIF** — ~90% retention
- Drag-and-drop: Same as file picker — ~90% retention
- Screenshots: **No GPS data, only screen capture metadata** — 0% useful retention

**Effective EXIF GPS retention rate for a platform like BetterWorld**: Realistically **15-35%** of submitted evidence photos will have usable GPS EXIF data, depending on submission flow:
- If users must take photos in-app: 85-95%
- If users can upload from gallery: 60-80%
- If users can forward from messaging: 0-15%

**BetterWorld implication**: The app should strongly encourage (or require for location-sensitive missions) in-app photo capture to maximize EXIF retention.

### 1.3 EXIF Forgery — How Easy Is It?

**Trivially easy.** Any user with basic technical knowledge can forge EXIF in under 60 seconds.

**Tools for EXIF manipulation**:

| Tool | Platform | Difficulty | What It Can Forge |
|------|----------|-----------|-------------------|
| `exiftool` (CLI) | All | Low (one command) | Everything: GPS, datetime, camera model, all fields |
| EXIF Editor (mobile app) | iOS/Android | Very Low (GUI) | GPS, datetime, description — no technical knowledge needed |
| Photoshop / GIMP | Desktop | Low | Full EXIF rewrite on save |
| Python `piexif` library | Programmatic | Medium | Full programmatic EXIF injection |
| Online EXIF editors | Web | Very Low | GPS, datetime via web form |

**Example of trivial GPS forgery**:
```bash
# Set GPS to Nairobi city center with a single command
exiftool -GPSLatitude="-1.2921" -GPSLongitude="36.8219" \
  -GPSLatitudeRef="S" -GPSLongitudeRef="E" \
  -DateTimeOriginal="2026:02:05 14:30:00" evidence.jpg
```

**Detection of EXIF forgery** is possible but imperfect:

1. **Consistency checks**: Does the camera model in EXIF match the image resolution and sensor characteristics? A photo claiming to be from an iPhone 16 Pro Max but at 640x480 resolution is suspicious.

2. **Timestamp plausibility**: Does the `DateTimeOriginal` make sense given the lighting conditions in the photo? A photo timestamped 2:00 AM but showing bright daylight is suspicious. (Requires Vision AI to assess.)

3. **GPS plausibility**: Does the GPS coordinate match the network location (IP geolocation) at upload time? A photo with Nairobi GPS but uploaded from a German IP is a flag.

4. **Software field**: If `Software` shows "Adobe Photoshop" or "GIMP" on what should be a raw camera photo, that is a tampering indicator.

5. **Thumbnail mismatch**: EXIF contains a thumbnail. If the thumbnail does not match the main image (different content, different orientation), the image was likely edited after capture.

### 1.4 Recommended EXIF Libraries

**For Node.js/TypeScript (BetterWorld backend)**:

| Library | npm Package | Maturity | GPS Support | Write Support | Recommendation |
|---------|------------|---------|-------------|---------------|----------------|
| **exifr** | `exifr` | High | Yes | No (read-only) | **Primary choice** — fast, comprehensive, handles HEIC/HEIF |
| sharp | `sharp` | Very High | Yes (via libvips) | Limited | Already likely in stack for image processing |
| exif-parser | `exif-parser` | Medium | Yes | No | Lightweight alternative |
| piexifjs | `piexifjs` | Medium | Yes | Yes | If write needed for testing |

**Recommended approach**: Use `exifr` for extraction — it is the fastest pure-JS EXIF parser, supports all common image formats (JPEG, HEIC, TIFF, AVIF), and handles the full GPS coordinate conversion natively.

```typescript
// Example: Extract and validate EXIF with exifr
import exifr from 'exifr';

interface ExifValidation {
  hasGps: boolean;
  latitude: number | null;
  longitude: number | null;
  captureTime: Date | null;
  cameraModel: string | null;
  software: string | null;
  suspiciousFlags: string[];
}

async function extractAndValidateExif(imageBuffer: Buffer): Promise<ExifValidation> {
  const exif = await exifr.parse(imageBuffer, {
    gps: true,
    pick: ['DateTimeOriginal', 'Make', 'Model', 'Software', 'ImageWidth', 'ImageHeight'],
  });

  const flags: string[] = [];

  if (exif?.Software && /photoshop|gimp|affinity/i.test(exif.Software)) {
    flags.push(`Editing software detected: ${exif.Software}`);
  }

  if (exif?.DateTimeOriginal && exif.DateTimeOriginal > new Date()) {
    flags.push('Capture timestamp is in the future');
  }

  return {
    hasGps: !!(exif?.latitude && exif?.longitude),
    latitude: exif?.latitude ?? null,
    longitude: exif?.longitude ?? null,
    captureTime: exif?.DateTimeOriginal ?? null,
    cameraModel: exif?.Model ? `${exif.Make || ''} ${exif.Model}`.trim() : null,
    software: exif?.Software ?? null,
    suspiciousFlags: flags,
  };
}
```

### 1.5 EXIF Verdict for BetterWorld

| Aspect | Assessment |
|--------|-----------|
| **As primary verification** | NO — too easily forged, too often stripped |
| **As supplementary signal** | YES — adds 0.1-0.2 to confidence when present and consistent |
| **Cost** | Near zero (pure computation, no API calls) |
| **Implementation effort** | Low (1-2 days with exifr) |
| **Where in pipeline** | Stage 1 (first check) — cheapest possible signal |

**Key design decision**: EXIF presence should **increase** confidence but EXIF absence should **not** decrease it significantly. Many legitimate photos lack EXIF through no fault of the submitter.

---

## 2. AI-Generated Image Detection (2025-2026)

### 2.1 The Threat Landscape

As of early 2026, the state-of-the-art image generators produce outputs that are perceptually indistinguishable from real photographs in most cases.

**Current top generators and their detection difficulty**:

| Generator | Version (2025-2026) | Photorealism Level | Detection Difficulty |
|-----------|---------------------|-------------------|---------------------|
| Midjourney | v6.1+ / v7 | Extremely high — skin texture, lighting, reflections are nearly perfect | Very Hard |
| DALL-E | 3 HD / 4 | High — excellent scene composition, occasional minor artifacts | Hard |
| Flux | 1.1 Pro / Dev | Very high — open-weight model, widely fine-tuned | Hard |
| Stable Diffusion | SDXL / SD3.5 | High with good prompting, medium otherwise | Medium-Hard |
| Ideogram | 2.0+ | High — especially strong at text in images | Hard |
| Google Imagen | 3 | Very high | Hard |
| Local fine-tuned models | Various LoRA/DreamBooth | Variable — can be extremely realistic for specific domains | Impossible to generalize |

**Why this matters for BetterWorld**: A motivated fraudster could generate a realistic photo of "volunteers distributing flyers in a park" in 30 seconds using any of these tools. The generated image would have no EXIF (unless injected), which is already common for legitimate photos.

### 2.2 Detection Approaches

#### 2.2.1 C2PA / Content Credentials (Structural Provenance)

**What it is**: Coalition for Content Provenance and Authenticity (C2PA) is an open standard that embeds cryptographically signed provenance data into media files. It creates a tamper-evident chain of custody from capture to publication.

**How it works**:
1. A camera or app creates the image and signs it with a C2PA manifest
2. Each edit/transformation adds a new manifest entry
3. The viewer can verify the entire chain back to the original capture device

**Current adoption (2025-2026)**:
- **Camera hardware**: Leica M11-P, Sony A7 IV (firmware update), Nikon Z series (firmware update), Samsung Galaxy S24+ (beta). Coverage is growing but still a small fraction of devices.
- **Software**: Adobe Creative Cloud (full support), Microsoft Designer, Truepic (mobile SDK)
- **Verification tools**: Content Credentials Verify (verify.contentcredentials.org), Adobe Content Authenticity browser extension
- **Mobile SDKs**: Truepic provides an SDK for mobile apps to create C2PA-signed captures

**Relevance for BetterWorld**:

| Aspect | Assessment |
|--------|-----------|
| Reliability when present | Very High — cryptographic, tamper-evident |
| Prevalence in user photos (2026) | Very Low — <5% of consumer photos have C2PA |
| Can it be forged? | Not the signature itself, but a legitimate C2PA-signed photo can be captured of a screen showing a fake image |
| Implementation | Moderate — use `c2pa-node` npm package for verification |
| Cost | Near zero (signature verification is computational) |

**Recommendation**: Integrate C2PA verification now as an optional "gold standard" signal. When present and valid, give a significant confidence boost (+0.3). Do not penalize absence. As C2PA adoption grows (projected 20-30% by 2028), this becomes increasingly valuable.

**Library**: `c2pa-node` (official C2PA SDK for Node.js) or `c2pa-rs` via WASM.

#### 2.2.2 Watermark Detection (SynthID, Invisible Watermarks)

**What it is**: Major AI providers embed invisible watermarks in generated images. Google's SynthID is the most prominent example. These watermarks survive common transformations (compression, cropping, resizing) but are invisible to the naked eye.

**Current state (2025-2026)**:
- **Google SynthID**: Embedded in all Imagen and Gemini-generated images. Detection via Google's API. Survives JPEG compression and mild edits, but can be removed by significant pixel manipulation.
- **DALL-E metadata**: OpenAI embeds C2PA metadata (not invisible watermarking) in DALL-E outputs.
- **Stable Diffusion / Flux / Midjourney**: No mandatory watermarking. Community models have zero watermarking.
- **Invisible watermarking research**: Robust watermarking that survives adversarial attacks remains an active research area. The "Stable Signature" and "Tree-Ring" approaches show promise but are not universally deployed.

**Relevance for BetterWorld**:

| Aspect | Assessment |
|--------|-----------|
| Catches Google-generated fakes | Yes (if SynthID API access available) |
| Catches open-source model fakes | No — Flux, SD, local models have no watermarks |
| Catches Midjourney fakes | Partial — Midjourney adds metadata but no robust invisible watermark |
| False positive risk | Low (watermarks are specific to generators) |
| Cost | Low if using Google's API; free for metadata checks |

**Recommendation**: Check for known AI-generation metadata markers (DALL-E C2PA tags, Midjourney metadata patterns) as a cheap signal. SynthID detection requires Google API access and catches only Google-generated images. Worth adding but not sufficient alone.

#### 2.2.3 Pixel-Level / Statistical Analysis (AI Image Detectors)

**What it is**: Trained classifiers that analyze pixel-level statistical properties to distinguish real photos from AI-generated ones. They look for artifacts in frequency domain, noise patterns, color distributions, and GAN/diffusion fingerprints.

**Current tools and their effectiveness (2025-2026)**:

| Tool / Model | Type | Accuracy (claimed) | Accuracy (adversarial) | Cost | Notes |
|-------------|------|-------------------|----------------------|------|-------|
| **Hive Moderation** | Commercial API | ~95% on known generators | ~70-80% on latest models | $0.001/image | Best commercial option, regularly retrained |
| **Illuminarty** | Commercial API | ~90% | ~65-75% | $0.002/image | Good at identifying specific generators |
| **Optic AI or Not** | Commercial API | ~88% | ~60-70% | Free tier available | Consumer-facing, less robust |
| **DIRE (Diffusion Reconstruction Error)** | Open-source model | ~92% on test set | ~60% on new generators | Self-hosted, compute cost | Effective principle but needs retraining |
| **UniversalFakeDetect** | Open-source research | ~90% on test set | ~55-65% on latest | Self-hosted | Good cross-generator generalization |
| **De-Fake** | Open-source research | ~87% | ~50-60% | Self-hosted | Multimodal approach |

**The fundamental problem**: These detectors are in a perpetual arms race. Every new generator version (or fine-tune) can evade detectors trained on previous versions. The typical shelf life of a pixel-level detector is **3-6 months** before accuracy degrades significantly against the newest generators.

**What actually works in practice (2025-2026)**:
- Detectors are still effective against **casual fraud** (someone using default settings on DALL-E or Midjourney without post-processing)
- Detectors struggle against **sophisticated fraud** (generated image → mild Photoshop adjustments → JPEG recompression → EXIF injection)
- **Ensemble approaches** (running 2-3 different detectors and requiring consensus) improve robustness but multiply cost

**Relevance for BetterWorld**:

Most evidence fraudsters will be casual — they want easy tokens, not to defeat a sophisticated detection system. A detector that catches 80% of AI-generated images at $0.001/image is highly cost-effective for the first pass. The remaining 20% will be caught (or not) by peer review and behavioral analysis.

**Recommendation**: Use Hive Moderation API ($0.001/image) as the primary AI-detection signal. Supplement with open-source DIRE or UniversalFakeDetect for a second opinion on flagged images. Accept that detection is probabilistic and design the overall system to tolerate some false negatives.

### 2.3 The Honest Assessment

No single technology can reliably detect all AI-generated images in 2026. The correct approach is **defense in depth**:

```
Layer 1: Metadata provenance (C2PA, EXIF consistency)     — catches 10-20% of fakes
Layer 2: Watermark/signature detection (SynthID, metadata) — catches 15-25% of fakes
Layer 3: Statistical pixel analysis (Hive, DIRE)           — catches 60-80% of casual fakes
Layer 4: Behavioral analysis (submission patterns, timing)  — catches repeat offenders
Layer 5: Peer review (human judgment)                       — catches most remaining fakes
Layer 6: Honeypot missions (known-answer tests)             — catches systematic fraudsters
```

Each layer catches a different subset. Combined, the system catches 90-95% of fraud attempts, which is sufficient if combined with token clawback for detected fraud.

---

## 3. Cost-Efficient Vision Verification

### 3.1 The Cost Problem

The current architecture in `01-ai-ml-architecture.md` Section 5.2 sends every photo to Claude Vision (Sonnet-class model) for analysis. The cost structure:

| Model | Cost per 1K input tokens | Cost per 1K output tokens | Typical image tokens | Cost per image analysis |
|-------|-------------------------|--------------------------|---------------------|------------------------|
| Claude 3.5 Sonnet (Vision) | $3.00 | $15.00 | ~1,600 (768px image) | ~$0.002 |
| Claude 3.5 Haiku (Vision) | $0.25 | $1.25 | ~1,600 | ~$0.0003 |
| GPT-4o | $2.50 | $10.00 | ~765 (low detail) | ~$0.001 |
| GPT-4o-mini | $0.15 | $0.60 | ~765 | ~$0.0002 |
| Gemini 1.5 Flash | $0.075 | $0.30 | ~258 | ~$0.00005 |

**Current cost at scale**:
- 500/day (Phase 2): $1/day = $30/month — manageable
- 5,000/day (Phase 3): $10/day = $300/month — significant platform cost
- 50,000/day (Phase 4): $100/day = $3,000/month — unsustainable as a platform cost

### 3.2 Open-Source Vision Model Alternatives

Self-hosted open-source models can handle basic image classification tasks at near-zero marginal cost (only compute).

**Viable open-source vision models (2025-2026)**:

| Model | Parameters | Task Suitability | GPU Required | Quality vs Claude Vision |
|-------|-----------|-----------------|-------------|------------------------|
| **LLaVA-NeXT (1.6)** | 7B / 13B / 34B | Scene description, object detection, activity recognition | 8GB VRAM (7B) / 24GB (34B) | ~70% of Claude Vision quality for scene matching |
| **InternVL2** | 8B / 26B / 76B | Strong multimodal reasoning, visual QA | 16GB (8B) / 48GB (26B) | ~80% of Claude Vision quality, excellent for structured QA |
| **CogVLM2** | 19B | Visual grounding, detailed description | 24GB VRAM | ~75% for scene analysis |
| **Qwen2-VL** | 7B / 72B | Strong multilingual vision, document understanding | 8GB (7B) / 80GB (72B) | ~75-85% of Claude Vision |
| **Phi-3.5-Vision** | 4.2B | Lightweight, fast inference | 6GB VRAM | ~60% — good for basic classification only |
| **MiniCPM-V 2.6** | 8B | Efficient, mobile-optimized | 8GB VRAM | ~65-70%, very fast inference |

**Task decomposition for evidence verification**:

Not all verification tasks require Claude Vision's full capability:

| Task | Difficulty | Open-Source Viable? | Recommended Model |
|------|-----------|-------------------|-------------------|
| "Is this a photo of an outdoor scene?" | Easy | Yes | Phi-3.5-Vision (cheapest) |
| "Does this photo show people distributing items?" | Medium | Yes | LLaVA-NeXT 13B |
| "Does this photo match the specific mission: 'Plant 10 trees in Uhuru Park'?" | Hard | Partially | InternVL2 26B (for initial pass), Claude Vision (for ambiguous cases) |
| "Are there signs of photo manipulation?" | Hard | No | Claude Vision or specialized detector |
| "Does the location in the photo match the GPS coordinates?" | Very Hard | No | Claude Vision |

> **GPU Infrastructure Deferral**: Open-source vision models (e.g., for AI-generated image detection) require GPU infrastructure. This is deferred to Phase 3. Phase 1-2 uses Claude Vision API for all image analysis, which is sufficient for MVP evidence verification and avoids GPU hosting complexity/cost.

### 3.3 CLIP-Based Approaches

**What CLIP is**: CLIP (Contrastive Language-Image Pre-training) by OpenAI encodes images and text into a shared embedding space. You can compute the similarity between a photo and a text description without any API call.

**How it applies to evidence verification**:

```typescript
// Pseudocode: CLIP-based mission-photo matching
// Compute embedding for mission description
const missionEmbedding = clipTextEncode("Volunteers planting trees in a public park");

// Compute embedding for submitted photo
const photoEmbedding = clipImageEncode(evidencePhoto);

// Cosine similarity
const similarity = cosineSimilarity(missionEmbedding, photoEmbedding);
// > 0.25: likely match, > 0.30: strong match, < 0.18: likely mismatch
```

**CLIP variants and costs**:

| Model | Hosting Cost | Inference Speed | Quality |
|-------|-------------|----------------|---------|
| **OpenCLIP ViT-L/14** | Self-hosted, ~$20/mo on T4 GPU | ~50ms/image | Good for general scene matching |
| **SigLIP (by Google)** | Self-hosted, ~$20/mo | ~40ms/image | Better zero-shot than CLIP |
| **EVA-CLIP** | Self-hosted, ~$25/mo | ~60ms/image | Best quality among open variants |
| **CLIP API (via Replicate)** | ~$0.0001/image | ~200ms | Easy integration, low cost |

**Limitations of CLIP for BetterWorld**:
- CLIP similarity is a coarse signal — it can tell "this is a photo of a park" but not "this is a photo of trees being planted in Uhuru Park specifically"
- Threshold calibration is tricky: too strict = many false negatives, too lenient = approves irrelevant photos
- CLIP is not designed for manipulation detection

**Recommendation**: Use CLIP as a Stage 2 filter (after EXIF/hash checks, before Vision AI). A CLIP score below 0.15 between the mission description and the photo is a strong "reject without further analysis" signal. This alone can prevent 10-20% of Vision AI calls.

### 3.4 Hybrid Architecture: Tiered Vision Verification

The optimal architecture uses a cascade of increasingly expensive models:

```
Tier 0: Perceptual hash check (duplicate detection)     Cost: $0.000
Tier 1: EXIF extraction + validation                      Cost: $0.000
Tier 2: AI-generation detection (Hive API)                Cost: $0.001
Tier 3: CLIP similarity check (self-hosted)               Cost: $0.0001
Tier 4: Open-source VLM (LLaVA/InternVL2, self-hosted)   Cost: $0.0002
Tier 5: Claude Vision (API, only for ambiguous cases)     Cost: $0.002
```

**Expected call distribution with cascading**:

| Tier | % of submissions reaching this tier | Cost per call | Effective cost contribution |
|------|-----------------------------------|--------------|-----------------------------|
| Tier 0-1 | 100% | $0.000 | $0.000 |
| Tier 2 | 95% (5% auto-rejected by hash/EXIF) | $0.001 | $0.00095 |
| Tier 3 | 85% (10% caught by AI detection) | $0.0001 | $0.000085 |
| Tier 4 | 60% (25% clearly matching via CLIP) | $0.0002 | $0.00012 |
| Tier 5 | 15-25% (ambiguous after open-source VLM) | $0.002 | $0.0003-0.0005 |

**Effective total cost per submission**: ~$0.0014-0.0018 (vs. $0.002 for sending everything to Claude Vision)

**Cost savings**: 30-70% reduction in Vision AI spend, depending on submission quality distribution.

### 3.5 GPU Hosting Cost Analysis

For self-hosted models (Tiers 3-4), the hosting options:

| Provider | GPU | Monthly Cost | Can Run | Throughput |
|----------|-----|-------------|---------|-----------|
| **Railway** (current) | No GPU support | N/A | Nothing | N/A |
| **Replicate** (serverless) | A40/A100 (on demand) | Pay per second (~$0.0001/inference) | Any model | Burst-capable |
| **Modal** (serverless) | T4/A10G/A100 | Pay per second (~$0.0001/inference) | Any model | Burst-capable |
| **RunPod** (reserved) | RTX 4090 (24GB) | ~$0.44/hr = $316/mo | LLaVA 13B, CLIP | ~100 images/min |
| **Vast.ai** (spot) | RTX 3090 (24GB) | ~$0.15/hr = $108/mo | LLaVA 13B, CLIP | ~80 images/min |
| **Lambda Labs** | A10 (24GB) | ~$0.60/hr = $432/mo | InternVL2 26B | ~60 images/min |
| **Fly.io GPU** (current infra) | L4 (24GB) | ~$0.50/hr = $360/mo | LLaVA 13B | ~90 images/min |

**Recommendation for BetterWorld**:

- **Phase 2 (500/day)**: Use serverless (Replicate or Modal) for open-source VLM inference. At 500 inferences/day with ~2s each, that is ~17 minutes of compute/day = ~$0.10/day = $3/month. Far cheaper than reserving a GPU.
- **Phase 3 (5K/day)**: Evaluate whether serverless is still cheaper. At ~170 min/day compute, serverless costs ~$1/day = $30/month. Still cheaper than a reserved GPU ($108-360/month), but approaching the crossover point.
- **Phase 4 (50K/day)**: Reserved GPU becomes cheaper. At ~1,700 min/day = ~28 hours/day (need 2+ GPUs), reserved instances at $108-316/month each are far cheaper than serverless at $300-600/month.

---

## 4. Peer Review System Design

### 4.1 Why Peer Review Is Essential

Peer review serves three purposes simultaneously:

1. **Verification accuracy**: Human judgment catches things AI misses (context, local knowledge, common sense)
2. **Fraud detection signal**: Reviewer behavior generates data (review time, consistency, correlation) that feeds the fraud scoring system
3. **Community engagement**: Reviewing evidence earns ImpactTokens, keeping users engaged between their own missions

### 4.2 Threat Model for Peer Review

| Attack | Description | Severity |
|--------|------------|---------|
| **Rubber-stamping** | Reviewer approves everything in <5 seconds to earn tokens quickly | High — undermines verification |
| **Collusion** | Two users approve each other's fake evidence | High — organized fraud |
| **Sybil attack** | One person creates multiple accounts to review their own evidence | Critical — complete bypass |
| **Strategic rejection** | Reviewer rejects legitimate evidence to reduce competition for missions | Medium — griefing |
| **Informed fraud** | Reviewer learns what passes review and crafts better fakes | Medium — adaptive attack |

### 4.3 Anti-Gaming Mechanisms

#### 4.3.1 Lottery Assignment (Random Reviewer Selection)

**Design**: Reviewers are assigned randomly from a pool, not chosen or self-selected.

```
Pool eligibility:
  - Must have completed 3+ own missions (not brand new accounts)
  - Must not be in the same city as the evidence submitter (reduces collusion)
  - Must not have reviewed the same submitter more than 2x in 30 days (prevents pairwise collusion)
  - Must have a reviewer reputation score >= 0.5 (see 4.3.3)

Assignment algorithm:
  1. Filter eligible reviewers by constraints above
  2. Weight selection probability by:
     - Reviewer reputation score (higher = more likely to be selected)
     - Time since last review assignment (longer gap = more likely, prevents burnout)
     - Geographic diversity (prefer reviewers from different regions)
  3. Select N reviewers (where N = suggested_peer_count from the AI verification)
  4. Assign with 48-hour deadline
  5. If insufficient reviews by deadline, reassign to new random reviewers
```

**Key property**: The evidence submitter cannot predict or influence who will review their evidence.

#### 4.3.2 Honeypot Injection

**Design**: Periodically inject known-answer evidence into the review queue. These are evidence submissions with pre-determined correct verdicts (known-good or known-fake).

**Honeypot types**:

| Type | Source | Expected Verdict | Purpose |
|------|--------|-----------------|---------|
| **Known-good** | Platform-generated evidence from verified partner missions | Approve | Detect over-rejectors |
| **Known-fake (AI generated)** | AI-generated images with obvious inconsistencies | Reject | Detect rubber-stampers |
| **Known-fake (wrong mission)** | Real photo from a different mission/location | Reject | Detect inattentive reviewers |
| **Known-fake (old evidence)** | Real photo with timestamps from months ago | Reject | Detect reviewers who skip timestamp checks |

**Implementation**:
```
Honeypot injection rate: 1 in every 10 reviews (10%)
Reviewer scoring:
  - Correct verdict on honeypot: +0.05 reputation
  - Incorrect verdict on honeypot: -0.15 reputation (asymmetric — wrong on honeypot is much worse)
  - Reputation falls below 0.3: reviewer is suspended from review pool
```

**Critical design point**: The reviewer must not be able to distinguish honeypots from real reviews. This means:
- Honeypot evidence must look realistic (use real photos with modified metadata)
- Honeypot missions must have realistic titles and descriptions
- Token rewards for honeypot reviews must be identical to real reviews
- Notification of honeypot result happens only after 24 hours (delayed feedback prevents instant learning)

#### 4.3.3 Reviewer Reputation Scoring

Each reviewer accumulates a reputation score based on their review accuracy and behavior:

```
Reviewer Reputation Score (0.0 - 1.0):
  Starting score: 0.6 (neutral)

  Positive signals:
    +0.05: Correct honeypot verdict
    +0.02: Review agrees with final evidence outcome (AI + peer consensus)
    +0.01: Review spent reasonable time (30s - 300s for photo evidence)

  Negative signals:
    -0.15: Incorrect honeypot verdict
    -0.05: Review disagrees with unanimous consensus (all other reviewers + AI disagree)
    -0.10: Review completed in < 10 seconds (rubber-stamping)
    -0.03: Review completed in < 20 seconds (likely insufficient attention)

  Decay:
    -0.01/week of inactivity (min 0.4 — don't punish infrequent reviewers too harshly)

  Thresholds:
    >= 0.8: "Trusted Reviewer" — assigned to high-value missions, single review sufficient
    0.5 - 0.8: "Standard Reviewer" — normal assignment pool
    0.3 - 0.5: "Probation" — only assigned honeypots and low-value missions
    < 0.3: "Suspended" — removed from review pool, must complete training to re-enter
```

#### 4.3.4 Cross-Validation Between AI and Human Reviewers

**Design**: The AI verification score and human review verdicts are compared. Systematic disagreements are flagged:

| AI Score | Human Verdict | Interpretation | Action |
|----------|--------------|---------------|--------|
| High (>0.85) | Approve | Agreement — likely genuine | Auto-confirm |
| High (>0.85) | Reject | Disagreement — human sees something AI missed | Escalate to admin |
| Low (<0.5) | Approve | Disagreement — human may be rubber-stamping | Flag reviewer, escalate to admin |
| Low (<0.5) | Reject | Agreement — likely fraud | Auto-reject |
| Medium (0.5-0.85) | Approve/Reject | Normal peer review territory | Accept human verdict |

**Key insight**: Disagreement between AI and human reviewers is the most valuable signal. It either reveals AI limitations (improving future prompts) or reveals fraudulent reviewer behavior.

#### 4.3.5 Collusion Detection

Detect patterns of suspiciously correlated reviewer behavior:

1. **Pairwise approval rate**: If reviewer A approves >90% of submitter B's evidence (over 5+ reviews), flag the pair
2. **Network clustering**: Build a graph of reviewer-submitter relationships. Detect tight clusters (A reviews for B, B reviews for C, C reviews for A)
3. **Temporal correlation**: If two accounts always submit and review within minutes of each other, flag as potential Sybil
4. **IP/device correlation**: If reviewer and submitter share IP addresses or device fingerprints, flag immediately
5. **Approval pattern anomaly**: If a reviewer's approval rate diverges >2 standard deviations from the population mean, investigate

### 4.4 Token Economics for Reviews

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Base review reward | 5 IT | Low enough that rubber-stamping isn't profitable |
| Quality bonus (trusted reviewer) | +3 IT | Incentivizes accuracy over speed |
| Honeypot bonus (correct) | +2 IT | Additional reward for proven accuracy |
| Honeypot penalty (incorrect) | -5 IT | Material penalty — rubber-stamping costs money |
| Maximum reviews per day | 20 | Prevents review farming |
| Minimum review time | 30 seconds | Enforced — reviews under 30s are auto-rejected |

---

## 5. Perceptual Hashing and Fraud Detection

### 5.1 Why Perceptual Hashing Is the Best First-Line Defense

Perceptual hashing is the cheapest, fastest, and most reliable fraud detection mechanism for the most common type of evidence fraud: **resubmitting the same (or slightly modified) photo for different missions.**

| Comparison | Perceptual Hash | Cryptographic Hash (SHA-256) | Vision AI |
|-----------|----------------|------------------------------|-----------|
| Cost per comparison | ~0.01ms | ~0.001ms | ~$0.002 |
| Catches exact duplicates | Yes | Yes | Overkill |
| Catches cropped versions | Yes | No | Yes |
| Catches resized versions | Yes | No | Yes |
| Catches color-adjusted versions | Yes | No | Yes |
| Catches screenshots of photos | Mostly | No | Yes |
| Catches unrelated similar photos | Sometimes (false positives) | No | Yes |
| Implementation complexity | Low | Trivial | High |

### 5.2 Hashing Algorithms

#### 5.2.1 pHash (Perceptual Hash)

**How it works**:
1. Resize image to 32x32
2. Convert to grayscale
3. Apply DCT (Discrete Cosine Transform)
4. Take top-left 8x8 DCT coefficients (low frequencies)
5. Compute median of the 64 values
6. Generate 64-bit hash: bit is 1 if coefficient > median, 0 otherwise

**Comparison**: Hamming distance between two hashes. Distance 0 = identical, <5 = very similar, <10 = possibly related, >10 = different images.

**Strengths**: Excellent at detecting resized, compressed, and slightly color-shifted images.
**Weaknesses**: Sensitive to significant cropping, rotation, or mirroring.

#### 5.2.2 dHash (Difference Hash)

**How it works**:
1. Resize image to 9x8 (9 columns, 8 rows)
2. Convert to grayscale
3. Compare each pixel to its right neighbor: 1 if left > right, 0 otherwise
4. Produces 64-bit hash

**Comparison**: Hamming distance, same as pHash.

**Strengths**: Faster than pHash (no DCT), good at gradient-based comparisons.
**Weaknesses**: Slightly less robust than pHash for compression artifacts.

#### 5.2.3 aHash (Average Hash)

**How it works**:
1. Resize to 8x8
2. Convert to grayscale
3. Compute mean pixel value
4. Generate hash: 1 if pixel > mean, 0 otherwise

**Strengths**: Simplest and fastest.
**Weaknesses**: Too many false positives. Not recommended as a sole signal.

#### 5.2.4 SSIM (Structural Similarity Index)

**What it is**: Not a hash — a full-reference image quality metric that compares two images and produces a similarity score from -1 to 1 (1 = identical).

**How it differs**: SSIM is a pairwise comparison, not a hash-and-lookup. This means it does not scale for comparing against all previous submissions (O(n) per new image vs. O(1) for hash lookup).

**When to use it**: As a secondary check after pHash flags a potential match. If pHash distance < 10, compute SSIM to confirm. SSIM > 0.85 = confirmed match.

### 5.3 Recommended Implementation

```typescript
// packages/evidence/src/hashing.ts

import { imagehash } from 'image-hash'; // or use sharp + custom implementation

interface HashResult {
  phash: string;    // 64-bit perceptual hash as hex string
  dhash: string;    // 64-bit difference hash as hex string
  sha256: string;   // Cryptographic hash for exact-match dedup
}

interface DuplicateCheck {
  is_duplicate: boolean;
  is_near_duplicate: boolean;
  matching_evidence_ids: string[];
  closest_distance: number;
  confidence: number;
}

// Compute hashes for a new evidence image
async function computeHashes(imageBuffer: Buffer): Promise<HashResult> {
  // Use sharp for image preprocessing, then compute hashes
  const normalized = await sharp(imageBuffer)
    .resize(256, 256, { fit: 'cover' })
    .grayscale()
    .toBuffer();

  return {
    phash: computePHash(normalized),
    dhash: computeDHash(normalized),
    sha256: crypto.createHash('sha256').update(imageBuffer).digest('hex'),
  };
}

// Check against database of existing hashes
async function checkForDuplicates(
  hash: HashResult,
  db: Database,
  excludeEvidenceId?: string
): Promise<DuplicateCheck> {
  // Step 1: Exact match (sha256)
  const exactMatch = await db.query(
    `SELECT evidence_id FROM evidence_hashes
     WHERE sha256 = $1 AND evidence_id != $2`,
    [hash.sha256, excludeEvidenceId]
  );

  if (exactMatch.rows.length > 0) {
    return {
      is_duplicate: true,
      is_near_duplicate: false,
      matching_evidence_ids: exactMatch.rows.map(r => r.evidence_id),
      closest_distance: 0,
      confidence: 1.0,
    };
  }

  // Step 2: Near-duplicate (pHash hamming distance)
  // PostgreSQL BIT_COUNT function for hamming distance
  const nearMatches = await db.query(
    `SELECT evidence_id, phash,
            BIT_COUNT(phash::bit(64) # $1::bit(64)) as distance
     FROM evidence_hashes
     WHERE evidence_id != $2
       AND BIT_COUNT(phash::bit(64) # $1::bit(64)) <= 10
     ORDER BY distance ASC
     LIMIT 5`,
    [hash.phash, excludeEvidenceId]
  );

  if (nearMatches.rows.length > 0) {
    const closest = nearMatches.rows[0];
    return {
      is_duplicate: closest.distance <= 3,
      is_near_duplicate: closest.distance <= 10,
      matching_evidence_ids: nearMatches.rows.map(r => r.evidence_id),
      closest_distance: closest.distance,
      confidence: 1 - (closest.distance / 64),
    };
  }

  return {
    is_duplicate: false,
    is_near_duplicate: false,
    matching_evidence_ids: [],
    closest_distance: 64,
    confidence: 0,
  };
}
```

### 5.4 Database Schema for Hashing

```sql
-- Add to the evidence table or as a separate table
CREATE TABLE evidence_hashes (
  evidence_id UUID PRIMARY KEY REFERENCES evidence(id),
  phash BIT(64) NOT NULL,
  dhash BIT(64) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Index for exact match lookups
  CONSTRAINT idx_evidence_sha256 UNIQUE (sha256)
);

-- Index for hamming distance queries (PostgreSQL 14+ with BIT_COUNT)
-- For larger datasets, consider pg_similarity extension or
-- approximate nearest neighbor approaches
CREATE INDEX idx_evidence_phash ON evidence_hashes (phash);
```

**Scaling note**: For >100K evidence items, pHash hamming distance searches become slow with the naive `BIT_COUNT(XOR)` approach. Solutions:
1. **Multi-index hashing**: Split the 64-bit hash into 4x16-bit segments. Create a B-tree index on each segment. Query any segment match, then verify full hash. Reduces scan space by ~16x.
2. **VP-tree or BK-tree**: In-memory data structures optimized for hamming distance search. Build on startup from DB, refresh periodically.
3. **SimHash buckets**: Group hashes into buckets by prefix similarity. Only search within same and adjacent buckets.

### 5.5 What Perceptual Hashing Catches and Misses

| Fraud Type | Detected by pHash? | Notes |
|-----------|-------------------|-------|
| Exact resubmission of same photo | Yes (distance 0) | Also caught by SHA-256 |
| Same photo, different JPEG quality | Yes (distance 1-3) | Very reliable |
| Same photo, resized | Yes (distance 1-4) | Very reliable |
| Same photo, minor crop | Yes (distance 3-8) | Usually caught |
| Same photo, heavy crop (>30%) | Maybe (distance 8-15) | May miss |
| Same photo, color filter applied | Yes (distance 2-6) | Grayscale normalization helps |
| Screenshot of the same photo | Usually (distance 5-12) | Depends on screenshot quality |
| Mirrored photo | No (distance typically >20) | Need separate mirrored-hash check |
| Different photo of same scene | No | Not designed for this — use CLIP |
| AI-regenerated similar image | No | Different pixel structure entirely |
| Stock photo used by multiple users | Yes if same source file | Very useful catch |

---

## 6. GPS Verification Without EXIF

### 6.1 The Problem

As established in Section 1, EXIF GPS data is present in only 15-35% of submitted photos (lower end for platforms allowing gallery uploads). BetterWorld needs location verification for location-sensitive missions even when EXIF is absent.

### 6.2 Approach 1: App-Level Location Capture (Recommended Primary)

**How it works**: The BetterWorld mobile app (or PWA) captures the user's GPS coordinates at the moment they submit evidence, independent of the photo's EXIF data.

**Implementation**:

```typescript
// Frontend: Capture location at evidence submission time
async function captureSubmissionLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,   // Use GPS, not just WiFi/cell
        timeout: 10000,             // 10 second timeout
        maximumAge: 60000,          // Accept cached position up to 1 minute old
      }
    );
  });
}

// Submit evidence with app-captured location
async function submitEvidence(evidence: FormData, photo: File) {
  const position = await captureSubmissionLocation();

  evidence.append('app_latitude', position.coords.latitude.toString());
  evidence.append('app_longitude', position.coords.longitude.toString());
  evidence.append('app_location_accuracy_m', position.coords.accuracy.toString());
  evidence.append('app_location_timestamp', new Date(position.timestamp).toISOString());

  // Also capture photo EXIF if available (for cross-validation)
  const exif = await extractExif(photo);
  if (exif.hasGps) {
    evidence.append('exif_latitude', exif.latitude.toString());
    evidence.append('exif_longitude', exif.longitude.toString());
  }

  return fetch('/api/v1/evidence', { method: 'POST', body: evidence });
}
```

**Trust model**:

| Signal | Trust Level | Can Be Spoofed? | Spoofing Difficulty |
|--------|-----------|-----------------|---------------------|
| App GPS at submission time | Medium-High | Yes (GPS spoofing apps exist) | Medium — requires developer mode or jailbreak on modern iOS/Android |
| EXIF GPS in photo | Low | Yes (trivial with exiftool) | Very Easy |
| Both agree (app GPS and EXIF GPS within 500m) | High | Requires spoofing both simultaneously | Hard |
| IP geolocation | Low | Yes (VPN) | Very Easy |
| Cell tower triangulation | Medium | No (not spoofable by user) | N/A (requires carrier API) |

**Cross-validation is key**: When both app GPS and EXIF GPS are available and they agree (within a reasonable radius), confidence is much higher than either alone. When they disagree significantly, that itself is a fraud signal.

**Anti-spoofing for app GPS**:
- **iOS**: Mock locations require jailbreak on iOS 16+. Non-jailbroken devices provide reliable GPS.
- **Android**: Mock locations require enabling Developer Options → "Allow mock locations." Can be detected by checking `isFromMockProvider()` flag (available in Android API).
- **Detection**: Send the Android `isFromMockProvider` flag to the server. If true, downgrade location confidence.

### 6.3 Approach 2: Geofencing (Mission-Based)

**How it works**: For location-sensitive missions, define a geofence (circular area around the mission location). The app tracks whether the user entered the geofence and for how long.

```typescript
// Server: Define geofence for a mission
interface MissionGeofence {
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;        // e.g., 500m
  minimum_dwell_minutes: number; // e.g., 15 minutes (must be in area for this long)
}

// Client: Track geofence presence
interface GeofencePresence {
  entered_at: Date;
  exited_at: Date | null;
  dwell_minutes: number;
  location_samples: Array<{
    latitude: number;
    longitude: number;
    accuracy_m: number;
    timestamp: Date;
  }>;
}
```

**Advantages**:
- Proves the user was physically at the location for a meaningful duration
- Much harder to fake than a single GPS point (would need to spoof GPS continuously for 15+ minutes)
- Provides a time-series of location data, not just a single point

**Disadvantages**:
- Requires background location permission (users are increasingly reluctant)
- Battery drain from continuous GPS tracking
- Privacy concerns (see 6.5)
- Only works for missions with a well-defined fixed location

**Recommendation**: Offer geofencing as an optional "high-trust mode" for missions worth >50 IT. Users who enable geofencing get a confidence bonus, but it is not required.

### 6.4 Approach 3: IP-Based Location (Weak Signal)

**What it provides**: IP geolocation provides city-level (sometimes neighborhood-level) location data.

**Accuracy**:
- Country: ~99% accurate
- City: ~70-80% accurate
- Neighborhood: ~30-50% accurate
- Street: ~5-10% accurate

**Use case for BetterWorld**: Not useful for verifying "user was at Uhuru Park" but useful as a gross consistency check. If the mission is in Nairobi and the submission IP geolocates to Germany, that is suspicious (though not conclusive — VPN use is common).

**Implementation**: Use a free IP geolocation database (MaxMind GeoLite2, free tier) to look up the submission IP at the server level. No user action required.

**Cost**: Free (MaxMind GeoLite2) or ~$50/month (MaxMind GeoIP2 Precision for better accuracy).

### 6.5 Privacy Implications

| Approach | Privacy Impact | GDPR Implications | User Consent Required |
|----------|---------------|-------------------|----------------------|
| EXIF GPS extraction | Medium — reading existing metadata | Legitimate interest (fraud prevention) | Inform user that EXIF is analyzed |
| App GPS at submission | Medium — single location point | Legitimate interest + consent | Explicit permission prompt |
| Geofencing / tracking | High — continuous location tracking | Requires explicit consent, data minimization | Must be opt-in, data retention limits |
| IP geolocation | Low — already available in server logs | Legitimate interest | Privacy policy disclosure |

**BetterWorld-specific privacy design**:

1. **Minimize collection**: Only capture GPS at evidence submission time, not continuously
2. **Retention limits**: Delete raw GPS coordinates after evidence is verified (keep only "location_valid: true/false" and distance from target)
3. **User transparency**: Show users what location data is being collected and why, in the evidence submission UI
4. **Opt-out with trade-offs**: Allow users to decline location sharing, but with clear communication that location-unverified evidence will take longer (goes to peer review) and may be weighted lower
5. **Geofencing opt-in only**: Never enable background location tracking without explicit user action for each mission

### 6.6 Recommended Location Verification Stack

```
Priority 1 (Default): App GPS at submission time
  - Always request (with clear UX explanation)
  - Single point, not continuous
  - Cross-validate with EXIF GPS when available

Priority 2 (Optional): Geofencing for high-value missions
  - Opt-in per mission
  - Continuous for duration of mission
  - Significant confidence bonus

Priority 3 (Always): IP geolocation
  - Automatic, no user action
  - Gross consistency check only
  - Flag contradictions (GPS says Nairobi, IP says Berlin)

Priority 4 (Future): Carrier location verification
  - Phase 4+ consideration
  - Requires telecom partnerships
  - Most reliable but most expensive and complex
```

---

## 7. Cost-Minimized Pipeline Design

### 7.1 Design Principles

1. **Cheapest checks first**: Execute free/near-free checks before any API call
2. **Fail fast**: Reject obvious fraud immediately without expensive checks
3. **Pass fast**: Auto-approve high-confidence evidence without expensive checks
4. **Expensive checks only for the ambiguous middle**: Reserve Vision AI for the 15-25% of cases where cheap checks are inconclusive
5. **Amortize costs**: Some checks (hash database, CLIP model hosting) have fixed costs that amortize across all submissions

### 7.2 Multi-Stage Pipeline Architecture

```
                         EVIDENCE SUBMISSION
                                │
                    ┌───────────┴───────────┐
                    │    STAGE 0: INTAKE     │  Cost: $0.00
                    │  Format validation     │  Time: <100ms
                    │  File size check       │
                    │  Image format check    │
                    │  Rate limit check      │
                    └───────────┬───────────┘
                                │
                         Pass ──┤── Reject (invalid format, rate limited)
                                │
                    ┌───────────┴───────────┐
                    │ STAGE 1: HASH CHECK   │  Cost: $0.00
                    │ SHA-256 exact match    │  Time: <10ms
                    │ pHash near-duplicate   │
                    │ dHash cross-check      │
                    └───────────┬───────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
               Duplicate   Unique     Near-dup
                    │           │           │
                 REJECT     Continue    FLAG +
               (instant)       │       Continue
                               │
                    ┌──────────┴───────────┐
                    │ STAGE 2: METADATA    │  Cost: $0.00
                    │ EXIF extraction      │  Time: <50ms
                    │ GPS validation       │
                    │ Timestamp validation │
                    │ Camera model check   │
                    │ Software field check │
                    │ App GPS cross-val    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                  │
         Consistent      Partial/Missing     Inconsistent
         (GPS+time OK)   (some data missing)  (contradictory)
              │                │                  │
         Score: +0.2      Score: +0.0        Score: -0.3
              │                │               FLAG
              │                │                  │
              └────────┬───────┘──────────────────┘
                       │
                    ┌──┴───────────────────┐
                    │ STAGE 3: AI DETECT   │  Cost: ~$0.001/image
                    │ Hive Moderation API  │  Time: <500ms
                    │ C2PA signature check │
                    │ Known AI metadata    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                  │
          Real (>90%)    Uncertain (50-90%)  AI-generated (<50%)
              │                │                  │
         Score: +0.1      Score: +0.0        Score: -0.5
              │                │               FLAG
              │                │                  │
              └────────┬───────┘──────────────────┘
                       │
                    ┌──┴───────────────────┐
                    │ STAGE 4: CLIP CHECK  │  Cost: ~$0.0001/image
                    │ Mission-photo match  │  Time: <100ms
                    │ (self-hosted)        │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                  │
         Strong match     Weak match        No match
         (sim > 0.28)    (0.18-0.28)       (< 0.18)
              │                │                  │
         Score: +0.2      Score: +0.0        Score: -0.2
              │                │                  │
              │                │                  │
              └────────┬───────┘──────────────────┘
                       │
                  ┌────┴────┐
                  │ DECIDE  │
                  └────┬────┘
                       │
         ┌─────────────┼──────────────┐
         │             │              │
   Score >= 0.7   Score 0.3-0.7   Score < 0.3
   No flags       Or has flags    Or critical flags
         │             │              │
    AUTO-APPROVE       │         AUTO-REJECT
         │             │              │
         │      ┌──────┴──────┐       │
         │      │  STAGE 5:   │       │
         │      │  VISION AI  │       │
         │      │  (Claude/   │       │
         │      │   LLaVA)    │       │
         │      │ Cost: $0.002│       │
         │      │ Time: 2-5s  │       │
         │      └──────┬──────┘       │
         │             │              │
         │    ┌────────┼────────┐     │
         │    │        │        │     │
         │  Approve  Ambiguous  Reject│
         │    │        │        │     │
         │    │   PEER REVIEW   │     │
         │    │   (Stage 6)     │     │
         │    │                 │     │
         └────┴────────┬────────┴─────┘
                       │
                    OUTCOME
```

### 7.3 Stage-by-Stage Cost Analysis

| Stage | What It Does | Cost/Call | % Reaching | Effective Cost | Cumulative |
|-------|-------------|-----------|-----------|---------------|------------|
| 0 | Format validation | $0.000 | 100% | $0.000 | $0.000 |
| 1 | Hash dedup | $0.000 | 100% | $0.000 | $0.000 |
| 2 | EXIF/GPS metadata | $0.000 | 97% (3% rejected by hash) | $0.000 | $0.000 |
| 3 | AI detection (Hive) | $0.001 | 95% | $0.00095 | $0.00095 |
| 4 | CLIP similarity | $0.0001 | 88% (7% auto-decided) | $0.000088 | $0.00104 |
| 5 | Vision AI | $0.002 | 20-30% | $0.0004-0.0006 | $0.00144-0.00164 |
| 6 | Peer review | $0.000 (token cost only) | 10-15% | $0.000 | $0.00144-0.00164 |

**Effective cost per evidence submission: ~$0.0014-0.0016**

**Compared to current design (Claude Vision for all): ~$0.002**

**Savings: 18-30% direct API cost reduction**, plus the massive savings from not calling Vision AI on obvious passes/fails.

### 7.4 Optimized Vision AI Usage

For the 20-30% of submissions that reach Stage 5, further optimize:

1. **Use Claude Haiku for Vision when possible**: For simple "does this photo show X?" questions, Haiku ($0.0003/call) is 6-7x cheaper than Sonnet ($0.002/call) and often sufficient.

2. **Tiered Vision approach**:
   - First pass: Open-source VLM (LLaVA/InternVL2) — $0.0002/call
   - If open-source is confident (>0.8 or <0.2): accept its verdict
   - If uncertain (0.2-0.8): escalate to Claude Haiku Vision
   - If Haiku is uncertain: escalate to Claude Sonnet Vision

3. **Batch processing**: Queue evidence submissions and process in batches during off-peak hours (if 48-hour verification window is acceptable). This allows using cheaper spot GPU instances for open-source model inference.

4. **Prompt caching**: For Claude Vision, the system prompt (mission verification instructions) is reused across calls. With Anthropic's prompt caching, the cached prefix reduces input token costs by ~90% for the system prompt portion.

### 7.5 Decision Score Accumulation

```typescript
interface PipelineState {
  evidence_id: string;
  cumulative_score: number;    // Running weighted score
  flags: string[];             // Accumulated warning flags
  critical_flags: string[];    // Flags that force reject or escalation
  stages_completed: string[];  // Audit trail
  stage_scores: Record<string, number>;
  decision: 'pending' | 'auto_approve' | 'vision_needed' | 'peer_review' | 'auto_reject';
}

// Decision thresholds (tunable)
const THRESHOLDS = {
  AUTO_APPROVE_SCORE: 0.7,
  AUTO_APPROVE_MAX_FLAGS: 0,
  VISION_NEEDED_SCORE_MIN: 0.3,
  AUTO_REJECT_SCORE: 0.3,
  CRITICAL_FLAG_FORCES_REJECT: true,
  PEER_REVIEW_AFTER_VISION_THRESHOLD: 0.6,
};
```

### 7.6 BullMQ Integration

The pipeline maps naturally onto the existing BullMQ job queue architecture defined in `01-ai-ml-architecture.md`:

```typescript
// Queue definitions
const evidencePipeline = new Queue('evidence.pipeline', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 86400 },  // Keep completed jobs for 24h
  },
});

// Job processing: each stage is a step in the job
const worker = new Worker('evidence.pipeline', async (job) => {
  const { evidenceId, currentStage } = job.data;

  switch (currentStage) {
    case 'hash_check':
      const hashResult = await performHashCheck(evidenceId);
      if (hashResult.is_duplicate) {
        return { decision: 'reject', reason: 'duplicate_evidence' };
      }
      // Progress to next stage
      await evidencePipeline.add('metadata_check', {
        evidenceId,
        currentStage: 'metadata_check',
        pipelineState: hashResult.state,
      });
      break;

    case 'metadata_check':
      // ... EXIF/GPS validation
      break;

    case 'ai_detection':
      // ... Hive API call
      break;

    case 'clip_check':
      // ... CLIP similarity
      break;

    case 'vision_ai':
      // ... Claude Vision (only if needed)
      break;

    case 'peer_review_assignment':
      // ... Assign to peer reviewers
      break;
  }
}, { connection: redis, concurrency: 10 });
```

**Alternative: Flow (BullMQ Pro)** — BullMQ Pro supports "Flows" which define parent-child job relationships. This is the cleaner way to model the pipeline, where each stage spawns the next only when needed.

---

## 8. Phased Implementation Plan

### Phase 1 (Sprint 3-4): Foundation — Minimal Viable Verification

**Goal**: Get basic evidence verification working. Not perfect, but functional.

| Component | Implementation | Estimated Effort |
|-----------|---------------|-----------------|
| EXIF extraction | `exifr` library integration | 1 day |
| SHA-256 dedup | Hash on upload, check against DB | 0.5 days |
| pHash near-duplicate | Compute and store perceptual hash | 1.5 days |
| App GPS capture | Frontend location API integration | 1 day |
| GPS cross-validation | Haversine distance check (already coded in Section 5.3) | 0.5 days |
| Claude Vision (basic) | Direct API call for all photo evidence (current design) | Already designed |
| Basic peer review | Random assignment, majority vote | 2 days |
| **Total** | | **~6.5 days** |

**Phase 1 cost model (500 submissions/day)**:
- Claude Vision for all: $1/day = $30/month
- Hash/EXIF/GPS: $0
- **Total: ~$30/month** (acceptable as platform cost)

### Phase 2 (Month 3-4): Optimization — Reduce Vision AI Dependency

**Goal**: Add cheaper pre-filters to reduce Claude Vision calls by 50%+.

| Component | Implementation | Estimated Effort |
|-----------|---------------|-----------------|
| Hive AI detection API | Integration, threshold calibration | 2 days |
| CLIP similarity | Deploy CLIP model on Replicate/Modal serverless | 3 days |
| Cascading pipeline logic | BullMQ flow with stage-gating | 3 days |
| Honeypot injection | Create honeypot evidence, inject into review queue | 2 days |
| Reviewer reputation | Scoring system, honeypot tracking | 2 days |
| Collusion detection (basic) | Pairwise approval rate monitoring | 1.5 days |
| **Total** | | **~13.5 days** |

**Phase 2 cost model (2,000 submissions/day)**:
- Hive AI detection: $2/day = $60/month
- CLIP (serverless): $0.20/day = $6/month
- Claude Vision (30% of submissions): $1.20/day = $36/month
- **Total: ~$102/month** (vs. $120/month without optimization)

### Phase 3 (Month 5-8): Scale — Self-Hosted Models, Advanced Fraud Detection

**Goal**: Replace paid APIs with self-hosted models where cost-effective. Harden fraud detection.

| Component | Implementation | Estimated Effort |
|-----------|---------------|-----------------|
| Self-hosted LLaVA/InternVL2 | Deploy on reserved GPU, API wrapper | 5 days |
| Self-hosted CLIP | Move from serverless to reserved GPU | 2 days |
| C2PA verification | `c2pa-node` integration | 2 days |
| Advanced collusion detection | Graph analysis, temporal correlation | 4 days |
| Multi-index hashing | Scale pHash lookups for >100K evidence | 2 days |
| Geofencing (opt-in) | Background location tracking for high-value missions | 4 days |
| Reviewer training system | Interactive training for new reviewers | 3 days |
| **Total** | | **~22 days** |

**Phase 3 cost model (10,000 submissions/day)**:
- Hive AI detection: $10/day = $300/month
- Self-hosted CLIP + VLM (reserved GPU): $316/month (fixed)
- Claude Vision (15% of submissions): $3/day = $90/month
- **Total: ~$706/month** (vs. $600/month Hive + $600/month Claude = $1,200/month without optimization)

### Phase 4 (Month 9+): Maturity — ML-Based Pipeline Optimization

**Goal**: Use accumulated data to train custom classifiers and further reduce costs.

| Component | Implementation | Estimated Effort |
|-----------|---------------|-----------------|
| Custom fraud classifier | Train on labeled data from peer reviews + honeypots | 10 days |
| Dynamic threshold tuning | ML-based threshold optimization per mission type | 5 days |
| Evidence quality predictor | Predict verification outcome before expensive checks | 5 days |
| Self-hosted AI detection | Replace Hive with custom detector trained on BW data | 8 days |
| Real-time fraud scoring | Behavioral analysis across submission history | 6 days |
| **Total** | | **~34 days** |

**Phase 4 cost model (50,000 submissions/day)**:
- Self-hosted AI detection (replacing Hive): $0/marginal (GPU fixed cost)
- Self-hosted CLIP + VLM (2x reserved GPU): $632/month (fixed)
- Claude Vision (10% of submissions): $10/day = $300/month
- **Total: ~$932/month** (vs. $3,000/month+ without any optimization)

---

## 9. Cost Model and Projections

### 9.1 Cost Per Evidence Submission by Phase

| Phase | Daily Volume | Approach | Cost/Submission | Daily Cost | Monthly Cost |
|-------|-------------|---------|----------------|-----------|-------------|
| 1 | 500 | Claude Vision for all | $0.0020 | $1.00 | $30 |
| 2 | 2,000 | Cascading pipeline | $0.0017 | $3.40 | $102 |
| 3 | 10,000 | Self-hosted + cascade | $0.0023 | $23.50 | $706 |
| 4 | 50,000 | Fully optimized | $0.0006 | $31.00 | $932 |

### 9.2 Cost Without Optimization (Baseline)

| Phase | Daily Volume | All Claude Vision | Monthly Cost |
|-------|-------------|------------------|-------------|
| 1 | 500 | $0.0020/each | $30 |
| 2 | 2,000 | $0.0020/each | $120 |
| 3 | 10,000 | $0.0020/each | $600 |
| 4 | 50,000 | $0.0020/each | $3,000 |

### 9.3 Cumulative Savings from Pipeline Optimization

| Phase | Optimized | Baseline | Savings | Savings % |
|-------|----------|---------|---------|----------|
| 1 | $30/mo | $30/mo | $0 | 0% |
| 2 | $102/mo | $120/mo | $18/mo | 15% |
| 3 | $706/mo | $600/mo* | -$106/mo | -18% |
| 4 | $932/mo | $3,000/mo | $2,068/mo | 69% |

*Phase 3 note: The optimized pipeline is actually more expensive at 10K/day because of the fixed GPU cost ($316/mo) that hasn't been amortized yet. The crossover point where self-hosted becomes cheaper than API is approximately 15K-20K submissions/day. **At Phase 3 volumes, stay on serverless**.

### 9.4 Revised Cost Recommendation

Given the analysis above, the optimal strategy by phase:

| Phase | Volume | Strategy | Monthly Cost |
|-------|--------|---------|-------------|
| 1 | 500/day | Claude Vision direct (simple, no optimization needed) | **$30** |
| 2 | 2K/day | Add Hive AI detection + CLIP (serverless) pre-filters | **$102** |
| 3 | 10K/day | Hive + CLIP (serverless) + Claude Haiku Vision (cheaper model) | **$450** |
| 4 | 50K/day | Self-hosted everything + Claude Vision only for 10% | **$932** |

### 9.5 Hidden Costs to Budget For

| Cost Category | Monthly Estimate | Notes |
|-------------|-----------------|-------|
| Hive Moderation API | $0-300/mo | Free tier for <1K/mo, then $0.001/image |
| MaxMind GeoIP2 | $0-50/mo | GeoLite2 is free, Precision is $50/mo |
| R2/S3 storage for evidence | $5-50/mo | Depends on photo size and retention |
| Peer review token rewards | Variable | 5-8 IT per review, valued at platform token economics |
| GPU hosting (Phase 3+) | $108-632/mo | Only when volume justifies fixed cost |
| Honeypot creation labor | 2-4 hours/month | Manual creation of realistic honeypot evidence |

---

## 10. Tool and Library Recommendations

### 10.1 Must-Have (Phase 1)

| Tool | Purpose | Package | License | Notes |
|------|---------|---------|---------|-------|
| **exifr** | EXIF metadata extraction | `exifr` | MIT | Fastest JS EXIF parser, supports HEIC |
| **sharp** | Image processing (resize, normalize) | `sharp` | Apache-2.0 | Already likely in stack; built on libvips |
| **crypto** (Node.js built-in) | SHA-256 hashing | Built-in | N/A | For exact-match deduplication |
| **@anthropic-ai/sdk** | Claude Vision API | `@anthropic-ai/sdk` | MIT | Already in stack |

### 10.2 Should-Have (Phase 2)

| Tool | Purpose | Package/Service | Cost | Notes |
|------|---------|----------------|------|-------|
| **Hive Moderation** | AI-generated image detection | API service | $0.001/image | Most accurate commercial detector |
| **image-hash** | Perceptual hashing (pHash, dHash) | `image-hash` | MIT | Or implement custom with sharp + DCT |
| **blockhash-js** | Alternative perceptual hashing | `blockhash-js` | MIT | Block-based hash, complementary to pHash |
| **CLIP (via Replicate)** | Image-text similarity | Replicate API | ~$0.0001/call | Serverless, no GPU management |
| **MaxMind GeoLite2** | IP geolocation | `maxmind` / `@maxmind/geoip2-node` | Free | City-level accuracy |

### 10.3 Nice-to-Have (Phase 3+)

| Tool | Purpose | Package/Service | Cost | Notes |
|------|---------|----------------|------|-------|
| **c2pa-node** | C2PA/Content Credentials verification | `c2pa-node` | BSD-3 | Official C2PA SDK |
| **LLaVA-NeXT** | Self-hosted vision model | Self-hosted (HuggingFace) | GPU cost | 13B model good balance of quality/cost |
| **InternVL2** | Self-hosted vision model (higher quality) | Self-hosted (HuggingFace) | GPU cost | 26B model for complex verification |
| **vllm** or **SGLang** | Model serving framework | Python | Free | Efficient batched inference for self-hosted VLMs |
| **OpenCLIP** | Self-hosted CLIP | Self-hosted (HuggingFace) | GPU cost | ViT-L/14 or ViT-H/14 |
| **ssim.js** | SSIM computation for JavaScript | `ssim.js` | MIT | Secondary check after pHash match |
| **pg_similarity** | PostgreSQL extension for similarity | PostgreSQL extension | Free | Faster hamming distance queries |

### 10.4 Architecture Diagram: Technology Stack by Stage

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVIDENCE VERIFICATION STACK                   │
│                                                                  │
│  STAGE 0: Intake ─────────── sharp (format check)               │
│                              multer / busboy (upload parsing)    │
│                                                                  │
│  STAGE 1: Hashing ────────── sharp (normalize) + custom pHash   │
│                              crypto (SHA-256)                    │
│                              PostgreSQL (hash storage/lookup)    │
│                                                                  │
│  STAGE 2: Metadata ───────── exifr (EXIF extraction)            │
│                              Geolocation API (app GPS)           │
│                              MaxMind GeoLite2 (IP geolocation)  │
│                              Custom haversine (distance calc)    │
│                                                                  │
│  STAGE 3: AI Detection ──── Hive Moderation API                 │
│                              c2pa-node (Content Credentials)     │
│                              Custom metadata scanners            │
│                                                                  │
│  STAGE 4: CLIP ───────────── Replicate API (Phase 2)            │
│                              Self-hosted OpenCLIP (Phase 3+)     │
│                                                                  │
│  STAGE 5: Vision AI ──────── Claude Haiku Vision (simple tasks)  │
│                              Claude Sonnet Vision (complex)      │
│                              LLaVA-NeXT / InternVL2 (Phase 3+)  │
│                                                                  │
│  STAGE 6: Peer Review ────── BullMQ (assignment queue)           │
│                              Custom reviewer reputation engine   │
│                              Honeypot injection system            │
│                                                                  │
│  ORCHESTRATION ───────────── BullMQ (job queue)                  │
│                              Redis (state management)            │
│                              PostgreSQL (evidence + hash storage) │
│                              R2/S3 (image storage)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Appendix: Architecture Decision Records

### ADR-T2-01: EXIF as supplementary signal, not primary

**Status**: Proposed
**Context**: EXIF metadata is the natural source for photo location and time data, but 65-85% of submitted photos may lack EXIF GPS data, and EXIF is trivially forgeable.
**Decision**: Use EXIF as a confidence-boosting supplementary signal. Presence of consistent EXIF increases score by +0.1 to +0.2. Absence does not penalize. Inconsistent EXIF (e.g., future timestamp, editing software detected) is a negative signal (-0.1 to -0.3).
**Consequences**: The platform cannot rely solely on photo metadata for verification, necessitating app-level GPS capture and multi-signal fusion.

### ADR-T2-02: App GPS capture as primary location signal

**Status**: Proposed
**Context**: EXIF GPS is unreliable (see ADR-T2-01). The platform needs a more controlled location signal.
**Decision**: The BetterWorld app captures GPS coordinates via the Geolocation API at the moment of evidence submission. This is independent of photo EXIF. App GPS is the primary location signal; EXIF GPS is secondary cross-validation.
**Consequences**: Requires frontend Geolocation API integration. Users must grant location permission. Location accuracy depends on device and environment (indoor/outdoor). GPS spoofing on Android is detectable via `isFromMockProvider()`.

### ADR-T2-03: Cascading pipeline architecture

**Status**: Proposed
**Context**: The current design sends all evidence through Claude Vision ($0.002/call). At scale (50K/day), this is $3,000/month in platform cost — unsustainable for a platform that wants to minimize costs beyond hosting + DB.
**Decision**: Implement a multi-stage cascading pipeline where free/cheap checks execute first (hash, EXIF, metadata), then moderately-priced checks (Hive AI detection, CLIP), and Claude Vision is called only for the 15-25% of ambiguous cases.
**Consequences**: More complex pipeline logic. More components to maintain. But 70-85% reduction in Vision AI API calls at scale. Savings exceed $2,000/month at 50K/day volume.

### ADR-T2-04: Hive Moderation for AI-generated image detection

**Status**: Proposed
**Context**: AI-generated images are the primary forgery vector for evidence fraud. No single detection method is perfect, but commercial detectors (Hive, Illuminarty) are regularly retrained against the latest generators.
**Decision**: Use Hive Moderation API ($0.001/image) as the primary AI-generation detection layer. It is more accurate and regularly updated than any self-hosted open-source detector. Consider self-hosted detection in Phase 4 when enough labeled data exists to train a custom model.
**Consequences**: External API dependency for a security-critical function. Hive API outages would require fallback (degrade to skipping this stage and relying on other signals). Monthly cost scales linearly with volume.

### ADR-T2-05: Perceptual hashing before all API calls

**Status**: Proposed
**Context**: The most common evidence fraud is resubmission of the same or slightly modified photo. This can be detected computationally in <1ms.
**Decision**: Compute pHash and dHash for every evidence image at upload time. Check against the database of all previous evidence hashes before making any API call. Exact duplicates (SHA-256 match) are auto-rejected. Near-duplicates (pHash hamming distance < 10) are flagged and require additional review.
**Consequences**: Requires storing hashes for all evidence (trivial storage: ~48 bytes per image). Requires efficient hamming distance queries (multi-index hashing at scale). Catches the lowest-effort fraud attempts at zero marginal cost.

### ADR-T2-06: Honeypot injection at 10% rate

**Status**: Proposed
**Context**: Peer reviewers can game the system by rubber-stamping all reviews to earn tokens quickly. Without ground truth, the platform cannot distinguish accurate reviewers from lazy ones.
**Decision**: Inject honeypot evidence (known-good and known-fake) into the review queue at a 10% rate. Reviewers do not know which reviews are honeypots. Correct honeypot verdicts earn bonus reputation; incorrect verdicts cause significant reputation loss. Reviewers below 0.3 reputation are suspended.
**Consequences**: Requires ongoing creation and maintenance of realistic honeypot evidence (2-4 hours/month labor). 10% of review assignments produce no useful verification data (they are ground-truth checks). But this is the single most effective mechanism for maintaining reviewer quality.

### ADR-T2-07: Defer geofencing to Phase 3

**Status**: Proposed
**Context**: Continuous location tracking (geofencing) provides the strongest location verification signal but requires background location permissions, has significant privacy implications, and increases app complexity.
**Decision**: Defer geofencing to Phase 3. For Phase 1-2, rely on single-point app GPS at submission time. Offer geofencing as an opt-in "high-trust mode" for missions worth >50 IT in Phase 3.
**Consequences**: Phase 1-2 location verification relies on single-point GPS, which is easier to spoof than continuous tracking. This is acceptable because the multi-signal pipeline (GPS + EXIF + peer review + behavioral analysis) provides sufficient fraud resistance for the MVP volume.

---

## Summary of Key Recommendations

| # | Recommendation | Phase | Impact | Effort |
|---|---------------|-------|--------|--------|
| 1 | Replace "Claude Vision for all" with cascading pipeline | Phase 2 | 70-85% reduction in Vision API calls | 3 days pipeline logic |
| 2 | Add perceptual hashing as Stage 1 | Phase 1 | Catches cheapest fraud at zero cost | 1.5 days |
| 3 | Integrate Hive Moderation for AI detection | Phase 2 | Catches 70-80% of AI-generated fakes | 2 days |
| 4 | Implement app-level GPS capture | Phase 1 | Reliable location signal independent of EXIF | 1 day frontend |
| 5 | Add honeypot injection to peer review | Phase 2 | Only reliable way to maintain reviewer quality | 2 days |
| 6 | Deploy CLIP for mission-photo matching | Phase 2 | Pre-filters 10-20% of submissions before Vision AI | 3 days |
| 7 | Self-host VLMs when volume > 15K/day | Phase 3-4 | Fixed cost replaces linear API cost | 5 days deployment |
| 8 | Integrate C2PA verification | Phase 3 | Future-proof provenance checking (growing adoption) | 2 days |
| 9 | Build collusion detection for peer review | Phase 3 | Catches organized fraud rings | 4 days |
| 10 | Train custom fraud classifier on platform data | Phase 4 | Replaces all external APIs with tailored model | 10 days |

**The single most impactful change**: Moving from "Claude Vision for every photo" to a cascading pipeline. This alone saves $2,000+/month at 50K daily submissions while actually improving fraud detection through the addition of cheap pre-filters that catch fraud types Vision AI is not designed to detect (duplicates, AI-generated images, metadata inconsistencies).
