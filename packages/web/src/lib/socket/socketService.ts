/** Singleton typed Socket.IO client. Auth rides the httpOnly cookie (same-origin). */
import type { ClientToServerEvents, ServerToClientEvents } from '@akpoker/shared';
import { io, type Socket } from 'socket.io-client';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (socket) return socket;
  socket = io({
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: false,
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
  return socket;
}

export function connectSocket(): AppSocket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

type AckRes<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Promise wrapper around an ack-style emit. Handles both (payload, ack) events and
 * the no-payload `room:list` (ack-only) event.
 */
export function emitAck<T = unknown>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    const ack = (res: AckRes<T>) => (res.ok ? resolve(res.data) : reject(new Error(res.error)));
    // Must call as a method so `this` stays bound to the socket.
    if (payload === undefined) (s as unknown as { emit: (e: string, ...a: unknown[]) => void }).emit(event, ack);
    else (s as unknown as { emit: (e: string, ...a: unknown[]) => void }).emit(event, payload, ack);
  });
}
