/**
 * Seat ordering helpers. All operate on the dealt-in players sorted by seatNo,
 * treating seats as a clockwise cycle. The button seatNo need not belong to a
 * player (supports a dead button): ordering is by modular seatNo comparison.
 *
 * Unified first-to-act rule (works for heads-up AND 3+):
 *   - preflop  first actor = next ACTIVE player clockwise after the BB seat
 *   - postflop first actor = next ACTIVE player clockwise after the BUTTON seat
 * In heads-up this naturally makes the button act first preflop / last postflop.
 */
import type { PlayerState } from './types.js';

/** Players sorted by seatNo (ascending). */
export function sortedBySeat(players: PlayerState[]): PlayerState[] {
  return [...players].sort((a, b) => a.seatNo - b.seatNo);
}

/** First player strictly clockwise after `fromSeatNo` (any status), or null. */
export function nextSeatFrom(players: PlayerState[], fromSeatNo: number): PlayerState | null {
  const sorted = sortedBySeat(players);
  if (sorted.length === 0) return null;
  const after = sorted.find((p) => p.seatNo > fromSeatNo);
  return after ?? sorted[0]!;
}

/** First player clockwise after `fromSeatNo` matching `pred`, scanning the full cycle. */
function nextMatching(
  players: PlayerState[],
  fromSeatNo: number,
  pred: (p: PlayerState) => boolean,
): PlayerState | null {
  const sorted = sortedBySeat(players);
  if (sorted.length === 0) return null;
  // Build the cyclic order starting strictly after fromSeatNo.
  const ordered: PlayerState[] = [];
  const after = sorted.filter((p) => p.seatNo > fromSeatNo);
  const before = sorted.filter((p) => p.seatNo <= fromSeatNo);
  ordered.push(...after, ...before);
  return ordered.find(pred) ?? null;
}

/** First ACTIVE (still-to-act-eligible) player clockwise after `fromSeatNo`. */
export function nextActiveFrom(players: PlayerState[], fromSeatNo: number): PlayerState | null {
  return nextMatching(players, fromSeatNo, (p) => p.status === 'active');
}

/** Resolve small/big blind seats given the button, honoring optional overrides. */
export function resolveBlinds(
  players: PlayerState[],
  buttonSeatNo: number,
  sbOverride: number | null | undefined,
  bbOverride: number | undefined,
): { smallBlindSeatNo: number | null; bigBlindSeatNo: number } {
  if (bbOverride !== undefined) {
    return {
      smallBlindSeatNo: sbOverride === undefined ? null : sbOverride,
      bigBlindSeatNo: bbOverride,
    };
  }
  if (players.length === 2) {
    // Heads-up: button posts the small blind; the other posts the big blind.
    const other = nextSeatFrom(players, buttonSeatNo);
    return { smallBlindSeatNo: buttonSeatNo, bigBlindSeatNo: other!.seatNo };
  }
  const sb = nextSeatFrom(players, buttonSeatNo)!;
  const bb = nextSeatFrom(players, sb.seatNo)!;
  return { smallBlindSeatNo: sb.seatNo, bigBlindSeatNo: bb.seatNo };
}

/** Count of players still able to take a betting action. */
export function activeCount(players: PlayerState[]): number {
  return players.filter((p) => p.status === 'active').length;
}

/** Players who have not folded (active + all-in) — contest the pots. */
export function contenders(players: PlayerState[]): PlayerState[] {
  return players.filter((p) => p.status !== 'folded');
}
