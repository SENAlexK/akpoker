import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = mode === 'login' ? await api.login(email, password) : await api.register(email, password, nickname);
      setUser(u);
      navigate('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-emerald-950/60 p-6 shadow-xl ring-1 ring-emerald-800/40"
      >
        <h1 className="mb-1 text-2xl font-bold text-emerald-100">{t('common.appName')}</h1>
        <p className="mb-6 text-sm text-emerald-300/70">{t('auth.welcome')}</p>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-emerald-300/80">{t('auth.email')}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-emerald-900/50 px-3 py-2 text-emerald-50 outline-none ring-1 ring-emerald-700/40 focus:ring-emerald-400"
          />
        </label>

        {mode === 'register' && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-emerald-300/80">{t('auth.nickname')}</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={24}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full rounded-lg bg-emerald-900/50 px-3 py-2 text-emerald-50 outline-none ring-1 ring-emerald-700/40 focus:ring-emerald-400"
            />
          </label>
        )}

        <label className="mb-5 block">
          <span className="mb-1 block text-xs text-emerald-300/80">{t('auth.password')}</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-emerald-900/50 px-3 py-2 text-emerald-50 outline-none ring-1 ring-emerald-700/40 focus:ring-emerald-400"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {mode === 'login' ? t('auth.login') : t('auth.register')}
        </button>

        <button
          type="button"
          onClick={() => navigate(mode === 'login' ? '/register' : '/login')}
          className="mt-4 w-full text-center text-sm text-emerald-300/70 hover:text-emerald-200"
        >
          {mode === 'login' ? t('auth.needAccount') : t('auth.haveAccount')}
        </button>
      </form>
    </div>
  );
}
