/**
 * The hole-card redaction boundary. buildSnapshot produces a PublicTableState
 * (TableSnapshot) that is STRUCTURALLY incapable of carrying any player's hidden
 * hole cards — it simply never reads seat.holeCards into the output. The viewer's
 * own concealed cards travel separately via the private hand:hole event.
 */
import {
  cardToWire,
  type LegalAction,
  type PublicSeat,
  type TableSnapshot,
  type LastAction,
} from '@akpoker/shared';
import { engineLegalActions, potPreview, type HandState } from '@akpoker/engine';
import type { Seat, TableConfigInternal } from '../rooms/types.js';

export interface SnapshotInput {
  config: TableConfigInternal;
  version: number;
  phase: 'idle' | 'in_hand';
  seats: (Seat | null)[];
  engine: HandState | null;
  buttonSeatNo: number | null;
  sbSeatNo: number | null;
  bbSeatNo: number | null;
  spectatorCount: number;
  lastAction: LastAction | null;
  actionDeadlineAt: number | null;
  viewerUserId: string | null;
}

function publicSeat(input: SnapshotInput, seat: Seat | null, seatNo: number): PublicSeat {
  if (!seat) {
    return {
      seatNo,
      userId: null,
      nickname: null,
      avatarUrl: null,
      stack: 0,
      committed: 0,
      seatStatus: 'empty',
      handStatus: null,
      inHand: false,
      hasCards: false,
      holeCards: null,
      isButton: false,
      isSmallBlind: false,
      isBigBlind: false,
      isTurn: false,
      isWinner: false,
    };
  }
  const enginePlayer = input.engine?.players.find((p) => p.seatNo === seatNo) ?? null;
  return {
    seatNo,
    userId: seat.userId,
    nickname: seat.nickname,
    avatarUrl: seat.avatarUrl,
    stack: seat.stack,
    committed: enginePlayer?.streetBet ?? 0,
    seatStatus: seat.seatStatus,
    handStatus: enginePlayer?.status ?? null,
    inHand: seat.inHand,
    hasCards: seat.inHand && enginePlayer?.status !== 'folded' && enginePlayer?.holeCards != null,
    holeCards: null, // NEVER leak opponents' cards here; reveals ride hand:result
    isButton: input.buttonSeatNo === seatNo,
    isSmallBlind: input.sbSeatNo === seatNo,
    isBigBlind: input.bbSeatNo === seatNo,
    isTurn: input.engine?.toActSeatNo === seatNo,
    isWinner: false,
  };
}

export function buildSnapshot(input: SnapshotInput): TableSnapshot {
  const { config, engine } = input;
  const seats = Array.from({ length: config.maxSeats }, (_, i) =>
    publicSeat(input, input.seats[i] ?? null, i),
  );

  const seatNoByUser = new Map<string, number>();
  for (const s of input.seats) if (s) seatNoByUser.set(s.userId, s.seatNo);

  const pots = engine
    ? potPreview(engine.players).map((pot) => ({
        amount: pot.amount,
        eligibleSeatNos: pot.eligibleUserIds
          .map((uid) => engine.players.find((p) => p.userId === uid)?.seatNo)
          .filter((n): n is number => n != null),
      }))
    : [];
  const totalPot = pots.reduce((s, p) => s + p.amount, 0);

  const viewerSeatNo = input.viewerUserId != null ? (seatNoByUser.get(input.viewerUserId) ?? null) : null;
  let viewerLegalAction: LegalAction | null = null;
  if (engine && input.viewerUserId && viewerSeatNo != null && engine.toActSeatNo === viewerSeatNo) {
    viewerLegalAction = engineLegalActions(engine, input.viewerUserId);
  }

  return {
    tableId: config.id,
    version: input.version,
    phase: input.phase,
    config: {
      name: config.name,
      maxSeats: config.maxSeats,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      minBuyIn: config.minBuyIn,
      maxBuyIn: config.maxBuyIn,
      isPrivate: config.isPrivate,
    },
    seats,
    board: engine ? engine.board.map(cardToWire) : [],
    pots,
    totalPot,
    buttonSeatNo: input.buttonSeatNo,
    handId: engine?.handId ?? null,
    street: engine?.street ?? null,
    currentBet: engine?.currentBet ?? 0,
    toActSeatNo: engine?.toActSeatNo ?? null,
    actionDeadlineAt: input.actionDeadlineAt,
    viewerSeatNo,
    viewerLegalAction,
    spectatorCount: input.spectatorCount,
    lastAction: input.lastAction,
    deckCommit: engine?.deckCommit ?? null,
  };
}
