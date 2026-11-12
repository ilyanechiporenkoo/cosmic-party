// Content store: question metadata in memory, per-question answer indexes loaded lazily (LRU).
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CategoryId, Loc, MatchKind, PreviewResult, QuestionPublic } from "../shared/types.ts";
import { normalize, foldCyr, cyrToLat, phoneticKey, stem, editDistance, typoBudget, GENERIC_FILLER } from "./text.ts";

export interface Answer { id: string; label: Loc; rank: number; sitelinks: number }
export interface QuestionMeta { id: string; category: CategoryId; difficulty: number; text: Loc; answerCount: number; filler: string[]; kind: "broad" | "template"; template: string | null }

type IdxMap = Map<string, Set<number>>;
export interface QuestionIndex {
  meta: QuestionMeta;
  answers: Answer[];
  exact: IdxMap; latin: IdxMap; stemmed: IdxMap; phon: IdxMap;
  fuzzy: { key: string; lat: string; idx: number }[];
  filler: Set<string>;
  maxTokens: number;
}

const add = (m: IdxMap, k: string, i: number) => { if (!k) return; let s = m.get(k); if (!s) m.set(k, (s = new Set())); s.add(i); };

export function buildIndex(meta: QuestionMeta, rows: { answer: Answer; aliases: string[] }[]): QuestionIndex {
  const idx: QuestionIndex = { meta, answers: [], exact: new Map(), latin: new Map(), stemmed: new Map(), phon: new Map(), fuzzy: [], filler: new Set(), maxTokens: 1 };
  for (const f of meta.filler) idx.filler.add(foldCyr(normalize(f)));
  for (const g of GENERIC_FILLER) idx.filler.add(foldCyr(g));
  rows.forEach(({ answer, aliases }, i) => {
    idx.answers.push(answer);
    const seen = new Set<string>();
    for (const a of [answer.label.uk, answer.label.ru, ...aliases]) {
      const k = foldCyr(normalize(a));
      if (!k || seen.has(k) || idx.filler.has(k)) continue;
      seen.add(k);
      const lat = cyrToLat(k);
      add(idx.exact, k, i);
      add(idx.latin, lat, i);
      add(idx.stemmed, stem(k), i);
      const pk = phoneticKey(lat);
      if (lat.replace(/[^a-z]/g, "").length >= 4 && pk.replace(/ /g, "").length >= 4) add(idx.phon, pk, i);
      idx.fuzzy.push({ key: k, lat, idx: i });
      idx.maxTokens = Math.max(idx.maxTokens, k.split(" ").length);
    }
  });
  return idx;
}

// ── matching ─────────────────────────────────────────────────
export interface MatchOutcome { status: "match" | "ambiguous" | "none" | "empty"; ids: number[]; kind?: MatchKind }

const pick = (idx: QuestionIndex, set: Set<number> | undefined, kind: MatchKind): MatchOutcome | null => {
  if (!set || set.size === 0) return null;
  const ids = [...set].sort((a, b) => idx.answers[a].rank - idx.answers[b].rank);
  return ids.length === 1 ? { status: "match", ids, kind } : { status: "ambiguous", ids: ids.slice(0, 5), kind };
};

function direct(idx: QuestionIndex, f: string): MatchOutcome | null {
  const lat = cyrToLat(f);
  return pick(idx, idx.exact.get(f), "exact")
    ?? pick(idx, idx.latin.get(lat), "translit")
    ?? pick(idx, idx.stemmed.get(stem(f)), "morph");
}

function typo(idx: QuestionIndex, f: string): MatchOutcome | null {
  const lat = cyrToLat(f);
  const budget = typoBudget(f.replace(/ /g, "").length);
  if (budget === 0) return null;
  let best = budget + 1;
  let ids = new Set<number>();
  for (const e of idx.fuzzy) {
    if (Math.abs(e.key.length - f.length) > budget && Math.abs(e.lat.length - lat.length) > budget) continue;
    // never correct to a much shorter answer (javascrip ↛ java): distance must be small relative to the key
    const d = Math.min(editDistance(f, e.key, budget), editDistance(lat, e.lat, budget));
    if (d > budget || d * 3 > e.key.length) continue;
    // short answers (≤4 letters) only forgive a same-length slip: "lau"→Lua yes, "luna"→Lua no
    if (e.key.length <= 4 && e.key.length !== f.length) continue;
    if (d < best) { best = d; ids = new Set([e.idx]); } else if (d === best) ids.add(e.idx);
  }
  return ids.size ? pick(idx, ids, "typo") : null;
}

function phrase(idx: QuestionIndex, tokens: string[]): MatchOutcome | null {
  // find maximal token spans that are known answers; remaining tokens must all be filler
  const spans: { s: number; e: number; set: Set<number> }[] = [];
  for (let len = Math.min(idx.maxTokens, tokens.length); len >= 1; len--) {
    for (let s = 0; s + len <= tokens.length; s++) {
      const e = s + len;
      if (spans.some((sp) => sp.s <= s && e <= sp.e)) continue;
      const k = tokens.slice(s, e).join(" ");
      if (len === 1 && idx.filler.has(k)) continue;
      const set = idx.exact.get(k) ?? idx.latin.get(cyrToLat(k)) ?? (k.length >= 5 ? idx.stemmed.get(stem(k)) : undefined);
      if (set) spans.push({ s, e, set });
    }
  }
  if (!spans.length) return null;
  const covered = new Set<number>();
  for (const sp of spans) for (let i = sp.s; i < sp.e; i++) covered.add(i);
  const leftovers = tokens.filter((t, i) => !covered.has(i));
  if (leftovers.some((t) => !idx.filler.has(t))) return null;
  const ids = new Set<number>();
  for (const sp of spans) for (const i of sp.set) ids.add(i);
  return pick(idx, ids, "phrase");
}

export function matchAnswer(idx: QuestionIndex, input: string): MatchOutcome {
  const f = foldCyr(normalize(input));
  if (!f) return { status: "empty", ids: [] };
  const d = direct(idx, f);
  if (d) return d;
  const tokens = f.split(" ");
  const stripped = tokens.filter((t) => !idx.filler.has(t)).join(" ");
  if (tokens.length > 1) {
    const p = phrase(idx, tokens);
    if (p) return p;
    if (stripped && stripped !== f) {
      const d2 = direct(idx, stripped);
      if (d2) return { ...d2, kind: "phrase" };
    }
  }
  const target = stripped || f;
  const t = typo(idx, target);
  if (t) return t;
  const lat = cyrToLat(target);
  const pk = phoneticKey(lat);
  if (lat.replace(/[^a-z]/g, "").length >= 4 && pk.replace(/ /g, "").length >= 4) {
    // sound-alike bridge for transliterations; lengths must stay comparable
    const set = idx.phon.get(pk);
    const ok = set && new Set([...set].filter((i) => idx.fuzzy.some((e) => e.idx === i && Math.abs(e.lat.length - lat.length) <= Math.max(2, e.lat.length * 0.4))));
    const ph = pick(idx, ok, "phonetic");
    if (ph) return ph;
  }
  return { status: "none", ids: [] };
}

export function toPreview(idx: QuestionIndex, input: string, m: MatchOutcome): PreviewResult {
  const a = (i: number) => ({ id: idx.answers[i].id, label: idx.answers[i].label });
  if (m.status === "match") return { status: "match", input, answer: a(m.ids[0]), kind: m.kind };
  if (m.status === "ambiguous") return { status: "ambiguous", input, options: m.ids.map(a), kind: m.kind };
  return { status: m.status, input };
}

// ── store ────────────────────────────────────────────────────
export class ContentStore {
  private db: DatabaseSync;
  readonly questions: QuestionMeta[];
  private cache = new Map<string, QuestionIndex>();
  constructor(file = fileURLToPath(new URL("../data/content.db", import.meta.url))) {
    if (!existsSync(file)) throw new Error(`content database missing: ${file}. Run npm run content:build`);
    this.db = new DatabaseSync(file, { readOnly: true });
    this.questions = (this.db.prepare("SELECT * FROM questions").all() as any[]).map((r) => ({
      id: r.id, category: r.category, difficulty: r.difficulty, text: { uk: r.text_uk, ru: r.text_ru }, answerCount: r.answer_count, filler: JSON.parse(r.filler),
      kind: r.kind ?? "broad", template: r.template ?? null,
    }));
  }
  meta(id: string) { return this.questions.find((q) => q.id === id); }
  index(id: string): QuestionIndex {
    const hit = this.cache.get(id);
    if (hit) { this.cache.delete(id); this.cache.set(id, hit); return hit; }
    const meta = this.meta(id);
    if (!meta) throw new Error("unknown question " + id);
    const rows = (this.db.prepare("SELECT * FROM answers WHERE question_id = ? ORDER BY rank").all(id) as any[]).map((r) => ({
      answer: { id: r.answer_id, label: { uk: r.label_uk, ru: r.label_ru }, rank: r.rank, sitelinks: r.sitelinks },
      aliases: JSON.parse(r.aliases) as string[],
    }));
    const idx = buildIndex(meta, rows);
    this.cache.set(id, idx);
    if (this.cache.size > 48) this.cache.delete(this.cache.keys().next().value!);
    return idx;
  }
  pickQuestion(categories: CategoryId[], exclude: Set<string>, minAnswers = 30): QuestionMeta {
    let pool = this.questions.filter((q) => q.answerCount >= minAnswers && (categories.length === 0 || categories.includes(q.category)));
    if (!pool.length) pool = this.questions;
    const fresh = pool.filter((q) => !exclude.has(q.id));
    const from = fresh.length ? fresh : pool;
    // weighted: broad questions are the backbone of a match (×4); templated ones add variety.
    // Each template family shares its weight so 150 "<country>: footballer" questions don't crowd out the rest.
    const famSize = new Map<string, number>();
    for (const q of from) if (q.template) famSize.set(q.template, (famSize.get(q.template) ?? 0) + 1);
    const w = from.map((q) => (q.kind === "broad" ? 4 : 2 / Math.sqrt(famSize.get(q.template!) ?? 1)) * Math.sqrt(Math.min(q.answerCount, 400) / 100));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < from.length; i++) { r -= w[i]; if (r <= 0) return from[i]; }
    return from[from.length - 1];
  }
  categoriesAvailable(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const q of this.questions) out[q.category] = (out[q.category] ?? 0) + 1;
    return out;
  }
}

export const toPublic = (m: QuestionMeta): QuestionPublic => ({ id: m.id, category: m.category, difficulty: m.difficulty, text: m.text, answerCount: m.answerCount });
