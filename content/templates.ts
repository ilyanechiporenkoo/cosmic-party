/**
 * Parametric question templates. One template ("Назовите город — <страна>") expands into many
 * questions, one per parameter value (a country, a year, a genre, a club…). Every answer is still
 * a real Wikidata item with Ukrainian + Russian labels; a question is kept only if it reaches
 * MIN_TEMPLATE_ANSWERS verified answers.
 */
import type { CategoryId, Loc } from "../shared/types.ts";

export const MIN_TEMPLATE_ANSWERS = 40;

export type ParamSource =
  | { kind: "country"; minCount?: number }                 // countries discovered by a count query (fallback: all major states)
  | { kind: "year"; from: number; to: number }              // a numeric range
  | { kind: "query"; top: number; minCount?: number };      // values discovered by a count query (genres, clubs, cities…)

export interface TemplateDef {
  id: string;
  category: CategoryId;
  difficulty: 1 | 2 | 3;
  params: ParamSource;
  /** SPARQL pattern binding ?item for parameter `p` ("wd:Q142" or a year as string). Use "?param" to discover values. */
  where: (p: string) => string;
  text: (label: Loc) => Loc;
  minSitelinks: number;
  limit?: number;
  person?: boolean;
  filler?: string[];
}

const yr = (y: string, prop: string) => {
  const n = Number(y);
  return `?item wdt:${prop} ?d . FILTER(?d >= "${n}-01-01T00:00:00Z"^^xsd:dateTime && ?d < "${n + 1}-01-01T00:00:00Z"^^xsd:dateTime)`;
};
const country = (uk: string, ru: string) => (l: Loc): Loc => ({ uk: `${l.uk}: ${uk}`, ru: `${l.ru}: ${ru}` });
const occ = (q: string) => (p: string) => `?item wdt:P106 wd:${q} ; wdt:P27 ${p} .`;
const BANDS = "VALUES ?bc { wd:Q215380 wd:Q5741069 wd:Q9212979 } ?item wdt:P31 ?bc";

export const TEMPLATE_DEFS: TemplateDef[] = [
  // ── by country ───────────────────────────────────────────
  { id: "c-city", category: "countries", difficulty: 2, params: { kind: "country" }, minSitelinks: 4,
    where: (p) => `?item wdt:P17 ${p} ; wdt:P31/wdt:P279* wd:Q515 .`, text: country("назвіть місто", "назовите город"), filler: ["місто", "город"] },
  { id: "c-river", category: "geography", difficulty: 2, params: { kind: "country" }, minSitelinks: 2,
    where: (p) => `?item wdt:P31 wd:Q4022 ; wdt:P17 ${p} .`, text: country("назвіть річку", "назовите реку"), filler: ["річка", "река"] },
  { id: "c-mountain", category: "geography", difficulty: 3, params: { kind: "country" }, minSitelinks: 2,
    where: (p) => `VALUES ?mc { wd:Q8502 wd:Q207326 } ?item wdt:P31 ?mc ; wdt:P17 ${p} .`, text: country("назвіть гору", "назовите гору"), filler: ["гора", "пік", "пик"] },
  { id: "c-lake", category: "geography", difficulty: 3, params: { kind: "country" }, minSitelinks: 2,
    where: (p) => `?item wdt:P31 wd:Q23397 ; wdt:P17 ${p} .`, text: country("назвіть озеро", "назовите озеро"), filler: ["озеро"] },
  { id: "c-island", category: "geography", difficulty: 3, params: { kind: "country" }, minSitelinks: 2,
    where: (p) => `?item wdt:P31 wd:Q23442 ; wdt:P17 ${p} .`, text: country("назвіть острів", "назовите остров"), filler: ["острів", "остров"] },
  { id: "c-footballer", category: "sports", difficulty: 2, params: { kind: "country" }, minSitelinks: 6, person: true,
    where: occ("Q937857"), text: country("назвіть футболіста", "назовите футболиста") },
  { id: "c-hockey", category: "sports", difficulty: 3, params: { kind: "country" }, minSitelinks: 5, person: true,
    where: occ("Q11774891"), text: country("назвіть хокеїста", "назовите хоккеиста") },
  { id: "c-tennis", category: "sports", difficulty: 3, params: { kind: "country" }, minSitelinks: 5, person: true,
    where: occ("Q10833314"), text: country("назвіть тенісиста чи тенісистку", "назовите теннисиста или теннисистку") },
  { id: "c-basketball", category: "sports", difficulty: 3, params: { kind: "country" }, minSitelinks: 5, person: true,
    where: occ("Q3665646"), text: country("назвіть баскетболіста", "назовите баскетболиста") },
  { id: "c-cyclist", category: "sports", difficulty: 3, params: { kind: "country" }, minSitelinks: 5, person: true,
    where: occ("Q2309784"), text: country("назвіть велогонщика", "назовите велогонщика") },
  { id: "c-chess", category: "sports", difficulty: 3, params: { kind: "country" }, minSitelinks: 4, person: true,
    where: occ("Q10873124"), text: country("назвіть шахіста чи шахістку", "назовите шахматиста или шахматистку") },
  { id: "c-writer", category: "literature", difficulty: 2, params: { kind: "country" }, minSitelinks: 8, person: true,
    where: occ("Q36180"), text: country("назвіть письменника чи письменницю", "назовите писателя или писательницу") },
  { id: "c-poet", category: "literature", difficulty: 3, params: { kind: "country" }, minSitelinks: 6, person: true,
    where: occ("Q49757"), text: country("назвіть поета чи поетесу", "назовите поэта или поэтессу") },
  { id: "c-painter", category: "general", difficulty: 3, params: { kind: "country" }, minSitelinks: 6, person: true,
    where: occ("Q1028181"), text: country("назвіть художника чи художницю", "назовите художника или художницу") },
  { id: "c-composer", category: "music", difficulty: 3, params: { kind: "country" }, minSitelinks: 6, person: true,
    where: occ("Q36834"), text: country("назвіть композитора", "назовите композитора") },
  { id: "c-singer", category: "music", difficulty: 2, params: { kind: "country" }, minSitelinks: 6, person: true,
    where: occ("Q177220"), text: country("назвіть співака чи співачку", "назовите певца или певицу") },
  { id: "c-actor", category: "movies", difficulty: 2, params: { kind: "country" }, minSitelinks: 8, person: true,
    where: occ("Q33999"), text: country("назвіть актора чи акторку", "назовите актёра или актрису") },
  { id: "c-director", category: "movies", difficulty: 3, params: { kind: "country" }, minSitelinks: 6, person: true,
    where: occ("Q2526255"), text: country("назвіть кінорежисера", "назовите кинорежиссёра") },
  { id: "c-scientist", category: "science", difficulty: 3, params: { kind: "country" }, minSitelinks: 8, person: true,
    where: (p) => `VALUES ?so { wd:Q169470 wd:Q593644 wd:Q170790 wd:Q864503 wd:Q11063 } ?item wdt:P106 ?so ; wdt:P27 ${p} .`,
    text: country("назвіть науковця", "назовите учёного") },
  { id: "c-film", category: "movies", difficulty: 2, params: { kind: "country" }, minSitelinks: 6,
    where: (p) => `?item wdt:P31 wd:Q11424 ; wdt:P495 ${p} .`, text: country("назвіть фільм", "назовите фильм"), filler: ["фільм", "фильм"] },
  { id: "c-tvseries", category: "movies", difficulty: 3, params: { kind: "country" }, minSitelinks: 4,
    where: (p) => `?item wdt:P31 wd:Q5398426 ; wdt:P495 ${p} .`, text: country("назвіть серіал", "назовите сериал"), filler: ["серіал", "сериал"] },
  { id: "c-band", category: "music", difficulty: 2, params: { kind: "country" }, minSitelinks: 4,
    where: (p) => `${BANDS} ; wdt:P495 ${p} .`, text: country("назвіть музичний гурт", "назовите музыкальную группу"), filler: ["гурт", "группа"] },
  { id: "c-club", category: "sports", difficulty: 2, params: { kind: "country" }, minSitelinks: 3,
    where: (p) => `?item wdt:P31 wd:Q476028 ; wdt:P17 ${p} .`, text: country("назвіть футбольний клуб", "назовите футбольный клуб"), filler: ["фк", "клуб"] },
  { id: "c-castle", category: "history", difficulty: 3, params: { kind: "country" }, minSitelinks: 3,
    where: (p) => `?item wdt:P31 wd:Q23413 ; wdt:P17 ${p} .`, text: country("назвіть замок", "назовите замок"), filler: ["замок"] },
  { id: "c-museum", category: "general", difficulty: 3, params: { kind: "country" }, minSitelinks: 4,
    where: (p) => `?item wdt:P31 wd:Q33506 ; wdt:P17 ${p} .`, text: country("назвіть музей", "назовите музей"), filler: ["музей"] },
  { id: "c-university", category: "general", difficulty: 3, params: { kind: "country" }, minSitelinks: 4,
    where: (p) => `?item wdt:P31 wd:Q3918 ; wdt:P17 ${p} .`, text: country("назвіть університет", "назовите университет"), filler: ["університет", "университет"] },
  { id: "c-airport", category: "transport", difficulty: 3, params: { kind: "country" }, minSitelinks: 3,
    where: (p) => `?item wdt:P31 wd:Q1248784 ; wdt:P17 ${p} .`, text: country("назвіть аеропорт", "назовите аэропорт"), filler: ["аеропорт", "аэропорт"] },
  { id: "c-company", category: "technology", difficulty: 3, params: { kind: "country" }, minSitelinks: 10,
    where: (p) => `VALUES ?cc { wd:Q4830453 wd:Q6881511 wd:Q891723 } ?item wdt:P31 ?cc ; wdt:P17 ${p} .`,
    text: country("назвіть компанію", "назовите компанию"), filler: ["компанія", "компания"] },
  { id: "c-dish", category: "food", difficulty: 2, params: { kind: "country" }, minSitelinks: 3,
    where: (p) => `?item wdt:P31/wdt:P279* wd:Q746549 ; wdt:P495 ${p} .`, text: country("назвіть страву", "назовите блюдо"), filler: ["страва", "блюдо"] },

  // ── by year ──────────────────────────────────────────────
  { id: "y-film", category: "movies", difficulty: 2, params: { kind: "year", from: 1925, to: 2025 }, minSitelinks: 6,
    where: (y) => `?item wdt:P31 wd:Q11424 . ${yr(y, "P577")}`, text: (l) => ({ uk: `Назвіть фільм ${l.uk} року`, ru: `Назовите фильм ${l.ru} года` }), filler: ["фільм", "фильм"] },
  { id: "y-game", category: "games", difficulty: 2, params: { kind: "year", from: 1980, to: 2025 }, minSitelinks: 4,
    where: (y) => `?item wdt:P31 wd:Q7889 . ${yr(y, "P577")}`, text: (l) => ({ uk: `Назвіть відеогру ${l.uk} року`, ru: `Назовите видеоигру ${l.ru} года` }), filler: ["гра", "игра"] },
  { id: "y-album", category: "music", difficulty: 3, params: { kind: "year", from: 1960, to: 2025 }, minSitelinks: 4,
    where: (y) => `?item wdt:P31 wd:Q482994 . ${yr(y, "P577")}`, text: (l) => ({ uk: `Назвіть музичний альбом ${l.uk} року`, ru: `Назовите музыкальный альбом ${l.ru} года` }), filler: ["альбом"] },
  { id: "y-song", category: "music", difficulty: 2, params: { kind: "year", from: 1955, to: 2025 }, minSitelinks: 4,
    where: (y) => `VALUES ?sc { wd:Q7366 wd:Q134556 } ?item wdt:P31 ?sc . ${yr(y, "P577")}`, text: (l) => ({ uk: `Назвіть пісню ${l.uk} року`, ru: `Назовите песню ${l.ru} года` }), filler: ["пісня", "песня"] },
  { id: "y-series", category: "movies", difficulty: 3, params: { kind: "year", from: 1970, to: 2025 }, minSitelinks: 4,
    where: (y) => `?item wdt:P31 wd:Q5398426 . ${yr(y, "P580")}`, text: (l) => ({ uk: `Назвіть серіал, що вийшов ${l.uk} року`, ru: `Назовите сериал, вышедший в ${l.ru} году` }), filler: ["серіал", "сериал"] },
  { id: "y-born", category: "general", difficulty: 2, params: { kind: "year", from: 1900, to: 2006 }, minSitelinks: 30, person: true,
    where: (y) => `?item wdt:P31 wd:Q5 . ${yr(y, "P569")}`, text: (l) => ({ uk: `Назвіть відому людину, яка народилася ${l.uk} року`, ru: `Назовите знаменитость, родившуюся в ${l.ru} году` }) },
  { id: "y-died", category: "history", difficulty: 3, params: { kind: "year", from: 1900, to: 2025 }, minSitelinks: 35, person: true,
    where: (y) => `?item wdt:P31 wd:Q5 . ${yr(y, "P570")}`, text: (l) => ({ uk: `Назвіть відому людину, яка померла ${l.uk} року`, ru: `Назовите известного человека, умершего в ${l.ru} году` }) },

  // ── by discovered value (genre, club, city, university, universe, collection) ─────
  { id: "q-film-genre", category: "movies", difficulty: 2, params: { kind: "query", top: 40 }, minSitelinks: 10,
    where: (p) => `?item wdt:P31 wd:Q11424 ; wdt:P136 ${p} .`, text: (l) => ({ uk: `Жанр «${l.uk}»: назвіть фільм`, ru: `Жанр «${l.ru}»: назовите фильм` }), filler: ["фільм", "фильм"] },
  { id: "q-game-genre", category: "games", difficulty: 2, params: { kind: "query", top: 30 }, minSitelinks: 5,
    where: (p) => `?item wdt:P31 wd:Q7889 ; wdt:P136 ${p} .`, text: (l) => ({ uk: `Жанр «${l.uk}»: назвіть відеогру`, ru: `Жанр «${l.ru}»: назовите видеоигру` }), filler: ["гра", "игра"] },
  { id: "q-musician-genre", category: "music", difficulty: 2, params: { kind: "query", top: 30 }, minSitelinks: 30, person: true,
    where: (p) => `?item wdt:P31 wd:Q5 ; wdt:P136 ${p} .`, text: (l) => ({ uk: `Жанр «${l.uk}»: назвіть виконавця`, ru: `Жанр «${l.ru}»: назовите исполнителя` }) },
  { id: "q-band-genre", category: "music", difficulty: 2, params: { kind: "query", top: 30 }, minSitelinks: 6,
    where: (p) => `${BANDS} ; wdt:P136 ${p} .`, text: (l) => ({ uk: `Жанр «${l.uk}»: назвіть гурт`, ru: `Жанр «${l.ru}»: назовите группу` }), filler: ["гурт", "группа"] },
  { id: "q-book-genre", category: "literature", difficulty: 3, params: { kind: "query", top: 20 }, minSitelinks: 8,
    where: (p) => `?item wdt:P31 wd:Q7725634 ; wdt:P136 ${p} .`, text: (l) => ({ uk: `Жанр «${l.uk}»: назвіть книжку`, ru: `Жанр «${l.ru}»: назовите книгу` }), filler: ["книга", "книжка"] },
  { id: "q-club-player", category: "sports", difficulty: 2, params: { kind: "query", top: 90 }, minSitelinks: 6, person: true,
    where: (p) => `?item wdt:P54 ${p} ; wdt:P106 wd:Q937857 .`, text: (l) => ({ uk: `Назвіть футболіста, який грав за «${l.uk}»`, ru: `Назовите футболиста, игравшего за «${l.ru}»` }) },
  { id: "q-born-city", category: "countries", difficulty: 3, params: { kind: "query", top: 60 }, minSitelinks: 40, person: true,
    where: (p) => `?item wdt:P19 ${p} ; wdt:P31 wd:Q5 .`, text: (l) => ({ uk: `Назвіть відому людину, яка народилася в місті ${l.uk}`, ru: `Назовите знаменитость, родившуюся в городе ${l.ru}` }) },
  { id: "q-alumni", category: "general", difficulty: 3, params: { kind: "query", top: 30 }, minSitelinks: 40, person: true,
    where: (p) => `?item wdt:P69 ${p} ; wdt:P31 wd:Q5 .`, text: (l) => ({ uk: `Назвіть відомого випускника — ${l.uk}`, ru: `Назовите известного выпускника — ${l.ru}` }) },
  { id: "q-universe", category: "movies", difficulty: 2, params: { kind: "query", top: 40 }, minSitelinks: 3,
    where: (p) => `?item wdt:P1080 ${p} .`, text: (l) => ({ uk: `Назвіть персонажа: ${l.uk}`, ru: `Назовите персонажа: ${l.ru}` }), filler: ["персонаж"] },
  { id: "q-collection", category: "general", difficulty: 3, params: { kind: "query", top: 20 }, minSitelinks: 8,
    where: (p) => `?item wdt:P31 wd:Q3305213 ; wdt:P195 ${p} .`, text: (l) => ({ uk: `Назвіть картину з колекції: ${l.uk}`, ru: `Назовите картину из коллекции: ${l.ru}` }), filler: ["картина"] },
];
