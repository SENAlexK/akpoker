import type { TableSnapshot } from '@akpoker/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getSocket } from '../../lib/socket/socketService.js';

let actionCounter = 0;

export function BettingControls({ snapshot }: { snapshot: TableSnapshot }) {
  const { t } = useTranslation();
  const la = snapshot.viewerLegalAction;
  const raiseMode = la?.canBet ? 'bet' : la?.canRaise ? 'raise' : null;
  const min = la ? (la.canBet ? la.minBet : la.minRaise) : 0;
  const max = la ? (la.canBet ? la.maxBet : la.maxRaise) : 0;
  const [amount, setAmount] = useState(min);

  useEffect(() => {
    setAmount(min);
  }, [min, snapshot.version]);

  if (!la) {
    return (
      <div className="flex h-16 items-center justify-center text-sm text-emerald-300/70">{t('table.waiting')}</div>
    );
  }

  const send = (type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amt?: number) => {
    getSocket().emit(
      'table:action',
      {
        tableId: snapshot.tableId,
        handId: snapshot.handId!,
        clientActionId: `a${snapshot.version}-${actionCounter++}`,
        expectedVersion: snapshot.version,
        type,
        ...(amt != null ? { amount: amt } : {}),
      },
      (res) => {
        if (!res.ok) toast.error(res.error);
      },
    );
  };

  const quick = (frac: number) => {
    const target = Math.round(snapshot.currentBet + snapshot.totalPot * frac) || min;
    setAmount(Math.max(min, Math.min(max, target)));
  };

  return (
    <div className="flex flex-col gap-2 bg-emerald-950/90 p-3" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0.75rem)' }}>
      {raiseMode && max > min && (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            value={amount}
            onChange={(e) => setAmount(+e.target.value)}
            className="flex-1 accent-emerald-400"
          />
          <span className="w-16 text-right font-mono text-amber-300">{amount}</span>
          <div className="hidden gap-1 sm:flex">
            <QuickBtn onClick={() => quick(0.5)} label="½" />
            <QuickBtn onClick={() => quick(1)} label="1x" />
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {la.canFold && (
          <Btn onClick={() => send('fold')} cls="bg-rose-700 hover:bg-rose-600">
            {t('table.fold')}
          </Btn>
        )}
        {la.canCheck && (
          <Btn onClick={() => send('check')} cls="bg-sky-700 hover:bg-sky-600">
            {t('table.check')}
          </Btn>
        )}
        {la.canCall && (
          <Btn onClick={() => send('call')} cls="bg-sky-700 hover:bg-sky-600">
            {t('table.call')} {la.callAmount}
          </Btn>
        )}
        {raiseMode && (
          <Btn onClick={() => send(raiseMode, amount)} cls="bg-emerald-600 hover:bg-emerald-500">
            {raiseMode === 'bet' ? t('table.bet') : t('table.raise')} {amount}
          </Btn>
        )}
        <Btn onClick={() => send('allin')} cls="bg-amber-600 hover:bg-amber-500">
          {t('table.allin')}
        </Btn>
      </div>
    </div>
  );
}

function Btn({ onClick, cls, children }: { onClick: () => void; cls: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-lg py-3 font-semibold text-white ${cls}`}>
      {children}
    </button>
  );
}
function QuickBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="rounded bg-emerald-800 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-700">
      {label}
    </button>
  );
}
