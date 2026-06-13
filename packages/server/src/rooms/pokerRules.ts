/**
 * Table-layer poker rules the engine delegates: button movement between hands.
 *
 * v1 uses the standard "moving button" — the button advances to the next eligible
 * (occupied, playing) seat clockwise each hand; the engine derives SB/BB as
 * button+1 / button+2 among the dealt-in players (heads-up: button is SB). This
 * is correct for a stable player set. Strict dead-button / dead-small-blind
 * handling for mid-orbit joins/leaves is a future refinement (see plan).
 */

/** Next eligible seat clockwise strictly after `prev` (or the first eligible if prev is null). */
export function nextButtonSeat(prev: number | null, eligibleSeatNos: number[]): number {
  if (eligibleSeatNos.length === 0) throw new Error('no eligible seats for button');
  const sorted = [...eligibleSeatNos].sort((a, b) => a - b);
  if (prev === null) return sorted[0]!;
  const after = sorted.find((s) => s > prev);
  return after ?? sorted[0]!;
}
