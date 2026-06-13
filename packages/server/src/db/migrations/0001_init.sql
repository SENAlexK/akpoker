-- AK Poker initial schema. Money is INTEGER chip units (no floats).
-- The ledger is the single source of truth; cached balances are reconcilable.

-- ── Users & auth (auth owns the users table) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  email_norm    TEXT NOT NULL UNIQUE,
  nickname      TEXT NOT NULL,
  nickname_norm TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  status        TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'locked' | 'banned'
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER,                         -- epoch ms
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           TEXT PRIMARY KEY,                 -- token id (the public half)
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,                    -- sha256 of the secret half
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  revoked_at   INTEGER,
  replaced_by  TEXT,                             -- rotation chain (reuse detection)
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         TEXT PRIMARY KEY,
  email_norm TEXT NOT NULL,
  ip         TEXT,
  success    INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_email ON login_attempts(email_norm, created_at);

-- ── Double-entry ledger ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,                   -- 'user_wallet' | 'table_escrow' | 'system'
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  table_id      TEXT,
  seat_no       INTEGER,
  label         TEXT,                            -- for system accounts e.g. 'SYSTEM_GRANTS'
  balance       INTEGER NOT NULL DEFAULT 0,      -- cached; canonical = SUM(postings)
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_acct_wallet ON accounts(owner_user_id) WHERE type = 'user_wallet';
CREATE UNIQUE INDEX IF NOT EXISTS idx_acct_escrow ON accounts(table_id, seat_no) WHERE type = 'table_escrow';
CREATE UNIQUE INDEX IF NOT EXISTS idx_acct_system ON accounts(label) WHERE type = 'system';

CREATE TABLE IF NOT EXISTS ledger_entries (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,  -- grant|daily_topup|buyin|rebuy|cashout|hand_settlement|adjustment
  ref_id     TEXT,           -- e.g. handId, tableId
  memo       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_postings (
  id         TEXT PRIMARY KEY,
  entry_id   TEXT NOT NULL REFERENCES ledger_entries(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  amount     INTEGER NOT NULL,                   -- signed; sum per entry must be 0 (enforced in app tx)
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_post_entry ON ledger_postings(entry_id);
CREATE INDEX IF NOT EXISTS idx_post_account ON ledger_postings(account_id);

-- Immutability: the ledger is append-only.
CREATE TRIGGER IF NOT EXISTS trg_entries_no_update BEFORE UPDATE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger_entries are immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_entries_no_delete BEFORE DELETE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger_entries are immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_postings_no_update BEFORE UPDATE ON ledger_postings
BEGIN SELECT RAISE(ABORT, 'ledger_postings are immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_postings_no_delete BEFORE DELETE ON ledger_postings
BEGIN SELECT RAISE(ABORT, 'ledger_postings are immutable'); END;

-- ── Tables / sessions / hands ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poker_tables (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  small_blind   INTEGER NOT NULL,
  big_blind     INTEGER NOT NULL,
  max_seats     INTEGER NOT NULL,
  min_buy_in    INTEGER NOT NULL,
  max_buy_in    INTEGER NOT NULL,
  is_private    INTEGER NOT NULL DEFAULT 0,
  invite_code   TEXT UNIQUE,
  created_at    INTEGER NOT NULL,
  closed_at     INTEGER
);

CREATE TABLE IF NOT EXISTS table_sessions (
  id            TEXT PRIMARY KEY,
  table_id      TEXT NOT NULL REFERENCES poker_tables(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  seat_no       INTEGER NOT NULL,
  escrow_id     TEXT NOT NULL REFERENCES accounts(id),
  buy_in_total  INTEGER NOT NULL DEFAULT 0,
  cash_out      INTEGER,
  joined_at     INTEGER NOT NULL,
  left_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_session_table ON table_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_session_user ON table_sessions(user_id);

CREATE TABLE IF NOT EXISTS hands (
  id              TEXT PRIMARY KEY,
  table_id        TEXT NOT NULL REFERENCES poker_tables(id),
  button_seat_no  INTEGER NOT NULL,
  board           TEXT NOT NULL,                 -- JSON array of wire cards
  total_pot       INTEGER NOT NULL,
  rake            INTEGER NOT NULL DEFAULT 0,
  deck_commit     TEXT NOT NULL,
  server_seed     TEXT NOT NULL,
  client_seed     TEXT NOT NULL,
  nonce           INTEGER NOT NULL,
  deck_permutation TEXT NOT NULL,                -- JSON array of 0..51
  created_at      INTEGER NOT NULL,
  completed_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hands_table ON hands(table_id, created_at);

CREATE TABLE IF NOT EXISTS hand_results (
  id         TEXT PRIMARY KEY,
  hand_id    TEXT NOT NULL REFERENCES hands(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  seat_no    INTEGER NOT NULL,
  net_delta  INTEGER NOT NULL,
  won        INTEGER NOT NULL,
  best_hand  TEXT,
  hole_cards TEXT                                -- JSON array if revealed
);
CREATE INDEX IF NOT EXISTS idx_results_hand ON hand_results(hand_id);
CREATE INDEX IF NOT EXISTS idx_results_user ON hand_results(user_id);

CREATE TABLE IF NOT EXISTS hand_actions (
  id        TEXT PRIMARY KEY,
  hand_id   TEXT NOT NULL REFERENCES hands(id),
  seq       INTEGER NOT NULL,
  seat_no   INTEGER NOT NULL,
  user_id   TEXT NOT NULL,
  street    TEXT NOT NULL,
  type      TEXT NOT NULL,
  amount    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_actions_hand ON hand_actions(hand_id, seq);

CREATE TABLE IF NOT EXISTS topup_grants (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  day        TEXT NOT NULL,                      -- YYYY-MM-DD (UTC)
  amount     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_topup_user_day ON topup_grants(user_id, day);

-- ── Per-user stats view ──────────────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS v_user_stats AS
SELECT
  u.id AS user_id,
  u.nickname AS nickname,
  COALESCE((SELECT a.balance FROM accounts a WHERE a.type='user_wallet' AND a.owner_user_id=u.id), 0) AS wallet,
  (SELECT COUNT(*) FROM hand_results hr WHERE hr.user_id=u.id) AS hands_played,
  (SELECT COUNT(*) FROM hand_results hr WHERE hr.user_id=u.id AND hr.won=1) AS hands_won,
  (SELECT COALESCE(SUM(hr.net_delta),0) FROM hand_results hr WHERE hr.user_id=u.id) AS net_winnings
FROM users u;
