/**
 * Canonical card representation — the SINGLE source of truth for the wire format.
 *
 * - Wire format (what crosses the network and the client renders): a 2-char string
 *   like "Ah" = rank char + suit char.
 * - Engine-internal format: an integer 0..51 = rank*4 + suit.
 *
 * rank: 0='2', 1='3', ... 8='T', 9='J', 10='Q', 11='K', 12='A'   (Ace high)
 * suit: 0='c'(clubs), 1='d'(diamonds), 2='h'(hearts), 3='s'(spades)
 *
 * The two conversion functions below are the ONLY place the two encodings meet.
 * A round-trip test (cards.test.ts) guards against any off-by-one that would
 * silently render the wrong card.
 */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['c', 'd', 'h', 's'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

/** A card on the wire, e.g. "Ah", "Tc", "2s". */
export type WireCard = `${Rank}${Suit}`;

/** Engine-internal integer card, 0..51. */
export type IntCard = number;

const RANK_INDEX: Record<string, number> = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const SUIT_INDEX: Record<string, number> = Object.fromEntries(SUITS.map((s, i) => [s, i]));

export function rankOf(card: IntCard): number {
  return Math.trunc(card / 4);
}

export function suitOf(card: IntCard): number {
  return card % 4;
}

/** Convert an engine integer card (0..51) to its wire string. */
export function cardToWire(card: IntCard): WireCard {
  if (!Number.isInteger(card) || card < 0 || card > 51) {
    throw new RangeError(`invalid IntCard: ${card}`);
  }
  const r = RANKS[rankOf(card)];
  const s = SUITS[suitOf(card)];
  return `${r}${s}` as WireCard;
}

/** Convert a wire card string ("Ah") to its engine integer (0..51). */
export function wireToCard(wire: string): IntCard {
  const r = RANK_INDEX[wire[0] ?? ''];
  const s = SUIT_INDEX[wire[1] ?? ''];
  if (r === undefined || s === undefined || wire.length !== 2) {
    throw new RangeError(`invalid WireCard: ${JSON.stringify(wire)}`);
  }
  return r * 4 + s;
}

export function isWireCard(value: unknown): value is WireCard {
  return (
    typeof value === 'string' &&
    value.length === 2 &&
    RANK_INDEX[value[0]!] !== undefined &&
    SUIT_INDEX[value[1]!] !== undefined
  );
}

/** A full, ordered 52-card int deck [0..51]. The only place cards are created. */
export function freshIntDeck(): IntCard[] {
  return Array.from({ length: 52 }, (_, i) => i);
}
