/**
 * Ledger reconciliation: the cached account balances must always equal the sum
 * of their postings, and the global ledger must sum to zero. Run after cashouts
 * and on a schedule; a mismatch indicates a bug and should freeze + alert.
 */
import { sql } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { accounts, ledgerPostings } from '../db/schema.js';

export interface ReconcileReport {
  ok: boolean;
  globalSum: number; // SUM of all postings; must be 0
  mismatches: { accountId: string; cached: number; computed: number }[];
}

export function reconcile(db: DB): ReconcileReport {
  const globalRow = db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerPostings.amount}), 0)` })
    .from(ledgerPostings)
    .get();
  const globalSum = globalRow?.total ?? 0;

  const accs = db.select({ id: accounts.id, balance: accounts.balance }).from(accounts).all();
  const mismatches: ReconcileReport['mismatches'] = [];
  for (const a of accs) {
    const row = db
      .select({ total: sql<number>`COALESCE(SUM(${ledgerPostings.amount}), 0)` })
      .from(ledgerPostings)
      .where(sql`${ledgerPostings.accountId} = ${a.id}`)
      .get();
    const computed = row?.total ?? 0;
    if (computed !== a.balance) mismatches.push({ accountId: a.id, cached: a.balance, computed });
  }

  return { ok: globalSum === 0 && mismatches.length === 0, globalSum, mismatches };
}
