/**
 * Hand evaluation bridge. Isolated behind evaluate7() so `phe` stays swappable.
 * `phe.evaluateCards` accepts the SAME 2-char strings as our WireCard, so we
 * convert int cards -> wire strings and call directly (no separate code mapping).
 * Lower strength = stronger hand. This is the single source of comparison.
 */
import { cardToWire, type IntCard } from '@akpoker/shared';
import { evaluateCards, handRank, rankDescription } from 'phe';

export type HandCategory =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'quads'
  | 'straight-flush';

// phe handRank index (0..8) -> our category
const CATEGORY_BY_PHE_RANK: HandCategory[] = [
  'straight-flush', // 0 STRAIGHT_FLUSH
  'quads', // 1 FOUR_OF_A_KIND
  'full-house', // 2 FULL_HOUSE
  'flush', // 3 FLUSH
  'straight', // 4 STRAIGHT
  'trips', // 5 THREE_OF_A_KIND
  'two-pair', // 6 TWO_PAIR
  'pair', // 7 ONE_PAIR
  'high-card', // 8 HIGH_CARD
];

export interface HandValue {
  strength: number; // phe value; LOWER is better
  category: HandCategory;
  descr: string; // human-readable, e.g. "Full House"
  best5: IntCard[]; // the 5 cards forming the hand (subset of input)
}

function strengthOf(cards: IntCard[]): number {
  return evaluateCards(cards.map(cardToWire));
}

/** All 5-card subsets of a 5..7 card array (indices). */
function combinations5(n: number): number[][] {
  const result: number[][] = [];
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) result.push([a, b, c, d, e]);
  return result;
}

/**
 * Evaluate 5, 6 or 7 cards, returning the comparable strength, category and the
 * best 5-card subset. best5 is computed only here (showdown path), so iterating
 * the few 5-card subsets is negligible.
 */
export function evaluate(cards: IntCard[]): HandValue {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluate needs 5-7 cards, got ${cards.length}`);
  }
  const strength = strengthOf(cards);
  const pheRank = handRank(strength);
  const category = CATEGORY_BY_PHE_RANK[pheRank]!;
  const descr = rankDescription[pheRank] ?? category;

  // Find the 5-card subset whose strength equals the overall strength.
  let best5: IntCard[] = cards.slice(0, 5);
  if (cards.length === 5) {
    best5 = cards.slice();
  } else {
    for (const combo of combinations5(cards.length)) {
      const subset = combo.map((i) => cards[i]!);
      if (strengthOf(subset) === strength) {
        best5 = subset;
        break;
      }
    }
  }
  return { strength, category, descr, best5 };
}

/** Convenience for exactly 2 hole + community cards. */
export function evaluate7(hole: [IntCard, IntCard], board: IntCard[]): HandValue {
  return evaluate([...hole, ...board]);
}
