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

  // `amount` drives the slider; `amtStr` is the free-text input (not clamped while
  // typing, so you can delete and retype any value). We clamp only when sending.
  const [amount, setAmount] = useState(min);
  const [amtStr, setAmtStr] = useState(String(min));

  useEffect(() => {
    setAmount(min);
    setAmtStr(String(min));
  }, [min, snapshot.version]);

  if (!la) {
    return (
      <div className="flex h-16 items-center justify-center text-sm text-emerald-300/70">{t('table.waiting')}</div>
    );
  }

  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const setBoth = (n: number) => {
    const c = clamp(n);
    setAmount(c);
    setAmtStr(String(c));
  };

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

  const quick = (frac: number) => setBoth(Math.round(snapshot.currentBet + snapshot.totalPot * frac) || min);
  const sendAmount = clamp(Number.isFinite(amount) ? amount : min);

  return (
    <div className="flex flex-col gap-2 bg-emerald-950/90 p-3" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0.75rem)' }}>
      {raiseMode && max > min && (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            value={amount}
            onChange={(e) => setBoth(+e.target.value)}
            className="flex-1 accent-emerald-400"
          />
          {/* Free-text custom amount: type freely; clamped to [min,max] on blur/send. */}
          <input
            type="text"
            inputMode="numeric"
            value={amtStr}
            title={t('table.customAmount')}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, '');
              setAmtStr(digits);
              if (digits !== '') setAmount(Number(digits));
            }}
            onBlur={() => setBoth(Number(amtStr) || min)}
            className="w-20 rounded bg-emerald-900/60 px-2 py-1 text-right font-mono text-amber-300 outline-none ring-1 ring-emerald-700/40"
          />
          <div className="hidden gap-1 sm:flex">
            <QuickBtn onClick={() => quick(0.5)} label="½" />
            <QuickBtn onClick={() => quick(1)} label="1x" />
            <QuickBtn onClick={() => setBoth(max)} label="Max" />
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
          <Btn onClick={() => send(raiseMode, sendAmount)} cls="bg-emerald-600 hover:bg-emerald-500">
            {raiseMode === 'bet' ? t('table.bet') : t('table.raise')} {sendAmount}
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
