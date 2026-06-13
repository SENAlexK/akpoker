/**
 * Place up to 9 seats around an ellipse. The viewer's seat is rotated to bottom
 * center; others fan out clockwise. Returns CSS percentage positions so the table
 * reflows responsively at any size (desktop landscape & mobile portrait).
 */
export interface SeatPos {
  leftPct: number;
  topPct: number;
}

export function seatPosition(seatNo: number, heroSeatNo: number | null, maxSeats: number): SeatPos {
  const hero = heroSeatNo ?? 0;
  const displayIndex = (seatNo - hero + maxSeats) % maxSeats;
  const t = displayIndex / maxSeats;
  const angle = Math.PI / 2 + t * Math.PI * 2; // start at bottom, go clockwise
  const rx = 46; // horizontal radius (% of container)
  const ry = 40; // vertical radius
  return {
    leftPct: 50 + rx * Math.cos(angle),
    topPct: 50 + ry * Math.sin(angle),
  };
}
