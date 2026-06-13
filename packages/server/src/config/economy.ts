/** Tunable economy constants (re-exported from shared where shared owns them). */
import { DAILY_TOPUP_FLOOR, DAILY_TOPUP_TARGET, RAKE_BPS, RAKE_CAP, STARTING_GRANT } from '@akpoker/shared';

export const ECONOMY = {
  STARTING_GRANT,
  DAILY_TOPUP_FLOOR,
  DAILY_TOPUP_TARGET,
  RAKE_BPS,
  RAKE_CAP,
} as const;
