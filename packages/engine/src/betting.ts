/**
 * Betting state machine: legal-action computation and the action reducer.
 * Implements No-Limit rules including min-raise increments and the
 * incomplete-all-in rule (an all-in for less than a full raise does NOT reopen
 * betting for players who have already acted).
 */
import type { LegalAction } from '@akpoker/shared';
import type { EngineEvent } from './events.js';
import { sortedBySeat } from './order.js';
import type { Action, ActionError, HandState, PlayerState } from './types.js';

const NO_ACTION: LegalAction = {
  canFold: false,
  canCheck: false,
  canCall: false,
  callAmount: 0,
  canBet: false,
  minBet: 0,
  maxBet: 0,
  canRaise: false,
  minRaise: 0,
  maxRaise: 0,
};

export function findPlayer(state: HandState, userId: string): PlayerState | undefined {
  return state.players.find((p) => p.userId === userId);
}

/** Does this player still owe an action this round? */
export function needsToAct(p: PlayerState, currentBet: number): boolean {
  return p.status === 'active' && (p.streetBet < currentBet || !p.hasActedThisRound);
}

/** Compute the unified LegalAction for the player whose turn it is. */
export function legalActions(state: HandState, userId: string): LegalAction {
  const p = findPlayer(state, userId);
  if (!p || state.toActSeatNo !== p.seatNo || p.status !== 'active') return { ...NO_ACTION };

  const toCall = state.currentBet - p.streetBet;
  const maxToTotal = p.streetBet + p.stack; // all-in street total
  const r: LegalAction = { ...NO_ACTION, canFold: true };

  if (toCall <= 0) {
    r.canCheck = true;
    if (state.currentBet === 0) {
      if (p.stack > 0) {
        r.canBet = true;
        r.minBet = Math.min(state.minOpen, maxToTotal);
        r.maxBet = maxToTotal;
      }
    } else if (p.mayRaise && maxToTotal > state.currentBet) {
      // BB option (already matched) — may raise.
      r.canRaise = true;
      r.minRaise = Math.min(state.currentBet + state.lastRaiseSize, maxToTotal);
      r.maxRaise = maxToTotal;
    }
  } else {
    if (p.stack > 0) {
      r.canCall = true;
      r.callAmount = Math.min(toCall, p.stack);
    }
    if (p.mayRaise && maxToTotal > state.currentBet) {
      r.canRaise = true;
      r.minRaise = Math.min(state.currentBet + state.lastRaiseSize, maxToTotal);
      r.maxRaise = maxToTotal;
    }
  }
  return r;
}

function commit(p: PlayerState, pay: number): void {
  const amt = Math.min(pay, p.stack);
  p.stack -= amt;
  p.streetBet += amt;
  p.contributed += amt;
}

/** Apply a raise/bet/all-in that commits the player's street total up to T. */
function commitToTotal(state: HandState, p: PlayerState, total: number): void {
  commit(p, total - p.streetBet);
  const effectiveTotal = p.streetBet; // in case capped by stack
  if (effectiveTotal > state.currentBet) {
    const raiseSize = effectiveTotal - state.currentBet;
    if (raiseSize >= state.lastRaiseSize) {
      // Full raise: reopen betting for everyone still active.
      state.lastRaiseSize = raiseSize;
      state.currentBet = effectiveTotal;
      for (const q of state.players) {
        if (q.status === 'active') q.mayRaise = true;
      }
    } else {
      // Incomplete all-in raise: raises the bet but does NOT reopen for actors
      // who have already acted; lastRaiseSize is unchanged.
      state.currentBet = effectiveTotal;
      for (const q of state.players) {
        if (q !== p && q.status === 'active' && q.hasActedThisRound) q.mayRaise = false;
      }
    }
  }
  if (p.stack === 0) p.status = 'allin';
}

function logAction(state: HandState, p: PlayerState, type: Action['type'], amount: number): void {
  state.log.push({
    seatNo: p.seatNo,
    userId: p.userId,
    street: state.street,
    type,
    amount,
  });
}

/** First player needing to act, clockwise strictly after `fromSeatNo`. */
function nextNeedsToAct(state: HandState, fromSeatNo: number): PlayerState | null {
  const sorted = sortedBySeat(state.players);
  const after = sorted.filter((p) => p.seatNo > fromSeatNo);
  const before = sorted.filter((p) => p.seatNo <= fromSeatNo);
  const ordered = [...after, ...before];
  return ordered.find((p) => needsToAct(p, state.currentBet)) ?? null;
}

function advanceTurn(state: HandState, actedSeatNo: number): void {
  const contenders = state.players.filter((p) => p.status !== 'folded');
  if (contenders.length <= 1) {
    state.toActSeatNo = null;
    return;
  }
  const next = nextNeedsToAct(state, actedSeatNo);
  state.toActSeatNo = next ? next.seatNo : null;
}

/**
 * Validate and apply an action. Mutates `state` (assumed to be a clone), pushes
 * the 'action' event, and advances the turn (sets toActSeatNo, possibly null when
 * the round closes). Returns an error code without mutating on illegal input.
 */
export function applyBettingAction(
  state: HandState,
  action: Action,
  events: EngineEvent[],
): ActionError | null {
  const p = findPlayer(state, action.userId);
  if (!p) return 'unknown-player';
  if (state.toActSeatNo === null) return 'hand-complete';
  if (state.toActSeatNo !== p.seatNo || p.status !== 'active') return 'not-your-turn';

  const la = legalActions(state, action.userId);

  switch (action.type) {
    case 'fold': {
      p.status = 'folded';
      p.hasActedThisRound = true;
      logAction(state, p, 'fold', 0);
      events.push({ t: 'action', userId: p.userId, seatNo: p.seatNo, type: 'fold', amount: 0, allin: false });
      break;
    }
    case 'check': {
      if (!la.canCheck) return 'illegal-action';
      p.hasActedThisRound = true;
      logAction(state, p, 'check', 0);
      events.push({ t: 'action', userId: p.userId, seatNo: p.seatNo, type: 'check', amount: 0, allin: false });
      break;
    }
    case 'call': {
      if (!la.canCall) return 'illegal-action';
      commit(p, la.callAmount);
      const allin = p.stack === 0;
      if (allin) p.status = 'allin';
      p.hasActedThisRound = true;
      logAction(state, p, 'call', p.streetBet);
      events.push({ t: 'action', userId: p.userId, seatNo: p.seatNo, type: 'call', amount: p.streetBet, allin });
      break;
    }
    case 'bet': {
      if (!la.canBet) return 'illegal-action';
      const to = action.amount;
      if (to === undefined || to < la.minBet || to > la.maxBet) return 'bad-amount';
      commitToTotal(state, p, to);
      p.hasActedThisRound = true;
      logAction(state, p, 'bet', p.streetBet);
      events.push({ t: 'action', userId: p.userId, seatNo: p.seatNo, type: 'bet', amount: p.streetBet, allin: p.stack === 0 });
      break;
    }
    case 'raise': {
      if (!la.canRaise) return 'illegal-action';
      const to = action.amount;
      if (to === undefined || to < la.minRaise || to > la.maxRaise) return 'bad-amount';
      commitToTotal(state, p, to);
      p.hasActedThisRound = true;
      logAction(state, p, 'raise', p.streetBet);
      events.push({ t: 'action', userId: p.userId, seatNo: p.seatNo, type: 'raise', amount: p.streetBet, allin: p.stack === 0 });
      break;
    }
    case 'allin': {
      if (p.stack <= 0) return 'illegal-action';
      const to = p.streetBet + p.stack;
      commitToTotal(state, p, to);
      p.hasActedThisRound = true;
      logAction(state, p, 'allin', p.streetBet);
      events.push({
        t: 'action',
        userId: p.userId,
        seatNo: p.seatNo,
        type: 'allin',
        amount: p.streetBet,
        allin: true,
      });
      break;
    }
    default:
      return 'illegal-action';
  }

  advanceTurn(state, p.seatNo);
  return null;
}
