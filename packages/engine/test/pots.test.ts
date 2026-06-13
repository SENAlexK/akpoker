import { wireToCard, type WireCard } from '@akpoker/shared';
import { describe, expect, it } from 'vitest';
import { buildPots, returnUncalled } from '../src/pots.js';
import { runShowdown } from '../src/showdown.js';
import type { PlayerState } from '../src/types.js';

function mkPlayer(
  seatNo: number,
  userId: string,
  contributed: number,
  status: PlayerState['status'] = 'active',
  hole?: [WireCard, WireCard],
): PlayerState {
  return {
    seatNo,
    userId,
    stack: 0,
    contributed,
    streetBet: 0,
    status,
    hasActedThisRound: true,
    mayRaise: true,
    holeCards: hole ? [wireToCard(hole[0]), wireToCard(hole[1])] : null,
    stackAtHandStart: 0,
  };
}

describe('side pots — contribution peeling', () => {
  it('3-way all-in at three depths => 1 main + 2 side pots', () => {
    // A all-in 100, B all-in 300, C covers 300 (calls 300)
    const players = [
      mkPlayer(0, 'A', 100),
      mkPlayer(1, 'B', 300),
      mkPlayer(2, 'C', 300),
    ];
    const pots = buildPots(players);
    // level 100: 3*100=300 (A,B,C); level 300: layer 200 * 2 (B,C) = 400
    expect(pots).toHaveLength(2);
    expect(pots[0]!.amount).toBe(300);
    expect(new Set(pots[0]!.eligibleUserIds)).toEqual(new Set(['A', 'B', 'C']));
    expect(pots[1]!.amount).toBe(400);
    expect(new Set(pots[1]!.eligibleUserIds)).toEqual(new Set(['B', 'C']));
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(700);
  });

  it('folded player dead money is in the pot but not eligible', () => {
    const players = [
      mkPlayer(0, 'A', 100, 'active'),
      mkPlayer(1, 'B', 100, 'active'),
      mkPlayer(2, 'C', 50, 'folded'), // folded after putting in 50
    ];
    const pots = buildPots(players);
    // level 50: 3*50 = 150 (eligible A,B); level 100: 2*50 = 100 (eligible A,B) -> merged
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(250);
    expect(new Set(pots[0]!.eligibleUserIds)).toEqual(new Set(['A', 'B']));
  });

  it('returns the uncalled over-bet to the sole top contributor before building pots', () => {
    // A bet 1500, B (all-in) only 600, C folded after 100
    const players = [
      mkPlayer(0, 'A', 1500, 'active'),
      mkPlayer(1, 'B', 600, 'allin'),
      mkPlayer(2, 'C', 100, 'folded'),
    ];
    const refund = returnUncalled(players);
    expect(refund).toEqual({ userId: 'A', amount: 900 }); // 1500 - 600
    expect(players[0]!.contributed).toBe(600);
    expect(players[0]!.stack).toBe(900);
    const pots = buildPots(players);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(600 + 600 + 100);
  });

  it('no uncalled return when top contributions tie', () => {
    const players = [mkPlayer(0, 'A', 500), mkPlayer(1, 'B', 500)];
    expect(returnUncalled(players)).toBeNull();
  });
});

describe('showdown — split pots and odd chips', () => {
  it('awards a split pot evenly', () => {
    const board = ['2c', '7d', '9h', 'Js', 'Kc'].map(wireToCard);
    const players = [
      mkPlayer(0, 'A', 100, 'active', ['Ah', 'Ad']),
      mkPlayer(1, 'B', 100, 'active', ['As', 'Ac']),
    ];
    const pots = buildPots(players); // single 200 pot
    const { awards } = runShowdown(players, board, pots, /*button*/ 0);
    const total = awards.reduce((s, a) => s + a.amount, 0);
    expect(total).toBe(200);
    // both have a pair of aces with same kickers -> tie, 100 each
    const byUser = Object.fromEntries(awards.map((a) => [a.userId, a.amount]));
    expect(byUser['A']).toBe(100);
    expect(byUser['B']).toBe(100);
  });

  it('gives the odd chip to the first winner left of the button', () => {
    // Royal flush on the board => all live players tie and play the board.
    // 3 winners split a single 100 pot (a 4th folded but contributed): 34/33/33,
    // odd chip to the first eligible winner clockwise from the button (seat 0).
    const board = ['Ah', 'Kh', 'Qh', 'Jh', 'Th'].map(wireToCard);
    const players = [
      mkPlayer(0, 'D', 25, 'folded', ['2c', '3d']), // button seat, folded, dead money
      mkPlayer(1, 'A', 25, 'active', ['2d', '4c']), // first left of button
      mkPlayer(2, 'B', 25, 'active', ['5c', '6d']),
      mkPlayer(3, 'C', 25, 'active', ['7c', '8d']),
    ];
    const pots = buildPots(players); // single 100 pot, eligible A,B,C
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(100);
    const { awards } = runShowdown(players, board, pots, /*button*/ 0);
    const byUser = Object.fromEntries(awards.map((a) => [a.userId, a.amount]));
    expect(byUser['A']).toBe(34); // odd chip to first left of button
    expect(byUser['B']).toBe(33);
    expect(byUser['C']).toBe(33);
    expect((byUser['A'] ?? 0) + (byUser['B'] ?? 0) + (byUser['C'] ?? 0)).toBe(100);
  });

  it('best hand wins the whole pot when not tied', () => {
    const board = ['2c', '7d', '9h', 'Js', 'Kc'].map(wireToCard);
    const players = [
      mkPlayer(0, 'A', 100, 'active', ['Ah', 'Ad']), // pair of aces
      mkPlayer(1, 'B', 100, 'active', ['2h', '7h']), // two pair 7s & 2s
    ];
    const pots = buildPots(players);
    const { awards } = runShowdown(players, board, pots, 0);
    expect(awards).toHaveLength(1);
    expect(awards[0]!.userId).toBe('B');
    expect(awards[0]!.amount).toBe(200);
  });
});
