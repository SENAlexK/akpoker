import type { PublicUser } from '@akpoker/shared';
import { create } from 'zustand';
import { api } from '../lib/api.js';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  setUser: (u: PublicUser | null) => void;
  bootstrap: () => Promise<void>;
  logout: () => Promise<void>;
  refreshWallet: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  bootstrap: async () => {
    try {
      const user = await api.me();
      set({ user, loading: false });
    } catch {
      // Try a silent refresh (access token may have expired).
      try {
        const user = await api.refresh();
        set({ user, loading: false });
      } catch {
        set({ user: null, loading: false });
      }
    }
  },
  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null });
    }
  },
  refreshWallet: async () => {
    try {
      const user = await api.me();
      set({ user });
    } catch {
      /* ignore */
    }
  },
}));
