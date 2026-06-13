/** Engine-internal state types. Cards are int 0..51. Money is integer chips. */
import type { ActionType, HandActionLog, IntCard, Street } from '@akpoker/shared';

export type { ActionType, Street } from '@akpoker/shared';

export type PlayerStatus = 'active' | 'folded' | 'allin';

export interface SeatInput {
  seatNo: number;
  userId: string;
  stack: number;
}

export interface HandConfig {
  handId: string;
  /** Dealt-in players, any seat order (sorted internally by seatNo). */
  seats: SeatInput[];
  buttonSeatNo: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  burnCards?: boolean;
  /** Pre-shuffled, injected 52-card int deck. */
  deck: IntCard[];
  /** Commit-reveal RNG record, passed through to the settlement object. */
  deckCommit: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  /**
   * Optional blind-seat overrides so the table layer can implement dead-button /
   * dead-small-blind precisely. If omitted, blinds are button+1 (SB) / button+2 (BB)
   * (heads-up: button is SB). `smallBlindSeatNo: null` means a dead (unposted) SB.
   */
  smallBlindSeatNo?: number | null;
  bigBlindSeatNo?: number;
}

export interface PlayerState {
  seatNo: number;
  userId: string;
  stack: number; // chips behind
  contributed: number; // total chips put in THIS hand (all streets + antes/blinds)
  streetBet: number; // chips put in on the CURRENT street
  status: PlayerStatus;
  hasActedThisRound: boolean;
  /** May this player still (re)raise? Cleared by an incomplete all-in for those who already acted. */
  mayRaise: boolean;
  holeCards: [IntCard, IntCard] | null;
  stackAtHandStart: number;
}

export interface Pot {
  amount: number;
  eligibleUserIds: string[];
}

export interface Award {
  userId: string;
  seatNo: number;
  amount: number;
  potIndex: number;
}

export interface HandReveal {
  userId: string;
  seatNo: number;
  holeCards: [IntCard, IntCard];
  category: string;
  descr: string;
  best5: IntCard[];
}

export interface HandState {
  handId: string;
  street: Street;
  board: IntCard[];
  players: PlayerState[]; // sorted by seatNo
  buttonSeatNo: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  burnCards: boolean;
  deck: IntCard[];
  deckPos: number;
  currentBet: number; // highest streetBet to match on this street
  lastRaiseSize: number; // size of the last FULL raise (for min-raise)
  minOpen: number; // minimum opening bet on a fresh street (= bigBlind)
  toActSeatNo: number | null; // whose turn; null when the round is closed
  pots: Pot[]; // finalized at showdown; running preview maintained
  log: HandActionLog[];
  awards: Award[];
  reveals: HandReveal[]; // contenders shown at multi-way showdown
  // commit-reveal passthrough
  deckCommit: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

export interface Action {
  userId: string;
  type: ActionType;
  /** Total street "to" amount for bet/raise. Ignored for fold/check/call/allin. */
  amount?: number;
}

export type ActionError =
  | 'not-your-turn'
  | 'hand-complete'
  | 'illegal-action'
  | 'bad-amount'
  | 'unknown-player';
