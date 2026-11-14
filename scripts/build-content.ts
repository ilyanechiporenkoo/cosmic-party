/**
 * Builds data/content.db from the sharded raw Wikidata dumps:
 *  - localization checks (uk label must not contain ru-only letters and vice versa)
 *  - deduplication of answers sharing a label inside one question
 *  - alias collection (uk/ru/en labels + altLabels + person surnames)
 *  - curated rarity prior = popularity rank by Wikipedia sitelink count
 *  - coverage report content/COVERAGE.md (counts are measured, never assumed)
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { QUESTION_DEFS } from "../content/definitions.ts";
import { TEMPLATE_DEFS, MIN_TEMPLATE_ANSWERS } from "../content/templates.ts";
import { normalize, foldCyr } from "../server/text.ts";
import type { RawShard, RawItem } from "./fetch-wikidata.ts";

const MIN_ANSWERS = 30;
const RAW = new URL("../content/raw/", import.meta.url);
const DATA = new URL("../data/", import.meta.url);
mkdirSync(DATA, { recursive: true });
const dbFile = new URL("content.db", DATA);
if (existsSync(dbFile)) rmSync(dbFile);
const db = new DatabaseSync(fileURLToPath(dbFile));
db.exec(`
CREATE TABLE questions (id TEXT PRIMARY KEY, category TEXT, difficulty INT, text_uk TEXT, text_ru TEXT, filler TEXT,
  answer_count INT, source TEXT, query TEXT, fetched_at TEXT, verification TEXT, kind TEXT, template TEXT, base TEXT, letter TEXT, person INT);
CREATE TABLE answers (question_id TEXT, answer_id TEXT, rank INT, sitelinks INT, label_uk TEXT, label_ru TEXT,
  aliases TEXT, merged TEXT, PRIMARY KEY (question_id, answer_id));
CREATE INDEX answers_q ON answers(question_id);
`);

const RU_ONLY = /[ыэъё]/i;
const UK_ONLY = /[іїєґ]/i;
const cleanLabel = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
const key = (s: string) => foldCyr(normalize(s));
const isJunk = (s: string) => !s || /^Q\d+$/.test(s) || s.length > 70;

interface Built { qid: string; sitelinks: number; uk: string; ru: string; aliases: Set<string>; merged: string[] }

const insQ = db.prepare(`INSERT INTO questions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insA = db.prepare(`INSERT INTO answers VALUES (?,?,?,?,?,?,?,?)`);
const report: { id: string; category: string; raw: number; locRejected: number; merged: number; answers: number; included: boolean; missing?: boolean; template?: string }[] = [];

// every question source — broad definitions and expanded templates — goes through the same pipeline
interface Source { id: string; category: string; difficulty: number; uk: string; ru: string; person?: boolean; filler?: string[]; min: number; kind: "broad" | "template"; template?: string; shard: RawShard | null }
const sources: Source[] = [];
for (const def of QUESTION_DEFS) {
  const file = new URL(`${def.id}.json`, RAW);
  sources.push({ ...def, min: MIN_ANSWERS, kind: "broad", shard: existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null });
}
const TPL = new URL("../content/raw-tpl/", import.meta.url);
const textsSeen = new Set(QUESTION_DEFS.flatMap((d) => [d.uk, d.ru]));
for (const t of TEMPLATE_DEFS) {
  const dir = new URL(`${t.id}/`, TPL);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    let sh: any;
    try { sh = JSON.parse(readFileSync(new URL(name, dir), "utf8")); } catch { continue; }
    if (textsSeen.has(sh.text.uk) || textsSeen.has(sh.text.ru)) continue; // question text must stay unique
    textsSeen.add(sh.text.uk); textsSeen.add(sh.text.ru);
    sources.push({ id: sh.id, category: sh.category, difficulty: t.difficulty, /* current template setting, not the one at fetch time */ uk: sh.text.uk, ru: sh.text.ru, person: sh.person, filler: sh.filler,
      min: MIN_TEMPLATE_ANSWERS, kind: "template", template: t.id, shard: sh.skipped ? { ...sh, items: [] } : sh });
  }
}

// ── letter questions: "Назовите птицу на букву «К»" — a subset of a broad question's verified answers ──
export const LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЮЯ".split("");
export const MIN_LETTER_ANSWERS = 15;
const fold1 = (w: string) => w.toUpperCase().replace("Ё", "Е").replace("Є", "Е").replace("І", "И").replace("Ї", "И")[0];
const initials = (label: string, person: boolean) => { const w = label.trim().split(/[\s-]+/).filter(Boolean); return person && w.length > 1 ? [fold1(w[0]), fold1(w[w.length - 1])] : [fold1(label.trim())]; };
const startsWith = (a: { uk: string; ru: string }, L: string, person: boolean) => initials(a.ru, person).includes(L) || initials(a.uk, person).includes(L);
const letterReport: { base: string; letters: number; questions: number }[] = [];
function addLetterQuestions(def: Source, built: Built[], fillerSet: string[], shard: RawShard) {
  const baseUk = def.uk.replace(/\s*\([^)]*\)\s*$/, ""), baseRu = def.ru.replace(/\s*\([^)]*\)\s*$/, "");
  let made = 0;
  for (const L of LETTERS) {
    const n = built.filter((b) => startsWith(b, L, !!def.person)).length;
    if (n < MIN_LETTER_ANSWERS) continue;
    insQ.run(`${def.id}~${L}`, def.category, def.difficulty, def.person ? `${baseUk} — ім'я чи прізвище на «${L}»` : `${baseUk} на літеру «${L}»`, def.person ? `${baseRu} — имя или фамилия на «${L}»` : `${baseRu} на букву «${L}»`, JSON.stringify(fillerSet), n,
      shard.source, shard.query, shard.fetchedAt, JSON.stringify({ subsetOf: def.id, letter: L }), "letter", `letter:${def.id}`, def.id, L, def.person ? 1 : 0);
    made++;
  }
  letterReport.push({ base: def.id, letters: LETTERS.length, questions: made });
}

db.exec("BEGIN");
for (const def of sources) {
  if (!def.shard) { report.push({ id: def.id, category: def.category, raw: 0, locRejected: 0, merged: 0, answers: 0, included: false, missing: true }); continue; }
  const shard: RawShard = def.shard;
  const items = [...shard.items].sort((a, b) => b.sitelinks - a.sitelinks || a.qid.localeCompare(b.qid));
  let locRejected = 0, mergedCount = 0;
  const byKey = new Map<string, Built>();
  const built: Built[] = [];
  for (const it of items as RawItem[]) {
    const uk = cleanLabel(it.uk), ru = cleanLabel(it.ru);
    if (isJunk(uk) || isJunk(ru)) { locRejected++; continue; }
    if (RU_ONLY.test(uk) || UK_ONLY.test(ru)) { locRejected++; continue; }
    const aliasesRaw = [uk, ru, it.en ?? "", ...it.aliases.uk, ...it.aliases.ru, ...it.aliases.en].map(cleanLabel).filter((a) => a && a.length <= 70);
    if (def.person) {
      for (const full of [uk, ru, it.en ?? ""]) {
        const parts = normalize(full).split(" ").filter((p) => p.length >= 3);
        if (parts.length >= 2) aliasesRaw.push(parts[parts.length - 1]);
      }
    }
    const k1 = key(uk), k2 = key(ru);
    const existing = byKey.get(k1) ?? byKey.get(k2);
    if (existing) {
      // same visible name → same answer for players; merge into the more popular item
      for (const a of aliasesRaw) existing.aliases.add(a);
      existing.merged.push(it.qid);
      mergedCount++;
      continue;
    }
    const b: Built = { qid: it.qid, sitelinks: it.sitelinks, uk, ru, aliases: new Set(aliasesRaw), merged: [] };
    byKey.set(k1, b); byKey.set(k2, b);
    built.push(b);
  }
  const included = built.length >= def.min;
  report.push({ id: def.id, category: def.category, raw: items.length, locRejected, merged: mergedCount, answers: built.length, included, template: def.template });
  if (!included) continue;
  const fillerSet = [...new Set((def.filler ?? []).map(key))];
  insQ.run(def.id, def.category, def.difficulty, def.uk, def.ru, JSON.stringify(fillerSet), built.length, shard.source, shard.query, shard.fetchedAt,
    JSON.stringify({ builtAt: new Date().toISOString(), rawItems: items.length, locRejected, merged: mergedCount, checks: ["uk+ru labels present", "script check", "dedup by label"] }),
    def.kind, def.template ?? null, null, null, def.person ? 1 : 0);
  if (def.kind === "broad") addLetterQuestions(def, built, fillerSet, shard);
  built.forEach((b, i) => {
    const aliases = [...new Set([...b.aliases].map((a) => a.trim()))].filter((a) => a.length >= 1);
    insA.run(def.id, b.qid, i + 1, b.sitelinks, b.uk, b.ru, JSON.stringify(aliases), JSON.stringify(b.merged));
  });
}
db.exec("COMMIT");

// ── coverage report ─────────────────────────────────────────
const inc = report.filter((r) => r.included);
const letterTotal = letterReport.reduce((a, r) => a + r.questions, 0);
const total = inc.reduce((s, r) => s + r.answers, 0);
const ge1000 = inc.filter((r) => r.answers >= 1000).length;
const byCat = new Map<string, { q: number; a: number }>();
for (const r of inc) { const c = byCat.get(r.category) ?? { q: 0, a: 0 }; c.q++; c.a += r.answers; byCat.set(r.category, c); }
const lines = [
  "# Content coverage (measured)",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `- Broad question definitions: **${QUESTION_DEFS.length}**, templates: **${TEMPLATE_DEFS.length}**`,
  `- Questions included: **${inc.length}** (broad: ${inc.filter((r) => !r.template).length} with ≥${MIN_ANSWERS} answers; templated: ${inc.filter((r) => r.template).length} with ≥${MIN_TEMPLATE_ANSWERS} answers)`,
  `- Letter questions ("… на букву «К»", subsets of broad questions with ≥${MIN_LETTER_ANSWERS} answers): **${letterTotal}**`,
  `- Question→answer relations: **${total.toLocaleString("en")}**`,
  `- Questions with ≥1000 answers: **${ge1000}**`,
  `- Target: 10,000 questions × 1000 answers. Current coverage: ${(inc.length / 100).toFixed(2)}% of question target, ${(total / 100000).toFixed(3)}% of relation target.`,
  "",
  "Every answer is a Wikidata item with both a Ukrainian and a Russian label. Nothing is hand-invented.",
  "",
  "## By category", "", "| Category | Questions | Answers |", "|---|---:|---:|",
  ...[...byCat].sort().map(([c, v]) => `| ${c} | ${v.q} | ${v.a} |`),
  "", "## By question", "", "| Question | Category | Raw | Loc-rejected | Merged | Answers | Included |", "|---|---|---:|---:|---:|---:|---|",
  ...report.filter((r) => !r.template).map((r) => `| ${r.id} | ${r.category} | ${r.raw} | ${r.locRejected} | ${r.merged} | ${r.answers} | ${r.missing ? "not fetched" : r.included ? "yes" : "no (too few)"} |`),
];
lines.push("", "## Templates (one question per parameter value)", "", "| Template | Candidates | Included | Answers |", "|---|---:|---:|---:|");
for (const t of TEMPLATE_DEFS) {
  const rs = report.filter((r) => r.template === t.id);
  const inc2 = rs.filter((r) => r.included);
  lines.push(`| ${t.id} | ${rs.length} | ${inc2.length} | ${inc2.reduce((a, r) => a + r.answers, 0)} |`);
}
lines.push("", "## Letter questions", "", "| Base question | Letter questions |", "|---|---:|", ...letterReport.filter((r) => r.questions).map((r) => `| ${r.base} | ${r.questions} |`));
writeFileSync(new URL("../content/COVERAGE.md", import.meta.url), lines.join("\n"));
console.log(`letter questions: ${letterTotal}`);
console.log(`included ${inc.length}/${report.length} candidate questions (${inc.filter((r) => r.template).length} templated), ${total} relations, ${ge1000} with ≥1000 answers`);
