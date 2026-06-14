/**
 * Admin CLI (no SMTP): manual password reset, wallet adjustment, ban/unban,
 * promote to admin. Usage:
 *   pnpm --filter @akpoker/server admin reset-password <email> <newPassword>
 *   pnpm --filter @akpoker/server admin set-points <email> <amount>
 *   pnpm --filter @akpoker/server admin ban <email> | unban <email>
 *   pnpm --filter @akpoker/server admin make-admin <email>
 *   pnpm --filter @akpoker/server admin list
 */
import { eq } from 'drizzle-orm';
import { loadEnv } from '../config/env.js';
import { initDb, SYSTEM_GRANTS, type DB } from '../db/client.js';
import { refreshTokens, users } from '../db/schema.js';
import { hashPassword } from '../auth/password.js';
import { ECONOMY } from '../config/economy.js';
import { getOrCreateWallet, getSystemAccountId, getWalletBalance, postEntry } from '../wallet/ledger.js';
import { findByEmailNorm } from '../users/repo.js';

function out(msg: string): void {
  console.log(msg);
}

function requireUser(db: DB, email: string) {
  const user = findByEmailNorm(db, email.trim().toLowerCase());
  if (!user) {
    out(`no user with email ${email}`);
    process.exit(1);
  }
  return user;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const db = initDb(env);
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case 'reset-password': {
      const [email, newPassword] = args;
      if (!email || !newPassword) return out('usage: reset-password <email> <newPassword>');
      const user = requireUser(db, email);
      db.update(users)
        .set({ passwordHash: await hashPassword(newPassword), failedLogins: 0, lockedUntil: null, updatedAt: Date.now() })
        .where(eq(users.id, user.id))
        .run();
      db.update(refreshTokens).set({ revokedAt: Date.now() }).where(eq(refreshTokens.userId, user.id)).run();
      out(`password reset for ${email}; all sessions revoked`);
      break;
    }
    case 'set-points': {
      const [email, amountStr] = args;
      const target = Number(amountStr);
      if (!email || !Number.isInteger(target) || target < 0) return out('usage: set-points <email> <amount>');
      const user = requireUser(db, email);
      db.transaction((tx) => {
        const wallet = getOrCreateWallet(tx, user.id);
        const grants = getSystemAccountId(tx, SYSTEM_GRANTS);
        const current = getWalletBalance(tx, user.id);
        const delta = target - current;
        if (delta !== 0) {
          postEntry(tx, {
            kind: 'adjustment',
            memo: `admin set-points to ${target}`,
            legs: [
              { accountId: grants, amount: -delta },
              { accountId: wallet, amount: delta },
            ],
          });
        }
      });
      out(`wallet for ${email} set to ${getWalletBalance(db, user.id)}`);
      break;
    }
    case 'ban':
    case 'unban': {
      const [email] = args;
      if (!email) return out(`usage: ${cmd} <email>`);
      const user = requireUser(db, email);
      db.update(users)
        .set({ status: cmd === 'ban' ? 'banned' : 'active', updatedAt: Date.now() })
        .where(eq(users.id, user.id))
        .run();
      if (cmd === 'ban') db.update(refreshTokens).set({ revokedAt: Date.now() }).where(eq(refreshTokens.userId, user.id)).run();
      out(`${email} ${cmd}ned`);
      break;
    }
    case 'make-admin': {
      const [email] = args;
      if (!email) return out('usage: make-admin <email>');
      const user = requireUser(db, email);
      db.update(users).set({ role: 'admin', updatedAt: Date.now() }).where(eq(users.id, user.id)).run();
      out(`${email} is now an admin`);
      break;
    }
    case 'reset-all-points': {
      const [amountStr] = args;
      const target = amountStr ? Number(amountStr) : ECONOMY.STARTING_GRANT;
      if (!Number.isInteger(target) || target < 0) return out('usage: reset-all-points [amount]');
      const all = db.select().from(users).all();
      let changed = 0;
      for (const u of all) {
        db.transaction((tx) => {
          const wallet = getOrCreateWallet(tx, u.id);
          const grants = getSystemAccountId(tx, SYSTEM_GRANTS);
          const delta = target - getWalletBalance(tx, u.id);
          if (delta !== 0) {
            postEntry(tx, {
              kind: 'adjustment',
              memo: `reset-all to ${target}`,
              legs: [
                { accountId: grants, amount: -delta },
                { accountId: wallet, amount: delta },
              ],
            });
            changed++;
          }
        });
      }
      out(`reset ${changed}/${all.length} wallets to ${target} (table escrow not touched — run when nobody is seated)`);
      break;
    }
    case 'delete-user': {
      const [email] = args;
      if (!email) return out('usage: delete-user <email>');
      const user = requireUser(db, email);
      const tag = `deleted_${user.id.slice(0, 8)}`;
      db.transaction((tx) => {
        // Zero the wallet with a balanced entry (keeps the ledger reconciled).
        const wallet = getOrCreateWallet(tx, user.id);
        const grants = getSystemAccountId(tx, SYSTEM_GRANTS);
        const bal = getWalletBalance(tx, user.id);
        if (bal !== 0) {
          postEntry(tx, {
            kind: 'adjustment',
            memo: 'account deletion',
            legs: [
              { accountId: wallet, amount: -bal },
              { accountId: grants, amount: bal },
            ],
          });
        }
        // Anonymize + ban; frees the email & nickname for reuse.
        tx.update(users)
          .set({
            status: 'banned',
            email: `${tag}@deleted`,
            emailNorm: `${tag}@deleted`,
            nickname: tag,
            nicknameNorm: tag,
            updatedAt: Date.now(),
          })
          .where(eq(users.id, user.id))
          .run();
        tx.update(refreshTokens).set({ revokedAt: Date.now() }).where(eq(refreshTokens.userId, user.id)).run();
      });
      out(`deleted ${email}: banned + anonymized (${tag}); email & nickname freed; sessions revoked`);
      break;
    }
    case 'list': {
      const all = db.select().from(users).all();
      for (const u of all) out(`${u.email}\t${u.nickname}\t${u.role}\t${u.status}\t${getWalletBalance(db, u.id)} pts`);
      break;
    }
    default:
      out(
        'commands: reset-password | set-points | reset-all-points | ban | unban | make-admin | delete-user | list',
      );
  }
  db.$client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
