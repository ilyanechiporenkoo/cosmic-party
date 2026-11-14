/**
 * Question definitions. Every question is backed by a structured Wikidata query:
 * answers are real Wikidata items that have BOTH a Ukrainian and a Russian label.
 * Nothing here is hand-typed answer data — the answer space comes from the source.
 */
import type { CategoryId } from "../shared/types.ts";

export interface QuestionDef {
  id: string;
  category: CategoryId;
  difficulty: 1 | 2 | 3;
  uk: string;
  ru: string;
  /** SPARQL graph pattern that binds ?item */
  where: string;
  minSitelinks?: number;
  limit?: number;
  /** answers are people → surname aliases are generated */
  person?: boolean;
  /** extra context words the matcher may ignore ("язык", "scripts", ...) */
  filler?: string[];
}

const inst = (q: string) => `?item wdt:P31 wd:${q} .`;
const instAny = (...qs: string[]) => `VALUES ?cls { ${qs.map((q) => "wd:" + q).join(" ")} } ?item wdt:P31 ?cls .`;
const instSub = (q: string) => `?item wdt:P31/wdt:P279* wd:${q} .`;
const taxon = (q: string, ranks = ["Q7432", "Q34740", "Q35409"]) =>
  `?item wdt:P171+ wd:${q} ; wdt:P105 ?rank . VALUES ?rank { ${ranks.map((r) => "wd:" + r).join(" ")} }`;
// kind of thing: subclasses (гитара ⊂ музыкальный инструмент) and instances alike
const kind = (...qs: string[]) => `VALUES ?root { ${qs.map((q) => "wd:" + q).join(" ")} } { ?item wdt:P279+ ?root } UNION { ?item wdt:P31/wdt:P279* ?root }`;
// lighter variant for big hierarchies: direct instances + subclasses up to two levels down
const kindNear = (...qs: string[]) => `VALUES ?root { ${qs.map((q) => "wd:" + q).join(" ")} } { ?item wdt:P31 ?root } UNION { ?item wdt:P279/wdt:P279? ?root }`;
const occ = (q: string) => `?item wdt:P106 wd:${q} ; wdt:P31 wd:Q5 .`;

export const QUESTION_DEFS: QuestionDef[] = [
  // ── Animals ───────────────────────────────────────────────
  { id: "animal-mammal", category: "animals", difficulty: 1, uk: "Назвіть ссавця", ru: "Назовите млекопитающее", where: taxon("Q7377"), minSitelinks: 3, filler: ["тварина", "животное", "звір", "зверь"] },
  { id: "animal-bird", category: "animals", difficulty: 1, uk: "Назвіть птаха", ru: "Назовите птицу", where: taxon("Q5113"), minSitelinks: 4, filler: ["птах", "птица", "пташка", "птичка"] },
  { id: "animal-reptile", category: "animals", difficulty: 1, uk: "Назвіть плазуна", ru: "Назовите рептилию", where: taxon("Q10811"), minSitelinks: 3 },
  { id: "animal-insect", category: "animals", difficulty: 2, uk: "Назвіть комаху", ru: "Назовите насекомое", where: taxon("Q1390"), minSitelinks: 6, filler: ["комаха", "насекомое", "жук"] },
  { id: "animal-fish", category: "animals", difficulty: 1, uk: "Назвіть рибу", ru: "Назовите рыбу", where: taxon("Q127282"), minSitelinks: 4, filler: ["риба", "рыба"] },
  { id: "animal-amphibian", category: "animals", difficulty: 3, uk: "Назвіть земноводне", ru: "Назовите земноводное", where: taxon("Q10908"), minSitelinks: 3 },
  { id: "animal-arachnid", category: "animals", difficulty: 3, uk: "Назвіть павукоподібне", ru: "Назовите паукообразное", where: taxon("Q1358"), minSitelinks: 3 },
  { id: "animal-butterfly", category: "animals", difficulty: 3, uk: "Назвіть метелика", ru: "Назовите бабочку", where: taxon("Q28319"), minSitelinks: 5 },
  { id: "animal-dinosaur", category: "animals", difficulty: 1, uk: "Назвіть динозавра", ru: "Назовите динозавра", where: taxon("Q430", ["Q34740", "Q7432"]), minSitelinks: 3 },
  { id: "animal-dog-breed", category: "animals", difficulty: 1, uk: "Назвіть породу собак", ru: "Назовите породу собак", where: inst("Q39367"), minSitelinks: 2, filler: ["порода", "собака", "пес", "пёс"] },
  { id: "animal-cat-breed", category: "animals", difficulty: 1, uk: "Назвіть породу кішок", ru: "Назовите породу кошек", where: inst("Q43577"), minSitelinks: 2, filler: ["порода", "кіт", "кот", "кішка", "кошка"] },
  { id: "animal-horse-breed", category: "animals", difficulty: 3, uk: "Назвіть породу коней", ru: "Назовите породу лошадей", where: inst("Q1160573"), minSitelinks: 2, filler: ["порода"] },

  // ── Geography ─────────────────────────────────────────────
  { id: "geo-river", category: "geography", difficulty: 1, uk: "Назвіть річку", ru: "Назовите реку", where: inst("Q4022"), minSitelinks: 10, filler: ["річка", "река", "ріка"] },
  { id: "geo-lake", category: "geography", difficulty: 1, uk: "Назвіть озеро", ru: "Назовите озеро", where: inst("Q23397"), minSitelinks: 8, filler: ["озеро"] },
  { id: "geo-mountain", category: "geography", difficulty: 1, uk: "Назвіть гору або вершину", ru: "Назовите гору или вершину", where: instAny("Q8502", "Q207326"), minSitelinks: 8, filler: ["гора", "пік", "пик", "вершина"] },
  { id: "geo-island", category: "geography", difficulty: 1, uk: "Назвіть острів", ru: "Назовите остров", where: inst("Q23442"), minSitelinks: 10, filler: ["острів", "остров"] },
  { id: "geo-sea", category: "geography", difficulty: 1, uk: "Назвіть море", ru: "Назовите море", where: instAny("Q165", "Q9430"), minSitelinks: 2, filler: ["море", "океан"] },
  { id: "geo-volcano", category: "geography", difficulty: 3, uk: "Назвіть вулкан", ru: "Назовите вулкан", where: instAny("Q8072", "Q169358", "Q212057"), minSitelinks: 3, filler: ["вулкан"] },
  { id: "geo-desert", category: "geography", difficulty: 3, uk: "Назвіть пустелю", ru: "Назовите пустыню", where: inst("Q8514"), minSitelinks: 2, filler: ["пустеля", "пустыня"] },
  { id: "geo-mountain-range", category: "geography", difficulty: 2, uk: "Назвіть гірський хребет або гори", ru: "Назовите горный хребет или горы", where: instAny("Q46831", "Q1437459"), minSitelinks: 6, filler: ["гори", "горы", "хребет"] },
  { id: "geo-peninsula", category: "geography", difficulty: 3, uk: "Назвіть півострів", ru: "Назовите полуостров", where: inst("Q34763"), minSitelinks: 4, filler: ["півострів", "полуостров"] },
  { id: "geo-waterfall", category: "nature", difficulty: 3, uk: "Назвіть водоспад", ru: "Назовите водопад", where: inst("Q34038"), minSitelinks: 3, filler: ["водоспад", "водопад"] },
  { id: "geo-cave", category: "nature", difficulty: 3, uk: "Назвіть печеру", ru: "Назовите пещеру", where: inst("Q35509"), minSitelinks: 3, filler: ["печера", "пещера"] },
  { id: "geo-national-park", category: "nature", difficulty: 3, uk: "Назвіть національний парк", ru: "Назовите национальный парк", where: inst("Q46169"), minSitelinks: 5, filler: ["парк", "національний", "национальный"] },
  { id: "geo-glacier", category: "nature", difficulty: 3, uk: "Назвіть льодовик", ru: "Назовите ледник", where: inst("Q35666"), minSitelinks: 3, filler: ["льодовик", "ледник"] },

  // ── Countries & cities ────────────────────────────────────
  { id: "country-any", category: "countries", difficulty: 1, uk: "Назвіть країну", ru: "Назовите страну", where: instAny("Q3624078", "Q6256"), minSitelinks: 30, filler: ["країна", "страна", "держава", "государство"] },
  { id: "country-historical", category: "history", difficulty: 2, uk: "Назвіть державу, якої більше не існує", ru: "Назовите государство, которого больше нет", where: inst("Q3024240"), minSitelinks: 12, filler: ["держава", "государство", "імперія", "империя"] },
  { id: "city-big", category: "countries", difficulty: 1, uk: "Назвіть місто", ru: "Назовите город", where: instSub("Q515"), minSitelinks: 45, filler: ["місто", "город", "м", "г"] },
  { id: "city-capital", category: "countries", difficulty: 1, uk: "Назвіть столицю будь-якої держави", ru: "Назовите столицу любого государства", where: "?country wdt:P36 ?item . ?country wdt:P31 wd:Q3624078 .", minSitelinks: 10, filler: ["столиця", "столица", "місто", "город"] },
  { id: "city-ukraine", category: "countries", difficulty: 1, uk: "Назвіть місто України", ru: "Назовите город Украины", where: "?item wdt:P31 wd:Q7930989 ; wdt:P17 wd:Q212 .", minSitelinks: 3, filler: ["місто", "город"] },
  { id: "city-usa", category: "countries", difficulty: 1, uk: "Назвіть місто США", ru: "Назовите город США", where: "?item wdt:P31/wdt:P279* wd:Q1093829 ; wdt:P17 wd:Q30 .", minSitelinks: 25, filler: ["місто", "город"] },
  { id: "city-germany", category: "countries", difficulty: 2, uk: "Назвіть місто Німеччини", ru: "Назовите город Германии", where: "?item wdt:P31 wd:Q42744322 ; wdt:P17 wd:Q183 .", minSitelinks: 20, filler: ["місто", "город"] },
  { id: "city-france", category: "countries", difficulty: 3, uk: "Назвіть місто чи комуну Франції", ru: "Назовите город или коммуну Франции", where: "?item wdt:P31 wd:Q484170 ; wdt:P17 wd:Q142 .", minSitelinks: 25, filler: ["місто", "город", "комуна", "коммуна"] },
  { id: "city-italy", category: "countries", difficulty: 3, uk: "Назвіть місто чи комуну Італії", ru: "Назовите город или коммуну Италии", where: "?item wdt:P31 wd:Q747074 ; wdt:P17 wd:Q38 .", minSitelinks: 20, filler: ["місто", "город", "комуна", "коммуна"] },
  { id: "city-poland", category: "countries", difficulty: 3, uk: "Назвіть місто Польщі", ru: "Назовите город Польши", where: "?item wdt:P31 wd:Q3558970 ; wdt:P17 wd:Q36 .", minSitelinks: 3, filler: ["місто", "город"] },
  { id: "city-japan", category: "countries", difficulty: 3, uk: "Назвіть місто Японії", ru: "Назовите город Японии", where: "?item wdt:P31/wdt:P279* wd:Q494721 ; wdt:P17 wd:Q17 .", minSitelinks: 12, filler: ["місто", "город"] },
  { id: "city-spain", category: "countries", difficulty: 3, uk: "Назвіть муніципалітет Іспанії", ru: "Назовите муниципалитет Испании", where: "?item wdt:P31 wd:Q2074737 ; wdt:P17 wd:Q29 .", minSitelinks: 20, filler: ["місто", "город"] },
  { id: "geo-airport", category: "transport", difficulty: 3, uk: "Назвіть аеропорт", ru: "Назовите аэропорт", where: inst("Q644371"), minSitelinks: 10, filler: ["аеропорт", "аэропорт"] },

  // ── History ───────────────────────────────────────────────
  { id: "hist-battle", category: "history", difficulty: 2, uk: "Назвіть історичну битву", ru: "Назовите историческую битву", where: inst("Q178561"), minSitelinks: 12, filler: ["битва", "бій", "бой", "сражение", "битва при", "битва под"] },
  { id: "hist-war", category: "history", difficulty: 2, uk: "Назвіть війну", ru: "Назовите войну", where: inst("Q198"), minSitelinks: 8, filler: ["війна", "война"] },
  { id: "hist-greek-deity", category: "history", difficulty: 2, uk: "Назвіть давньогрецьке божество", ru: "Назовите древнегреческое божество", where: instAny("Q22989102", "Q178885"), minSitelinks: 5, filler: ["бог", "богиня"] },
  { id: "hist-roman-emperor", category: "history", difficulty: 3, uk: "Назвіть римського імператора", ru: "Назовите римского императора", where: "?item p:P39/ps:P39 wd:Q842606 .", minSitelinks: 5, person: true, filler: ["імператор", "император"] },
  { id: "hist-castle", category: "history", difficulty: 3, uk: "Назвіть замок", ru: "Назовите замок", where: inst("Q23413"), minSitelinks: 10, filler: ["замок"] },
  { id: "hist-archaeological", category: "history", difficulty: 3, uk: "Назвіть археологічну пам'ятку", ru: "Назовите археологический памятник", where: inst("Q839954"), minSitelinks: 15 },
  { id: "hist-revolution", category: "history", difficulty: 3, uk: "Назвіть революцію чи повстання", ru: "Назовите революцию или восстание", where: instAny("Q10931", "Q124734"), minSitelinks: 8, filler: ["революція", "революция", "повстання", "восстание"] },
  { id: "hist-monarch", category: "history", difficulty: 3, uk: "Назвіть монарха", ru: "Назовите монарха", where: occ("Q116"), minSitelinks: 25, person: true, filler: ["король", "цар", "царь", "королева"] },

  // ── Science ───────────────────────────────────────────────
  { id: "sci-element", category: "science", difficulty: 1, uk: "Назвіть хімічний елемент", ru: "Назовите химический элемент", where: inst("Q11344"), minSitelinks: 0, filler: ["елемент", "элемент", "хімічний", "химический"] },
  { id: "sci-mineral", category: "science", difficulty: 3, uk: "Назвіть мінерал", ru: "Назовите минерал", where: inst("Q12089225"), minSitelinks: 6, filler: ["мінерал", "минерал", "камінь", "камень"] },
  { id: "sci-disease", category: "science", difficulty: 1, uk: "Назвіть хворобу", ru: "Назовите болезнь", where: instSub("Q12136"), minSitelinks: 20, filler: ["хвороба", "болезнь"] },
  { id: "sci-physicist", category: "science", difficulty: 2, uk: "Назвіть фізика", ru: "Назовите физика", where: occ("Q169470"), minSitelinks: 30, person: true },
  { id: "sci-mathematician", category: "science", difficulty: 2, uk: "Назвіть математика", ru: "Назовите математика", where: occ("Q170790"), minSitelinks: 30, person: true },
  { id: "sci-chemist", category: "science", difficulty: 3, uk: "Назвіть хіміка", ru: "Назовите химика", where: occ("Q593644"), minSitelinks: 25, person: true },
  { id: "sci-inventor", category: "science", difficulty: 3, uk: "Назвіть винахідника", ru: "Назовите изобретателя", where: occ("Q205375"), minSitelinks: 25, person: true },
  { id: "sci-unit", category: "science", difficulty: 2, uk: "Назвіть одиницю вимірювання", ru: "Назовите единицу измерения", where: instSub("Q47574"), minSitelinks: 8, filler: ["одиниця", "единица"] },
  { id: "sci-compound", category: "science", difficulty: 3, uk: "Назвіть хімічну сполуку", ru: "Назовите химическое соединение", where: inst("Q11173"), minSitelinks: 25 },
  { id: "sci-bone", category: "science", difficulty: 3, uk: "Назвіть кістку або орган людини", ru: "Назовите кость или орган человека", where: instAny("Q265868", "Q712378", "Q1074"), minSitelinks: 8, filler: ["кістка", "кость", "орган"] },
  { id: "sci-biologist", category: "science", difficulty: 3, uk: "Назвіть біолога", ru: "Назовите биолога", where: occ("Q864503"), minSitelinks: 25, person: true },
  { id: "sci-philosopher", category: "general", difficulty: 2, uk: "Назвіть філософа", ru: "Назовите философа", where: occ("Q4964182"), minSitelinks: 40, person: true },

  // ── Technology & programming ──────────────────────────────
  { id: "prog-language", category: "programming", difficulty: 1, uk: "Назвіть мову програмування", ru: "Назовите язык программирования", where: instSub("Q9143"), minSitelinks: 2, filler: ["мова", "язык", "програмування", "программирования", "programming", "language", "lang", "scripts", "script", "скрипт", "скрипты", "скрипти", "code", "код"] },
  { id: "tech-os", category: "technology", difficulty: 1, uk: "Назвіть операційну систему", ru: "Назовите операционную систему", where: instSub("Q9135"), minSitelinks: 6, filler: ["ос", "os", "система", "операційна", "операционная"] },
  { id: "tech-software", category: "technology", difficulty: 1, uk: "Назвіть комп'ютерну програму", ru: "Назовите компьютерную программу", where: inst("Q7397"), minSitelinks: 12, filler: ["програма", "программа", "app", "додаток", "приложение"] },
  { id: "tech-website", category: "internet", difficulty: 1, uk: "Назвіть вебсайт", ru: "Назовите веб-сайт", where: instSub("Q35127"), minSitelinks: 25, filler: ["сайт", "вебсайт", "com", "www"] },
  { id: "tech-browser", category: "technology", difficulty: 3, uk: "Назвіть вебоглядач", ru: "Назовите веб-браузер", where: instSub("Q6368"), minSitelinks: 3, filler: ["браузер", "оглядач"] },
  { id: "tech-dbms", category: "programming", difficulty: 3, uk: "Назвіть систему керування базами даних", ru: "Назовите систему управления базами данных", where: instSub("Q176165"), minSitelinks: 4, filler: ["база", "бд", "db", "database"] },
  { id: "tech-framework", category: "programming", difficulty: 3, uk: "Назвіть програмний фреймворк", ru: "Назовите программный фреймворк", where: instSub("Q271680"), minSitelinks: 4, filler: ["фреймворк", "framework", "бібліотека", "библиотека"] },
  { id: "tech-company", category: "technology", difficulty: 1, uk: "Назвіть технологічну компанію", ru: "Назовите технологическую компанию", where: "?item wdt:P31/wdt:P279* wd:Q4830453 ; wdt:P452/wdt:P279* wd:Q11661 .", minSitelinks: 20, filler: ["компанія", "компания", "корпорація", "корпорация", "inc"] },
  { id: "tech-file-format", category: "programming", difficulty: 3, uk: "Назвіть формат файлів", ru: "Назовите формат файлов", where: instSub("Q235557"), minSitelinks: 8, filler: ["формат", "файл"] },

  // ── Video games ───────────────────────────────────────────
  { id: "game-video", category: "games", difficulty: 1, uk: "Назвіть відеогру", ru: "Назовите видеоигру", where: instSub("Q7889"), minSitelinks: 15, filler: ["гра", "игра", "game"] },
  { id: "game-console", category: "games", difficulty: 2, uk: "Назвіть ігрову консоль", ru: "Назовите игровую консоль", where: instSub("Q8076"), minSitelinks: 3, filler: ["консоль", "приставка"] },
  { id: "game-character", category: "games", difficulty: 1, uk: "Назвіть персонажа відеогри", ru: "Назовите персонажа видеоигры", where: instSub("Q1569167"), minSitelinks: 8, filler: ["персонаж"] },
  { id: "game-series", category: "games", difficulty: 1, uk: "Назвіть серію відеоігор", ru: "Назовите серию видеоигр", where: inst("Q7058673"), minSitelinks: 10, filler: ["серія", "серия"] },
  { id: "game-developer", category: "games", difficulty: 3, uk: "Назвіть розробника відеоігор", ru: "Назовите разработчика видеоигр", where: inst("Q210167"), minSitelinks: 8, filler: ["студія", "студия"] },
  { id: "game-board", category: "games", difficulty: 1, uk: "Назвіть настільну гру", ru: "Назовите настольную игру", where: instSub("Q131436"), minSitelinks: 8, filler: ["гра", "игра"] },

  // ── Movies & TV ───────────────────────────────────────────
  { id: "film-any", category: "movies", difficulty: 1, uk: "Назвіть фільм", ru: "Назовите фильм", where: instSub("Q11424"), minSitelinks: 35, filler: ["фільм", "фильм", "кіно", "кино"] },
  { id: "film-animated", category: "movies", difficulty: 2, uk: "Назвіть анімаційний фільм", ru: "Назовите анимационный фильм", where: "?item wdt:P31 wd:Q11424 ; wdt:P136 wd:Q202866 .", minSitelinks: 12, filler: ["мультфільм", "мультфильм", "мульт"] },
  { id: "tv-series", category: "movies", difficulty: 1, uk: "Назвіть телесеріал", ru: "Назовите телесериал", where: instSub("Q5398426"), minSitelinks: 20, filler: ["серіал", "сериал"] },
  { id: "tv-animated", category: "movies", difficulty: 2, uk: "Назвіть мультсеріал", ru: "Назовите мультсериал", where: inst("Q581714"), minSitelinks: 10, filler: ["мультсеріал", "мультсериал", "мульт"] },
  { id: "tv-anime", category: "movies", difficulty: 2, uk: "Назвіть аніме", ru: "Назовите аниме", where: instAny("Q63952888", "Q20650540"), minSitelinks: 10, filler: ["аніме", "аниме"] },
  { id: "film-actor", category: "movies", difficulty: 1, uk: "Назвіть актора чи акторку", ru: "Назовите актёра или актрису", where: occ("Q33999"), minSitelinks: 60, person: true },
  { id: "film-director", category: "movies", difficulty: 2, uk: "Назвіть кінорежисера", ru: "Назовите кинорежиссёра", where: occ("Q2526255"), minSitelinks: 45, person: true },
  { id: "film-character", category: "movies", difficulty: 1, uk: "Назвіть персонажа фільму чи серіалу", ru: "Назовите персонажа фильма или сериала", where: instAny("Q15773347", "Q15773317", "Q15711870"), minSitelinks: 10, filler: ["персонаж"] },

  // ── Music ─────────────────────────────────────────────────
  { id: "music-instrument", category: "music", difficulty: 1, uk: "Назвіть музичний інструмент", ru: "Назовите музыкальный инструмент", where: kind("Q34379"), minSitelinks: 6, filler: ["інструмент", "инструмент"] },
  { id: "music-genre", category: "music", difficulty: 1, uk: "Назвіть музичний жанр", ru: "Назовите музыкальный жанр", where: instSub("Q188451"), minSitelinks: 10, filler: ["жанр", "музика", "музыка"] },
  { id: "music-band", category: "music", difficulty: 1, uk: "Назвіть музичний гурт", ru: "Назовите музыкальную группу", where: instSub("Q215380"), minSitelinks: 30, filler: ["гурт", "группа", "band"] },
  { id: "music-singer", category: "music", difficulty: 1, uk: "Назвіть співака чи співачку", ru: "Назовите певца или певицу", where: occ("Q177220"), minSitelinks: 50, person: true },
  { id: "music-composer", category: "music", difficulty: 1, uk: "Назвіть композитора", ru: "Назовите композитора", where: occ("Q36834"), minSitelinks: 35, person: true },
  { id: "music-rapper", category: "music", difficulty: 2, uk: "Назвіть репера", ru: "Назовите рэпера", where: occ("Q2252262"), minSitelinks: 25, person: true },
  { id: "music-album", category: "music", difficulty: 3, uk: "Назвіть музичний альбом", ru: "Назовите музыкальный альбом", where: inst("Q482994"), minSitelinks: 30, filler: ["альбом"] },
  { id: "music-song", category: "music", difficulty: 1, uk: "Назвіть пісню", ru: "Назовите песню", where: instAny("Q7366", "Q134556"), minSitelinks: 30, filler: ["пісня", "песня", "сингл"] },
  { id: "music-opera", category: "music", difficulty: 3, uk: "Назвіть оперу чи балет", ru: "Назовите оперу или балет", where: instAny("Q1344", "Q2742"), minSitelinks: 12, filler: ["опера", "балет"] },

  // ── Food ──────────────────────────────────────────────────
  { id: "food-dish", category: "food", difficulty: 1, uk: "Назвіть страву", ru: "Назовите блюдо", where: kind("Q746549"), minSitelinks: 12, filler: ["страва", "блюдо", "їжа", "еда"] },
  { id: "food-cheese", category: "food", difficulty: 1, uk: "Назвіть сир", ru: "Назовите сыр", where: kind("Q10943"), minSitelinks: 4, filler: ["сир", "сыр"] },
  { id: "food-cocktail", category: "food", difficulty: 2, uk: "Назвіть коктейль", ru: "Назовите коктейль", where: kind("Q134768"), minSitelinks: 4, filler: ["коктейль"] },
  { id: "food-dessert", category: "food", difficulty: 2, uk: "Назвіть десерт", ru: "Назовите десерт", where: kind("Q182940"), minSitelinks: 6, filler: ["десерт", "солодке", "сладкое"] },
  { id: "food-spice", category: "food", difficulty: 2, uk: "Назвіть прянощі чи спецію", ru: "Назовите специю или пряность", where: kind("Q42527"), minSitelinks: 6, filler: ["спеція", "специя", "приправа"] },
  { id: "food-bread", category: "food", difficulty: 3, uk: "Назвіть вид хліба чи випічки", ru: "Назовите вид хлеба или выпечки", where: kind("Q7802"), minSitelinks: 6, filler: ["хліб", "хлеб"] },
  { id: "food-fruit", category: "food", difficulty: 1, uk: "Назвіть фрукт або ягоду", ru: "Назовите фрукт или ягоду", where: instAny("Q3314483", "Q13184", "Q1364"), minSitelinks: 6, filler: ["фрукт", "ягода"] },
  { id: "food-soup", category: "food", difficulty: 2, uk: "Назвіть суп", ru: "Назовите суп", where: instSub("Q41415"), minSitelinks: 4, filler: ["суп"] },
  { id: "food-sauce", category: "food", difficulty: 2, uk: "Назвіть соус", ru: "Назовите соус", where: instSub("Q178359"), minSitelinks: 4, filler: ["соус"] },
  { id: "food-drink", category: "food", difficulty: 1, uk: "Назвіть напій", ru: "Назовите напиток", where: kind("Q40050"), minSitelinks: 15, filler: ["напій", "напиток"] },
  { id: "food-sausage", category: "food", difficulty: 3, uk: "Назвіть ковбасу чи сосиски", ru: "Назовите колбасу или сосиски", where: kind("Q131419"), minSitelinks: 4, filler: ["ковбаса", "колбаса"] },
  { id: "food-pasta", category: "food", difficulty: 3, uk: "Назвіть вид пасти", ru: "Назовите вид пасты", where: kind("Q178"), minSitelinks: 4, filler: ["паста", "макарони", "макароны"] },

  // ── Sports ────────────────────────────────────────────────
  { id: "sport-any", category: "sports", difficulty: 1, uk: "Назвіть вид спорту", ru: "Назовите вид спорта", where: kindNear("Q349", "Q31629"), minSitelinks: 10, filler: ["спорт", "вид"] },
  { id: "sport-club", category: "sports", difficulty: 1, uk: "Назвіть футбольний клуб", ru: "Назовите футбольный клуб", where: inst("Q476028"), minSitelinks: 25, filler: ["фк", "fc", "клуб"] },
  { id: "sport-footballer", category: "sports", difficulty: 1, uk: "Назвіть футболіста", ru: "Назовите футболиста", where: occ("Q937857"), minSitelinks: 45, person: true },
  { id: "sport-tennis", category: "sports", difficulty: 2, uk: "Назвіть тенісиста чи тенісистку", ru: "Назовите теннисиста или теннисистку", where: occ("Q10833314"), minSitelinks: 25, person: true },
  { id: "sport-basketball", category: "sports", difficulty: 2, uk: "Назвіть баскетболіста", ru: "Назовите баскетболиста", where: occ("Q3665646"), minSitelinks: 25, person: true },
  { id: "sport-chess", category: "sports", difficulty: 3, uk: "Назвіть шахіста чи шахістку", ru: "Назовите шахматиста или шахматистку", where: occ("Q10873124"), minSitelinks: 20, person: true },
  { id: "sport-racer", category: "sports", difficulty: 3, uk: "Назвіть автогонщика", ru: "Назовите автогонщика", where: occ("Q10349745"), minSitelinks: 20, person: true },
  { id: "sport-boxer", category: "sports", difficulty: 3, uk: "Назвіть боксера", ru: "Назовите боксёра", where: occ("Q11338576"), minSitelinks: 20, person: true },
  { id: "sport-stadium", category: "sports", difficulty: 3, uk: "Назвіть стадіон", ru: "Назовите стадион", where: inst("Q483110"), minSitelinks: 15, filler: ["стадіон", "стадион", "арена"] },

  // ── Astronomy ─────────────────────────────────────────────
  { id: "astro-constellation", category: "astronomy", difficulty: 2, uk: "Назвіть сузір'я", ru: "Назовите созвездие", where: inst("Q8928"), minSitelinks: 0, filler: ["сузір'я", "созвездие"] },
  { id: "astro-star", category: "astronomy", difficulty: 2, uk: "Назвіть зорю", ru: "Назовите звезду", where: instSub("Q523"), minSitelinks: 12, filler: ["зоря", "зірка", "звезда"] },
  { id: "astro-galaxy", category: "astronomy", difficulty: 3, uk: "Назвіть галактику", ru: "Назовите галактику", where: instSub("Q318"), minSitelinks: 8, filler: ["галактика"] },
  { id: "astro-moon", category: "astronomy", difficulty: 2, uk: "Назвіть природний супутник планети", ru: "Назовите естественный спутник планеты", where: "?item wdt:P31/wdt:P279* wd:Q2537 .", minSitelinks: 5, filler: ["супутник", "спутник", "місяць"] },
  { id: "astro-asteroid", category: "astronomy", difficulty: 3, uk: "Назвіть астероїд", ru: "Назовите астероид", where: instSub("Q3863"), minSitelinks: 15, filler: ["астероїд", "астероид"] },
  { id: "astro-nebula", category: "astronomy", difficulty: 3, uk: "Назвіть туманність", ru: "Назовите туманность", where: instSub("Q42372"), minSitelinks: 8, filler: ["туманність", "туманность"] },
  { id: "astro-comet", category: "astronomy", difficulty: 3, uk: "Назвіть комету", ru: "Назовите комету", where: instSub("Q3559"), minSitelinks: 8, filler: ["комета"] },
  { id: "astro-exoplanet", category: "astronomy", difficulty: 3, uk: "Назвіть екзопланету", ru: "Назовите экзопланету", where: inst("Q44559"), minSitelinks: 8, filler: ["екзопланета", "экзопланета"] },
  { id: "astro-astronomer", category: "astronomy", difficulty: 3, uk: "Назвіть астронома", ru: "Назовите астронома", where: occ("Q11063"), minSitelinks: 25, person: true },

  // ── Space ─────────────────────────────────────────────────
  { id: "space-probe", category: "space", difficulty: 2, uk: "Назвіть космічний апарат", ru: "Назовите космический аппарат", where: instAny("Q26529", "Q40218", "Q26540", "Q2133344"), minSitelinks: 10, filler: ["апарат", "аппарат", "зонд"] },
  { id: "space-astronaut", category: "space", difficulty: 2, uk: "Назвіть астронавта чи космонавта", ru: "Назовите астронавта или космонавта", where: occ("Q11631"), minSitelinks: 15, person: true },
  { id: "space-rocket", category: "space", difficulty: 3, uk: "Назвіть ракету-носій", ru: "Назовите ракету-носитель", where: instSub("Q697175"), minSitelinks: 6, filler: ["ракета"] },
  { id: "space-telescope", category: "space", difficulty: 3, uk: "Назвіть телескоп чи обсерваторію", ru: "Назовите телескоп или обсерваторию", where: instAny("Q148578", "Q4213", "Q62832"), minSitelinks: 8, filler: ["телескоп", "обсерваторія", "обсерватория"] },
  { id: "space-mission", category: "space", difficulty: 3, uk: "Назвіть пілотований космічний політ", ru: "Назовите пилотируемый космический полёт", where: inst("Q752783"), minSitelinks: 12, filler: ["політ", "полёт", "місія", "миссия"] },
  { id: "space-station", category: "space", difficulty: 3, uk: "Назвіть космічну станцію чи космодром", ru: "Назовите космическую станцию или космодром", where: instAny("Q25956", "Q194188"), minSitelinks: 6, filler: ["станція", "станция", "космодром"] },

  // ── Cars & transport ──────────────────────────────────────
  { id: "car-brand", category: "transport", difficulty: 1, uk: "Назвіть автомобільну марку чи виробника", ru: "Назовите автомобильную марку или производителя", where: "{ VALUES ?root { wd:Q786820 wd:Q44294 } ?item wdt:P31 ?root } UNION { ?item wdt:P452 wd:Q190117 }", minSitelinks: 15, filler: ["авто", "машина", "марка", "автомобіль", "автомобиль"] },
  { id: "car-model", category: "transport", difficulty: 1, uk: "Назвіть модель автомобіля", ru: "Назовите модель автомобиля", where: inst("Q3231690"), minSitelinks: 12, filler: ["авто", "машина", "модель"] },
  { id: "transport-airline", category: "transport", difficulty: 2, uk: "Назвіть авіакомпанію", ru: "Назовите авиакомпанию", where: inst("Q46970"), minSitelinks: 12, filler: ["авіакомпанія", "авиакомпания", "airlines"] },
  { id: "transport-aircraft", category: "transport", difficulty: 2, uk: "Назвіть модель літака чи гелікоптера", ru: "Назовите модель самолёта или вертолёта", where: inst("Q15056995"), minSitelinks: 12, filler: ["літак", "самолёт", "самолет"] },
  { id: "transport-ship", category: "transport", difficulty: 3, uk: "Назвіть відомий корабель", ru: "Назовите известный корабль", where: instSub("Q11446"), minSitelinks: 15, filler: ["корабель", "корабль", "судно"] },
  { id: "transport-metro", category: "transport", difficulty: 3, uk: "Назвіть місто з метро", ru: "Назовите город с метро", where: "?metro wdt:P31 wd:Q5503 ; wdt:P131 ?item .", minSitelinks: 10, filler: ["метро"] },

  // ── Internet culture & memes ─────────────────────────────
  { id: "net-meme", category: "memes", difficulty: 1, uk: "Назвіть інтернет-мем", ru: "Назовите интернет-мем", where: instSub("Q2927074"), minSitelinks: 3, filler: ["мем"] },
  { id: "net-social", category: "internet", difficulty: 1, uk: "Назвіть соцмережу чи месенджер", ru: "Назовите соцсеть или мессенджер", where: instAny("Q3220391", "Q1981630", "Q615699", "Q1066511", "Q2462003", "Q559856", "Q122759350"), minSitelinks: 8, filler: ["соцмережа", "соцсеть", "месенджер", "мессенджер"] },
  { id: "net-youtuber", category: "internet", difficulty: 2, uk: "Назвіть ютубера чи стрімера", ru: "Назовите ютубера или стримера", where: "VALUES ?o { wd:Q17125263 wd:Q57414145 } ?item wdt:P106 ?o ; wdt:P31 wd:Q5 .", minSitelinks: 10, person: true },
  { id: "net-video-platform", category: "internet", difficulty: 3, uk: "Назвіть інтернет-сервіс", ru: "Назовите интернет-сервис", where: instAny("Q1076509", "Q193424", "Q1153191", "Q4182287"), minSitelinks: 10, filler: ["сервіс", "сервис"] },

  // ── Nature ────────────────────────────────────────────────
  { id: "nature-plant", category: "nature", difficulty: 2, uk: "Назвіть рослину", ru: "Назовите растение", where: taxon("Q756"), minSitelinks: 30, filler: ["рослина", "растение", "квітка", "цветок", "дерево"] },
  { id: "nature-tree", category: "nature", difficulty: 2, uk: "Назвіть хвойну рослину", ru: "Назовите хвойное растение", where: taxon("Q25314"), minSitelinks: 4, filler: ["дерево"] },
  { id: "nature-mushroom", category: "nature", difficulty: 2, uk: "Назвіть гриб", ru: "Назовите гриб", where: taxon("Q764"), minSitelinks: 10, filler: ["гриб"] },
  { id: "nature-flower", category: "nature", difficulty: 2, uk: "Назвіть квіткову рослину з родини айстрових чи розових", ru: "Назовите растение из семейства астровых или розовых", where: "VALUES ?fam { wd:Q25400 wd:Q46299 } ?item wdt:P171+ ?fam ; wdt:P105 ?rank . VALUES ?rank { wd:Q7432 wd:Q34740 }", minSitelinks: 6 },
  { id: "nature-weather", category: "nature", difficulty: 3, uk: "Назвіть природне явище", ru: "Назовите природное явление", where: instSub("Q1322005"), minSitelinks: 20 },

  // ── Literature ────────────────────────────────────────────
  { id: "lit-writer", category: "literature", difficulty: 1, uk: "Назвіть письменника чи письменницю", ru: "Назовите писателя или писательницу", where: occ("Q36180"), minSitelinks: 60, person: true },
  { id: "lit-poet", category: "literature", difficulty: 2, uk: "Назвіть поета чи поетесу", ru: "Назовите поэта или поэтессу", where: occ("Q49757"), minSitelinks: 45, person: true },
  { id: "lit-novel", category: "literature", difficulty: 2, uk: "Назвіть роман", ru: "Назовите роман", where: "?item wdt:P31 wd:Q7725634 ; wdt:P7937 wd:Q8261 .", minSitelinks: 20, filler: ["роман", "книга", "книжка"] },
  { id: "lit-work", category: "literature", difficulty: 2, uk: "Назвіть літературний твір", ru: "Назовите литературное произведение", where: inst("Q7725634"), minSitelinks: 35, filler: ["книга", "книжка", "твір", "произведение"] },
  { id: "lit-character", category: "literature", difficulty: 1, uk: "Назвіть вигаданого персонажа", ru: "Назовите вымышленного персонажа", where: instAny("Q95074", "Q15632617", "Q3658341", "Q15773347"), minSitelinks: 25, filler: ["персонаж"] },
  { id: "lit-playwright", category: "literature", difficulty: 3, uk: "Назвіть драматурга", ru: "Назовите драматурга", where: occ("Q214917"), minSitelinks: 35, person: true },
  { id: "lit-fairy-tale", category: "literature", difficulty: 2, uk: "Назвіть казку", ru: "Назовите сказку", where: instAny("Q699", "Q1716696"), minSitelinks: 6, filler: ["казка", "сказка"] },
  { id: "lit-comics", category: "literature", difficulty: 1, uk: "Назвіть супергероя чи персонажа коміксів", ru: "Назовите супергероя или персонажа комиксов", where: instAny("Q1114461", "Q188784"), minSitelinks: 12, filler: ["супергерой"] },

  // ── General knowledge ─────────────────────────────────────
  { id: "gen-profession", category: "general", difficulty: 1, uk: "Назвіть професію", ru: "Назовите профессию", where: instAny("Q28640", "Q12737077"), minSitelinks: 15, filler: ["професія", "профессия"] },
  { id: "gen-language", category: "general", difficulty: 1, uk: "Назвіть мову світу", ru: "Назовите язык мира", where: instAny("Q34770", "Q1288568", "Q33742"), minSitelinks: 20, filler: ["мова", "язык"] },
  { id: "gen-currency", category: "general", difficulty: 1, uk: "Назвіть валюту", ru: "Назовите валюту", where: inst("Q8142"), minSitelinks: 10, filler: ["валюта", "гроші", "деньги"] },
  { id: "gen-holiday", category: "general", difficulty: 1, uk: "Назвіть свято", ru: "Назовите праздник", where: instSub("Q1445650"), minSitelinks: 12, filler: ["свято", "праздник", "день"] },
  { id: "gen-painter", category: "general", difficulty: 2, uk: "Назвіть художника чи художницю", ru: "Назовите художника или художницу", where: occ("Q1028181"), minSitelinks: 50, person: true },
  { id: "gen-painting", category: "general", difficulty: 3, uk: "Назвіть відому картину", ru: "Назовите известную картину", where: inst("Q3305213"), minSitelinks: 20, filler: ["картина"] },
  { id: "gen-creature", category: "general", difficulty: 1, uk: "Назвіть міфічну істоту", ru: "Назовите мифическое существо", where: instSub("Q2239243"), minSitelinks: 8, filler: ["істота", "существо"] },
  { id: "gen-museum", category: "general", difficulty: 3, uk: "Назвіть музей", ru: "Назовите музей", where: inst("Q33506"), minSitelinks: 25, filler: ["музей"] },
  { id: "gen-university", category: "general", difficulty: 3, uk: "Назвіть університет", ru: "Назовите университет", where: inst("Q3918"), minSitelinks: 40, filler: ["університет", "университет"] },
  { id: "gen-writing-system", category: "general", difficulty: 3, uk: "Назвіть систему письма чи абетку", ru: "Назовите систему письма или алфавит", where: instSub("Q8192"), minSitelinks: 10, filler: ["абетка", "алфавит", "письмо"] },
  { id: "gen-dance", category: "general", difficulty: 1, uk: "Назвіть танець", ru: "Назовите танец", where: instAny("Q1792379", "Q11639"), minSitelinks: 6, filler: ["танець", "танец"] },
  { id: "gen-landmark", category: "general", difficulty: 2, uk: "Назвіть пам'ятку архітектури", ru: "Назовите памятник архитектуры", where: instAny("Q570116", "Q1081138", "Q4989906"), minSitelinks: 25 },
  { id: "gen-brand", category: "general", difficulty: 2, uk: "Назвіть бренд одягу чи взуття", ru: "Назовите бренд одежды или обуви", where: "VALUES ?ind { wd:Q11828862 wd:Q1352375 wd:Q3661311 } ?item wdt:P452 ?ind .", minSitelinks: 8, filler: ["бренд"] },
  // ── easy everyday questions ──────────────────────────────
  { id: "food-vegetable", category: "food", difficulty: 1, uk: "Назвіть овоч", ru: "Назовите овощ", where: kind("Q11004"), minSitelinks: 8, filler: ["овоч", "овощ"] },
  { id: "food-sweets", category: "food", difficulty: 2, uk: "Назвіть солодощі чи кондитерський виріб", ru: "Назовите сладость или кондитерское изделие", where: "VALUES ?root { wd:Q185583 wd:Q2920963 } ?item wdt:P279 ?root .", minSitelinks: 8, filler: ["солодощі", "сладости", "цукерка", "конфета"] },
  { id: "gen-clothing", category: "general", difficulty: 2, uk: "Назвіть предмет одягу чи взуття", ru: "Назовите предмет одежды или обуви", where: "VALUES ?root { wd:Q11460 wd:Q22676 } ?item wdt:P279 ?root .", minSitelinks: 10, filler: ["одяг", "одежда", "взуття", "обувь"] },
  { id: "gen-furniture", category: "general", difficulty: 1, uk: "Назвіть меблі", ru: "Назовите предмет мебели", where: kind("Q14745"), minSitelinks: 8, filler: ["меблі", "мебель"] },
  { id: "gen-appliance", category: "technology", difficulty: 1, uk: "Назвіть побутовий прилад", ru: "Назовите бытовой прибор", where: kind("Q212920"), minSitelinks: 8, filler: ["прилад", "прибор", "техніка", "техника"] },
  { id: "transport-vehicle", category: "transport", difficulty: 1, uk: "Назвіть вид транспорту", ru: "Назовите вид транспорта", where: "VALUES ?root { wd:Q42889 wd:Q334166 } ?item wdt:P279 ?root .", minSitelinks: 15, filler: ["транспорт"] },
  { id: "gen-color", category: "general", difficulty: 1, uk: "Назвіть колір", ru: "Назовите цвет", where: kind("Q1075"), minSitelinks: 12, filler: ["колір", "цвет"] },
  { id: "film-cartoon", category: "movies", difficulty: 1, uk: "Назвіть мультфільм", ru: "Назовите мультфильм", where: instSub("Q202866"), minSitelinks: 25, filler: ["мультфільм", "мультфильм", "мультик"] },
  { id: "tv-cartoon-series", category: "movies", difficulty: 1, uk: "Назвіть мультсеріал", ru: "Назовите мультсериал", where: instSub("Q581714"), minSitelinks: 15, filler: ["мультсеріал", "мультсериал", "мультик"] },
  { id: "gen-body", category: "nature", difficulty: 1, uk: "Назвіть частину тіла чи орган", ru: "Назовите часть тела или орган", where: instAny("Q112826905", "Q103812529"), minSitelinks: 25, filler: ["орган", "частина", "часть"] },
];
