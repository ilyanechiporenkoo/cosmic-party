/**
 * Fetches answer spaces from Wikidata for every question definition.
 * Output is sharded: content/raw/<questionId>.json (one file per question).
 * Resumable: existing shards are skipped unless --force or --only=<id>.
 */
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { QUESTION_DEFS, type QuestionDef } from "../content/definitions.ts";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "CosmicPartyContentBuilder/1.0 (educational party game dataset; node fetch)";
const OUT = new URL("../content/raw/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");

export interface RawItem { qid: string; sitelinks: number; uk: string; ru: string; en?: string; aliases: { uk: string[]; ru: string[]; en: string[] } }
export interface RawShard { id: string; fetchedAt: string; source: string; query: string; items: RawItem[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sparql(query: string, attempt = 0): Promise<any[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 70_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "User-Agent": UA, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ query }),
      signal: ctrl.signal,
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 3) throw new Error(`HTTP ${res.status}`);
      const wait = Number(res.headers.get("retry-after") ?? 0) * 1000 || 4000 * (attempt + 1);
      await sleep(wait);
      return sparql(query, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json: any = await res.json();
    return json.results.bindings;
  } catch (e: any) {
    if (attempt < 2 && (e.name === "AbortError" || /fetch failed/.test(e.message))) { await sleep(3000); return sparql(query, attempt + 1); }
    throw e;
  } finally { clearTimeout(t); }
}

// Stage 1: candidate items ranked by sitelinks (no label joins → fast even for big taxonomies)
function mainQuery(d: QuestionDef) {
  return `SELECT DISTINCT ?item ?sl WHERE {
  ${d.where}
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${d.minSitelinks ?? 5})
} ORDER BY DESC(?sl) LIMIT ${Math.round((d.limit ?? 3000) * 1.6)}`;
}

// Stage 2: labels + aliases in batches. Wikidata increasingly stores shared names ("Python") only
// under the multilingual "mul" label, so uk/ru fall back to mul.
async function fetchDef(d: QuestionDef): Promise<RawShard> {
  const query = mainQuery(d);
  const rows = await sparql(query);
  const ranked: { qid: string; sl: number }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const qid = r.item.value.split("/").pop()!;
    if (seen.has(qid)) continue;
    seen.add(qid); ranked.push({ qid, sl: Number(r.sl.value) });
  }
  type Lab = { uk?: string; ru?: string; mul?: string; en?: string; alt: { uk: string[]; ru: string[]; en: string[] } };
  const labs = new Map<string, Lab>();
  for (let i = 0; i < ranked.length; i += 300) {
    const batch = ranked.slice(i, i + 300);
    const lq = `SELECT ?item ?p ?l WHERE { VALUES ?item { ${batch.map((b) => "wd:" + b.qid).join(" ")} } VALUES ?p { rdfs:label skos:altLabel }
      ?item ?p ?l . FILTER(LANG(?l) IN ("uk","ru","en","mul")) }`;
    for (const r of await sparql(lq)) {
      const qid = r.item.value.split("/").pop()!;
      let L = labs.get(qid);
      if (!L) labs.set(qid, (L = { alt: { uk: [], ru: [], en: [] } }));
      const lang = r.l["xml:lang"] as "uk" | "ru" | "en" | "mul";
      if (r.p.value.endsWith("#label")) L[lang] = r.l.value;
      else { const k = lang === "mul" ? "en" : lang; if (L.alt[k].length < 25) L.alt[k].push(r.l.value); }
    }
    await sleep(250);
  }
  const items: RawItem[] = [];
  for (const { qid, sl } of ranked) {
    const L = labs.get(qid);
    const uk = L?.uk ?? L?.mul, ru = L?.ru ?? L?.mul;
    if (!L || !uk || !ru) continue;
    items.push({ qid, sitelinks: sl, uk, ru, en: L.en ?? L.mul, aliases: L.alt });
    if (items.length >= (d.limit ?? 3000)) break;
  }
  return { id: d.id, fetchedAt: new Date().toISOString(), source: "Wikidata (query.wikidata.org), CC0", query, items };
}

const defs = QUESTION_DEFS.filter((d) => !only || only.includes(d.id));
let ok = 0, fail = 0;
const queue = [...defs];
const CONCURRENCY = Number(args.find((a) => a.startsWith("--parallel="))?.slice(11) ?? 3); // polite: Wikidata allows a few parallel queries per client
async function worker() {
  for (let d = queue.shift(); d; d = queue.shift()) {
    const file = new URL(`${d.id}.json`, OUT);
    if (existsSync(file) && !force && !only) { ok++; continue; }
    const t0 = Date.now();
    try {
      const shard = await fetchDef(d);
      writeFileSync(file, JSON.stringify(shard));
      ok++;
      console.log(`✓ ${d.id.padEnd(24)} ${String(shard.items.length).padStart(5)} items  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e: any) {
      fail++;
      console.log(`✗ ${d.id.padEnd(24)} ${String(e.message).slice(0, 160)}`);
    }
    await sleep(500);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${ok} ok, ${fail} failed`);
