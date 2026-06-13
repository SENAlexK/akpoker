/** Starting grant on registration + daily top-up for near-broke players. */
import { createId } from '@paralleldrive/cuid2';
import { and, eq } from 'drizzle-orm';
import { ECONOMY } from '../config/economy.js';
import { SYSTEM_GRANTS, type DB } from '../db/client.js';
import { topupGrants } from '../db/schema.js';
import { getOrCreateWallet, getSystemAccountId, getWalletBalance, postEntry } from './ledger.js';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Grant the starting balance within an existing transaction (used by registration). */
export function grantStartingTx(tx: Tx, userId: string): void {
  const wallet = getOrCreateWallet(tx, userId);
  const grants = getSystemAccountId(tx, SYSTEM_GRANTS);
  postEntry(tx, {
    kind: 'grant',
    memo: 'starting grant',
    legs: [
      { accountId: grants, amount: -ECONOMY.STARTING_GRANT },
      { accountId: wallet, amount: ECONOMY.STARTING_GRANT },
    ],
  });
}

/** Grant the starting balance exactly once. */
export function grantStarting(db: DB, userId: string): void {
  db.transaction((tx) => grantStartingTx(tx, userId));
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export interface TopupResult {
  granted: boolean;
  amount: number;
  newBalance: number;
  reason?: 'already-claimed' | 'above-floor';
}

/** Top a near-broke wallet up to the target, once per UTC day. */
export function claimDailyTopup(db: DB, userId: string, now = Date.now()): TopupResult {
  return db.transaction((tx) => {
    const day = utcDay(now);
    const already = tx
      .select({ id: topupGrants.id })
      .from(topupGrants)
      .where(and(eq(topupGrants.userId, userId), eq(topupGrants.day, day)))
      .get();
    const balance = getWalletBalance(tx, userId);
    if (already) return { granted: false, amount: 0, newBalance: balance, reason: 'already-claimed' as const };
    if (balance >= ECONOMY.DAILY_TOPUP_FLOOR) {
      return { granted: false, amount: 0, newBalance: balance, reason: 'above-floor' as const };
    }
    const amount = ECONOMY.DAILY_TOPUP_TARGET - balance;
    const wallet = getOrCreateWallet(tx, userId);
    const grants = getSystemAccountId(tx, SYSTEM_GRANTS);
    postEntry(tx, {
      kind: 'daily_topup',
      memo: `daily topup ${day}`,
      legs: [
        { accountId: grants, amount: -amount },
        { accountId: wallet, amount },
      ],
    });
    tx.insert(topupGrants).values({ id: createId(), userId, day, amount, createdAt: now }).run();
    return { granted: true, amount, newBalance: balance + amount };
  });
}
