import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../lib/api.js';
import i18n from '../../i18n/index.js';
import { useAuthStore } from '../../store/authStore.js';

export function TopBar({ left }: { left?: React.ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshWallet = useAuthStore((s) => s.refreshWallet);

  const topup = async () => {
    try {
      const r = await api.dailyTopup();
      if (r.granted) toast.success(`${t('common.dailyBonus')} +${r.amount}`);
      else toast.message(t('common.alreadyClaimed'));
      await refreshWallet();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'error');
    }
  };

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    localStorage.setItem('lang', next);
    void i18n.changeLanguage(next);
  };

  return (
    <header className="flex items-center justify-between gap-1 whitespace-nowrap bg-emerald-950/80 px-2 py-1.5 text-xs sm:gap-3 sm:px-3 sm:py-2 sm:text-sm">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">{left}</div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {user && (
          <>
            <img src={user.avatarUrl} alt="" className="hidden h-7 w-7 rounded-full ring-1 ring-emerald-600 sm:block" />
            <span className="hidden text-emerald-100 sm:inline">{user.nickname}</span>
            <span className="rounded-md bg-emerald-800/60 px-1.5 py-0.5 font-mono text-emerald-200 sm:px-2 sm:py-1">
              <span className="hidden sm:inline">{t('common.wallet')}: </span>💰{user.walletPoints}
            </span>
            <button onClick={topup} className="text-emerald-300 hover:text-emerald-100" title={t('common.dailyTopup')}>
              ＋
            </button>
          </>
        )}
        <button onClick={toggleLang} className="rounded px-1 py-1 text-emerald-300 hover:text-emerald-100 sm:px-2">
          {i18n.language === 'zh' ? 'EN' : '中'}
        </button>
        {user && (
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="rounded px-1 py-1 text-emerald-300 hover:text-emerald-100 sm:px-2"
          >
            {t('common.logout')}
          </button>
        )}
      </div>
    </header>
  );
}
