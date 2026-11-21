/**
 * Lifetime ImpactToken totals for one person, read from the ledger.
 *
 * The ledger (token_transactions) is the record of truth for tokens. "Earned"
 * used to come from a counter on the profile that only the orientation bonus
 * ever updated, so a person's dashboard said "Earned: 10" for ever, no matter
 * how many missions they were paid for. Summing the ledger cannot drift:
 * earned minus spent is always the balance.
 */
import { tokenTransactions } from "@betterworld/db";
import { eq, sql } from "drizzle-orm";

import type { DbOrTx } from "./content-status.js";

export interface TokenTotals {
  earned: number;
  spent: number;
}

export async function getTokenTotals(db: DbOrTx, humanId: string): Promise<TokenTotals> {
  const rows = await db
    .select({
      earned: sql<string>`COALESCE(SUM(${tokenTransactions.amount}) FILTER (WHERE ${tokenTransactions.amount} > 0), 0)`,
      spent: sql<string>`COALESCE(SUM(-${tokenTransactions.amount}) FILTER (WHERE ${tokenTransactions.amount} < 0), 0)`,
    })
    .from(tokenTransactions)
    .where(eq(tokenTransactions.humanId, humanId));

  const row = rows[0];
  return {
    earned: Number(row?.earned ?? 0),
    spent: Number(row?.spent ?? 0),
  };
}
