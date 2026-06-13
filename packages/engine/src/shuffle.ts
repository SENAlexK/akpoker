/**
 * Fisher-Yates shuffle over a fresh 52-card deck. Because it only swaps existing
 * elements of [0..51], it is a bijection: the multiset of cards is invariant, so
 * duplicates and impossible hands (e.g. five aces) are STRUCTURALLY impossible.
 * Uniform over all 52! permutations given an unbiased Rng.
 */
import { freshIntDeck, type IntCard } from '@akpoker/shared';
import type { Rng } from './rng.js';

export function shuffle(deck: readonly IntCard[], rng: Rng): IntCard[] {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1); // uniform in [0, i]
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/** Shuffle a brand-new 52-card deck. */
export function shuffledDeck(rng: Rng): IntCard[] {
  return shuffle(freshIntDeck(), rng);
}
