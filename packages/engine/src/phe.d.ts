/**
 * Minimal local type declarations for the untyped `phe` package (v0.6.0).
 * The evaluator is isolated behind evaluate7() so phe stays swappable.
 * phe card strings use the same 2-char format as our WireCard ("Ah", "Tc", ...).
 * evaluateCards returns a strength where SMALLER is better.
 * handRank(value) returns a category index 0..8:
 *   0 STRAIGHT_FLUSH, 1 FOUR_OF_A_KIND, 2 FULL_HOUSE, 3 FLUSH,
 *   4 STRAIGHT, 5 THREE_OF_A_KIND, 6 TWO_PAIR, 7 ONE_PAIR, 8 HIGH_CARD
 */
declare module 'phe' {
  export function evaluateCards(cards: string[]): number;
  export function evaluateCardsFast(cards: string[]): number;
  export function evaluateCardCodes(codes: number[]): number;
  export function rankCards(cards: string[]): number;
  export function handRank(value: number): number;
  export const rankDescription: string[];
}
