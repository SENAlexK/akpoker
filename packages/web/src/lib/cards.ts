/** Display helpers for wire cards ("Ah" -> { rank:'A', suit:'♥', red:true }). */
import type { WireCard } from '@akpoker/shared';

const SUIT_SYMBOL: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };

export interface CardFace {
  rank: string;
  suit: string;
  red: boolean;
}

export function cardFace(card: WireCard): CardFace {
  const r = card[0]!;
  const s = card[1]!;
  return {
    rank: r === 'T' ? '10' : r,
    suit: SUIT_SYMBOL[s] ?? '?',
    red: s === 'd' || s === 'h',
  };
}
