/** User lookups + PublicUser assembly (joins the wallet balance). */
import type { PublicUser } from '@akpoker/shared';
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { users } from '../db/schema.js';
import { getWalletBalance } from '../wallet/ledger.js';

export type UserRow = typeof users.$inferSelect;

export function findById(db: DB, id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function findByEmailNorm(db: DB, emailNorm: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.emailNorm, emailNorm)).get();
}

export function findByNicknameNorm(db: DB, nicknameNorm: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.nicknameNorm, nicknameNorm)).get();
}

export function toPublicUser(db: DB, row: UserRow): PublicUser {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl ?? `/api/avatar/${row.id}`,
    walletPoints: getWalletBalance(db, row.id),
  };
}

export function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}
