import type { HandResult, TableSnapshot } from '@akpoker/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Centered winner banner, animated in and auto-dismissed after 3 seconds. */
export function WinnerOverlay({ result, snapshot }: { result: HandResult | null; snapshot: TableSnapshot }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!result) return;
    setShow(true);
    const id = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(id);
  }, [result?.handId]);

  const winners = result?.winners ?? [];

  return (
    <AnimatePresence>
      {show && result && winners.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.5, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="rounded-2xl bg-black/75 px-8 py-5 text-center shadow-2xl ring-2 ring-amber-400/70"
          >
            {winners.map((w) => {
              const seat = snapshot.seats.find((s) => s.seatNo === w.seatNo);
              return (
                <div key={`${w.seatNo}-${w.potIndex}`} className="text-2xl font-extrabold text-amber-300 sm:text-3xl">
                  🏆 {seat?.nickname ?? '玩家'} {t('table.wins')} {w.amount}
                </div>
              );
            })}
            {result.revealed.length > 0 && (
              <div className="mt-2 text-sm text-emerald-200">
                {result.revealed.map((r) => r.handDescr).join(' · ')}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
