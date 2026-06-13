/** REST client. Cookies (httpOnly auth) ride automatically via credentials:'include'. */
import type { PublicUser } from '@akpoker/shared';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let error = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) error = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(error);
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

export const api = {
  register: (email: string, password: string, nickname: string) =>
    req<PublicUser>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, nickname }) }),
  login: (email: string, password: string) =>
    req<PublicUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  refresh: () => req<PublicUser>('/api/auth/refresh', { method: 'POST' }),
  me: () => req<PublicUser>('/api/me'),
  updateNickname: (nickname: string) =>
    req<PublicUser>('/api/profile', { method: 'PATCH', body: JSON.stringify({ nickname }) }),
  deleteAvatar: () => req<PublicUser>('/api/profile/avatar', { method: 'DELETE' }),
  dailyTopup: () =>
    req<{ granted: boolean; amount: number; newBalance: number; reason?: string }>('/api/wallet/daily-topup', {
      method: 'POST',
    }),
  async uploadAvatar(blob: Blob): Promise<PublicUser> {
    const form = new FormData();
    form.append('file', blob, 'avatar.webp');
    const res = await fetch('/api/profile/avatar', { method: 'POST', credentials: 'include', body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as PublicUser;
  },
};
