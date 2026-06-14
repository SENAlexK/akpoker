/**
 * Authoritative per-table runtime. Drives the pure engine, serializes all
 * mutations through an ActionQueue, fans out redacted public snapshots + private
 * hole cards, runs turn timers with auto check/fold, and settles each hand to the
 * ledger. The in-memory stack is the hot truth during a hand; escrow/ledger is
 * written only at buy-in / cash-out / hand-settlement.
 */
import {
  ACTION_TIMEOUT_MS,
  INTER_HAND_DELAY_MS,
  SHOWDOWN_DELAY_MS,
  cardToWire,
  type ChatMessage,
  type HandResult,
  type LastAction,
  type TableSnapshot,
} from '@akpoker/shared';
import {
  applyAction as engineApply,
  buildSettlement,
  createHand,
  createShuffleSeed,
  legalActions,
  resolveBlinds,
  rngForHand,
  shuffledDeck,
  type HandState,
} from '@akpoker/engine';
import type { FastifyBaseLogger } from 'fastify';
import { SYSTEM_GRANTS, type DB } from '../db/client.js';
import { settleHand } from '../hands/settlement.js';
import { reconcile } from '../wallet/reconcile.js';
import { buyIn, cashOut } from '../wallet/buyin.js';
import { getSystemAccountId, postEntry } from '../wallet/ledger.js';
import type { IoServer } from '../realtime/io.js';
import { buildSnapshot } from '../realtime/serialize.js';
import { ActionQueue } from './ActionQueue.js';
import { nextButtonSeat } from './pokerRules.js';
import type { Seat, TableConfigInternal } from './types.js';

export interface TableDeps {
  io: IoServer;
  db: DB;
  log: FastifyBaseLogger;
  onEmpty: (tableId: string) => void;
}

export class TableRuntime {
  readonly config: TableConfigInternal;
  private readonly deps: TableDeps;
  private readonly queue = new ActionQueue();
  private seats: (Seat | null)[];
  private spectators = new Set<string>();
  private engine: HandState | null = null;
  private phase: 'idle' | 'in_hand' = 'idle';
  private buttonSeatNo: number | null = null;
  private sbSeatNo: number | null = null;
  private bbSeatNo: number | null = null;
  private version = 1;
  private turnStartVersion = 1;
  private handCount = 0;
  private lastAction: LastAction | null = null;
  private actionSeq = 0;
  private actionDeadlineAt: number | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private nextHandTimer: ReturnType<typeof setTimeout> | null = null;
  private showdownTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(config: TableConfigInternal, deps: TableDeps) {
    this.config = config;
    this.deps = deps;
    this.seats = Array.from({ length: config.maxSeats }, () => null);
  }

  // ── public read helpers ──────────────────────────────────────────────────
  get occupiedSeats(): number {
    return this.seats.filter((s) => s !== null).length;
  }
  get isInHand(): boolean {
    return this.phase === 'in_hand';
  }
  hasUser(userId: string): boolean {
    return this.spectators.has(userId) || this.seats.some((s) => s?.userId === userId);
  }
  isSeated(userId: string): boolean {
    return this.seats.some((s) => s?.userId === userId);
  }
  findSeatNoByNickname(nickname: string): number | null {
    const s = this.seats.find((x) => x?.nickname === nickname);
    return s ? s.seatNo : null;
  }
  private seatOf(userId: string): Seat | null {
    return this.seats.find((s) => s?.userId === userId) ?? null;
  }

  listItem() {
    return {
      tableId: this.config.id,
      name: this.config.name,
      ownerId: this.config.ownerUserId,
      occupiedSeats: this.occupiedSeats,
      maxSeats: this.config.maxSeats,
      smallBlind: this.config.smallBlind,
      bigBlind: this.config.bigBlind,
      isPrivate: this.config.isPrivate,
      inHand: this.isInHand,
    };
  }

  // ── membership ───────────────────────────────────────────────────────────
  addSpectator(userId: string): void {
    if (!this.seatOf(userId)) this.spectators.add(userId);
  }
  removeSpectator(userId: string): void {
    this.spectators.delete(userId);
  }

  snapshotFor(viewerUserId: string | null): TableSnapshot {
    return buildSnapshot({
      config: this.config,
      version: this.version,
      phase: this.phase,
      seats: this.seats,
      engine: this.engine,
      buttonSeatNo: this.buttonSeatNo,
      sbSeatNo: this.sbSeatNo,
      bbSeatNo: this.bbSeatNo,
      spectatorCount: this.spectators.size,
      lastAction: this.lastAction,
      actionDeadlineAt: this.actionDeadlineAt,
      viewerUserId,
    });
  }

  /** Re-send a user their snapshot + (if seated and in a live hand) their hole cards. */
  resyncUser(userId: string): void {
    this.deps.io.to(`user:${userId}`).emit('table:snapshot', this.snapshotFor(userId));
    const seat = this.seatOf(userId);
    if (seat?.inHand && seat.holeCards && this.engine) {
      this.deps.io.to(`user:${userId}`).emit('hand:hole', {
        tableId: this.config.id,
        handId: this.engine.handId,
        cards: [cardToWire(seat.holeCards[0]), cardToWire(seat.holeCards[1])],
      });
    }
  }

  private audience(): Set<string> {
    const ids = new Set<string>(this.spectators);
    for (const s of this.seats) if (s) ids.add(s.userId);
    return ids;
  }

  private broadcast(): void {
    for (const userId of this.audience()) {
      this.deps.io.to(`user:${userId}`).emit('table:snapshot', this.snapshotFor(userId));
    }
  }

  private bump(): void {
    this.version++;
  }

  chat(userId: string, nickname: string, text: string): void {
    const seat = this.seatOf(userId);
    const msg: ChatMessage = { seatNo: seat?.seatNo ?? null, userId, nickname, text, ts: Date.now() };
    this.deps.io.to(`table:${this.config.id}`).emit('chat:message', msg);
  }

  // ── sit / stand ───────────────────────────────────────────────────────────
  sit(
    user: { userId: string; nickname: string; avatarUrl: string },
    seatNo: number,
    buyInAmount: number,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.queue.run(() => {
      if (seatNo < 0 || seatNo >= this.config.maxSeats) return { ok: false as const, error: 'bad-seat' };
      if (this.seats[seatNo]) return { ok: false as const, error: 'seat-taken' };
      if (this.seatOf(user.userId)) return { ok: false as const, error: 'already-seated' };
      if (buyInAmount < this.config.minBuyIn || buyInAmount > this.config.maxBuyIn) {
        return { ok: false as const, error: 'bad-buyin' };
      }
      let res: { escrowId: string; stack: number };
      try {
        res = buyIn(this.deps.db, {
          userId: user.userId,
          tableId: this.config.id,
          seatNo,
          amount: buyInAmount,
        });
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : 'buyin-failed' };
      }
      this.spectators.delete(user.userId);
      this.seats[seatNo] = {
        seatNo,
        userId: user.userId,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        escrowId: res.escrowId,
        stack: res.stack,
        seatStatus: 'playing',
        inHand: false,
        handStatus: null,
        committed: 0,
        holeCards: null,
        ready: false, // must ready up (sit-in) before being dealt
        pendingLeave: false,
        disconnectDeadline: null,
        lastClientActionId: null,
      };
      this.bump();
      this.broadcast();
      this.maybeStartHand();
      return { ok: true as const };
    });
  }

  stand(userId: string): Promise<{ chips: number }> {
    return this.queue.run(() => {
      const seat = this.seatOf(userId);
      if (!seat) {
        this.spectators.delete(userId);
        return { chips: 0 };
      }
      if (seat.inHand && this.phase === 'in_hand') {
        // Leave at hand end; auto-fold when it's their turn.
        seat.pendingLeave = true;
        if (this.engine?.toActSeatNo === seat.seatNo) void this.autoAct(seat.seatNo);
        return { chips: seat.stack };
      }
      return { chips: this.removeAndCashOut(seat) };
    });
  }

  private removeAndCashOut(seat: Seat): number {
    let chips = 0;
    try {
      chips = cashOut(this.deps.db, { userId: seat.userId, tableId: this.config.id, seatNo: seat.seatNo });
    } catch (err) {
      this.deps.log.error({ err }, 'cashout failed');
    }
    this.seats[seat.seatNo] = null;
    this.bump();
    this.broadcast();
    if (this.occupiedSeats === 0 && this.spectators.size === 0) this.deps.onEmpty(this.config.id);
    return chips;
  }

  onDisconnect(userId: string): void {
    // If the user has no other live sockets, mark disconnected; auto-fold at turn.
    void this.queue.run(() => {
      const seat = this.seatOf(userId);
      if (seat && seat.inHand) {
        seat.seatStatus = 'disconnected';
        if (this.engine?.toActSeatNo === seat.seatNo) void this.autoAct(seat.seatNo);
        this.bump();
        this.broadcast();
      }
    });
  }

  // ── hand lifecycle ─────────────────────────────────────────────────────────
  private eligibleSeats(): Seat[] {
    // A player is dealt in only after readying up (sit-in) — this gives explicit
    // start control and cleanly handles mid-session joiners.
    return this.seats.filter(
      (s): s is Seat =>
        s !== null && s.seatStatus === 'playing' && s.stack > 0 && s.ready && !s.pendingLeave,
    );
  }

  /**
   * Admin override: set a seated player's table chips (idle only — between hands).
   * Keeps the ledger balanced by posting the delta against SYSTEM_GRANTS so escrow
   * stays reconcilable. Refused mid-hand (would break the zero-sum settlement).
   */
  adminSetStack(seatNo: number, amount: number): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.queue.run(() => {
      if (this.phase === 'in_hand') return { ok: false as const, error: 'wait-for-hand-end' };
      const seat = this.seats[seatNo];
      if (!seat) return { ok: false as const, error: 'empty-seat' };
      const target = Math.max(0, Math.floor(amount));
      const delta = target - seat.stack;
      if (delta !== 0) {
        try {
          this.deps.db.transaction((tx) => {
            const system = getSystemAccountId(tx, SYSTEM_GRANTS);
            postEntry(tx, {
              kind: 'adjustment',
              refId: this.config.id,
              memo: `admin set stack seat ${seatNo} -> ${target}`,
              legs: [
                { accountId: seat.escrowId, amount: delta },
                { accountId: system, amount: -delta },
              ],
            });
          });
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : 'ledger-failed' };
        }
      }
      seat.stack = target;
      if (target <= 0) {
        seat.ready = false;
        seat.seatStatus = 'sitting_out';
      }
      this.bump();
      this.broadcast();
      return { ok: true as const };
    });
  }

  setReady(userId: string, ready: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.queue.run(() => {
      const seat = this.seatOf(userId);
      if (!seat) return { ok: false as const, error: 'not-seated' };
      if (ready && seat.stack <= 0) return { ok: false as const, error: 'no-chips' };
      seat.ready = ready;
      this.bump();
      this.broadcast();
      this.maybeStartHand();
      return { ok: true as const };
    });
  }

  private maybeStartHand(): void {
    if (this.phase !== 'idle') return;
    if (this.eligibleSeats().length < 2) return;
    this.startHand();
  }

  private scheduleNextHand(): void {
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = setTimeout(() => {
      void this.queue.run(() => this.maybeStartHand());
    }, INTER_HAND_DELAY_MS);
    if (typeof this.nextHandTimer === 'object' && 'unref' in this.nextHandTimer) this.nextHandTimer.unref();
  }

  private startHand(): void {
    const eligible = this.eligibleSeats();
    if (eligible.length < 2) return;
    this.handCount++;
    const eligibleSeatNos = eligible.map((s) => s.seatNo);
    this.buttonSeatNo = nextButtonSeat(this.buttonSeatNo, eligibleSeatNos);

    const seed = createShuffleSeed(`${this.config.id}:${this.handCount}`, this.handCount);
    const deck = shuffledDeck(rngForHand(seed));
    const handId = `${this.config.id}-h${this.handCount}`;

    const { state, events } = createHand({
      handId,
      seats: eligible.map((s) => ({ seatNo: s.seatNo, userId: s.userId, stack: s.stack })),
      buttonSeatNo: this.buttonSeatNo,
      smallBlind: this.config.smallBlind,
      bigBlind: this.config.bigBlind,
      deck,
      deckCommit: seed.deckCommit,
      serverSeed: seed.serverSeed,
      clientSeed: seed.clientSeed,
      nonce: seed.nonce,
    });
    void events;

    this.engine = state;
    this.phase = 'in_hand';
    const blinds = resolveBlinds(state.players, this.buttonSeatNo, undefined, undefined);
    this.sbSeatNo = blinds.smallBlindSeatNo;
    this.bbSeatNo = blinds.bigBlindSeatNo;

    // Mark dealt-in seats and stash private hole cards.
    for (const s of eligible) {
      const p = state.players.find((pl) => pl.seatNo === s.seatNo);
      if (p) {
        s.inHand = true;
        s.holeCards = p.holeCards;
        s.handStatus = p.status;
        s.committed = p.streetBet;
        s.stack = p.stack;
      }
    }
    this.syncSeats();
    this.bump();

    // Deal private hole cards to each seated player.
    for (const s of eligible) {
      if (s.holeCards) {
        this.deps.io.to(`user:${s.userId}`).emit('hand:hole', {
          tableId: this.config.id,
          handId,
          cards: [cardToWire(s.holeCards[0]), cardToWire(s.holeCards[1])],
        });
      }
    }

    if (state.street === 'complete') {
      this.onHandComplete();
      return;
    }
    this.broadcast();
    this.armTurnTimer();
  }

  private syncSeats(): void {
    if (!this.engine) return;
    for (const p of this.engine.players) {
      const seat = this.seats[p.seatNo];
      if (seat) {
        seat.stack = p.stack;
        seat.committed = p.streetBet;
        seat.handStatus = p.status;
        seat.holeCards = p.holeCards;
      }
    }
  }

  private armTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.actionDeadlineAt = null;
    if (!this.engine || this.engine.toActSeatNo === null) return;
    const seat = this.seats[this.engine.toActSeatNo];
    this.turnStartVersion = this.version;
    if (seat && (seat.pendingLeave || seat.seatStatus === 'disconnected')) {
      void this.autoAct(this.engine.toActSeatNo);
      return;
    }
    this.actionDeadlineAt = Date.now() + ACTION_TIMEOUT_MS;
    const seatNo = this.engine.toActSeatNo;
    this.turnTimer = setTimeout(() => {
      void this.queue.run(() => this.autoAct(seatNo));
    }, ACTION_TIMEOUT_MS);
    if (typeof this.turnTimer === 'object' && 'unref' in this.turnTimer) this.turnTimer.unref();
  }

  private autoAct(seatNo: number): void {
    if (!this.engine || this.engine.toActSeatNo !== seatNo) return;
    const seat = this.seats[seatNo];
    if (!seat) return;
    const la = legalActions(this.engine, seat.userId);
    const type = la.canCheck ? 'check' : 'fold';
    this.applyEngineAction(seat.userId, { type });
  }

  /** Apply a validated action to the engine and react to the result. Caller is on the queue. */
  private applyEngineAction(
    userId: string,
    action: { type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'; amount?: number },
  ): { ok: true } | { ok: false; error: string } {
    if (!this.engine) return { ok: false, error: 'no-hand' };
    const res = engineApply(this.engine, { userId, ...action });
    if (!res.ok) return { ok: false, error: res.error };
    this.engine = res.state;
    const seat = this.seatOf(userId);
    if (seat) {
      const enginePlayer = this.engine.players.find((p) => p.seatNo === seat.seatNo);
      // For bet/raise/call show the total street commitment; fold/check carry 0.
      const amount =
        action.type === 'fold' || action.type === 'check' ? 0 : (enginePlayer?.streetBet ?? action.amount ?? 0);
      this.lastAction = { seatNo: seat.seatNo, type: action.type, amount, seq: ++this.actionSeq };
    }
    this.syncSeats();
    if (this.engine.street === 'complete') {
      this.onHandComplete();
    } else {
      this.bump();
      this.broadcast();
      this.armTurnTimer();
    }
    return { ok: true };
  }

  act(
    userId: string,
    action: { type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'; amount?: number },
    clientActionId: string,
    expectedVersion: number,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.queue.run(() => {
      if (this.phase !== 'in_hand' || !this.engine) return { ok: false as const, error: 'no-hand' };
      const seat = this.seatOf(userId);
      if (!seat || !seat.inHand) return { ok: false as const, error: 'not-in-hand' };
      if (seat.lastClientActionId === clientActionId) return { ok: true as const };
      if (expectedVersion < this.turnStartVersion) return { ok: false as const, error: 'stale' };
      if (this.engine.toActSeatNo !== seat.seatNo) return { ok: false as const, error: 'not-your-turn' };
      const result = this.applyEngineAction(userId, action);
      if (result.ok) seat.lastClientActionId = clientActionId;
      return result;
    });
  }

  private onHandComplete(): void {
    if (!this.engine) return;
    const engine = this.engine;
    const settlement = buildSettlement(engine);
    this.syncSeats();

    // Build and emit the public result (reveals are face-up showdown cards).
    const result: HandResult = {
      handId: engine.handId,
      board: engine.board.map(cardToWire),
      winners: engine.awards.map((a) => ({ seatNo: a.seatNo, userId: a.userId, amount: a.amount, potIndex: a.potIndex })),
      revealed: engine.reveals.map((r) => ({
        seatNo: r.seatNo,
        cards: [cardToWire(r.holeCards[0]), cardToWire(r.holeCards[1])],
        handDescr: r.descr,
      })),
      settlements: settlement.perSeat.map((p) => ({ seatNo: p.seatNo, userId: p.userId, netDelta: p.netDelta })),
    };
    this.deps.io.to(`table:${this.config.id}`).emit('hand:result', result);
    this.deps.io.to(`table:${this.config.id}`).emit('hand:reveal', {
      handId: engine.handId,
      deckCommit: settlement.deckCommit,
      serverSeed: settlement.serverSeed,
      clientSeed: settlement.clientSeed,
      nonce: settlement.nonce,
      deckPermutation: settlement.deckPermutation,
    });

    // Persist + apply to escrow (the only ledger write of the hand).
    const escrowBySeat: Record<number, string> = {};
    for (const p of engine.players) {
      const seat = this.seats[p.seatNo];
      if (seat) escrowBySeat[p.seatNo] = seat.escrowId;
    }
    try {
      settleHand(this.deps.db, {
        settlement,
        tableId: this.config.id,
        buttonSeatNo: engine.buttonSeatNo,
        escrowBySeat,
      });
      const rep = reconcile(this.deps.db);
      if (!rep.ok) this.deps.log.error({ rep }, 'ledger reconciliation failed after hand');
    } catch (err) {
      this.deps.log.error({ err, handId: engine.handId }, 'settlement persistence failed');
    }

    // Hold the finished hand on screen (board + revealed cards + winner) so players
    // can see who won and why. The engine state is kept so the snapshot still shows
    // the full board; we clear it in finishShowdown() after the delay.
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.actionDeadlineAt = null;
    this.bump();
    this.broadcast();
    if (this.destroyed) return;
    if (this.showdownTimer) clearTimeout(this.showdownTimer);
    this.showdownTimer = setTimeout(() => {
      void this.queue.run(() => this.finishShowdown());
    }, SHOWDOWN_DELAY_MS);
    if (typeof this.showdownTimer === 'object' && 'unref' in this.showdownTimer) this.showdownTimer.unref();
  }

  /** After the showdown hold: clear the hand, settle seats, start the next hand. */
  private finishShowdown(): void {
    for (const s of this.seats) {
      if (!s) continue;
      s.inHand = false;
      s.holeCards = null;
      s.handStatus = null;
      s.committed = 0;
      s.lastClientActionId = null;
    }
    this.engine = null;
    this.phase = 'idle';

    // Handle leavers and busts. Players with chips keep their ready flag so play
    // continues automatically; busted players must re-buy (leave + rejoin).
    for (const s of [...this.seats]) {
      if (!s) continue;
      if (s.pendingLeave) {
        this.removeAndCashOut(s);
      } else if (s.stack <= 0) {
        s.seatStatus = 'sitting_out';
        s.ready = false; // busted; must re-buy to continue
      }
    }

    this.bump();
    this.broadcast();
    if (this.destroyed) return;
    this.scheduleNextHand();
  }

  /** Owner/admin force-close: cash everyone out (escrow -> wallet) and empty the table. */
  forceClose(): Promise<void> {
    return this.queue.run(() => {
      this.destroyed = true;
      if (this.turnTimer) clearTimeout(this.turnTimer);
      if (this.showdownTimer) clearTimeout(this.showdownTimer);
      if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
      this.turnTimer = this.showdownTimer = this.nextHandTimer = null;
      this.engine = null;
      this.phase = 'idle';
      for (const s of this.seats) {
        if (!s) continue;
        try {
          cashOut(this.deps.db, { userId: s.userId, tableId: this.config.id, seatNo: s.seatNo });
        } catch (err) {
          this.deps.log.error({ err }, 'cashout on force-close failed');
        }
      }
      this.seats = this.seats.map(() => null);
      this.spectators.clear();
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    if (this.showdownTimer) clearTimeout(this.showdownTimer);
  }
}
