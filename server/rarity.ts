/**
 * Rarity scoring.
 *
 * share(answer) = (picks + α·prior) / (totalPicks + α)
 *  - picks / totalPicks: real historical picks for this question (persisted in data/stats.db)
 *  - prior: curated estimate before real data exists = Zipf weight over the answer's popularity
 *    rank (Wikipedia sitelink count, from Wikidata), normalized over the question's answers
 *  - α: smoothing strength (pseudo-picks); as real picks accumulate they dominate the prior
 * The tier is a deterministic function of share. No randomness anywhere.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TIER_POINTS, type RarityTier } from "../shared/types.ts";

export const ALPHA = 40;
const ZIPF_S = 1.3;
const THRESHOLDS: [number, RarityTier][] = [
  [0.08, "common"], [0.035, "uncommon"], [0.015, "interesting"], [0.006, "rare"], [0.0025, "veryRare"], [0.001, "extreme"],
];

const normCache = new Map<number, number>();
function zipfNorm(n: number) {
  let s = normCache.get(n);
  if (s === undefined) { s = 0; for (let r = 1; r <= n; r++) s += 1 / Math.pow(r + 2, ZIPF_S); normCache.set(n, s); }
  return s;
}
export const priorShare = (rank: number, answerCount: number) => 1 / Math.pow(rank + 2, ZIPF_S) / zipfNorm(answerCount);

export function tierFor(share: number): RarityTier {
  for (const [t, tier] of THRESHOLDS) if (share >= t) return tier;
  return "exceptional";
}

export interface Scored { tier: RarityTier; points: number; share: number }
export function score(rank: number, answerCount: number, picks: number, total: number): Scored {
  const share = (picks + ALPHA * priorShare(rank, answerCount)) / (total + ALPHA);
  const tier = tierFor(share);
  return { tier, points: TIER_POINTS[tier], share };
}

export class StatsStore {
  private db: DatabaseSync;
  constructor(file?: string) {
    const dir = new URL("../data/", import.meta.url);
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(file ?? fileURLToPath(new URL("stats.db", dir)));
    this.db.exec(`CREATE TABLE IF NOT EXISTS picks (question_id TEXT, answer_id TEXT, n INT, PRIMARY KEY (question_id, answer_id));
      CREATE TABLE IF NOT EXISTS totals (question_id TEXT PRIMARY KEY, n INT);`);
  }
  get(questionId: string, answerId: string) {
    const p = this.db.prepare("SELECT n FROM picks WHERE question_id=? AND answer_id=?").get(questionId, answerId) as any;
    const t = this.db.prepare("SELECT n FROM totals WHERE question_id=?").get(questionId) as any;
    return { picks: p?.n ?? 0, total: t?.n ?? 0 };
  }
  record(questionId: string, answerIds: string[]) {
    if (!answerIds.length) return;
    this.db.exec("BEGIN");
    const up = this.db.prepare("INSERT INTO picks VALUES (?,?,1) ON CONFLICT(question_id, answer_id) DO UPDATE SET n = n + 1");
    for (const a of answerIds) up.run(questionId, a);
    this.db.prepare("INSERT INTO totals VALUES (?,?) ON CONFLICT(question_id) DO UPDATE SET n = n + excluded.n").run(questionId, answerIds.length);
    this.db.exec("COMMIT");
  }
}
