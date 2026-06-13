/** Bind socket events to the table store once, and connect. Idempotent. */
import { useTableStore } from '../../store/tableStore.js';
import { getSocket, type AppSocket } from './socketService.js';

let bound = false;

export function bindAndConnect(): AppSocket {
  const s = getSocket();
  if (!bound) {
    bound = true;
    const store = useTableStore.getState;
    s.on('connect', () => store().setConnected(true));
    s.on('disconnect', () => store().setConnected(false));
    s.on('table:snapshot', (snap) => store().setSnapshot(snap));
    s.on('hand:hole', (h) => store().setHole(h));
    s.on('hand:result', (r) => store().setResult(r));
    s.on('hand:reveal', (r) => store().setReveal(r));
    s.on('chat:message', (m) => store().addMessage(m));
  }
  if (!s.connected) s.connect();
  return s;
}
