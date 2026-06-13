/**
 * Engine output events (int cards). The real-time layer converts to wire cards
 * and applies per-seat redaction (deal-hole/reveal go only to the owner until
 * showdown). The engine emits the full event; redaction is the layer's job.
 */
import type { IntCard } from '@akpoker/shared';
import type { ActionType, Pot, Street } from './types.js';

export type EngineEvent =
  | { t: 'hand-started'; handId: string; buttonSeatNo: number; deckCommit: string }
  | { t: 'ante'; userId: string; seatNo: number; amount: number; allin: boolean }
  | { t: 'blind'; userId: string; seatNo: number; kind: 'sb' | 'bb'; amount: number; allin: boolean }
  | { t: 'deal-hole'; userId: string; seatNo: number; cards: [IntCard, IntCard] }
  | { t: 'burn'; card: IntCard }
  | { t: 'board'; street: 'flop' | 'turn' | 'river'; cards: IntCard[] }
  | {
      t: 'action';
      userId: string;
      seatNo: number;
      type: ActionType;
      amount: number; // total street "to" after the action (0 for fold/check)
      allin: boolean;
    }
  | { t: 'street-closed'; street: Street }
  | { t: 'pots'; pots: Pot[] }
  | { t: 'uncalled-returned'; userId: string; seatNo: number; amount: number }
  | {
      t: 'reveal';
      userId: string;
      seatNo: number;
      cards: [IntCard, IntCard];
      category: string;
      descr: string;
      best5: IntCard[];
    }
  | { t: 'award'; userId: string; seatNo: number; amount: number; potIndex: number }
  | { t: 'hand-complete'; finalStacks: Record<string, number> };
