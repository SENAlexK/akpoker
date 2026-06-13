import type { HandResult, PrivateHole, TableSnapshot, WireCard } from '@akpoker/shared';
import { useTranslation } from 'react-i18next';
import { seatPosition } from '../../lib/geometry/seatLayout.js';
import { Card } from './Card.js';
import { Seat } from './Seat.js';

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

  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-4xl sm:aspect-[16/9]">
      {/* Felt */}
      <div className="felt absolute inset-[6%] rounded-[50%] ring-4 ring-emerald-900/60 shadow-2xl" />

      {/* Community cards + pot */}
      <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <div className="flex gap-1">
          {snapshot.board.map((c, i) => (
            <Card key={i} card={c} size="md" />
          ))}
          {Array.from({ length: Math.max(0, 5 - snapshot.board.length) }).map((_, i) => (
            <div key={`ph${i}`} className="h-12 w-9 rounded-md border border-emerald-200/10" />
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
              onSit={() => onSit(seat.seatNo)}
            />
          </div>
        );
      })}
    </div>
  );
}
