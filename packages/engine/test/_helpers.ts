import { freshIntDeck } from '@akpoker/shared';
import { applyAction, createHand } from '../src/engine.js';
import { legalActions } from '../src/betting.js';
import { commitOf, seqRng } from '../src/rng.js';
import { shuffle } from '../src/shuffle.js';
import type { Action, HandConfig, HandState, SeatInput } from '../src/types.js';

export function mkSeats(stacks: number[]): SeatInput[] {
  return stacks.map((stack, i) => ({ seatNo: i, userId: `P${i}`, stack }));
}

export function mkConfig(
  seats: SeatInput[],
  opts: { buttonSeatNo?: number; smallBlind?: number; bigBlind?: number; words?: number[] } = {},
): HandConfig {
  const serverSeed = 'test-server-seed-' + (opts.words?.join('-') ?? '0');
  const deck = shuffle(freshIntDeck(), seqRng(opts.words ?? [123456789, 987654321, 42, 7]));
  return {
    handId: 'h1',
    seats,
    buttonSeatNo: opts.buttonSeatNo ?? 0,
    smallBlind: opts.smallBlind ?? 5,
    bigBlind: opts.bigBlind ?? 10,
    deck,
    deckCommit: commitOf(serverSeed),
    serverSeed,
    clientSeed: 'client-seed',
    nonce: 1,
  };
}

export function totalChips(state: HandState): number {
  return state.players.reduce((s, p) => s + p.stack + p.contributed, 0);
}

export function initialTotal(state: HandState): number {
  return state.players.reduce((s, p) => s + p.stackAtHandStart, 0);
}

/** Assert engine invariants at any point in a hand. */
export function assertInvariants(state: HandState): void {
  for (const p of state.players) {
    if (p.stack < 0) throw new Error(`negative stack for ${p.userId}: ${p.stack}`);
    if (p.contributed < 0) throw new Error(`negative contributed for ${p.userId}`);
  }
  if (state.street === 'complete') {
    const sum = state.players.reduce((s, p) => s + p.stack, 0);
    if (sum !== initialTotal(state)) {
      throw new Error(`chip leak at complete: ${sum} != ${initialTotal(state)}`);
    }
    const net = state.players.reduce((s, p) => s + (p.stack - p.stackAtHandStart), 0);
    if (net !== 0) throw new Error(`netDelta sum != 0: ${net}`);
  } else {
    if (totalChips(state) !== initialTotal(state)) {
      throw new Error(`chip leak in play: ${totalChips(state)} != ${initialTotal(state)}`);
    }
  }
}

export type ActionPicker = (la: ReturnType<typeof legalActions>, rnd: () => number) => Action['type'] | { type: Action['type']; amount?: number };

/** Drive a hand to completion picking random legal actions, asserting invariants throughout. */
export function playRandomHand(config: HandConfig, rnd: () => number): HandState {
  const { state } = createHand(config);
  let s = state;
  assertInvariants(s);
  let guard = 0;
  while (s.street !== 'complete') {
    if (++guard > 500) throw new Error('hand did not terminate');
    const toAct = s.toActSeatNo;
    if (toAct === null) throw new Error('no actor but hand not complete');
    const actor = s.players.find((p) => p.seatNo === toAct)!;
    const la = legalActions(s, actor.userId);

    const choices: Action[] = [];
    if (la.canCheck) choices.push({ userId: actor.userId, type: 'check' });
    if (la.canCall) choices.push({ userId: actor.userId, type: 'call' });
    if (la.canBet) {
      const amt = la.minBet + Math.floor(rnd() * (la.maxBet - la.minBet + 1));
      choices.push({ userId: actor.userId, type: 'bet', amount: amt });
    }
    if (la.canRaise) {
      const amt = la.minRaise + Math.floor(rnd() * (la.maxRaise - la.minRaise + 1));
      choices.push({ userId: actor.userId, type: 'raise', amount: amt });
    }
    // fold last, lower weight so hands progress
    if (la.canFold && (choices.length === 0 || rnd() < 0.2)) {
      choices.push({ userId: actor.userId, type: 'fold' });
    }
    const choice = choices[Math.floor(rnd() * choices.length)]!;
    const res = applyAction(s, choice);
    if (!res.ok) throw new Error(`illegal action ${JSON.stringify(choice)}: ${res.error}`);
    s = res.state;
    assertInvariants(s);
  }
  return s;
}

/** Tiny deterministic PRNG for tests (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
