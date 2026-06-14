/**
 * Shared, canonical config constants. ONE value, ONE place.
 * Timing, economy, and table-limit knobs referenced by server + web.
 */

// ── Turn / timing (all milliseconds) ──────────────────────────────────────────
export const ACTION_TIMEOUT_MS = 60_000; // per-decision time to act (then auto check/fold)
export const DISCONNECT_GRACE_MS = 30_000; // >= connectionStateRecovery window
export const BETWEEN_HANDS_SITOUT_MS = 120_000; // hold a disconnected seat between hands
export const AUTO_STAND_MS = 300_000; // auto-stand + settle after this idle
export const SHOWDOWN_DELAY_MS = 4_000; // hold the finished hand (board + reveals + winner) before clearing
export const INTER_HAND_DELAY_MS = 1_200; // brief pause after clearing before the next hand
export const CONNECTION_RECOVERY_MS = 30_000; // socket.io connectionStateRecovery window

// ── Voice ─────────────────────────────────────────────────────────────────────
export const VOICE_MESH_CAP = 6; // hard cap on P2P mesh participants per table
export const TURN_CRED_TTL_SEC = 3_600; // ephemeral TURN credential lifetime

// ── Economy (integer chip units; no floats anywhere) ──────────────────────────
export const STARTING_GRANT = 10_000; // wallet points granted at registration
export const DAILY_TOPUP_FLOOR = 2_000; // eligible for top-up if wallet below this
export const DAILY_TOPUP_TARGET = 2_000; // top wallet up to this amount
export const RAKE_BPS = 0; // friends game: no rake
export const RAKE_CAP = 0;

// ── Table limits ──────────────────────────────────────────────────────────────
export const MIN_SEATS = 2;
export const MAX_SEATS = 10;
export const DEFAULT_SMALL_BLIND = 5;
export const DEFAULT_BIG_BLIND = 10;
export const MIN_BUYIN_BB = 40; // minimum buy-in = 40 big blinds
export const MAX_BUYIN_BB = 100; // maximum buy-in = 100 big blinds

// ── Auth / sessions ───────────────────────────────────────────────────────────
export const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

// ── Wire payload limits (abuse surface) ───────────────────────────────────────
export const MAX_SDP_BYTES = 64 * 1024; // cap WebRTC SDP blobs
export const MAX_ICE_CANDIDATE_BYTES = 4 * 1024;
export const MAX_CHAT_LEN = 500;
export const MAX_NICKNAME_LEN = 24;
export const MIN_NICKNAME_LEN = 2;
export const MIN_PASSWORD_LEN = 8;
export const MAX_PASSWORD_LEN = 128;
export const INVITE_CODE_LEN = 8;
