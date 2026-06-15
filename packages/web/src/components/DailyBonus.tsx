/** Daily bonus prompt: on the first load of the day (while logged in), pop up to claim. */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';

export function DailyBonus() {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const refreshWallet = useAuthStore((s) => s.refreshWallet);
  const [amount, setAmount] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void api
      .dailyStatus()
      .then((s) => {
        if (!cancelled && s.available) {
          setAmount(s.amount);
          setOpen(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const claim = async () => {
    setBusy(true);
    try {
      const r = await api.dailyTopup();
      if (r.granted) toast.success(`${t('common.dailyBonus')} +${r.amount}`);
      await refreshWallet();
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.6, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-emerald-950 p-6 text-center ring-1 ring-amber-400/50"
          >
            <div className="text-5xl">🎁</div>
            <h3 className="mt-2 text-lg font-bold text-amber-300">{t('common.dailyBonus')}</h3>
            <p className="mt-1 text-3xl font-extrabold text-emerald-100">+{amount}</p>
            <button
              onClick={() => void claim()}
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-amber-500 py-2.5 font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {t('common.claim')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
