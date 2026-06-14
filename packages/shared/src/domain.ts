/**
 * Domain types shared by engine, server and web.
 *
 * Hole-card safety: PublicSeat / TableSnapshot are STRUCTURALLY incapable of
 * carrying a non-viewer's hidden hole cards. A seat's `holeCards` is:
 *   - null  → hidden (face down)
 *   - []    → mucked (folded at showdown without showing)
 *   - [c,c] → revealed face-up at showdown (public to everyone)
 * The viewer's own concealed hole cards are delivered SEPARATELY via the private
 * `hand:hole` event to the `user:<userId>` room — never inside a public payload.
 */

import type { WireCard } from './cards.js';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

/** In-hand status of a player who is dealt into the current hand. */
export type PlayerStatus = 'active' | 'folded' | 'allin';

/** Seat occupancy status (independent of in-hand status). */
export type SeatStatus = 'empty' | 'playing' | 'sitting_out' | 'disconnected' | 'leaving';

export type TablePhase = 'idle' | 'in_hand';

export type HandCategory =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'quads'
  | 'straight-flush';

/**
 * The ONE legal-action descriptor. The server emits exactly this; the client
 * renders controls from exactly this. All amounts are integer chips.
 *
 * Amount semantics ("to" totals for the current street):
 *  - callAmount: chips to ADD to call (delta), 0 if checking is free.
 *  - minBet/maxBet: total bet size when opening (currentBet === 0).
 *  - minRaise/maxRaise: total "raise-to" amount when facing a bet (currentBet > 0).
 */
export interface LegalAction {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  minBet: number;
  maxBet: number;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;
}

export interface PublicTableConfig {
  name: string;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  isPrivate: boolean;
}

export interface PublicSeat {
  seatNo: number;
  userId: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  stack: number; // chips behind
  committed: number; // chips committed on the CURRENT street
  seatStatus: SeatStatus;
  /** In-hand status, only meaningful while a hand is in progress and the seat is dealt in. */
  handStatus: PlayerStatus | null;
  inHand: boolean;
  hasCards: boolean; // is this seat holding (face-down) cards right now
  holeCards: WireCard[] | null; // null=hidden, []=mucked, [c,c]=revealed at showdown
  isButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  isWinner: boolean;
  ready: boolean; // has this seated player readied up (sit-in) for the next hand
}

export interface PotView {
  amount: number;
  eligibleSeatNos: number[];
}

/** Last action, for lightweight client-side animation. `seq` increments per action. */
export interface LastAction {
  seatNo: number;
  type: ActionType;
  amount: number;
  seq: number;
}

/**
 * The full authoritative snapshot the client mirrors. The server pushes a fresh
 * snapshot on every state transition; the client renders purely from it.
 */
export interface TableSnapshot {
  tableId: string;
  version: number; // monotonic per-table; used for BOTH stale-action rejection and snapshot ordering
  phase: TablePhase;
  config: PublicTableConfig;
  seats: PublicSeat[];
  board: WireCard[];
  pots: PotView[];
  totalPot: number;
  buttonSeatNo: number | null;
  handId: string | null;
  street: Street | null;
  currentBet: number;
  toActSeatNo: number | null;
  actionDeadlineAt: number | null; // epoch ms; server is the clock authority
  /** The viewer's own seat number, or null if spectating. */
  viewerSeatNo: number | null;
  /** Populated ONLY when it is the viewer's turn. */
  viewerLegalAction: LegalAction | null;
  spectatorCount: number;
  lastAction: LastAction | null;
  /** Pre-deal RNG commitment for the current hand (revealed after the hand). */
  deckCommit: string | null;
  /** Invite code for sharing (used to build /join/<code>). */
  inviteCode: string;
  /** The seat number of the table owner's seat, if seated (unused) — owner id below. */
  ownerId: string;
}

/** Private hole cards for the viewer, delivered over the user:<id> room only. */
export interface PrivateHole {
  tableId: string;
  handId: string;
  cards: [WireCard, WireCard];
}

export interface HandActionLog {
  seatNo: number;
  userId: string;
  street: Street;
  type: ActionType;
  amount: number; // total street "to" amount for bet/raise/call; 0 for check/fold
}

export interface SeatSettlement {
  userId: string;
  seatNo: number;
  netDelta: number; // = finalStack - stackAtHandStart (signed; sum + rake === 0)
  won: boolean;
  bestHand?: string; // human-readable hand description, if reached showdown
  holeCards?: WireCard[]; // revealed cards, if reached showdown
}

/**
 * The ONE canonical settlement object the engine (or a thin adapter) produces at
 * end of hand. The wallet's settleHand re-asserts sum(netDelta)+rake===0 and
 * posts a single balanced HAND_SETTLEMENT ledger entry.
 */
export interface EngineSettlement {
  handId: string;
  board: WireCard[];
  totalPot: number;
  rake: 0;
  perSeat: SeatSettlement[];
  actions: HandActionLog[];
  // commit-reveal provably-fair RNG record
  deckCommit: string; // sha256(serverSeed), published before the deal
  serverSeed: string; // revealed after the hand
  clientSeed: string;
  nonce: number;
  deckPermutation: number[]; // resulting 0..51 order, for audit/replay
}

/** Result broadcast at showdown / hand end. */
export interface HandResult {
  handId: string;
  board: WireCard[];
  winners: { seatNo: number; userId: string; amount: number; potIndex: number }[];
  revealed: { seatNo: number; cards: WireCard[]; handDescr: string }[];
  settlements: { seatNo: number; userId: string; netDelta: number }[];
}

/** Reveal payload so clients can verify the provably-fair shuffle. */
export interface HandReveal {
  handId: string;
  deckCommit: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  deckPermutation: number[];
}

export interface RoomListItem {
  tableId: string;
  name: string;
  ownerId: string;
  occupiedSeats: number;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  isPrivate: boolean;
  inHand: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string;
  net: number; // net winnings this week
}

export interface InvitePreview {
  tableId: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  occupiedSeats: number;
  maxSeats: number;
}

export interface ChatMessage {
  seatNo: number | null;
  userId: string;
  nickname: string;
  text: string;
  ts: number;
}

/** ICE server config delivered to clients for the voice mesh (TURN creds are short-lived). */
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PublicUser {
  id: string;
  nickname: string;
  avatarUrl: string;
  walletPoints: number;
  role: string; // 'user' | 'admin'
}
