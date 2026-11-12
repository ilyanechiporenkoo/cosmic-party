/**
 * Expands content/templates.ts into concrete questions using Wikidata.
 *   phase 1: discover parameter values per template (count query, cached in _params.json)
 *   phase 2: per parameter, fetch items ranked by sitelinks + uk/ru labels and aliases
 * Output: content/raw-tpl/<template>/<param>.json (one shard per question; resumable).
 * Flags: --only=tpl1,tpl2  --parallel=3  --force
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { TEMPLATE_DEFS, MIN_TEMPLATE_ANSWERS, type TemplateDef } from "../content/templates.ts";
import type { Loc } from "../shared/types.ts";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "CosmicPartyContentBuilder/1.0 (educational party game dataset; node fetch)";
const ROOT = new URL("../content/raw-tpl/", import.meta.url);
mkdirSync(ROOT, { recursive: true });
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const force = args.includes("--force");
const PARALLEL = Number(args.find((a) => a.startsWith("--parallel="))?.slice(11) ?? 3);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sparql(query: string, attempt = 0, maxAttempts = 4): Promise<any[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 70_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "User-Agent": UA, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ query }), signal: ctrl.signal,
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= maxAttempts) throw new Error(`HTTP ${res.status}`);
      const wait = Number(res.headers.get("retry-after") ?? 0) * 1000 || 5000 * (attempt + 1);
      await sleep(wait);
      return sparql(query, attempt + 1, maxAttempts);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as any).results.bindings;
  } catch (e: any) {
    if (attempt < Math.min(3, maxAttempts) && (e.name === "AbortError" || /fetch failed|terminated|JSON/.test(String(e.message)))) { await sleep(4000); return sparql(query, attempt + 1, maxAttempts); }
    throw e;
  } finally { clearTimeout(t); }
}
const qidOf = (uri: string) => uri.split("/").pop()!;

// ── labels with an in-process cache (people/places recur across templates) ──
type Lab = { uk?: string; ru?: string; mul?: string; en?: string; alt: { uk: string[]; ru: string[]; en: string[] } };
const labelCache = new Map<string, Lab>();
async function labels(qids: string[]): Promise<Map<string, Lab>> {
  const need = qids.filter((q) => !labelCache.has(q));
  for (let i = 0; i < need.length; i += 300) {
    const batch = need.slice(i, i + 300);
    const rows = await sparql(`SELECT ?item ?p ?l WHERE { VALUES ?item { ${batch.map((b) => "wd:" + b).join(" ")} } VALUES ?p { rdfs:label skos:altLabel }
      ?item ?p ?l . FILTER(LANG(?l) IN ("uk","ru","en","mul")) }`);
    for (const b of batch) labelCache.set(b, { alt: { uk: [], ru: [], en: [] } });
    for (const r of rows) {
      const L = labelCache.get(qidOf(r.item.value))!;
      const lang = r.l["xml:lang"] as "uk" | "ru" | "en" | "mul";
      if (r.p.value.endsWith("#label")) L[lang] = r.l.value;
      else { const k = lang === "mul" ? "en" : lang; if (L.alt[k].length < 20) L.alt[k].push(r.l.value); }
    }
  }
  return new Map(qids.map((q) => [q, labelCache.get(q)!]));
}
const ukru = (L?: Lab) => (L && (L.uk ?? L.mul) && (L.ru ?? L.mul) ? { uk: (L.uk ?? L.mul)!, ru: (L.ru ?? L.mul)! } : null);

// ── phase 1: parameters ───────────────────────────────────
interface Param { key: string; sparql: string; label: Loc }
let countriesCache: Param[] | null = null;
async function allCountries(): Promise<Param[]> {
  if (countriesCache) return countriesCache;
  const f = new URL("_countries.json", ROOT);
  if (existsSync(f)) return (countriesCache = JSON.parse(readFileSync(f, "utf8")));
  const rows = await sparql(`SELECT DISTINCT ?c WHERE { ?c wdt:P31 wd:Q3624078 ; wikibase:sitelinks ?sl . FILTER(?sl >= 120) }`);
  const ids = rows.map((r) => qidOf(r.c.value));
  const L = await labels(ids);
  countriesCache = ids.flatMap((q) => { const l = ukru(L.get(q)); return l ? [{ key: q, sparql: "wd:" + q, label: l }] : []; });
  writeFileSync(f, JSON.stringify(countriesCache));
  return countriesCache;
}

async function params(t: TemplateDef): Promise<Param[]> {
  const dir = new URL(`${t.id}/`, ROOT);
  mkdirSync(dir, { recursive: true });
  const f = new URL("_params.json", dir);
  if (existsSync(f) && !force) return JSON.parse(readFileSync(f, "utf8"));
  let out: Param[] = [];
  if (t.params.kind === "year") {
    for (let y = t.params.from; y <= t.params.to; y++) out.push({ key: String(y), sparql: String(y), label: { uk: String(y), ru: String(y) } });
  } else {
    const top = t.params.kind === "query" ? t.params.top : 200;
    const minCount = t.params.minCount ?? MIN_TEMPLATE_ANSWERS + 5;
    try {
      const rows = await sparql(`SELECT ?param (COUNT(DISTINCT ?item) AS ?n) WHERE { ${t.where("?param")}
        ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${t.minSitelinks}) FILTER(isIRI(?param)) }
        GROUP BY ?param HAVING (COUNT(DISTINCT ?item) >= ${minCount}) ORDER BY DESC(?n) LIMIT ${top}`, 0, 1);
      const ids = rows.map((r) => qidOf(r.param.value)).filter((q) => /^Q\d+$/.test(q));
      const L = await labels(ids);
      out = ids.flatMap((q) => { const l = ukru(L.get(q)); return l ? [{ key: q, sparql: "wd:" + q, label: l }] : []; });
      console.log(`  ${t.id}: ${out.length} parameter values discovered`);
    } catch (e: any) {
      if (t.params.kind !== "country") throw e;
      out = await allCountries(); // count query too heavy → try every major state; thin ones are dropped later
      console.log(`  ${t.id}: count query failed (${e.message}); falling back to ${out.length} countries`);
    }
  }
  writeFileSync(f, JSON.stringify(out));
  return out;
}

// ── phase 2: one question per parameter ───────────────────
async function fetchQuestion(t: TemplateDef, p: Param) {
  const file = new URL(`${t.id}/${p.key}.json`, ROOT);
  if (existsSync(file) && !force) return "cached";
  const limit = t.limit ?? 400;
  const query = `SELECT DISTINCT ?item ?sl WHERE { ${t.where(p.sparql)} ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${t.minSitelinks}) } ORDER BY DESC(?sl) LIMIT ${Math.round(limit * 1.5)}`;
  const rows = await sparql(query);
  const ranked: { qid: string; sl: number }[] = [];
  const seen = new Set<string>();
  for (const r of rows) { const q = qidOf(r.item.value); if (!seen.has(q) && q !== p.key) { seen.add(q); ranked.push({ qid: q, sl: Number(r.sl.value) }); } }
  const meta = { id: `${t.id}-${p.key}`, template: t.id, param: p.key, text: t.text(p.label), category: t.category, difficulty: t.difficulty,
    person: !!t.person, filler: t.filler ?? [], fetchedAt: new Date().toISOString(), source: "Wikidata (query.wikidata.org), CC0", query };
  if (ranked.length < MIN_TEMPLATE_ANSWERS) { writeFileSync(file, JSON.stringify({ ...meta, skipped: true, items: [] })); return "thin"; }
  const L = await labels(ranked.map((r) => r.qid));
  const items = [];
  for (const { qid, sl } of ranked) {
    const lab = L.get(qid); const l = ukru(lab);
    if (!l) continue;
    items.push({ qid, sitelinks: sl, uk: l.uk, ru: l.ru, en: lab!.en ?? lab!.mul, aliases: lab!.alt });
    if (items.length >= limit) break;
  }
  const skipped = items.length < MIN_TEMPLATE_ANSWERS;
  writeFileSync(file, JSON.stringify({ ...meta, skipped, items: skipped ? [] : items }));
  return skipped ? "thin" : "ok";
}

const templates = TEMPLATE_DEFS.filter((t) => !only || only.includes(t.id));
const pending = [...templates];
const tasks: [TemplateDef, Param][] = [];
let discovering = templates.length;
async function discover() {
  for (let t = pending.shift(); t; t = pending.shift()) {
    try { const ps = await params(t); for (const p of ps) tasks.push([t, p]); }
    catch (e: any) { console.log(`✗ ${t.id}: parameter discovery failed: ${String(e.message).slice(0, 120)}`); }
    discovering--;
  }
}
const stats = { ok: 0, thin: 0, cached: 0, failed: 0 };
let done = 0;
async function worker() {
  for (;;) {
    const task = tasks.shift();
    if (!task) { if (discovering <= 0) return; await sleep(1000); continue; }
    const [t, p] = task;
    try { stats[(await fetchQuestion(t, p)) as "ok" | "thin" | "cached"]++; }
    catch (e: any) { stats.failed++; console.log(`✗ ${t.id}/${p.key}: ${String(e.message).slice(0, 100)}`); }
    if (++done % 50 === 0) console.log(`  … ${done} processed ${JSON.stringify(stats)}`);
    await sleep(150);
  }
}
// ≤ 5 concurrent queries in total (Wikidata's per-client limit): 2 discovery + PARALLEL question workers
await Promise.all([discover(), discover(), ...Array.from({ length: Math.max(1, PARALLEL - 2) }, worker)]);
console.log(`done ${JSON.stringify(stats)}`);
