/**
 * Showdown: determine winners pot-by-pot, split ties, apply the odd-chip rule
 * (extra chips go to the first eligible winner(s) clockwise from the button).
 */
import type { IntCard } from '@akpoker/shared';
import { evaluate, type HandValue } from './evaluator.js';
import { sortedBySeat } from './order.js';
import type { Award, PlayerState, Pot } from './types.js';

export interface ShowdownReveal {
  userId: string;
  seatNo: number;
  holeCards: [IntCard, IntCard];
  hand: HandValue;
}

/** Clockwise rank of each player's seat starting just after the button (0-based). */
function clockwiseOrder(players: PlayerState[], buttonSeatNo: number): Map<string, number> {
  const sorted = sortedBySeat(players);
  const after = sorted.filter((p) => p.seatNo > buttonSeatNo);
  const before = sorted.filter((p) => p.seatNo <= buttonSeatNo);
  const order = [...after, ...before];
  const map = new Map<string, number>();
  order.forEach((p, i) => map.set(p.userId, i));
  return map;
}

export interface ShowdownResult {
  awards: Award[];
  reveals: ShowdownReveal[]; // contenders who reached showdown (for multi-way pots)
}

/**
 * Distribute the given pots among contenders. Requires a complete 5-card board
 * for any pot contested by >1 player. Mutates player stacks via the returned
 * awards being applied by the caller? No — this applies awards to stacks directly
 * and returns the award list + reveals.
 */
export function runShowdown(
  players: PlayerState[],
  board: IntCard[],
  pots: Pot[],
  buttonSeatNo: number,
): ShowdownResult {
  const byId = new Map(players.map((p) => [p.userId, p]));
  const order = clockwiseOrder(players, buttonSeatNo);
  const awards: Award[] = [];
  const reveals: ShowdownReveal[] = [];
  const evalCache = new Map<string, HandValue>();

  const handFor = (p: PlayerState): HandValue => {
    const cached = evalCache.get(p.userId);
    if (cached) return cached;
    if (!p.holeCards) throw new Error(`contender ${p.userId} has no hole cards`);
    const hv = evaluate([...p.holeCards, ...board]);
    evalCache.set(p.userId, hv);
    return hv;
  };

  pots.forEach((pot, potIndex) => {
    const eligible = pot.eligibleUserIds.map((id) => byId.get(id)!).filter(Boolean);
    if (eligible.length === 0) return;

    let winners: PlayerState[];
    if (eligible.length === 1) {
      winners = eligible;
    } else {
      // Multi-way: evaluate and take minimum strength (lower = better).
      let best = Infinity;
      for (const p of eligible) best = Math.min(best, handFor(p).strength);
      winners = eligible.filter((p) => handFor(p).strength === best);
      // Record reveals for everyone who showed down for this pot.
      for (const p of eligible) {
        if (!reveals.some((r) => r.userId === p.userId)) {
          reveals.push({
            userId: p.userId,
            seatNo: p.seatNo,
            holeCards: p.holeCards!,
            hand: handFor(p),
          });
        }
      }
    }

    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    // Odd chips: one each, clockwise from the button.
    const orderedWinners = [...winners].sort(
      (a, b) => (order.get(a.userId) ?? 0) - (order.get(b.userId) ?? 0),
    );
    for (const w of orderedWinners) {
      let amt = share;
      if (remainder > 0) {
        amt += 1;
        remainder -= 1;
      }
      if (amt > 0) {
        w.stack += amt;
        awards.push({ userId: w.userId, seatNo: w.seatNo, amount: amt, potIndex });
      }
    }
  });

  return { awards, reveals };
}
