import { freshIntDeck } from '@akpoker/shared';
import { describe, expect, it } from 'vitest';
import { commitOf, createShuffleSeed, drbgFromSeed, rngForHand, seqRng } from '../src/rng.js';
import { shuffle } from '../src/shuffle.js';

describe('shuffle integrity', () => {
  it('every shuffle is a permutation of 0..51 (no dup / no missing)', () => {
    for (let i = 0; i < 5000; i++) {
      const out = shuffle(freshIntDeck(), seqRng([i * 2654435761, (i + 7) * 40503, i + 1]));
      expect(out).toHaveLength(52);
      const sorted = [...out].sort((a, b) => a - b);
      expect(sorted).toEqual(freshIntDeck());
    }
  });

  it('covers all 52 positions roughly uniformly for card 0 over many shuffles', () => {
    const counts = new Array(52).fill(0);
    const N = 52 * 400;
    for (let i = 0; i < N; i++) {
      const rng = drbgFromSeed(`seed-${i}`);
      const out = shuffle(freshIntDeck(), rng);
      counts[out.indexOf(0)]++;
    }
    const expected = N / 52;
    // loose chi-square-ish bound: each bucket within 40% of expected
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.6);
      expect(c).toBeLessThan(expected * 1.4);
    }
  });
});

describe('commit-reveal provably-fair', () => {
  it('recomputes the exact deck from the revealed seed and matches the commitment', () => {
    const seed = createShuffleSeed('client-abc', 42);
    expect(commitOf(seed.serverSeed)).toBe(seed.deckCommit);

    const deck1 = shuffle(freshIntDeck(), rngForHand(seed));
    // Anyone with the revealed seed recomputes the identical deck.
    const deck2 = shuffle(freshIntDeck(), rngForHand(seed));
    expect(deck2).toEqual(deck1);

    // A different nonce yields a different deck.
    const deck3 = shuffle(freshIntDeck(), rngForHand({ ...seed, nonce: 43 }));
    expect(deck3).not.toEqual(deck1);
  });

  it('drbg is deterministic for a given seed', () => {
    const a = drbgFromSeed('x');
    const b = drbgFromSeed('x');
    const seqA = Array.from({ length: 100 }, () => a.int(1000));
    const seqB = Array.from({ length: 100 }, () => b.int(1000));
    expect(seqA).toEqual(seqB);
  });
});
