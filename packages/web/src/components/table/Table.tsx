import type { ActionType, HandResult, PrivateHole, TableSnapshot, WireCard } from '@akpoker/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { seatPosition } from '../../lib/geometry/seatLayout.js';
import { Card } from './Card.js';
import { Seat } from './Seat.js';

const ACTION_KEY: Record<ActionType, string> = {
  fold: 'table.actFold',
  check: 'table.actCheck',
  call: 'table.actCall',
  bet: 'table.actBet',
  raise: 'table.actRaise',
  allin: 'table.actAllin',
};

interface Props {
  snapshot: TableSnapshot;
  hole: PrivateHole | null;
  result: HandResult | null;
  onSit: (seatNo: number) => void;
}

export function Table({ snapshot, hole, result, onSit }: Props) {
  const { t } = useTranslation();
  const heroSeatNo = snapshot.viewerSeatNo;
  const heroHole: [WireCard, WireCard] | null =
    hole && hole.handId === snapshot.handId ? hole.cards : null;
  const winners = new Set(result?.winners.map((w) => w.seatNo));
  const revealedBySeat = new Map(result?.revealed.map((r) => [r.seatNo, r.cards]) ?? []);

  // Transient per-action floating label (bet/call/raise/fold/check), keyed by seq.
  const [bubble, setBubble] = useState<{ seatNo: number; text: string; seq: number } | null>(null);
  const la = snapshot.lastAction;
  useEffect(() => {
    if (!la) return;
    const amt = la.type === 'fold' || la.type === 'check' ? '' : ` ${la.amount}`;
    setBubble({ seatNo: la.seatNo, text: t(ACTION_KEY[la.type]) + amt, seq: la.seq });
    const id = setTimeout(() => setBubble((b) => (b?.seq === la.seq ? null : b)), 2500);
    return () => clearTimeout(id);
  }, [la?.seq, la, t]);

  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-5xl sm:aspect-[16/9]">
      {/* Wooden rail + felt */}
      <div className="rail absolute inset-[2%] rounded-[50%]" />
      <div className="felt absolute inset-[6%] rounded-[50%] ring-2 ring-amber-900/30" />
      {/* Table label */}
      <div className="absolute left-1/2 top-[8%] -translate-x-1/2 text-center text-xs text-emerald-200/50">
        {snapshot.config.name} · {snapshot.config.smallBlind}/{snapshot.config.bigBlind}
      </div>

      {/* Community cards + pot */}
      <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <div className="flex gap-1.5">
          {snapshot.board.map((c, i) => (
            <Card key={i} card={c} size="lg" />
          ))}
          {Array.from({ length: Math.max(0, 5 - snapshot.board.length) }).map((_, i) => (
            <div key={`ph${i}`} className="h-24 w-[4.5rem] rounded-md border border-emerald-200/10" />
          ))}
        </div>
        {snapshot.totalPot > 0 && (
          <div className="rounded-full bg-black/40 px-3 py-1 text-sm font-semibold text-amber-200">
            {t('table.pot')}: {snapshot.totalPot}
          </div>
        )}
      </div>

      {/* Seats */}
      {snapshot.seats.map((seat) => {
        const pos = seatPosition(seat.seatNo, heroSeatNo, snapshot.config.maxSeats);
        return (
          <div
            key={seat.seatNo}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }}
          >
            <Seat
              seat={seat}
              isHero={seat.seatNo === heroSeatNo}
              heroHole={heroHole}
              revealed={revealedBySeat.get(seat.seatNo) ?? null}
              isWinner={winners.has(seat.seatNo)}
              actionLabel={bubble?.seatNo === seat.seatNo ? bubble.text : null}
              onSit={() => onSit(seat.seatNo)}
            />
          </div>
        );
      })}
    </div>
  );
}
