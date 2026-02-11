/**
 * Token Audit Job (Sprint 6)
 *
 * Daily job to verify double-entry accounting integrity.
 * Runs at 02:00 UTC via BullMQ cron.
 */

import { sql } from "drizzle-orm";
import pino from "pino";

const auditLogger = pino({ name: "token-audit" });

export interface AuditDiscrepancy {
  humanId: string;
  calculatedBalance: number;
  cachedBalance: string; // Decimal
  difference: number;
}

/**
 * Run token audit job
 *
 * Checks:
 * 1. Per-user balance integrity: SUM(amount) per human == cached balance
 * 2. Global balance integrity: SUM(all amounts) should equal SUM(all balances)
 *
 * @returns Array of discrepancies (empty if audit passes)
 */
export async function runTokenAudit(): Promise<AuditDiscrepancy[]> {
  auditLogger.info("Starting daily audit job");

  const { getDb } = await import("../lib/container.js");
  const db = getDb();
  if (!db) throw new Error("Database not available for audit");

  try {
    // 1. Check per-user balance integrity
    // db.execute() with postgres-js returns RowList (array-like), not { rows }
    const discrepancyRows = await db.execute(sql`
      SELECT
        tt.human_id,
        COALESCE(SUM(tt.amount), 0) AS calculated_balance,
        h.token_balance AS cached_balance
      FROM token_transactions tt
      RIGHT JOIN humans h ON tt.human_id = h.id
      WHERE h.role = 'human'
      GROUP BY tt.human_id, h.token_balance
      HAVING COALESCE(SUM(tt.amount), 0) != CAST(h.token_balance AS INTEGER)
    `);

    const rows = Array.from(discrepancyRows) as { human_id: string; calculated_balance: string; cached_balance: string }[];

    if (rows.length > 0) {
      const formattedDiscrepancies: AuditDiscrepancy[] = rows.map(
        (row) => ({
          humanId: row.human_id,
          calculatedBalance: Number(row.calculated_balance),
          cachedBalance: row.cached_balance,
          difference:
            Number(row.calculated_balance) - parseFloat(row.cached_balance),
        }),
      );

      auditLogger.error(
        { count: formattedDiscrepancies.length, discrepancies: formattedDiscrepancies },
        "Audit FAILED - balance discrepancies found",
      );

      // Alert admins (Slack webhook, email, etc.)
      await alertAdmins(
        "Token Audit Failed: Balance Discrepancies Detected",
        formattedDiscrepancies,
      );

      return formattedDiscrepancies;
    }

    // 2. Check global balance integrity
    const globalCheckRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(amount), 0) AS total_transactions
      FROM token_transactions
    `);

    const totalBalancesRows = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(token_balance AS INTEGER)), 0) AS total
      FROM humans
      WHERE role = 'human'
    `);

    const globalArr = Array.from(globalCheckRows) as { total_transactions: string }[];
    const balArr = Array.from(totalBalancesRows) as { total: string }[];

    const globalRow = globalArr[0];
    const balRow = balArr[0];

    if (globalRow && balRow) {
      const totalTx = Number(globalRow.total_transactions);
      const totalBal = parseFloat(balRow.total);

      if (totalTx !== totalBal) {
        auditLogger.error(
          { totalTransactions: totalTx, totalBalances: totalBal, difference: totalTx - totalBal },
          "Audit FAILED - global sum mismatch",
        );

        await alertAdmins("Token Audit Failed: Global Sum Mismatch", {
          totalTransactions: totalTx,
          totalBalances: totalBal,
          difference: totalTx - totalBal,
        });

        return [
          {
            humanId: "GLOBAL",
            calculatedBalance: totalTx,
            cachedBalance: totalBal.toString(),
            difference: totalTx - totalBal,
          },
        ];
      }
    }

    auditLogger.info("Audit PASSED - all balances consistent");
    return [];
  } catch (error) {
    auditLogger.error({ error: error instanceof Error ? error.message : String(error) }, "Audit ERROR");
    await alertAdmins("Token Audit Failed: Unexpected Error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Alert admins of audit failures
 *
 * TODO: Implement Slack webhook, email, or PagerDuty integration
 */
async function alertAdmins(
  title: string,
  data: unknown,
): Promise<void> {
  const webhookUrl = process.env.TOKEN_AUDIT_WEBHOOK_URL;

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🚨 ${title}`,
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
      auditLogger.error({ error: error instanceof Error ? error.message : "Unknown" }, "Failed to send webhook alert");
    }
  } else {
    auditLogger.warn("No webhook URL configured (TOKEN_AUDIT_WEBHOOK_URL)");
  }
}
