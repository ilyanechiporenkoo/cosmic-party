# Cosmic Party

A multiplayer browser party game: everyone gets the same question and tries to type the *rarest* valid answer.
The UI is Ukrainian and Russian only; players using either language share a room and their answers are equivalent.

## Run

```bash
npm install
npm run build          # client → dist/
npm start              # game server + client on http://localhost:3210
```

Development: `npm run dev:server` and `npm run dev:client` (Vite on :5173 proxies sockets to :3210).

Content pipeline:

```bash
npm run content:fetch     # broad questions: Wikidata → content/raw/<question>.json (resumable; --parallel=3, --only=id1,id2, --force)
npm run content:templates # templated questions: content/templates.ts → content/raw-tpl/<template>/<param>.json (resumable)
npm run content:build     # raw shards → data/content.db + content/COVERAGE.md
npm run content:validate  # integrity checks + measured counts (exit 1 on violations)
npm test                  # matcher, rarity, two-client multiplayer, hot potato
```

## Architecture

| Part | Where | Notes |
|---|---|---|
| Server | `server/index.ts` | Express + Socket.IO; serves `dist/` |
| Rooms / game loop | `server/rooms.ts` | server-authoritative timers, scoring, ready/host, reconnection by per-tab token, rate limits (token buckets), hidden-mode text never leaves the server |
| Answer recognition | `server/content.ts`, `server/text.ts` | exact → transliteration → morphology → context phrase (filler words per question) → typo (Damerau–Levenshtein, length-scaled) → phonetic bridge; ambiguity returns options instead of guessing |
| Rarity | `server/rarity.ts` | `share = (picks + α·prior) / (total + α)`, α = 40; prior = Zipf over Wikipedia-sitelink popularity rank; deterministic tiers 10…250 |
| Content store | `data/content.db` (SQLite) | questions + per-question answer rows; indexes built lazily per question (LRU of 48); answers never sent to clients |
| Stats | `data/stats.db` (SQLite) | real pick counts, updated after each round is scored |
| Client | `client/` | React + Motion + Zustand; canvas starfield, SVG planets and characters, Web Audio synthesized sounds |

Deviation from the suggested stack: SQLite (Node's built-in `node:sqlite`) instead of PostgreSQL/Prisma/Redis,
and Vite instead of Next.js. Postgres and Redis were not available on this machine; storage sits behind
`ContentStore`/`StatsStore`, so swapping in Postgres is a contained change. Room state is in-process memory
(one server instance); Redis would be needed only to run several instances.

## Content: what is real

Every answer is a Wikidata item that has both a Ukrainian and a Russian label (falling back to Wikidata's
multilingual `mul` label for names such as "Python"). Canonical answer id = Wikidata QID, shared by both
languages. Nothing is hand-typed or generated. See `content/COVERAGE.md` for measured numbers.

Two kinds of questions:

- **Broad** (`content/definitions.ts`, ~160): "Назовите птицу", "Назовите фильм" — hundreds to thousands of answers each; kept at ≥30 answers.
- **Templated** (`content/templates.ts`, 46 templates): one template expands per parameter value — a country ("Франция: назовите футболиста"),
  a year ("Назовите фильм 1994 года"), a genre, a club, a city of birth, a university, a fictional universe, a museum collection.
  Kept only at ≥40 verified answers.

Matches draw questions by weight: broad questions are 4× more likely, and each template family shares its weight so one family
(e.g. 150 country-footballer questions) cannot crowd out the rest.

The original 10,000-questions × 1000-answers target is **not** met: real data with both uk and ru names does not support it
without inventing answers. Templated questions typically have 40–400 answers. Exact current numbers: `content/COVERAGE.md`.

## Hot potato ("Гаряча зірка")

The holder must name an unused answer to pass the star; the fuse length is random and secret (server-only).
Holding it at the end costs a life. Rare-or-better answers give star shards; 3 shards = +1 life. Last player standing wins.
