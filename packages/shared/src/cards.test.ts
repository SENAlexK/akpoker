import { describe, expect, it } from 'vitest';
import {
  cardToWire,
  freshIntDeck,
  isWireCard,
  RANKS,
  SUITS,
  wireToCard,
  type WireCard,
} from './cards.js';

describe('card wire <-> int conversion', () => {
  it('round-trips every card in the deck (int -> wire -> int)', () => {
    for (let c = 0; c < 52; c++) {
      const wire = cardToWire(c);
      expect(wireToCard(wire)).toBe(c);
    }
  });

  it('round-trips every wire card (wire -> int -> wire)', () => {
    for (const r of RANKS) {
      for (const s of SUITS) {
        const wire = `${r}${s}` as WireCard;
        expect(cardToWire(wireToCard(wire))).toBe(wire);
      }
    }
  });

  it('produces 52 distinct wire cards', () => {
    const wires = new Set(freshIntDeck().map(cardToWire));
    expect(wires.size).toBe(52);
  });

  it('maps the documented anchors correctly', () => {
    // rank 0='2', suit 0='c'  -> int 0
    expect(cardToWire(0)).toBe('2c');
    // 'As' = rank 12, suit 3 -> 12*4 + 3 = 51
    expect(wireToCard('As')).toBe(51);
    expect(cardToWire(51)).toBe('As');
    // 'Ah' = rank 12, suit 2 -> 50
    expect(wireToCard('Ah')).toBe(50);
  });

  it('rejects invalid input', () => {
    expect(() => cardToWire(-1)).toThrow();
    expect(() => cardToWire(52)).toThrow();
    expect(() => wireToCard('Zz')).toThrow();
    expect(() => wireToCard('A')).toThrow();
    expect(() => wireToCard('Ahh')).toThrow();
  });

  it('isWireCard guards correctly', () => {
    expect(isWireCard('Ah')).toBe(true);
    expect(isWireCard('Tc')).toBe(true);
    expect(isWireCard('1x')).toBe(false);
    expect(isWireCard(42)).toBe(false);
    expect(isWireCard('Ahh')).toBe(false);
  });
});
