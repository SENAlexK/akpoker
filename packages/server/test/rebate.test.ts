import { describe, expect, it } from 'vitest';
import { lossRebate } from '../src/wallet/buyin.js';

describe('tiered loss rebate (25% -> 5% of buy-in)', () => {
  it('pays per 25% lost, capped at 100% -> 20%', () => {
    expect(lossRebate(1000, 1000)).toBe(0); // no loss
    expect(lossRebate(1000, 800)).toBe(0); // 20% lost -> below first tier
    expect(lossRebate(1000, 750)).toBe(50); // 25% -> 1 tier -> 5%
    expect(lossRebate(1000, 500)).toBe(100); // 50% -> 2 tiers -> 10%
    expect(lossRebate(1000, 250)).toBe(150); // 75% -> 3 tiers -> 15%
    expect(lossRebate(1000, 0)).toBe(200); // 100% -> 4 tiers -> 20%
    expect(lossRebate(1000, 1200)).toBe(0); // won -> no rebate
    expect(lossRebate(0, 0)).toBe(0); // no buy-in
  });
});
