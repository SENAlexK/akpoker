import type { LeaderboardEntry, RoomListItem } from '@akpoker/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { TopBar } from '../components/layout/TopBar.js';
import { api } from '../lib/api.js';
import { bindAndConnect } from '../lib/socket/bind.js';
import { emitAck, getSocket } from '../lib/socket/socketService.js';
import { useAuthStore } from '../store/authStore.js';

export function LobbyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code } = useParams();
  const me = useAuthStore((s) => s.user);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    void api.leaderboard().then((r) => setBoard(r.entries)).catch(() => {});
  }, []);

  const deleteRoom = async (tableId: string) => {
    try {
      await emitAck('room:delete', { tableId });
      toast.success(t('lobby.deleted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'error');
    }
  };

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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/table/${r.tableId}`)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-emerald-50 hover:bg-emerald-500"
                  >
                    {t('lobby.join')}
                  </button>
                  {me && (me.id === r.ownerId || me.role === 'admin') && (
                    <button
                      onClick={() => void deleteRoom(r.tableId)}
                      title={t('lobby.delete')}
                      className="rounded-lg bg-rose-800 px-2 py-1.5 text-rose-100 hover:bg-rose-700"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {board.length > 0 && (
          <section className="mt-8">
            <h3 className="mb-2 text-lg font-bold text-amber-300">🏆 {t('lobby.leaderboard')}</h3>
            <p className="mb-2 text-xs text-emerald-300/60">{t('lobby.weeklyNet')}</p>
            <ul className="space-y-1">
              {board.map((e) => (
                <li
                  key={e.userId}
                  className="flex items-center gap-3 rounded-lg bg-emerald-950/50 px-3 py-2 ring-1 ring-emerald-800/40"
                >
                  <span className="w-6 text-center font-bold text-amber-300">{e.rank}</span>
                  <img src={e.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                  <span className="flex-1 truncate text-emerald-100">{e.nickname}</span>
                  <span className={`font-mono ${e.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {e.net >= 0 ? '+' : ''}
                    {e.net}
                  </span>
                </li>
              ))}
            </ul>
          </section>
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
            <NumInput value={sb} onChange={setSb} min={1} />
          </Field>
          <Field label={t('lobby.bigBlind')}>
            <NumInput value={bb} onChange={setBb} min={1} />
          </Field>
          <Field label={t('lobby.maxSeats')}>
            <NumInput value={maxSeats} onChange={setMaxSeats} min={2} max={9} />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm text-emerald-200">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            {t('lobby.private')}
          </label>
          <Field label={t('lobby.minBuyIn')}>
            <NumInput value={minBuyIn} onChange={setMinBuyIn} min={bb} />
          </Field>
          <Field label={t('lobby.maxBuyIn')}>
            <NumInput value={maxBuyIn} onChange={setMaxBuyIn} min={minBuyIn} />
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

/** Free-text numeric input: type/delete freely; clamps to [min,max] on blur. */
function NumInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const [s, setS] = useState(String(value));
  useEffect(() => {
    setS(String(value));
  }, [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={s}
      onChange={(e) => {
        const d = e.target.value.replace(/[^0-9]/g, '');
        setS(d);
        if (d !== '') onChange(Number(d));
      }}
      onBlur={() => {
        let n = Number(s) || min || 0;
        if (min != null) n = Math.max(min, n);
        if (max != null) n = Math.min(max, n);
        onChange(n);
        setS(String(n));
      }}
      className={inputCls}
    />
  );
}
