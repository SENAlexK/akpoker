/** Minimal declarations for pokersolver — used ONLY as an independent test oracle. */
declare module 'pokersolver' {
  export class Hand {
    name: string;
    descr: string;
    rank: number;
    cards: unknown[];
    static solve(cards: string[]): Hand;
    static winners(hands: Hand[]): Hand[];
  }
}
