/**
 * Environment loading for API and worker entrypoints.
 *
 * Import this module FIRST (before anything that reads process.env).
 *
 * Looks for `.env` next to the API package and at the repository root, in that
 * order. Values already present in the real environment always win, and the
 * first file that defines a variable wins over the second. The README tells
 * people to create `.env` at the repository root, but the API only ever read
 * `apps/api/.env`, so following the README produced a server that refused to
 * start for missing configuration.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(apiRoot, "../..");

config({
  path: [path.join(apiRoot, ".env"), path.join(repoRoot, ".env")],
  quiet: true,
});
