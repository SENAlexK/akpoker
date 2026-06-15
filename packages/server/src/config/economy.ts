/** Tunable economy constants (re-exported from shared where shared owns them). */
import { DAILY_BONUS, RAKE_BPS, RAKE_CAP, STARTING_GRANT } from '@akpoker/shared';

export const ECONOMY = {
  STARTING_GRANT,
  DAILY_BONUS,
  RAKE_BPS,
  RAKE_CAP,
} as const;
