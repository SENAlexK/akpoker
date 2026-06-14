import type { LeaderboardEntry } from '@akpoker/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';

/** In-room weekly leaderboard, docked left on desktop / drawer on mobile. Refetches when refreshKey changes. */
export function LeaderboardPanel({ refreshKey }: { refreshKey: string }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void api
      .leaderboard()
      .then((r) => setEntries(r.entries))
      .catch(() => {});
  }, [refreshKey]);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="absolute bottom-2 left-2 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-amber-700/80 text-lg shadow-lg ring-1 ring-amber-400/40 backdrop-blur sm:hidden"
        aria-label={t('lobby.leaderboard')}
      >
        🏆
      </button>

      <div
        className={[
          'z-40 flex-col rounded-xl bg-black/45 ring-1 ring-amber-700/30 backdrop-blur-sm',
          'sm:absolute sm:left-2 sm:top-2 sm:flex sm:max-h-[70%] sm:w-56',
          open ? 'fixed inset-y-0 left-0 flex w-4/5 max-w-xs' : 'hidden',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-amber-700/30 px-3 py-2 text-sm text-amber-200">
          <span>🏆 {t('lobby.leaderboard')}</span>
          <button onClick={() => setOpen(false)} className="text-amber-300/70 sm:hidden">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2 text-sm">
          {entries.length === 0 ? (
            <p className="px-1 text-xs text-emerald-300/50">—</p>
          ) : (
            entries.map((e) => (
              <div key={e.userId} className="flex items-center gap-2 px-1">
                <span className="w-5 text-center font-bold text-amber-300">{e.rank}</span>
                <img src={e.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                <span className="flex-1 truncate text-emerald-100">{e.nickname}</span>
                <span className={`font-mono text-xs ${e.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {e.net >= 0 ? '+' : ''}
                  {e.net}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
