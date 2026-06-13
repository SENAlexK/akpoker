/**
 * Drizzle table definitions for typed queries. The canonical DDL (incl. triggers
 * and the stats view) lives in ./migrations/0001_init.sql — keep them in sync.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  emailNorm: text('email_norm').notNull(),
  nickname: text('nickname').notNull(),
  nicknameNorm: text('nickname_norm').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('user'),
  status: text('status').notNull().default('active'),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: integer('locked_until'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
    revokedAt: integer('revoked_at'),
    replacedBy: text('replaced_by'),
    userAgent: text('user_agent'),
  },
  (t) => ({ byUser: index('idx_refresh_user').on(t.userId) }),
);

export const loginAttempts = sqliteTable('login_attempts', {
  id: text('id').primaryKey(),
  emailNorm: text('email_norm').notNull(),
  ip: text('ip'),
  success: integer('success').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // user_wallet | table_escrow | system
  ownerUserId: text('owner_user_id'),
  tableId: text('table_id'),
  seatNo: integer('seat_no'),
  label: text('label'),
  balance: integer('balance').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const ledgerEntries = sqliteTable('ledger_entries', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  refId: text('ref_id'),
  memo: text('memo'),
  createdAt: integer('created_at').notNull(),
});

export const ledgerPostings = sqliteTable(
  'ledger_postings',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    accountId: text('account_id').notNull(),
    amount: integer('amount').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byEntry: index('idx_post_entry').on(t.entryId),
    byAccount: index('idx_post_account').on(t.accountId),
  }),
);

export const pokerTables = sqliteTable('poker_tables', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id'),
  smallBlind: integer('small_blind').notNull(),
  bigBlind: integer('big_blind').notNull(),
  maxSeats: integer('max_seats').notNull(),
  minBuyIn: integer('min_buy_in').notNull(),
  maxBuyIn: integer('max_buy_in').notNull(),
  isPrivate: integer('is_private').notNull().default(0),
  inviteCode: text('invite_code'),
  createdAt: integer('created_at').notNull(),
  closedAt: integer('closed_at'),
});

export const tableSessions = sqliteTable('table_sessions', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull(),
  userId: text('user_id').notNull(),
  seatNo: integer('seat_no').notNull(),
  escrowId: text('escrow_id').notNull(),
  buyInTotal: integer('buy_in_total').notNull().default(0),
  cashOut: integer('cash_out'),
  joinedAt: integer('joined_at').notNull(),
  leftAt: integer('left_at'),
});

export const hands = sqliteTable('hands', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull(),
  buttonSeatNo: integer('button_seat_no').notNull(),
  board: text('board').notNull(),
  totalPot: integer('total_pot').notNull(),
  rake: integer('rake').notNull().default(0),
  deckCommit: text('deck_commit').notNull(),
  serverSeed: text('server_seed').notNull(),
  clientSeed: text('client_seed').notNull(),
  nonce: integer('nonce').notNull(),
  deckPermutation: text('deck_permutation').notNull(),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at').notNull(),
});

export const handResults = sqliteTable(
  'hand_results',
  {
    id: text('id').primaryKey(),
    handId: text('hand_id').notNull(),
    userId: text('user_id').notNull(),
    seatNo: integer('seat_no').notNull(),
    netDelta: integer('net_delta').notNull(),
    won: integer('won').notNull(),
    bestHand: text('best_hand'),
    holeCards: text('hole_cards'),
  },
  (t) => ({
    byHand: index('idx_results_hand').on(t.handId),
    byUser: index('idx_results_user').on(t.userId),
  }),
);

export const handActions = sqliteTable(
  'hand_actions',
  {
    id: text('id').primaryKey(),
    handId: text('hand_id').notNull(),
    seq: integer('seq').notNull(),
    seatNo: integer('seat_no').notNull(),
    userId: text('user_id').notNull(),
    street: text('street').notNull(),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
  },
  (t) => ({ byHand: index('idx_actions_hand').on(t.handId, t.seq) }),
);

export const topupGrants = sqliteTable(
  'topup_grants',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    day: text('day').notNull(),
    amount: integer('amount').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({ byUserDay: uniqueIndex('idx_topup_user_day').on(t.userId, t.day) }),
);
