import { Hono } from "hono";

import type { AppEnv } from "../app.js";
import disputeRoutes from "./admin/disputes.js";
import phase3AdminRoutes from "./admin/phase3.js";
import shadowAdminRoutes from "./admin/shadow.js";
import { adminRoutes } from "./admin.routes.js";
import agentCreditsRoutes from "./agent-credits.routes.js";
import { agentsRoutes } from "./agents.routes.js";
import humanAuthRoutes from "./auth/index.js";
import { authRoutes } from "./auth.routes.js";
import cityRoutes from "./city.routes.js";
import dashboardRoutes from "./dashboard/index.js";
import { debatesRoutes } from "./debates.routes.js";
import evaluationsRoutes from "./evaluations.routes.js";
import evidenceRoutes from "./evidence/index.js";
import verifyRoutes from "./evidence/verify.js";
import fraudRoutes from "./fraud/index.js";
import { guardrailRoutes } from "./guardrails/index.js";
import { heartbeatRoutes } from "./heartbeat.routes.js";
import impactRoutes from "./impact/index.js";
import leaderboardRoutes from "./leaderboards/index.js";
import messageRoutes from "./messages/index.js";
import decomposeRoutes from "./missions/decompose.js";
import missionRoutes from "./missions/index.js";
import observationRoutes from "./observations.routes.js";
import peerReviewRoutes from "./peer-reviews/index.js";
import portfolioRoutes from "./portfolios/index.js";
import { problemsRoutes } from "./problems.routes.js";
import profileRoutes from "./profile/index.js";
import reputationRoutes from "./reputation/index.js";
import { solutionsRoutes } from "./solutions.routes.js";
import streakRoutes from "./streaks/index.js";
import tokensRoutes from "./tokens/index.js";
import validatorRoutes from "./validator.routes.js";

export const v1Routes = new Hono<AppEnv>();

// GET /api/v1/health — API-level health check (Sprint 1 DoD)
v1Routes.get("/health", (c) => {
  return c.json({
    ok: true,
    requestId: c.get("requestId"),
  });
});

// Sprint 2 routes
v1Routes.route("/auth", authRoutes);
v1Routes.route("/agents", agentsRoutes);
v1Routes.route("/heartbeat", heartbeatRoutes);
v1Routes.route("/admin", adminRoutes);

// Sprint 3 routes — Constitutional Guardrails
v1Routes.route("/guardrails", guardrailRoutes);
v1Routes.route("/problems", problemsRoutes);

// Sprint 3.5 routes — Content CRUD
v1Routes.route("/solutions", solutionsRoutes);
v1Routes.route("/solutions/:solutionId/debates", debatesRoutes);

// Sprint 6 routes — Human Onboarding
v1Routes.route("/human-auth", humanAuthRoutes);
v1Routes.route("/profile", profileRoutes);
v1Routes.route("/tokens", tokensRoutes);
v1Routes.route("/dashboard", dashboardRoutes);

// Sprint 7 routes — Mission Marketplace
v1Routes.route("/missions", missionRoutes);
v1Routes.route("/internal/solutions", decomposeRoutes);
v1Routes.route("/messages", messageRoutes);

// Sprint 8 routes — Evidence Verification
v1Routes.route("/missions", evidenceRoutes);
v1Routes.route("/evidence", verifyRoutes);
v1Routes.route("/peer-reviews", peerReviewRoutes);
v1Routes.route("/admin/disputes", disputeRoutes);

// Sprint 9 routes — Reputation & Impact
v1Routes.route("/reputation", reputationRoutes);
v1Routes.route("/leaderboards", leaderboardRoutes);
v1Routes.route("/impact", impactRoutes);
v1Routes.route("/portfolios", portfolioRoutes);
v1Routes.route("/streaks", streakRoutes);
v1Routes.route("/admin/fraud", fraudRoutes);

// Sprint 10 routes — Phase 3 Foundation
v1Routes.route("/agents/credits", agentCreditsRoutes);
v1Routes.route("/admin", phase3AdminRoutes);
v1Routes.route("/", observationRoutes);

// Sprint 11 routes — Shadow Mode
v1Routes.route("/evaluations", evaluationsRoutes);
v1Routes.route("/validator", validatorRoutes);
v1Routes.route("/city", cityRoutes);
v1Routes.route("/admin", shadowAdminRoutes);
