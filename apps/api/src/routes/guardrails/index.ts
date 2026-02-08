import { Hono } from "hono";

import { evaluateRoutes } from "./evaluate.js";
import { statusRoutes } from "./status.js";
import type { AuthEnv } from "../../middleware/auth.js";

export const guardrailRoutes = new Hono<AuthEnv>();

guardrailRoutes.route("/evaluate", evaluateRoutes);
guardrailRoutes.route("/status", statusRoutes);
