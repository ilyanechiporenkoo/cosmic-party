import { describe, it, expect } from "vitest";
import { score, priorShare, tierFor, ALPHA } from "../server/rarity.ts";
import { TIER_POINTS } from "../shared/types.ts";

describe("rarity", () => {
  it("prior shares sum to 1 and decrease with rank", () => {
    let s = 0; for (let r = 1; r <= 400; r++) s += priorShare(r, 400);
    expect(s).toBeCloseTo(1, 6);
    expect(priorShare(1, 400)).toBeGreaterThan(priorShare(50, 400));
  });
  it("popular answers are common, obscure ones exceptional (no history)", () => {
    expect(score(1, 400, 0, 0).tier).toBe("common");
    expect(score(400, 400, 0, 0).tier).toBe("exceptional");
    expect(score(1, 400, 0, 0).points).toBe(10);
  });
  it("deterministic: same inputs → same points", () => {
    for (let i = 0; i < 20; i++) expect(score(17, 300, 3, 40)).toEqual(score(17, 300, 3, 40));
  });
  it("history moves rarity, smoothed so few plays do not swing it wildly", () => {
    const fresh = score(200, 400, 0, 0);
    const oneGame = score(200, 400, 1, 4);   // one pick in a tiny sample
    const many = score(200, 400, 300, 1000); // chosen by 30% of players over time
    expect(TIER_POINTS[oneGame.tier]).toBeLessThan(TIER_POINTS[fresh.tier]);
    expect(oneGame.points).toBeGreaterThan(many.points);
    expect(many.tier).toBe("common");
    expect(ALPHA).toBeGreaterThan(10);
  });
  it("tiers are monotonic in share", () => {
    const order = ["exceptional", "extreme", "veryRare", "rare", "interesting", "uncommon", "common"];
    let last = 0;
    for (const s of [0.0001, 0.0015, 0.003, 0.01, 0.02, 0.05, 0.2]) { const i = order.indexOf(tierFor(s)); expect(i).toBeGreaterThanOrEqual(last); last = i; }
  });
});
