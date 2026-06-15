/**
 * Buy-in / re-buy / cash-out. Escrow (a player's table chips) is a ledgered
 * account per (tableId, seatNo). Escrow balance changes ONLY here and at hand
 * settlement — never per in-hand action (the in-memory stack is the hot truth).
 */
import { LOSS_REBATE_MAX_STEPS } from '@akpoker/shared';
import { createId } from '@paralleldrive/cuid2';
import { and, eq, isNull } from 'drizzle-orm';
import { SYSTEM_GRANTS, type DB } from '../db/client.js';
import { accounts, tableSessions } from '../db/schema.js';
import { getOrCreateWallet, getSystemAccountId, getWalletBalance, postEntry } from './ledger.js';

/** Tiered loss rebate: floor(lost/25%) steps * 5% of the session buy-in, capped at 100%->20%. */
export function lossRebate(buyInTotal: number, cashedOut: number): number {
  if (buyInTotal <= 0) return 0;
  const lost = buyInTotal - cashedOut;
  if (lost <= 0) return 0;
  const steps = Math.min(LOSS_REBATE_MAX_STEPS, Math.floor((4 * lost) / buyInTotal)); // each step = 25%
  return Math.floor((steps * buyInTotal) / 20); // each step rebates 5% = 1/20
}

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export function getEscrowAccountId(db: DB | Tx, tableId: string, seatNo: number): string | null {
  const row = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.tableId, tableId), eq(accounts.seatNo, seatNo), eq(accounts.type, 'table_escrow')))
    .get();
  return row?.id ?? null;
}

function getOrCreateEscrow(tx: Tx, tableId: string, seatNo: number): string {
  const existing = getEscrowAccountId(tx, tableId, seatNo);
  if (existing) return existing;
  const id = createId();
  tx.insert(accounts)
    .values({ id, type: 'table_escrow', tableId, seatNo, balance: 0, createdAt: Date.now() })
    .run();
  return id;
}

export interface BuyInResult {
  escrowId: string;
  stack: number;
}

/** Move `amount` from the user's wallet into their table escrow. */
export function buyIn(
  db: DB,
  params: { userId: string; tableId: string; seatNo: number; amount: number },
): BuyInResult {
  const { userId, tableId, seatNo, amount } = params;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('invalid buy-in amount');
  return db.transaction((tx) => {
    const balance = getWalletBalance(tx, userId);
    if (balance < amount) throw new Error('insufficient-funds');
    const wallet = getOrCreateWallet(tx, userId);
    const escrow = getOrCreateEscrow(tx, tableId, seatNo);
    postEntry(tx, {
      kind: 'buyin',
      refId: tableId,
      memo: `buyin seat ${seatNo}`,
      legs: [
        { accountId: wallet, amount: -amount },
        { accountId: escrow, amount: amount },
      ],
    });
    // Record / update the session.
    const open = tx
      .select({ id: tableSessions.id, buyInTotal: tableSessions.buyInTotal })
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, tableId), eq(tableSessions.userId, userId), isNull(tableSessions.leftAt)))
      .get();
    if (open) {
      tx.update(tableSessions)
        .set({ buyInTotal: open.buyInTotal + amount })
        .where(eq(tableSessions.id, open.id))
        .run();
    } else {
      tx.insert(tableSessions)
        .values({
          id: createId(),
          tableId,
          userId,
          seatNo,
          escrowId: escrow,
          buyInTotal: amount,
          joinedAt: Date.now(),
        })
        .run();
    }
    const escrowBal = tx.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, escrow)).get();
    return { escrowId: escrow, stack: escrowBal?.balance ?? amount };
  });
}

/**
 * Move the player's full escrow back to their wallet, pay the tiered loss rebate
 * (based on this session's total buy-in), and close the session.
 */
export function cashOut(
  db: DB,
  params: { userId: string; tableId: string; seatNo: number },
): { chips: number; rebate: number } {
  const { userId, tableId, seatNo } = params;
  return db.transaction((tx) => {
    const escrowId = getEscrowAccountId(tx, tableId, seatNo);
    if (!escrowId) return { chips: 0, rebate: 0 };
    const row = tx.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, escrowId)).get();
    const chips = row?.balance ?? 0;
    const wallet = getOrCreateWallet(tx, userId);
    if (chips > 0) {
      postEntry(tx, {
        kind: 'cashout',
        refId: tableId,
        memo: `cashout seat ${seatNo}`,
        legs: [
          { accountId: escrowId, amount: -chips },
          { accountId: wallet, amount: chips },
        ],
      });
    }

    // Tiered loss rebate based on this session's total buy-in.
    const session = tx
      .select({ buyInTotal: tableSessions.buyInTotal })
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, tableId), eq(tableSessions.userId, userId), isNull(tableSessions.leftAt)))
      .get();
    let rebate = 0;
    if (session) {
      rebate = lossRebate(session.buyInTotal, chips);
      if (rebate > 0) {
        const grants = getSystemAccountId(tx, SYSTEM_GRANTS);
        postEntry(tx, {
          kind: 'loss_rebate',
          refId: tableId,
          memo: `loss rebate seat ${seatNo}`,
          legs: [
            { accountId: grants, amount: -rebate },
            { accountId: wallet, amount: rebate },
          ],
        });
      }
    }

    tx.update(tableSessions)
      .set({ cashOut: chips, leftAt: Date.now() })
      .where(and(eq(tableSessions.tableId, tableId), eq(tableSessions.userId, userId), isNull(tableSessions.leftAt)))
      .run();
    return { chips, rebate };
  });
}
