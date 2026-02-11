import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index";

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  return { db, client };
}

export { schema };
export { agents } from "./schema/agents";
export { humans } from "./schema/humans";
export { problems } from "./schema/problems";
export { solutions } from "./schema/solutions";
export { debates } from "./schema/debates";
export * from "./schema/guardrails";
export * from "./schema/enums";
// Sprint 6: Human onboarding tables
export { humanProfiles } from "./schema/humanProfiles";
export { tokenTransactions } from "./schema/tokenTransactions";
export { accounts } from "./schema/accounts";
export { verificationTokens } from "./schema/verificationTokens";
export { sessions } from "./schema/sessions";
// Sprint 7: Mission marketplace tables
export { missions } from "./schema/missions";
export { missionClaims } from "./schema/missionClaims";
export { messages } from "./schema/messages";
// Sprint 8: Evidence verification tables
export { evidence } from "./schema/evidence";
export { peerReviews } from "./schema/peerReviews";
export { reviewHistory } from "./schema/reviewHistory";
export { verificationAuditLog } from "./schema/verificationAuditLog";
