#!/usr/bin/env node
/**
 * Face Detection Model Verification Script (Sprint 15 — T038)
 *
 * The SSD MobileNet v1 model files (~15MB) are bundled with the
 * @vladmandic/face-api npm package. This script verifies they exist
 * and optionally copies them to a local assets directory for
 * environments where node_modules may be pruned.
 *
 * Usage:
 *   node scripts/download-face-models.js [--copy]
 *
 * With --copy flag, copies model files to apps/api/assets/models/
 */

const fs = require("node:fs");
const path = require("node:path");

const MODEL_SOURCE = path.resolve(
  __dirname,
  "../apps/api/node_modules/@vladmandic/face-api/model",
);

// Also check root node_modules (hoisted)
const MODEL_SOURCE_ROOT = path.resolve(
  __dirname,
  "../node_modules/@vladmandic/face-api/model",
);

const MODEL_TARGET = path.resolve(
  __dirname,
  "../apps/api/assets/models",
);

const REQUIRED_FILES = [
  "ssd_mobilenetv1_model-weights_manifest.json",
  "ssd_mobilenetv1_model.bin",
];

function findModelDir() {
  if (fs.existsSync(MODEL_SOURCE)) return MODEL_SOURCE;
  if (fs.existsSync(MODEL_SOURCE_ROOT)) return MODEL_SOURCE_ROOT;
  return null;
}

function verifyModels() {
  const modelDir = findModelDir();
  if (!modelDir) {
    console.error(
      "ERROR: @vladmandic/face-api model directory not found.\n" +
        "Run 'pnpm install' to install dependencies first.",
    );
    process.exit(1);
  }

  console.log(`Model directory found: ${modelDir}`);

  const missing = [];
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(modelDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`  OK: ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
      missing.push(file);
      console.error(`  MISSING: ${file}`);
    }
  }

  if (missing.length > 0) {
    console.error(
      `\nERROR: ${missing.length} required model file(s) missing.`,
    );
    process.exit(1);
  }

  console.log("\nAll required face detection model files present.");
  return modelDir;
}

function copyModels(sourceDir) {
  if (!fs.existsSync(MODEL_TARGET)) {
    fs.mkdirSync(MODEL_TARGET, { recursive: true });
    console.log(`Created target directory: ${MODEL_TARGET}`);
  }

  const allFiles = fs.readdirSync(sourceDir);
  let copied = 0;
  for (const file of allFiles) {
    const src = path.join(sourceDir, file);
    const dst = path.join(MODEL_TARGET, file);
    fs.copyFileSync(src, dst);
    copied++;
  }
  console.log(`Copied ${copied} model files to ${MODEL_TARGET}`);
}

// Main
const modelDir = verifyModels();

if (process.argv.includes("--copy")) {
  copyModels(modelDir);
}
