/**
 * Claim Count Reconciliation Job (R16)
 *
 * Periodic audit to detect and fix drift between missions.currentClaimCount
 * and the actual COUNT of active claims in mission_claims.
 *
 * Similar pattern to tokenAudit.ts — runs daily, alerts on discrepancies.
 */

import { sql } from "drizzle-orm";
import pino from "pino";

const reconciliationLogger = pino({ name: "claim-reconciliation" });

export interface ClaimDiscrepancy {
  missionId: string;
  cachedCount: number;
  actualCount: number;
  difference: number;
}

export interface ReconciliationResult {
  checkedCount: number;
  discrepancyCount: number;
  fixedCount: number;
  discrepancies: ClaimDiscrepancy[];
}

/**
 * Run claim count reconciliation.
 *
 * 1. Compare missions.currentClaimCount vs COUNT(active claims) per mission
 * 2. Fix any mismatches by updating currentClaimCount to actual
 * 3. Alert admins if discrepancies found
 *
 * @param autoFix - If true, automatically correct drifted counts (default: true)
 */
export async function runClaimReconciliation(
  autoFix = true,
): Promise<ReconciliationResult> {
  reconciliationLogger.info("Starting claim count reconciliation");

  const { getDb } = await import("../lib/container.js");
  const db = getDb();
  if (!db) throw new Error("Database not available for reconciliation");

  const result: ReconciliationResult = {
    checkedCount: 0,
    discrepancyCount: 0,
    fixedCount: 0,
    discrepancies: [],
  };

  try {
    // Find missions where currentClaimCount doesn't match actual active claim count
    const discrepancyRows = await db.execute(sql`
      SELECT
        m.id AS mission_id,
        m.current_claim_count AS cached_count,
        COALESCE(c.actual_count, 0)::int AS actual_count
      FROM missions m
      LEFT JOIN (
        SELECT mission_id, COUNT(*)::int AS actual_count
        FROM mission_claims
        WHERE status = 'active'
        GROUP BY mission_id
      ) c ON m.id = c.mission_id
      WHERE m.status NOT IN ('expired', 'archived')
        AND m.current_claim_count != COALESCE(c.actual_count, 0)
    `);

    const rows = Array.from(discrepancyRows) as {
      mission_id: string;
      cached_count: number;
      actual_count: number;
    }[];

    // Count total missions checked (all non-expired/archived)
    const [totalRow] = Array.from(
      await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM missions
        WHERE status NOT IN ('expired', 'archived')
      `),
    ) as [{ total: number }];
    result.checkedCount = totalRow?.total ?? 0;

    if (rows.length === 0) {
      reconciliationLogger.info(
        { checkedCount: result.checkedCount },
        "Reconciliation PASSED — all claim counts consistent",
      );
      return result;
    }

    // Process discrepancies
    result.discrepancyCount = rows.length;
    result.discrepancies = rows.map((row) => ({
      missionId: row.mission_id,
      cachedCount: Number(row.cached_count),
      actualCount: Number(row.actual_count),
      difference: Number(row.cached_count) - Number(row.actual_count),
    }));

    reconciliationLogger.warn(
      {
        discrepancyCount: result.discrepancyCount,
        discrepancies: result.discrepancies,
      },
      "Claim count discrepancies detected",
    );

    // Auto-fix: update currentClaimCount to match actual
    if (autoFix && rows.length > 0) {
      const missionIds = rows.map((r) => r.mission_id);

      // Batch fix in a single UPDATE using a subquery
      await db.execute(sql`
        UPDATE missions m
        SET
          current_claim_count = COALESCE(sub.actual_count, 0),
          updated_at = NOW()
        FROM (
          SELECT mission_id, COUNT(*)::int AS actual_count
          FROM mission_claims
          WHERE status = 'active'
          GROUP BY mission_id
        ) sub
        WHERE m.id = sub.mission_id
          AND m.id = ANY(${missionIds})
      `);

      // Also fix missions with 0 active claims (not in subquery)
      await db.execute(sql`
        UPDATE missions
        SET current_claim_count = 0, updated_at = NOW()
        WHERE id = ANY(${missionIds})
          AND id NOT IN (
            SELECT DISTINCT mission_id FROM mission_claims WHERE status = 'active'
          )
      `);

      result.fixedCount = rows.length;
      reconciliationLogger.info(
        { fixedCount: result.fixedCount },
        "Claim counts auto-corrected",
      );
    }

    // Alert admins
    await alertAdmins(
      "Claim Count Reconciliation: Discrepancies Found",
      result,
    );

    return result;
  } catch (error) {
    reconciliationLogger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Reconciliation ERROR",
    );
    await alertAdmins("Claim Reconciliation Failed: Unexpected Error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function alertAdmins(title: string, data: unknown): Promise<void> {
  const webhookUrl = process.env.CLAIM_RECONCILIATION_WEBHOOK_URL ?? process.env.TOKEN_AUDIT_WEBHOOK_URL;

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `⚠️ ${title}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${title}*\n\`\`\`${JSON.stringify(data, null, 2)}\`\`\``,
              },
            },
          ],
        }),
      });
    } catch (error) {
      reconciliationLogger.error(
        { error: error instanceof Error ? error.message : "Unknown" },
        "Failed to send webhook alert",
      );
    }
  } else {
    reconciliationLogger.warn("No webhook URL configured");
  }
}
