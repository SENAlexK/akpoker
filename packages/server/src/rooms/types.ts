/** Server-side table/seat types. Seat.holeCards is server-only and never serialized into a public payload. */
import type { PlayerStatus, SeatStatus } from '@akpoker/shared';
import type { IntCard } from '@akpoker/shared';

export interface Seat {
  seatNo: number;
  userId: string;
  nickname: string;
  avatarUrl: string;
  escrowId: string;
  stack: number; // in-memory chips (hot truth during a hand)
  seatStatus: SeatStatus;
  inHand: boolean; // dealt into the current hand
  handStatus: PlayerStatus | null; // mirrors the engine while in a hand
  committed: number; // current-street commit (engine streetBet), for display
  holeCards: [IntCard, IntCard] | null; // SERVER ONLY
  ready: boolean; // readied up (sit-in) for the next hand
  pendingLeave: boolean;
  disconnectDeadline: number | null;
  lastClientActionId: string | null;
}

export interface TableConfigInternal {
  id: string;
  name: string;
  ownerUserId: string;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  minBuyIn: number;
  maxBuyIn: number;
  isPrivate: boolean;
  inviteCode: string;
}
