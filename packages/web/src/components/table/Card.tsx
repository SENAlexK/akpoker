import type { WireCard } from '@akpoker/shared';
import { cardFace } from '../../lib/cards.js';

interface Props {
  card: WireCard | null; // null => face down
  size?: 'sm' | 'md' | 'lg';
  highlight?: boolean;
}

const SIZES = {
  sm: 'h-9 w-7 text-xs',
  md: 'h-12 w-9 text-sm',
  lg: 'h-16 w-12 text-lg',
} as const;

export function Card({ card, size = 'md', highlight }: Props) {
  const cls = SIZES[size];
  if (!card) {
    return (
      <div
        className={`${cls} flex items-center justify-center rounded-md bg-gradient-to-br from-rose-800 to-rose-950 ring-1 ring-rose-300/30`}
      >
        <div className="h-2/3 w-2/3 rounded-sm border border-rose-300/30" />
      </div>
    );
  }
  const face = cardFace(card);
  return (
    <div
      className={`${cls} relative flex flex-col items-center justify-center rounded-md bg-white font-bold shadow ${
        highlight ? 'ring-2 ring-amber-400' : 'ring-1 ring-black/10'
      } ${face.red ? 'text-rose-600' : 'text-zinc-900'}`}
    >
      <span className="leading-none">{face.rank}</span>
      <span className="leading-none">{face.suit}</span>
    </div>
  );
}
