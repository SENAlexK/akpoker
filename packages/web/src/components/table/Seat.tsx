import type { PublicSeat, WireCard } from '@akpoker/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Card } from './Card.js';

interface Props {
  seat: PublicSeat;
  isHero: boolean;
  heroHole: [WireCard, WireCard] | null;
  revealed: WireCard[] | null;
  isWinner: boolean;
  actionLabel?: string | null;
  onSit?: () => void;
}

export function Seat({ seat, isHero, heroHole, revealed, isWinner, actionLabel, onSit }: Props) {
  const { t } = useTranslation();

  if (!seat.userId) {
    return (
      <button
        onClick={onSit}
        className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-dashed border-emerald-400/40 text-xs text-emerald-300/70 hover:border-emerald-300 hover:text-emerald-100 sm:h-20 sm:w-20"
      >
        {t('table.sit')}
      </button>
    );
  }

  const dimmed = seat.handStatus === 'folded' || seat.seatStatus === 'sitting_out';
  const cards: (WireCard | null)[] | null = isHero
    ? heroHole ?? (seat.hasCards ? [null, null] : null)
    : revealed && revealed.length === 2
      ? revealed
      : seat.hasCards
        ? [null, null]
        : null;

  return (
    <div className={`relative flex flex-col items-center gap-1 ${dimmed ? 'opacity-50' : ''}`}>
      <AnimatePresence>
        {actionLabel && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.8 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            exit={{ opacity: 0, y: -14 }}
            className="absolute -top-6 z-20 whitespace-nowrap rounded-full bg-black/80 px-2.5 py-0.5 text-xs font-bold text-amber-300 shadow ring-1 ring-amber-400/40"
          >
            {actionLabel}
          </motion.div>
        )}
      </AnimatePresence>
      {cards && (
        <div className="flex gap-0.5">
          {cards.map((c, i) => (
            <Card key={i} card={c} size={isHero ? 'md' : 'sm'} />
          ))}
        </div>
      )}
      {!seat.inHand && (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            seat.ready ? 'bg-emerald-500 text-emerald-950' : 'bg-zinc-600 text-zinc-200'
          }`}
        >
          {seat.ready ? t('table.ready') : t('table.notReady')}
        </span>
      )}
      <div
        className={`relative flex w-24 flex-col items-center rounded-lg bg-emerald-950/85 px-2 py-1 ring-1 ${
          seat.isTurn ? 'ring-2 ring-amber-400' : isWinner ? 'ring-2 ring-emerald-300' : 'ring-emerald-700/50'
        }`}
      >
        <div className="flex items-center gap-1">
          <img src={seat.avatarUrl ?? ''} alt="" className="h-5 w-5 rounded-full" />
          <span className="max-w-[60px] truncate text-xs text-emerald-100">{seat.nickname}</span>
        </div>
        <span className="font-mono text-sm font-bold text-amber-300">{seat.stack}</span>
        <div className="absolute -top-2 -right-2 flex gap-0.5">
          {seat.isButton && <Badge text="D" cls="bg-white text-zinc-900" />}
          {seat.isSmallBlind && <Badge text="S" cls="bg-sky-400 text-zinc-900" />}
          {seat.isBigBlind && <Badge text="B" cls="bg-amber-400 text-zinc-900" />}
        </div>
      </div>
      {seat.committed > 0 && (
        <span className="rounded-full bg-black/40 px-2 text-xs font-semibold text-amber-200">{seat.committed}</span>
      )}
    </div>
  );
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${cls}`}>{text}</span>;
}
