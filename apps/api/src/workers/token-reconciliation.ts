/**
 * Token Balance Reconciliation Worker (P0-D2)
 *
 * BullMQ repeatable worker that runs hourly to verify
 * humans.tokenBalance matches SUM(tokenTransactions.amount) per human.
 * Auto-fixes discrepancies and alerts admins.
 *
 * Similar to claimReconciliation but as a proper BullMQ worker.
 */
import { Worker } from "bullmq";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";

import { initDb, getDb } from "../lib/container.js";

const logger = pino({ name: "token-reconciliation" });

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://betterworld:betterworld_dev@localhost:5432/betterworld";
const QUEUE_NAME = "token-reconciliation";

export interface TokenDiscrepancy {
  humanId: string;
  cachedBalance: number;
  calculatedBalance: number;
  difference: number;
}

export interface TokenReconciliationResult {
  checkedCount: number;
  discrepancyCount: number;
  fixedCount: number;
  discrepancies: TokenDiscrepancy[];
}

/**
 * Core reconciliation logic — exported for testing.
 */
export async function runTokenReconciliation(
  autoFix = true,
): Promise<TokenReconciliationResult> {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const result: TokenReconciliationResult = {
    checkedCount: 0,
    discrepancyCount: 0,
    fixedCount: 0,
    discrepancies: [],
  };

  // Count total humans checked
  const [totalRow] = Array.from(
    await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM humans
      WHERE role = 'human' AND is_active = true
    `),
  ) as [{ total: number }];
  result.checkedCount = totalRow?.total ?? 0;

  // Find humans where cached tokenBalance != SUM(transactions)
  const discrepancyRows = await db.execute(sql`
    SELECT
      h.id AS human_id,
      CAST(h.token_balance AS INTEGER) AS cached_balance,
      COALESCE(SUM(tt.amount), 0)::int AS calculated_balance
    FROM humans h
    LEFT JOIN token_transactions tt ON tt.human_id = h.id
    WHERE h.role = 'human' AND h.is_active = true
    GROUP BY h.id, h.token_balance
    HAVING CAST(h.token_balance AS INTEGER) != COALESCE(SUM(tt.amount), 0)
  `);

  const rows = Array.from(discrepancyRows) as {
    human_id: string;
    cached_balance: number;
    calculated_balance: number;
  }[];

  if (rows.length === 0) {
    logger.info(
      { checkedCount: result.checkedCount },
      "Reconciliation PASSED — all token balances consistent",
    );
    return result;
  }

  result.discrepancyCount = rows.length;
  result.discrepancies = rows.map((row) => ({
    humanId: row.human_id,
    cachedBalance: Number(row.cached_balance),
    calculatedBalance: Number(row.calculated_balance),
    difference: Number(row.cached_balance) - Number(row.calculated_balance),
  }));

  logger.warn(
    {
      discrepancyCount: result.discrepancyCount,
      discrepancies: result.discrepancies,
    },
    "Token balance discrepancies detected",
  );

  // Auto-fix: update cached balances to match transaction sums
  if (autoFix && rows.length > 0) {
    const humanIds = rows.map((r) => r.human_id);

    await db.execute(sql`
      UPDATE humans h
      SET
        token_balance = COALESCE(sub.calculated_balance, 0),
        updated_at = NOW()
      FROM (
        SELECT human_id, SUM(amount)::int AS calculated_balance
        FROM token_transactions
        WHERE human_id = ANY(${humanIds})
        GROUP BY human_id
      ) sub
      WHERE h.id = sub.human_id
    `);

    // Handle humans with zero transactions (not in subquery)
    await db.execute(sql`
      UPDATE humans
      SET token_balance = 0, updated_at = NOW()
      WHERE id = ANY(${humanIds})
        AND id NOT IN (
          SELECT DISTINCT human_id FROM token_transactions
        )
    `);

    result.fixedCount = rows.length;
    logger.info(
      { fixedCount: result.fixedCount },
      "Token balances auto-corrected",
    );
  }

  // Alert admins
  await alertAdmins("Token Balance Reconciliation: Discrepancies Found", result);

  return result;
}

async function alertAdmins(title: string, data: unknown): Promise<void> {
  const webhookUrl =
    process.env.TOKEN_RECONCILIATION_WEBHOOK_URL ??
    process.env.TOKEN_AUDIT_WEBHOOK_URL;

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `\u26a0\ufe0f ${title}`,
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
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown" },
        "Failed to send webhook alert",
      );
    }
  } else {
    logger.warn("No webhook URL configured");
  }
}

export function createTokenReconciliationWorker(): Worker {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  initDb(DATABASE_URL);

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      logger.info("Running token balance reconciliation...");

      const result = await runTokenReconciliation(true);

      logger.info(
        {
          checkedCount: result.checkedCount,
          discrepancyCount: result.discrepancyCount,
          fixedCount: result.fixedCount,
        },
        "Token reconciliation complete",
      );

      return result;
    },
    {
      connection,
      concurrency: 1,
    },
  );

  // Schedule hourly repeatable job
  import("bullmq").then(({ Queue }) => {
    const schedulerQueue = new Queue(QUEUE_NAME, {
      connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
    });
    schedulerQueue
      .add(
        "token-reconciliation",
        {},
        {
          repeat: { pattern: "0 * * * *" }, // every hour
          removeOnComplete: { count: 24 },
          removeOnFail: { count: 10 },
        },
      )
      .catch((err) => {
        logger.error(
          { error: (err as Error).message },
          "Failed to schedule repeatable job",
        );
      });
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Token reconciliation job completed");
  });

  worker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;

    if (attemptsMade >= maxAttempts) {
      logger.error(
        { jobId: job?.id, attemptsMade, maxAttempts, error: err.message },
        "DEAD LETTER: Token reconciliation job exhausted all retries",
      );
    } else {
      logger.warn(
        { jobId: job?.id, attemptsMade, error: err.message },
        "Token reconciliation job failed, will retry",
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error");
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down token reconciliation worker...");
    await worker.close();
    await connection.quit();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Token reconciliation worker started (hourly schedule)");

  return worker;
}

// Start worker if running as standalone script
if (process.argv[1]?.includes("token-reconciliation")) {
  createTokenReconciliationWorker();
}
