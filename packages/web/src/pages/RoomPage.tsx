import type { TableSnapshot } from '@akpoker/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { TopBar } from '../components/layout/TopBar.js';
import { ChatPanel } from '../components/chat/ChatPanel.js';
import { BettingControls } from '../components/table/BettingControls.js';
import { Table } from '../components/table/Table.js';
import { WinnerOverlay } from '../components/table/WinnerOverlay.js';
import { VoiceControls } from '../components/voice/VoiceControls.js';
import { bindAndConnect } from '../lib/socket/bind.js';
import { emitAck } from '../lib/socket/socketService.js';
import { useVoiceMesh } from '../voice/useVoiceMesh.js';
import { useAuthStore } from '../store/authStore.js';
import { useTableStore } from '../store/tableStore.js';

export function RoomPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tableId } = useParams();
  const snapshot = useTableStore((s) => s.snapshot);
  const hole = useTableStore((s) => s.hole);
  const result = useTableStore((s) => s.result);
  const connected = useTableStore((s) => s.connected);
  const refreshWallet = useAuthStore((s) => s.refreshWallet);
  const selfUserId = useAuthStore((s) => s.user?.id);
  const [sitSeat, setSitSeat] = useState<number | null>(null);
  const voice = useVoiceMesh(tableId, selfUserId);

  useEffect(() => {
    if (!tableId) return;
    const s = bindAndConnect();
    const join = () =>
      void emitAck<TableSnapshot>('table:join', { tableId })
        .then((snap) => useTableStore.getState().setSnapshot(snap)) // seed from the ack
        .catch(() => toast.error('join failed'));
    if (s.connected) join();
    else s.once('connect', join);
    return () => {
      void emitAck('table:leave', { tableId }).catch(() => {});
      useTableStore.getState().reset();
    };
  }, [tableId]);

  // Refresh wallet after each hand result (chips settled to escrow; wallet on cash-out).
  useEffect(() => {
    if (result) void refreshWallet();
  }, [result, refreshWallet]);

  const invite = () => {
    const url = `${location.origin}/join/${snapshot?.tableId ?? tableId}`;
    void navigator.clipboard?.writeText(url);
    toast.success(t('table.copied'));
  };

  const stand = async () => {
    if (!tableId) return;
    await emitAck('seat:stand', { tableId }).catch(() => {});
    await refreshWallet();
  };

  const leave = async () => {
    if (tableId) await emitAck('table:leave', { tableId }).catch(() => {});
    navigate('/');
  };

  if (!snapshot) {
    return (
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center text-emerald-300/70">{t('common.loading')}</div>
      </div>
    );
  }

  const seated = snapshot.viewerSeatNo !== null;
  const mySeat = snapshot.viewerSeatNo !== null ? snapshot.seats[snapshot.viewerSeatNo] : null;
  const readyCount = snapshot.seats.filter((s) => s.userId && s.ready).length;

  return (
    <div className="flex h-full flex-col">
      <TopBar
        left={
          <div className="flex items-center gap-2">
            <button onClick={leave} className="text-emerald-300 hover:text-emerald-100">
              ← {t('common.back')}
            </button>
            <button onClick={invite} className="rounded bg-emerald-800 px-2 py-1 text-xs text-emerald-100">
              {t('table.invite')}
            </button>
            {seated && (
              <>
                <button onClick={stand} className="rounded bg-rose-800 px-2 py-1 text-xs text-rose-100">
                  {t('table.stand')}
                </button>
                <VoiceControls onEnable={() => void voice.enable()} onToggleMute={voice.toggleMute} />
              </>
            )}
          </div>
        }
      />

      {!connected && (
        <div className="bg-amber-700/80 py-1 text-center text-sm text-amber-50">{t('table.reconnecting')}</div>
      )}

      <main className="relative flex flex-1 flex-col justify-between overflow-hidden p-2">
        <WinnerOverlay result={result} snapshot={snapshot} />
        <ChatPanel tableId={tableId!} />
        <Table snapshot={snapshot} hole={hole} result={result} onSit={(seatNo) => setSitSeat(seatNo)} />

        {result && (
          <div className="mx-auto my-1 rounded-lg bg-emerald-950/80 px-4 py-2 text-center text-sm text-emerald-100">
            {result.winners.map((w) => {
              const seat = snapshot.seats.find((s) => s.seatNo === w.seatNo);
              return (
                <span key={`${w.seatNo}-${w.potIndex}`} className="mr-3">
                  {seat?.nickname} {t('table.wins')} {w.amount}
                </span>
              );
            })}
          </div>
        )}
      </main>

      {seated ? (
        snapshot.phase === 'in_hand' && mySeat?.inHand ? (
          <BettingControls snapshot={snapshot} />
        ) : (
          <ReadyBar tableId={tableId!} ready={mySeat?.ready ?? false} readyCount={readyCount} />
        )
      ) : (
        <div className="p-3 text-center text-sm text-emerald-300/70">{t('table.spectating')}</div>
      )}

      {sitSeat !== null && (
        <SitModal
          seatNo={sitSeat}
          tableId={tableId!}
          minBuyIn={snapshot.config.minBuyIn}
          maxBuyIn={snapshot.config.maxBuyIn}
          onClose={() => setSitSeat(null)}
        />
      )}
    </div>
  );
}

function ReadyBar({ tableId, ready, readyCount }: { tableId: string; ready: boolean; readyCount: number }) {
  const { t } = useTranslation();
  const toggle = () => void emitAck('seat:ready', { tableId, ready: !ready }).catch(() => {});
  return (
    <div
      className="flex items-center justify-center gap-3 bg-emerald-950/90 p-3"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0.75rem)' }}
    >
      <span className="text-sm text-emerald-300/80">
        {t('table.waitingReady')}（{readyCount}）
      </span>
      <button
        onClick={toggle}
        className={`rounded-lg px-5 py-2.5 font-semibold ${
          ready ? 'bg-zinc-600 text-zinc-100' : 'bg-emerald-500 text-emerald-950'
        }`}
      >
        {ready ? t('table.cancelReady') : t('table.clickReady')}
      </button>
    </div>
  );
}

function SitModal({
  seatNo,
  tableId,
  minBuyIn,
  maxBuyIn,
  onClose,
}: {
  seatNo: number;
  tableId: string;
  minBuyIn: number;
  maxBuyIn: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const wallet = useAuthStore((s) => s.user?.walletPoints ?? 0);
  const refreshWallet = useAuthStore((s) => s.refreshWallet);
  const cap = Math.min(maxBuyIn, wallet);
  const [amount, setAmount] = useState(Math.min(cap, Math.max(minBuyIn, maxBuyIn)));

  const sit = async () => {
    try {
      await emitAck('seat:sit', { tableId, seatNo, buyIn: amount });
      await refreshWallet();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-emerald-950 p-5 ring-1 ring-emerald-800" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold text-emerald-100">
          {t('table.sit')} · #{seatNo + 1}
        </h3>
        <p className="mb-2 text-xs text-emerald-300/70">
          {t('table.buyInAmount')}: {minBuyIn}–{maxBuyIn} · {t('common.wallet')} {wallet}
        </p>
        <input
          type="range"
          min={minBuyIn}
          max={cap}
          value={amount}
          onChange={(e) => setAmount(+e.target.value)}
          className="w-full accent-emerald-400"
        />
        <div className="mb-4 text-center font-mono text-amber-300">{amount}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-emerald-300">
            {t('common.cancel')}
          </button>
          <button
            onClick={sit}
            disabled={wallet < minBuyIn}
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 disabled:opacity-50"
          >
            {t('table.buyIn')}
          </button>
        </div>
      </div>
    </div>
  );
}
