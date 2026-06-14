/** Weekly leaderboard: net winnings since the start of the current week (UTC Monday). */
import type { LeaderboardEntry } from '@akpoker/shared';
import type { DB } from '../db/client.js';

/** Epoch ms of the most recent Monday 00:00:00 in UTC+8 (Beijing time). */
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
export function weekStartMs(now = Date.now()): number {
  const shifted = new Date(now + TZ_OFFSET_MS); // wall-clock of UTC+8, read via getUTC*
  const dow = (shifted.getUTCDay() + 6) % 7; // 0 = Monday
  const mondayMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - dow,
    0,
    0,
    0,
    0,
  );
  return mondayMidnight - TZ_OFFSET_MS; // back to a real UTC epoch
}

interface Row {
  userId: string;
  nickname: string;
  net: number;
}

export function weeklyLeaderboard(db: DB, sinceMs: number, limit = 20): LeaderboardEntry[] {
  const rows = db.$client
    .prepare(
      `SELECT hr.user_id AS userId, u.nickname AS nickname, COALESCE(SUM(hr.net_delta), 0) AS net
       FROM hand_results hr
       JOIN hands h ON h.id = hr.hand_id
       JOIN users u ON u.id = hr.user_id
       WHERE h.created_at >= ? AND u.status != 'banned'
       GROUP BY hr.user_id, u.nickname
       ORDER BY net DESC
       LIMIT ?`,
    )
    .all(sinceMs, limit) as Row[];

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    nickname: r.nickname,
    avatarUrl: `/api/avatar/${r.userId}`,
    net: r.net,
  }));
}
