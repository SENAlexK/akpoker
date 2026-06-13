import { create } from 'zustand';

interface VoiceState {
  enabled: boolean;
  muted: boolean;
  /** userId -> connected */
  peers: Record<string, boolean>;
  /** userIds currently speaking */
  speaking: Record<string, boolean>;
  setEnabled: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setPeer: (userId: string, connected: boolean) => void;
  removePeer: (userId: string) => void;
  setSpeaking: (userId: string, v: boolean) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  enabled: false,
  muted: false,
  peers: {},
  speaking: {},
  setEnabled: (enabled) => set({ enabled }),
  setMuted: (muted) => set({ muted }),
  setPeer: (userId, connected) => set((s) => ({ peers: { ...s.peers, [userId]: connected } })),
  removePeer: (userId) =>
    set((s) => {
      const peers = { ...s.peers };
      const speaking = { ...s.speaking };
      delete peers[userId];
      delete speaking[userId];
      return { peers, speaking };
    }),
  setSpeaking: (userId, v) => set((s) => ({ speaking: { ...s.speaking, [userId]: v } })),
  reset: () => set({ enabled: false, muted: false, peers: {}, speaking: {} }),
}));
