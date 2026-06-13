import type {
  ClientToServerEvents,
  HandResult,
  PrivateHole,
  ServerToClientEvents,
  TableSnapshot,
} from '@akpoker/shared';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DB } from '../src/db/client.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let app: FastifyInstance;
let db: DB;
let port: number;
let reconcileFn: (db: DB) => { ok: boolean };

async function registerAndCookie(email: string, nickname: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'password1234', nickname },
  });
  expect(res.statusCode).toBe(201);
  const at = res.cookies?.find((c) => c.name === 'ak_at');
  return `ak_at=${at!.value}`;
}

function connect(cookie: string): Promise<ClientSocket> {
  const socket: ClientSocket = ioClient(`http://localhost:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie },
  });
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function emitAck<T>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    (socket.emit as (e: string, p: unknown, cb: (r: { ok: boolean; data?: T; error?: string }) => void) => void)(
      event,
      payload,
      (r) => (r.ok ? resolve(r.data as T) : reject(new Error(r.error))),
    );
  });
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'akpoker-table-'));
  process.env.DB_PATH = join(dir, 'test.sqlite');
  process.env.DATA_DIR = dir;
  process.env.AVATAR_DIR = join(dir, 'avatars');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-test-secret-1234';
  process.env.COOKIE_SECRET = 'test-cookie-secret-1234567890';

  const { loadEnv } = await import('../src/config/env.js');
  const { initDb } = await import('../src/db/client.js');
  const { buildApp } = await import('../src/app.js');
  const { attachRealtime } = await import('../src/realtime/io.js');
  const { reconcile } = await import('../src/wallet/reconcile.js');
  reconcileFn = reconcile;
  const env = loadEnv();
  db = initDb(env);
  app = await buildApp(env, db);
  const realtime = attachRealtime(app, env, db);
  app.addHook('preClose', (done) => {
    realtime.io.local.disconnectSockets(true);
    done();
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  port = (app.server.address() as AddressInfo).port;
});

afterAll(async () => {
  await app.close();
});

describe('realtime table — full hand end to end', () => {
  it('two players buy in, play to showdown, settle, with no hole-card leak', async () => {
    const aliceCookie = await registerAndCookie('alice@t.com', 'Alice');
    const bobCookie = await registerAndCookie('bob@t.com', 'Bob');
    const alice = await connect(aliceCookie);
    const bob = await connect(bobCookie);

    // Track snapshots + private holes for redaction checks and action driving.
    const snaps: Record<string, TableSnapshot[]> = { alice: [], bob: [] };
    const holes: Record<string, PrivateHole[]> = { alice: [], bob: [] };
    let aliceResult: HandResult | null = null;

    const drive = (name: 'alice' | 'bob', socket: ClientSocket, tableId: string): void => {
      let lastActedVersion = -1;
      socket.on('table:snapshot', (snap) => {
        snaps[name]!.push(snap);
        const la = snap.viewerLegalAction;
        if (la && snap.version !== lastActedVersion && snap.handId) {
          lastActedVersion = snap.version;
          const action = la.canCheck ? 'check' : la.canCall ? 'call' : 'fold';
          socket.emit('table:action', {
            tableId,
            handId: snap.handId,
            clientActionId: `${name}-${snap.version}`,
            expectedVersion: snap.version,
            type: action,
          }, () => {});
        }
      });
      socket.on('hand:hole', (h) => holes[name]!.push(h));
    };

    // Alice creates a heads-up table.
    const created = await emitAck<{ tableId: string; inviteCode: string }>(alice, 'room:create', {
      name: 'HU',
      maxSeats: 2,
      smallBlind: 5,
      bigBlind: 10,
      minBuyIn: 200,
      maxBuyIn: 1000,
      isPrivate: false,
    });
    const tableId = created.tableId;

    const done = new Promise<void>((resolve) => {
      alice.on('hand:result', (r) => {
        aliceResult = r;
        resolve();
      });
    });

    drive('alice', alice, tableId);
    drive('bob', bob, tableId);

    await emitAck(alice, 'table:join', { tableId });
    await emitAck(bob, 'table:join', { tableId });
    await emitAck(alice, 'seat:sit', { tableId, seatNo: 0, buyIn: 1000 });
    await emitAck(bob, 'seat:sit', { tableId, seatNo: 1, buyIn: 1000 });
    // Ready up — the hand starts only when all seated players are ready.
    await emitAck(alice, 'seat:ready', { tableId, ready: true });
    await emitAck(bob, 'seat:ready', { tableId, ready: true });

    await done;

    // Each player received exactly their own two hole cards privately.
    expect(holes.alice.length).toBeGreaterThanOrEqual(1);
    expect(holes.bob.length).toBeGreaterThanOrEqual(1);
    expect(holes.alice[0]!.cards).toHaveLength(2);
    expect(holes.bob[0]!.cards).toHaveLength(2);

    // REDACTION: no snapshot ever carried another player's hole cards.
    for (const name of ['alice', 'bob'] as const) {
      for (const snap of snaps[name]!) {
        for (const seat of snap.seats) {
          if (seat.seatNo !== snap.viewerSeatNo) {
            expect(seat.holeCards).toBeNull();
          }
        }
      }
    }

    // Settlement sums to zero and chips are conserved.
    expect(aliceResult).not.toBeNull();
    const net = aliceResult!.settlements.reduce((s, x) => s + x.netDelta, 0);
    expect(net).toBe(0);

    // Both players only ever check/call (never fold), so the hand MUST reach a
    // 5-card showdown — this guards against the "wins at the flop" bug report.
    expect(aliceResult!.board).toHaveLength(5);

    // Ledger reconciles globally.
    expect(reconcileFn(db).ok).toBe(true);

    alice.disconnect();
    bob.disconnect();
  }, 20000);
});
