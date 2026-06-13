/**
 * Persist a completed hand and apply its chip movement. The engine's signed
 * per-seat netDeltas sum to zero (rake=0); we re-assert that, then post ONE
 * balanced HAND_SETTLEMENT entry across the seats' escrow accounts. This is the
 * only ledger write per hand — never per in-hand action.
 */
import type { EngineSettlement } from '@akpoker/shared';
import { createId } from '@paralleldrive/cuid2';
import type { DB } from '../db/client.js';
import { handActions, handResults, hands } from '../db/schema.js';
import { type Leg, postEntry } from '../wallet/ledger.js';

export interface SettleParams {
  settlement: EngineSettlement;
  tableId: string;
  buttonSeatNo: number;
  /** seatNo -> escrow account id (every seated player who was dealt in). */
  escrowBySeat: Record<number, string>;
}

export function settleHand(db: DB, params: SettleParams): void {
  const { settlement, tableId, buttonSeatNo, escrowBySeat } = params;
  const net = settlement.perSeat.reduce((s, p) => s + p.netDelta, 0);
  if (net + settlement.rake !== 0) {
    throw new Error(`settlement not balanced: sum(netDelta)=${net} rake=${settlement.rake}`);
  }

  db.transaction((tx) => {
    const now = Date.now();
    tx.insert(hands)
      .values({
        id: settlement.handId,
        tableId,
        buttonSeatNo,
        board: JSON.stringify(settlement.board),
        totalPot: settlement.totalPot,
        rake: settlement.rake,
        deckCommit: settlement.deckCommit,
        serverSeed: settlement.serverSeed,
        clientSeed: settlement.clientSeed,
        nonce: settlement.nonce,
        deckPermutation: JSON.stringify(settlement.deckPermutation),
        createdAt: now,
        completedAt: now,
      })
      .run();

    for (const seat of settlement.perSeat) {
      tx.insert(handResults)
        .values({
          id: createId(),
          handId: settlement.handId,
          userId: seat.userId,
          seatNo: seat.seatNo,
          netDelta: seat.netDelta,
          won: seat.won ? 1 : 0,
          bestHand: seat.bestHand ?? null,
          holeCards: seat.holeCards ? JSON.stringify(seat.holeCards) : null,
        })
        .run();
    }

    settlement.actions.forEach((a, seq) => {
      tx.insert(handActions)
        .values({
          id: createId(),
          handId: settlement.handId,
          seq,
          seatNo: a.seatNo,
          userId: a.userId,
          street: a.street,
          type: a.type,
          amount: a.amount,
        })
        .run();
    });

    // Apply net deltas to escrow accounts as one balanced entry.
    const legs: Leg[] = settlement.perSeat
      .filter((p) => p.netDelta !== 0)
      .map((p) => {
        const escrowId = escrowBySeat[p.seatNo];
        if (!escrowId) throw new Error(`no escrow for seat ${p.seatNo}`);
        return { accountId: escrowId, amount: p.netDelta };
      });
    if (legs.length >= 2) {
      postEntry(tx, {
        kind: 'hand_settlement',
        refId: settlement.handId,
        memo: `hand ${settlement.handId}`,
        legs,
      });
    }
  });
}
