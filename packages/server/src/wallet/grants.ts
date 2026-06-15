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

/** Calendar day in Beijing time (UTC+8), e.g. "2026-06-16". */
function beijingDay(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Has this user already claimed today's (Beijing-time) daily bonus? */
export function hasClaimedDailyBonus(db: DB, userId: string, now = Date.now()): boolean {
  const day = beijingDay(now);
  const row = db
    .select({ id: topupGrants.id })
    .from(topupGrants)
    .where(and(eq(topupGrants.userId, userId), eq(topupGrants.day, day)))
    .get();
  return !!row;
}

export interface TopupResult {
  granted: boolean;
  amount: number;
  newBalance: number;
  reason?: 'already-claimed';
}

/** Flat daily welfare bonus, claimable once per Beijing-time day. */
export function claimDailyTopup(db: DB, userId: string, now = Date.now()): TopupResult {
  return db.transaction((tx) => {
    const day = beijingDay(now);
    const already = tx
      .select({ id: topupGrants.id })
      .from(topupGrants)
      .where(and(eq(topupGrants.userId, userId), eq(topupGrants.day, day)))
      .get();
    const balance = getWalletBalance(tx, userId);
    if (already) return { granted: false, amount: 0, newBalance: balance, reason: 'already-claimed' as const };
    const amount = ECONOMY.DAILY_BONUS;
    const wallet = getOrCreateWallet(tx, userId);
    const grants = getSystemAccountId(tx, SYSTEM_GRANTS);
    postEntry(tx, {
      kind: 'daily_topup',
      memo: `daily bonus ${day}`,
      legs: [
        { accountId: grants, amount: -amount },
        { accountId: wallet, amount },
      ],
    });
    tx.insert(topupGrants).values({ id: createId(), userId, day, amount, createdAt: now }).run();
    return { granted: true, amount, newBalance: balance + amount };
  });
}
