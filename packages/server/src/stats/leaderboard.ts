/** Weekly leaderboard: net winnings since the start of the current week (UTC Monday). */
import type { LeaderboardEntry } from '@akpoker/shared';
import type { DB } from '../db/client.js';

/** Epoch ms of the most recent Monday 00:00:00 UTC. */
export function weekStartMs(now = Date.now()): number {
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow, 0, 0, 0, 0);
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
       WHERE h.created_at >= ?
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
