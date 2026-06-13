import { describe, expect, it } from 'vitest';
import { applyAction, buildSettlement, createHand } from '../src/engine.js';
import type { Action } from '../src/types.js';
import { mkConfig, mkSeats } from './_helpers.js';

const SCRIPT: Action[] = [
  { userId: 'P0', type: 'call' }, // UTG/button limps
  { userId: 'P1', type: 'call' }, // SB completes
  { userId: 'P2', type: 'check' }, // BB option -> flop
  { userId: 'P1', type: 'check' },
  { userId: 'P2', type: 'check' },
  { userId: 'P0', type: 'bet', amount: 30 },
  { userId: 'P1', type: 'fold' },
  { userId: 'P2', type: 'call' }, // turn
  { userId: 'P2', type: 'check' },
  { userId: 'P0', type: 'check' }, // river
  { userId: 'P2', type: 'check' },
  { userId: 'P0', type: 'check' }, // showdown
];

function run(): { stacks: Record<string, number>; settlement: ReturnType<typeof buildSettlement> } {
  let { state } = createHand(mkConfig(mkSeats([1000, 1000, 1000]), { buttonSeatNo: 0, words: [11, 22, 33, 44] }));
  for (const a of SCRIPT) {
    if (state.street === 'complete') break;
    const res = applyAction(state, a);
    if (!res.ok) throw new Error(`action failed: ${JSON.stringify(a)} -> ${res.error}`);
    state = res.state;
  }
  const stacks: Record<string, number> = {};
  for (const p of state.players) stacks[p.userId] = p.stack;
  return { stacks, settlement: buildSettlement(state) };
}

describe('deterministic replay', () => {
  it('produces byte-identical results from the same deck + action script', () => {
    const a = run();
    const b = run();
    expect(b.stacks).toEqual(a.stacks);
    expect(b.settlement.deckPermutation).toEqual(a.settlement.deckPermutation);
    expect(b.settlement.board).toEqual(a.settlement.board);
  });

  it('settlement conserves chips (sum netDelta + rake === 0)', () => {
    const { settlement } = run();
    const net = settlement.perSeat.reduce((s, p) => s + p.netDelta, 0);
    expect(net + settlement.rake).toBe(0);
  });

  it('reveals only the players who reached showdown', () => {
    const { settlement } = run();
    const revealed = settlement.perSeat.filter((p) => p.holeCards);
    // P1 folded on the flop; P0 and P2 reached showdown.
    expect(revealed.map((p) => p.userId).sort()).toEqual(['P0', 'P2']);
  });
});
