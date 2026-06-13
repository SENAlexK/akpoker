/**
 * Pot construction via contribution-peeling. Handles arbitrary multi-way all-ins
 * at different stack depths, dead blinds, and folded contributions.
 *
 * returnUncalled() MUST run before buildPots(): the unique top contributor's
 * chips beyond the next-highest contribution are uncalled and returned.
 */
import type { PlayerState, Pot } from './types.js';

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

/**
 * Return the uncalled portion to the sole highest contributor. Mutates the given
 * players (stack += refund, contributed -= refund). Returns the refund info or null.
 */
export function returnUncalled(players: PlayerState[]): { userId: string; amount: number } | null {
  const withContrib = players.filter((p) => p.contributed > 0);
  if (withContrib.length === 0) return null;

  let maxC = -1;
  for (const p of withContrib) if (p.contributed > maxC) maxC = p.contributed;
  const atMax = withContrib.filter((p) => p.contributed === maxC);
  if (atMax.length !== 1) return null; // tie at top => fully matched

  const top = atMax[0]!;
  if (top.status === 'folded') return null; // shouldn't happen; never refund dead money

  let secondC = 0;
  for (const p of withContrib) {
    if (p === top) continue;
    if (p.contributed > secondC) secondC = p.contributed;
  }
  const refund = maxC - secondC;
  if (refund <= 0) return null;

  top.contributed -= refund;
  top.stack += refund;
  return { userId: top.userId, amount: refund };
}

/**
 * Build pots from final per-player `contributed` totals. Folded players' chips
 * are included in the pot amounts but they appear in NO eligible set.
 */
export function buildPots(players: PlayerState[]): Pot[] {
  const levels = [...new Set(players.map((p) => p.contributed).filter((c) => c > 0))].sort(
    (a, b) => a - b,
  );
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    const layer = level - prev;
    const contributors = players.filter((p) => p.contributed >= level);
    const amount = layer * contributors.length;
    const eligible = contributors.filter((p) => p.status !== 'folded').map((p) => p.userId);
    if (amount > 0) {
      const last = pots[pots.length - 1];
      if (last && sameSet(last.eligibleUserIds, eligible)) {
        last.amount += amount;
      } else {
        pots.push({ amount, eligibleUserIds: eligible });
      }
    }
    prev = level;
  }
  return pots;
}

/** Running pot preview (for the UI) — same algorithm but non-mutating. */
export function potPreview(players: PlayerState[]): Pot[] {
  return buildPots(players.map((p) => ({ ...p })));
}
