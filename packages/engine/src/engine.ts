/**
 * Public engine API. Pure: createHand/applyAction return NEW immutable state plus
 * an ordered event list; they never perform I/O or mutate their inputs. The
 * real-time layer owns timers, sockets and persistence.
 */
import {
  cardToWire,
  type EngineSettlement,
  type HandActionLog,
  type IntCard,
  type LegalAction,
  type WireCard,
} from '@akpoker/shared';
import { applyBettingAction, legalActions as legalActionsImpl } from './betting.js';
import type { EngineEvent } from './events.js';
import { activeCount, nextActiveFrom, resolveBlinds, sortedBySeat } from './order.js';
import { buildPots, returnUncalled } from './pots.js';
import { runShowdown } from './showdown.js';
import type {
  Action,
  ActionError,
  HandConfig,
  HandState,
  PlayerState,
} from './types.js';

export interface CreateHandResult {
  state: HandState;
  events: EngineEvent[];
}

export type ActionResult =
  | { ok: true; state: HandState; events: EngineEvent[] }
  | { ok: false; error: ActionError };

// ── helpers ───────────────────────────────────────────────────────────────────

function cloneState(s: HandState): HandState {
  return {
    ...s,
    board: [...s.board],
    deck: [...s.deck],
    players: s.players.map((p) => ({ ...p, holeCards: p.holeCards ? [...p.holeCards] : null })),
    pots: s.pots.map((p) => ({ ...p, eligibleUserIds: [...p.eligibleUserIds] })),
    log: s.log.map((l) => ({ ...l })),
    awards: s.awards.map((a) => ({ ...a })),
    reveals: s.reveals.map((r) => ({ ...r, holeCards: [...r.holeCards], best5: [...r.best5] })),
  };
}

/** Players clockwise starting strictly after `fromSeatNo`. */
function clockwiseFrom(players: PlayerState[], fromSeatNo: number): PlayerState[] {
  const sorted = sortedBySeat(players);
  const after = sorted.filter((p) => p.seatNo > fromSeatNo);
  const before = sorted.filter((p) => p.seatNo <= fromSeatNo);
  return [...after, ...before];
}

function postBlind(p: PlayerState, amount: number): number {
  const pay = Math.min(amount, p.stack);
  p.stack -= pay;
  p.streetBet += pay;
  p.contributed += pay;
  if (p.stack === 0) p.status = 'allin';
  return pay;
}

function dealNextStreet(state: HandState, events: EngineEvent[]): void {
  const take = (): IntCard => state.deck[state.deckPos++]!;
  const burn = (): void => {
    if (state.burnCards) {
      const c = take();
      events.push({ t: 'burn', card: c });
    }
  };
  if (state.street === 'preflop') {
    burn();
    const cards = [take(), take(), take()];
    state.board.push(...cards);
    state.street = 'flop';
    events.push({ t: 'board', street: 'flop', cards });
  } else if (state.street === 'flop') {
    burn();
    const c = take();
    state.board.push(c);
    state.street = 'turn';
    events.push({ t: 'board', street: 'turn', cards: [c] });
  } else if (state.street === 'turn') {
    burn();
    const c = take();
    state.board.push(c);
    state.street = 'river';
    events.push({ t: 'board', street: 'river', cards: [c] });
  }
}

function dealRemainingStreets(state: HandState, events: EngineEvent[]): void {
  while (state.street === 'preflop' || state.street === 'flop' || state.street === 'turn') {
    dealNextStreet(state, events);
  }
}

function openBettingRound(state: HandState): void {
  for (const p of state.players) {
    p.streetBet = 0;
    if (p.status === 'active') {
      p.hasActedThisRound = false;
      p.mayRaise = true;
    }
  }
  state.currentBet = 0;
  state.lastRaiseSize = state.bigBlind;
  state.minOpen = state.bigBlind;
  const first = nextActiveFrom(state.players, state.buttonSeatNo);
  state.toActSeatNo = first ? first.seatNo : null;
}

function finalizeHand(state: HandState, events: EngineEvent[]): void {
  const refund = returnUncalled(state.players);
  if (refund) {
    const rp = state.players.find((p) => p.userId === refund.userId)!;
    events.push({ t: 'uncalled-returned', userId: rp.userId, seatNo: rp.seatNo, amount: refund.amount });
  }

  const pots = buildPots(state.players);
  state.pots = pots;
  events.push({ t: 'pots', pots: pots.map((p) => ({ ...p, eligibleUserIds: [...p.eligibleUserIds] })) });

  const { awards, reveals } = runShowdown(state.players, state.board, pots, state.buttonSeatNo);
  state.awards = awards;
  state.reveals = reveals.map((r) => ({
    userId: r.userId,
    seatNo: r.seatNo,
    holeCards: r.holeCards,
    category: r.hand.category,
    descr: r.hand.descr,
    best5: r.hand.best5,
  }));

  for (const r of state.reveals) {
    events.push({
      t: 'reveal',
      userId: r.userId,
      seatNo: r.seatNo,
      cards: r.holeCards,
      category: r.category,
      descr: r.descr,
      best5: r.best5,
    });
  }
  for (const a of awards) {
    events.push({ t: 'award', userId: a.userId, seatNo: a.seatNo, amount: a.amount, potIndex: a.potIndex });
  }

  state.street = 'complete';
  state.toActSeatNo = null;
  const finalStacks: Record<string, number> = {};
  for (const p of state.players) finalStacks[p.userId] = p.stack;
  events.push({ t: 'hand-complete', finalStacks });
}

/**
 * Progress the hand while no player input is required: close rounds, deal streets,
 * run out all-in boards, and finalize at showdown. Stops when a player must act
 * (toActSeatNo set) or the hand is complete.
 */
function runAdvance(state: HandState, events: EngineEvent[]): void {
  // Safety bound: a hand can never need more than a handful of transitions.
  for (let guard = 0; guard < 64; guard++) {
    if (state.street === 'complete') return;
    if (state.toActSeatNo !== null) return; // waiting for a player

    events.push({ t: 'street-closed', street: state.street });

    const contenders = state.players.filter((p) => p.status !== 'folded');
    if (contenders.length <= 1) {
      finalizeHand(state, events);
      return;
    }
    if (state.street === 'river') {
      finalizeHand(state, events);
      return;
    }
    if (activeCount(state.players) <= 1) {
      // No further betting possible — run out the board, then showdown.
      dealRemainingStreets(state, events);
      finalizeHand(state, events);
      return;
    }
    dealNextStreet(state, events);
    openBettingRound(state);
    if (state.toActSeatNo !== null) return;
  }
  throw new Error('runAdvance exceeded transition bound (engine bug)');
}

// ── public API ──────────────────────────────────────────────────────────────

export function createHand(config: HandConfig): CreateHandResult {
  const ante = config.ante ?? 0;
  const burnCards = config.burnCards ?? true;
  const players: PlayerState[] = sortedBySeat(
    config.seats.map((s) => ({
      seatNo: s.seatNo,
      userId: s.userId,
      stack: s.stack,
      contributed: 0,
      streetBet: 0,
      status: 'active' as const,
      hasActedThisRound: false,
      mayRaise: true,
      holeCards: null,
      stackAtHandStart: s.stack,
    })),
  );

  const state: HandState = {
    handId: config.handId,
    street: 'preflop',
    board: [],
    players,
    buttonSeatNo: config.buttonSeatNo,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    ante,
    burnCards,
    deck: [...config.deck],
    deckPos: 0,
    currentBet: 0,
    lastRaiseSize: config.bigBlind,
    minOpen: config.bigBlind,
    toActSeatNo: null,
    pots: [],
    log: [],
    awards: [],
    reveals: [],
    deckCommit: config.deckCommit,
    serverSeed: config.serverSeed,
    clientSeed: config.clientSeed,
    nonce: config.nonce,
  };

  const events: EngineEvent[] = [];
  events.push({ t: 'hand-started', handId: state.handId, buttonSeatNo: state.buttonSeatNo, deckCommit: state.deckCommit });

  // Antes (dead money) before blinds.
  if (ante > 0) {
    for (const p of clockwiseFrom(players, state.buttonSeatNo)) {
      const pay = Math.min(ante, p.stack);
      if (pay > 0) {
        p.stack -= pay;
        p.contributed += pay;
        if (p.stack === 0) p.status = 'allin';
        events.push({ t: 'ante', userId: p.userId, seatNo: p.seatNo, amount: pay, allin: p.status === 'allin' });
      }
    }
  }

  // Blinds.
  const { smallBlindSeatNo, bigBlindSeatNo } = resolveBlinds(
    players,
    state.buttonSeatNo,
    config.smallBlindSeatNo,
    config.bigBlindSeatNo,
  );
  if (smallBlindSeatNo !== null) {
    const sb = players.find((p) => p.seatNo === smallBlindSeatNo);
    if (sb) {
      const paid = postBlind(sb, state.smallBlind);
      events.push({ t: 'blind', userId: sb.userId, seatNo: sb.seatNo, kind: 'sb', amount: paid, allin: sb.status === 'allin' });
    }
  }
  const bb = players.find((p) => p.seatNo === bigBlindSeatNo);
  if (bb) {
    const paid = postBlind(bb, state.bigBlind);
    events.push({ t: 'blind', userId: bb.userId, seatNo: bb.seatNo, kind: 'bb', amount: paid, allin: bb.status === 'allin' });
  }
  state.currentBet = state.bigBlind;
  state.lastRaiseSize = state.bigBlind;

  // Deal hole cards: two passes, one card at a time, starting left of the button.
  const dealOrder = clockwiseFrom(players, state.buttonSeatNo);
  for (let pass = 0; pass < 2; pass++) {
    for (const p of dealOrder) {
      const c = state.deck[state.deckPos++]!;
      if (pass === 0) p.holeCards = [c, c]; // second card is overwritten on pass 1
      else p.holeCards![1] = c;
    }
  }
  for (const p of dealOrder) {
    events.push({ t: 'deal-hole', userId: p.userId, seatNo: p.seatNo, cards: p.holeCards! });
  }

  // First to act preflop = next active after the big blind.
  const first = nextActiveFrom(players, bigBlindSeatNo);
  state.toActSeatNo = first ? first.seatNo : null;

  // If nobody can act (e.g. all-in from blinds), run it out.
  runAdvance(state, events);
  return { state, events };
}

export function applyAction(state: HandState, action: Action): ActionResult {
  if (state.street === 'complete') return { ok: false, error: 'hand-complete' };
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  const err = applyBettingAction(next, action, events);
  if (err) return { ok: false, error: err };
  runAdvance(next, events);
  return { ok: true, state: next, events };
}

export function legalActions(state: HandState, userId: string): LegalAction {
  return legalActionsImpl(state, userId);
}

/** Wire-format hole cards for a player (private channel), or null. */
export function holeCardsFor(state: HandState, userId: string): [WireCard, WireCard] | null {
  const p = state.players.find((q) => q.userId === userId);
  if (!p || !p.holeCards) return null;
  return [cardToWire(p.holeCards[0]), cardToWire(p.holeCards[1])];
}

/** Build the canonical settlement object consumed by the wallet. */
export function buildSettlement(state: HandState): EngineSettlement {
  if (state.street !== 'complete') throw new Error('hand not complete');
  const wonIds = new Set(state.awards.map((a) => a.userId));
  const revealById = new Map(state.reveals.map((r) => [r.userId, r]));

  const perSeat = state.players.map((p) => {
    const reveal = revealById.get(p.userId);
    return {
      userId: p.userId,
      seatNo: p.seatNo,
      netDelta: p.stack - p.stackAtHandStart,
      won: wonIds.has(p.userId),
      ...(reveal ? { bestHand: reveal.descr } : {}),
      ...(reveal ? { holeCards: reveal.holeCards.map(cardToWire) } : {}),
    };
  });

  const actions: HandActionLog[] = state.log.map((l) => ({ ...l }));
  const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0);

  return {
    handId: state.handId,
    board: state.board.map(cardToWire),
    totalPot,
    rake: 0,
    perSeat,
    actions,
    deckCommit: state.deckCommit,
    serverSeed: state.serverSeed,
    clientSeed: state.clientSeed,
    nonce: state.nonce,
    deckPermutation: [...state.deck],
  };
}
