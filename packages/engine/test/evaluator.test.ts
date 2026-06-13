import { cardToWire, wireToCard, type WireCard } from '@akpoker/shared';
import { Hand } from 'pokersolver';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluator.js';

const c = (...w: WireCard[]): number[] => w.map(wireToCard);

describe('evaluator — named hands', () => {
  it('classifies categories correctly', () => {
    expect(evaluate(c('Ah', 'Kh', 'Qh', 'Jh', 'Th')).category).toBe('straight-flush');
    expect(evaluate(c('As', 'Ad', 'Ah', 'Ac', 'Kd')).category).toBe('quads');
    expect(evaluate(c('As', 'Ad', 'Ah', 'Kc', 'Kd')).category).toBe('full-house');
    expect(evaluate(c('Ah', 'Th', '7h', '5h', '2h')).category).toBe('flush');
    expect(evaluate(c('As', '2d', '3h', '4c', '5d')).category).toBe('straight'); // wheel
    expect(evaluate(c('As', 'Ad', 'Ah', 'Kc', 'Qd')).category).toBe('trips');
    expect(evaluate(c('As', 'Ad', 'Kh', 'Kc', 'Qd')).category).toBe('two-pair');
    expect(evaluate(c('As', 'Ad', 'Kh', 'Qc', 'Jd')).category).toBe('pair');
    expect(evaluate(c('As', 'Jd', '9h', '7c', '5d')).category).toBe('high-card');
  });

  it('ranks stronger hands lower (better)', () => {
    const royal = evaluate(c('Ah', 'Kh', 'Qh', 'Jh', 'Th')).strength;
    const quads = evaluate(c('As', 'Ad', 'Ah', 'Ac', 'Kd')).strength;
    const boat = evaluate(c('As', 'Ad', 'Ah', 'Kc', 'Kd')).strength;
    const high = evaluate(c('As', 'Jd', '9h', '7c', '5d')).strength;
    expect(royal).toBeLessThan(quads);
    expect(quads).toBeLessThan(boat);
    expect(boat).toBeLessThan(high);
  });

  it('finds the wheel straight A-2-3-4-5 from 7 cards', () => {
    const hv = evaluate(c('Ah', '2d', '3h', '4c', '5s', 'Kd', 'Qd'));
    expect(hv.category).toBe('straight');
    expect(hv.best5).toHaveLength(5);
  });

  it('best5 is a subset that re-evaluates to the same strength', () => {
    const seven = c('Ah', 'Kh', 'Qh', 'Jh', 'Th', '2c', '3d');
    const hv = evaluate(seven);
    expect(hv.best5.every((x) => seven.includes(x))).toBe(true);
    expect(evaluate(hv.best5).strength).toBe(hv.strength);
  });
});

// ── independent oracle cross-check against pokersolver ─────────────────────────
function sample(n: number, exclude: Set<number>): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const x = Math.floor(Math.random() * 52);
    if (!exclude.has(x)) {
      exclude.add(x);
      out.push(x);
    }
  }
  return out;
}

describe('evaluator — pokersolver oracle (random 7-card hands)', () => {
  it('agrees with pokersolver on the winner of two hands over many deals', () => {
    let disagreements = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const used = new Set<number>();
      const board = sample(5, used);
      const holeA = sample(2, used);
      const holeB = sample(2, used);

      const sevenA = [...holeA, ...board];
      const sevenB = [...holeB, ...board];

      const sA = evaluate(sevenA).strength;
      const sB = evaluate(sevenB).strength;
      const pheWinner = sA < sB ? 'A' : sA > sB ? 'B' : 'tie';

      const hA = Hand.solve(sevenA.map(cardToWire));
      const hB = Hand.solve(sevenB.map(cardToWire));
      const winners = Hand.winners([hA, hB]);
      const psWinner =
        winners.length === 2 ? 'tie' : winners[0] === hA ? 'A' : 'B';

      if (pheWinner !== psWinner) disagreements++;
    }
    expect(disagreements).toBe(0);
  });
});
