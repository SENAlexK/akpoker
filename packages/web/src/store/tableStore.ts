/**
 * Mirror of the server-authoritative table state. The client renders snapshots
 * verbatim; out-of-order snapshots are dropped by version. Private hole cards and
 * the latest hand result are kept alongside.
 */
import type { HandResult, HandReveal, PrivateHole, TableSnapshot } from '@akpoker/shared';
import { create } from 'zustand';

interface TableState {
  snapshot: TableSnapshot | null;
  hole: PrivateHole | null;
  result: HandResult | null;
  reveal: HandReveal | null;
  connected: boolean;
  setSnapshot: (s: TableSnapshot) => void;
  setHole: (h: PrivateHole) => void;
  setResult: (r: HandResult) => void;
  setReveal: (r: HandReveal) => void;
  setConnected: (c: boolean) => void;
  reset: () => void;
}

export const useTableStore = create<TableState>((set, get) => ({
  snapshot: null,
  hole: null,
  result: null,
  reveal: null,
  connected: false,
  setSnapshot: (s) => {
    const cur = get().snapshot;
    if (cur && cur.tableId === s.tableId && s.version < cur.version) return; // drop stale
    // Clear last result when a new hand starts.
    const newHand = s.handId && s.handId !== cur?.handId;
    set({ snapshot: s, ...(newHand ? { result: null, reveal: null } : {}) });
  },
  setHole: (hole) => set({ hole }),
  setResult: (result) => set({ result }),
  setReveal: (reveal) => set({ reveal }),
  setConnected: (connected) => set({ connected }),
  reset: () => set({ snapshot: null, hole: null, result: null, reveal: null }),
}));
