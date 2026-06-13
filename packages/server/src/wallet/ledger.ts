/**
 * Double-entry ledger primitive. Every chip movement is a balanced entry: the
 * postings sum to zero. Cached account balances are updated in the same
 * transaction and are always reconcilable against SUM(postings).
 *
 * postEntry MUST be called inside a db.transaction (see callers).
 */
import { createId } from '@paralleldrive/cuid2';
import { eq, sql } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { accounts, ledgerEntries, ledgerPostings } from '../db/schema.js';

export interface Leg {
  accountId: string;
  amount: number; // signed integer chips
}

export interface PostEntryInput {
  kind: string;
  refId?: string;
  memo?: string;
  legs: Leg[];
}

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export function getWalletAccountId(db: DB | Tx, userId: string): string | null {
  const rows = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.ownerUserId, userId))
    .all();
  const wallet = rows.find(() => true);
  return wallet?.id ?? null;
}

export function getOrCreateWallet(db: DB | Tx, userId: string): string {
  const existing = getWalletAccountId(db, userId);
  if (existing) return existing;
  const id = createId();
  db.insert(accounts)
    .values({ id, type: 'user_wallet', ownerUserId: userId, balance: 0, createdAt: Date.now() })
    .run();
  return id;
}

export function getBalance(db: DB | Tx, accountId: string): number {
  const row = db
    .select({ balance: accounts.balance })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  return row?.balance ?? 0;
}

export function getWalletBalance(db: DB | Tx, userId: string): number {
  const id = getWalletAccountId(db, userId);
  return id ? getBalance(db, id) : 0;
}

export function getSystemAccountId(db: DB | Tx, label: string): string {
  const row = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.label, label)).get();
  if (!row) throw new Error(`system account ${label} missing`);
  return row.id;
}

/**
 * Write one balanced ledger entry. Asserts the legs sum to 0, forbids any
 * account balance going negative, then updates cached balances atomically.
 */
export function postEntry(tx: Tx, input: PostEntryInput): string {
  const sum = input.legs.reduce((s, l) => s + l.amount, 0);
  if (sum !== 0) throw new Error(`unbalanced ledger entry (sum=${sum})`);
  if (input.legs.length < 2) throw new Error('entry needs >= 2 postings');

  const now = Date.now();
  const entryId = createId();
  tx.insert(ledgerEntries)
    .values({ id: entryId, kind: input.kind, refId: input.refId, memo: input.memo, createdAt: now })
    .run();

  for (const leg of input.legs) {
    if (!Number.isInteger(leg.amount)) throw new Error('non-integer posting amount');
    tx.insert(ledgerPostings)
      .values({ id: createId(), entryId, accountId: leg.accountId, amount: leg.amount, createdAt: now })
      .run();
    tx.update(accounts)
      .set({ balance: sql`${accounts.balance} + ${leg.amount}` })
      .where(eq(accounts.id, leg.accountId))
      .run();
    // System (source/sink) accounts may go negative — their negative balance is
    // the total minted/withdrawn. User wallets and table escrows may not.
    const acct = tx
      .select({ type: accounts.type, balance: accounts.balance })
      .from(accounts)
      .where(eq(accounts.id, leg.accountId))
      .get();
    if (acct && acct.type !== 'system' && acct.balance < 0) {
      throw new Error(`account ${leg.accountId} would go negative (${acct.balance})`);
    }
  }
  return entryId;
}
