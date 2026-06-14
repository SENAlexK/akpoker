import type { RoomListItem } from '@akpoker/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { TopBar } from '../components/layout/TopBar.js';
import { bindAndConnect } from '../lib/socket/bind.js';
import { emitAck, getSocket } from '../lib/socket/socketService.js';

export function LobbyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code } = useParams();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    const s = bindAndConnect();
    const refresh = () => void emitAck<RoomListItem[]>('room:list').then(setRooms).catch(() => {});
    s.on('lobby:rooms', setRooms);
    if (s.connected) refresh();
    else s.once('connect', refresh);
    return () => {
      s.off('lobby:rooms', setRooms);
    };
  }, []);

  // Auto-resolve an invite link (/join/:code).
  useEffect(() => {
    if (!code) return;
    const go = async () => {
      try {
        const data = await emitAck<{ tableId: string }>('room:resolveInvite', { code });
        navigate(`/table/${data.tableId}`, { replace: true });
      } catch {
        toast.error('invite not found');
        navigate('/', { replace: true });
      }
    };
    if (getSocket().connected) void go();
    else getSocket().once('connect', () => void go());
  }, [code, navigate]);

  const joinByCode = async () => {
    try {
      const data = await emitAck<{ tableId: string }>('room:resolveInvite', { code: joinCode.trim().toUpperCase() });
      navigate(`/table/${data.tableId}`);
    } catch {
      toast.error('not found');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-emerald-100">{t('lobby.title')}</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-emerald-950 hover:bg-emerald-400"
          >
            {t('lobby.createRoom')}
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder={t('lobby.inviteCode')}
            className="flex-1 rounded-lg bg-emerald-900/50 px-3 py-2 text-emerald-50 outline-none ring-1 ring-emerald-700/40"
          />
          <button onClick={joinByCode} className="rounded-lg bg-emerald-700 px-3 py-2 text-emerald-50 hover:bg-emerald-600">
            {t('lobby.joinByCode')}
          </button>
        </div>

        {rooms.length === 0 ? (
          <p className="mt-10 text-center text-emerald-400/60">{t('lobby.noRooms')}</p>
        ) : (
          <ul className="space-y-2">
            {rooms.map((r) => (
              <li
                key={r.tableId}
                className="flex items-center justify-between rounded-lg bg-emerald-950/50 p-3 ring-1 ring-emerald-800/40"
              >
                <div>
                  <div className="font-semibold text-emerald-100">{r.name}</div>
                  <div className="text-xs text-emerald-300/70">
                    {t('lobby.blinds')} {r.smallBlind}/{r.bigBlind} · {r.occupiedSeats}/{r.maxSeats} {t('lobby.seats')}
                    {r.inHand ? ' · ▶' : ''}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/table/${r.tableId}`)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-emerald-50 hover:bg-emerald-500"
                >
                  {t('lobby.join')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('我的牌局');
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [maxSeats, setMaxSeats] = useState(6);
  const [minBuyIn, setMinBuyIn] = useState(400);
  const [maxBuyIn, setMaxBuyIn] = useState(5000);
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const data = await emitAck<{ tableId: string; inviteCode: string }>('room:create', {
        name,
        maxSeats,
        smallBlind: sb,
        bigBlind: bb,
        minBuyIn,
        maxBuyIn,
        isPrivate,
      });
      navigate(`/table/${data.tableId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'error');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-emerald-950 p-5 ring-1 ring-emerald-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-emerald-100">{t('lobby.createRoom')}</h3>
        <Field label={t('lobby.roomName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('lobby.smallBlind')}>
            <input type="number" value={sb} onChange={(e) => setSb(+e.target.value)} className={inputCls} />
          </Field>
          <Field label={t('lobby.bigBlind')}>
            <input type="number" value={bb} onChange={(e) => setBb(+e.target.value)} className={inputCls} />
          </Field>
          <Field label={t('lobby.maxSeats')}>
            <input type="number" min={2} max={9} value={maxSeats} onChange={(e) => setMaxSeats(+e.target.value)} className={inputCls} />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm text-emerald-200">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            {t('lobby.private')}
          </label>
          <Field label={t('lobby.minBuyIn')}>
            <input type="number" min={bb} value={minBuyIn} onChange={(e) => setMinBuyIn(+e.target.value)} className={inputCls} />
          </Field>
          <Field label={t('lobby.maxBuyIn')}>
            <input type="number" min={minBuyIn} value={maxBuyIn} onChange={(e) => setMaxBuyIn(+e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-emerald-300">
            {t('common.cancel')}
          </button>
          <button onClick={create} disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 disabled:opacity-50">
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg bg-emerald-900/50 px-3 py-2 text-emerald-50 outline-none ring-1 ring-emerald-700/40';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs text-emerald-300/80">{label}</span>
      {children}
    </label>
  );
}
