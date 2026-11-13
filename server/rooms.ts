// Server-authoritative room + game state machine.
import { randomInt, randomBytes } from "node:crypto";
import {
  AVATAR_KINDS, PLAYER_COLORS, CATEGORY_IDS, type AvatarKind, type EndStats, type Loc, type Phase, type PotatoState, type PublicPlayer,
  type RarityTier, type RevealEntry, type RoomSettings, type RoomSnapshot, type RoundSummary, type SubmitResult, type ErrorCode,
} from "../shared/types.ts";
import { ContentStore, matchAnswer, toPreview, toPublic, type QuestionIndex, type QuestionMeta } from "./content.ts";
import { StatsStore, score } from "./rarity.ts";

export const MAX_PLAYERS = 12;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INTRO_MS = 1800;
const LOBBY_GRACE_MS = 60_000;
const HOST_GRACE_MS = 15_000;

export interface Emitter {
  state(room: Room): void;
  event(room: Room, name: string, payload: unknown): void;
}

class Bucket {
  private tokens: number; private last = Date.now();
  constructor(private rate: number, private burst: number) { this.tokens = burst; }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1; return true;
  }
}

export class Player {
  id = randomBytes(6).toString("hex");
  token: string;
  name: string; avatar: AvatarKind; color: string;
  ready = false; host = false; online = true; socketId: string | null = null;
  score = 0; correct = 0; roundPoints: number[] = [];
  typing = false; text = ""; answered = false; answerIdx = -1;
  lives = 3; shards = 0; out = false; outAt = 0;
  graceTimer: NodeJS.Timeout | null = null;
  buckets = { preview: new Bucket(12, 24), submit: new Bucket(4, 8), typing: new Bucket(20, 30) };
  constructor(token: string, name: string, avatar: AvatarKind, color: string) { this.token = token; this.name = name; this.avatar = avatar; this.color = color; }
}

export const sanitizeName = (s: unknown) => (typeof s === "string" ? s.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 16) : "");
export const sanitizeText = (s: unknown) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, "").slice(0, 60) : "");

export class Room {
  code: string;
  players = new Map<string, Player>();
  phase: Phase = "lobby";
  settings: RoomSettings = { mode: "classic", rounds: 10, timer: 20, categories: [], visibility: "hidden", earlyEnd: true, lives: 3, difficulty: 1 };
  round = 0;
  q: QuestionMeta | null = null;
  idx: QuestionIndex | null = null;
  endsAt: number | null = null;
  reveal: RoundSummary | null = null;
  end: EndStats | null = null;
  used = new Set<string>();
  timer: NodeJS.Timeout | null = null;
  history: { round: number; entries: RevealEntry[] }[] = [];
  potato: (PotatoState & { usedIds: Set<string>; fuseEnd: number }) | null = null;
  lastActive = Date.now();

  constructor(code: string, private content: ContentStore, private stats: StatsStore, private emit: Emitter) { this.code = code; }

  // ── players ───────────────────────────────────────────────
  get list() { return [...this.players.values()]; }
  get online() { return this.list.filter((p) => p.online); }
  host() { return this.list.find((p) => p.host); }

  addPlayer(token: string, name: string, avatar: AvatarKind): Player | ErrorCode {
    if (this.players.size >= MAX_PLAYERS) return "roomFull";
    const used = new Set(this.list.map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
    const p = new Player(token, name, avatar, color);
    if (!this.host()) p.host = true;
    p.lives = this.settings.lives;
    if (this.phase === "potato") p.out = true; // late joiners watch the current potato match
    this.players.set(p.id, p);
    this.emit.event(this, "player:joined", { id: p.id });
    this.emit.state(this);
    return p;
  }

  byToken(token: string) { return this.list.find((p) => p.token === token); }

  connect(p: Player, socketId: string) {
    if (p.graceTimer) { clearTimeout(p.graceTimer); p.graceTimer = null; }
    const wasOffline = !p.online;
    p.online = true; p.socketId = socketId; this.lastActive = Date.now();
    if (wasOffline) this.emit.event(this, "player:joined", { id: p.id, reconnect: true });
    this.emit.state(this);
  }

  disconnect(p: Player) {
    p.online = false; p.socketId = null; p.typing = false;
    this.emit.event(this, "player:left", { id: p.id });
    if (p.host) setTimeout(() => { if (!p.online) this.transferHost(); }, HOST_GRACE_MS);
    p.graceTimer = setTimeout(() => { if (!p.online && this.phase === "lobby") this.remove(p); }, LOBBY_GRACE_MS);
    this.emit.state(this);
    this.checkEarlyEnd();
  }

  remove(p: Player) {
    if (p.graceTimer) clearTimeout(p.graceTimer);
    this.players.delete(p.id);
    if (p.host) this.transferHost();
    this.emit.event(this, "player:left", { id: p.id, removed: true });
    if (this.phase === "potato" && this.potato?.holderId === p.id) this.passPotato(p, null);
    this.emit.state(this);
    this.checkEarlyEnd();
  }

  transferHost() {
    const cur = this.host();
    const next = this.online.find((p) => p !== cur) ?? this.list.find((p) => p !== cur);
    if (cur && next && !cur.online) { cur.host = false; next.host = true; next.ready = true; this.emit.state(this); }
    else if (!cur && next) { next.host = true; this.emit.state(this); }
  }

  updatePlayer(p: Player, data: { name?: unknown; avatar?: unknown }) {
    const name = sanitizeName(data.name);
    if (name) p.name = name;
    if (typeof data.avatar === "string" && (AVATAR_KINDS as readonly string[]).includes(data.avatar)) p.avatar = data.avatar as AvatarKind;
    this.emit.state(this);
  }

  setReady(p: Player, ready: boolean) {
    if (this.phase !== "lobby" && this.phase !== "finished") return;
    p.ready = !!ready;
    if (p.ready) this.emit.event(this, "player:ready", { id: p.id });
    this.emit.state(this);
  }

  updateSettings(p: Player, s: Partial<RoomSettings>): ErrorCode | null {
    if (!p.host) return "notHost";
    if (this.phase !== "lobby" && this.phase !== "finished") return "inProgress";
    const n = { ...this.settings };
    if (s.mode === "classic" || s.mode === "potato") n.mode = s.mode;
    if ([0, 5, 10, 15, 20].includes(s.rounds as number)) n.rounds = s.rounds!;
    if ([10, 15, 20, 30, 45].includes(s.timer as number)) n.timer = s.timer!;
    if (Array.isArray(s.categories)) n.categories = s.categories.filter((c) => (CATEGORY_IDS as readonly string[]).includes(c));
    if (s.visibility === "live" || s.visibility === "hidden") n.visibility = s.visibility;
    if (typeof s.earlyEnd === "boolean") n.earlyEnd = s.earlyEnd;
    if ([1, 2, 3].includes(s.difficulty as number)) n.difficulty = s.difficulty!;
    if (typeof s.lives === "number" && s.lives >= 1 && s.lives <= 5) n.lives = Math.floor(s.lives);
    this.settings = n;
    this.emit.state(this);
    return null;
  }

  // ── match control ─────────────────────────────────────────
  start(p: Player): ErrorCode | null {
    if (!p.host) return "notHost";
    if (this.phase !== "lobby" && this.phase !== "finished") return "inProgress";
    const active = this.online;
    if (active.length < 2) return "notEnoughPlayers";
    if (this.phase === "lobby" && active.some((x) => !x.host && !x.ready)) return "notReady"; // "play again" from results skips the ready check
    for (const x of this.list) {
      x.score = 0; x.correct = 0; x.roundPoints = []; x.answered = false; x.text = ""; x.typing = false;
      x.lives = this.settings.lives; x.shards = 0; x.out = !x.online; x.outAt = 0;
    }
    this.round = 0; this.history = []; this.end = null; this.reveal = null;
    if (this.settings.mode === "potato") this.startPotato();
    else this.nextRound();
    return null;
  }

  backToLobby(p: Player) {
    if (!p.host) return;
    this.clearTimer();
    this.phase = "lobby"; this.q = null; this.idx = null; this.endsAt = null; this.reveal = null; this.potato = null;
    for (const x of this.list) { x.ready = x.host; x.answered = false; x.typing = false; x.text = ""; }
    this.emit.state(this);
  }

  finishNow(p: Player) { if (p.host && this.phase !== "lobby" && this.phase !== "finished") this.finish(); }

  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  private nextRound() {
    this.clearTimer();
    const total = this.settings.rounds;
    if (total > 0 && this.round >= total) return this.finish();
    this.round++;
    this.q = this.content.pickQuestion(this.settings.categories, this.used, 30, this.settings.difficulty);
    this.used.add(this.q.id);
    this.idx = this.content.index(this.q.id);
    for (const x of this.list) { x.answered = false; x.answerIdx = -1; x.typing = false; x.text = ""; }
    this.reveal = null;
    this.phase = "intro";
    this.endsAt = null;
    this.emit.state(this);
    this.timer = setTimeout(() => {
      this.phase = "question";
      this.endsAt = Date.now() + this.settings.timer * 1000;
      this.emit.state(this);
      this.timer = setTimeout(() => this.closeRound(), this.settings.timer * 1000);
    }, INTRO_MS);
  }

  private checkEarlyEnd() {
    if (this.phase !== "question" || !this.settings.earlyEnd) return;
    const active = this.online;
    if (active.length && active.every((x) => x.answered)) {
      this.clearTimer();
      setTimeout(() => this.closeRound(), 600); // let the last submit animation land
    }
  }

  private closeRound() {
    if (this.phase !== "question" || !this.q || !this.idx) return;
    this.clearTimer();
    const idx = this.idx, q = this.q;
    const picked: string[] = [];
    const entries: RevealEntry[] = this.list.map((x) => {
      if (x.answerIdx < 0) { x.roundPoints.push(0); return { playerId: x.id, answer: null, tier: null, points: 0, total: x.score, share: null }; }
      const a = idx.answers[x.answerIdx];
      const st = this.stats.get(q.id, a.id);
      const sc = score(a.rank, idx.answers.length, st.picks, st.total);
      picked.push(a.id);
      x.score += sc.points; x.correct++; x.roundPoints.push(sc.points);
      return { playerId: x.id, answer: a.label, tier: sc.tier, points: sc.points, total: x.score, share: sc.share };
    });
    this.stats.record(q.id, picked); // statistics update AFTER scoring this round
    const topAnswers = idx.answers.slice(0, 3).map((a) => ({ label: a.label, tier: score(a.rank, idx.answers.length, 0, 0).tier }));
    this.reveal = { round: this.round, question: toPublic(q), entries, topAnswers };
    this.history.push({ round: this.round, entries });
    this.phase = "reveal";
    this.endsAt = null;
    for (const x of this.list) { x.typing = false; }
    this.emit.state(this);
    const answered = entries.filter((e) => e.answer).length;
    const dur = Math.min(12_000, 3500 + answered * 900);
    this.timer = setTimeout(() => this.nextRound(), dur);
  }

  skipReveal(p: Player) { if (p.host && this.phase === "reveal") { this.clearTimer(); this.nextRound(); } }

  private finish() {
    this.clearTimer();
    this.phase = "finished"; this.endsAt = null;
    let rarest: EndStats["rarest"] = null;
    let best = -1, bestShare = 2;
    for (const h of this.history) for (const e of h.entries) {
      if (e.answer && e.tier && (e.points > best || (e.points === best && (e.share ?? 1) < bestShare))) {
        best = e.points; bestShare = e.share ?? 1; rarest = { playerId: e.playerId, name: this.players.get(e.playerId)?.name ?? "?", answer: e.answer, points: e.points, tier: e.tier };
      }
    }
    const ranking = this.list.map((x) => {
      let bestRound = 0, bestRoundPoints = 0;
      x.roundPoints.forEach((pts, i) => { if (pts > bestRoundPoints) { bestRoundPoints = pts; bestRound = i + 1; } });
      return { playerId: x.id, name: x.name, avatar: x.avatar, color: x.color, score: x.score, correct: x.correct, bestRound, bestRoundPoints };
    });
    if (this.settings.mode === "potato") {
      const winner = this.potato?.winnerId;
      ranking.sort((a, b) => {
        const pa = this.players.get(a.playerId)!, pb = this.players.get(b.playerId)!;
        if (a.playerId === winner) return -1; if (b.playerId === winner) return 1;
        return (pb.outAt || Infinity) - (pa.outAt || Infinity) || b.score - a.score;
      });
    } else ranking.sort((a, b) => b.score - a.score || b.correct - a.correct);
    this.end = { ranking, rarest };
    for (const x of this.list) x.ready = x.host;
    this.emit.state(this);
  }

  // ── typing / answers ──────────────────────────────────────
  typing(p: Player, raw: unknown) {
    if (!p.buckets.typing.take()) return;
    const inClassic = this.phase === "question" && !p.answered;
    const inPotato = this.phase === "potato" && this.potato?.holderId === p.id && !this.potato.explodedId;
    if (!inClassic && !inPotato) return;
    const text = sanitizeText(raw);
    p.text = text; p.typing = text.length > 0;
    const live = this.settings.visibility === "live";
    this.emit.event(this, "player:typing", { id: p.id, typing: p.typing, len: text.length, text: live ? text : undefined });
  }

  preview(p: Player, raw: unknown) {
    if (!p.buckets.preview.take()) return null;
    const idx = this.activeIndex();
    if (!idx) return null;
    const text = sanitizeText(raw);
    return toPreview(idx, text, matchAnswer(idx, text));
  }

  private activeIndex(): QuestionIndex | null {
    if (this.phase === "question") return this.idx;
    if (this.phase === "potato" && this.potato?.question) return this.idx;
    return null;
  }

  submit(p: Player, raw: unknown, choiceId?: unknown): SubmitResult {
    if (!p.buckets.submit.take()) return { ok: false, reason: "rate" };
    const idx = this.activeIndex();
    if (!idx) return { ok: false, reason: "closed" };
    if (this.phase === "potato") return this.potatoSubmit(p, idx, raw, choiceId);
    if (this.endsAt && Date.now() > this.endsAt + 250) return { ok: false, reason: "closed" };
    if (p.answered) return { ok: false, reason: "already" };
    const r = this.resolve(idx, raw, choiceId);
    if (!r.ok) return r;
    p.answered = true; p.answerIdx = r.i; p.typing = false;
    this.emit.event(this, "player:answered", { id: p.id });
    this.emit.state(this);
    this.checkEarlyEnd();
    return { ok: true, answer: { id: idx.answers[r.i].id, label: idx.answers[r.i].label } };
  }

  private resolve(idx: QuestionIndex, raw: unknown, choiceId?: unknown): { ok: true; i: number } | Extract<SubmitResult, { ok: false }> {
    const text = sanitizeText(raw);
    const m = matchAnswer(idx, text);
    if (m.status === "ambiguous") {
      // a choice is only honoured if it is one of the options the server itself offered for this text
      const i = m.ids.find((k) => idx.answers[k].id === choiceId);
      if (i !== undefined) return { ok: true, i };
      return { ok: false, reason: "ambiguous", options: m.ids.map((k) => ({ id: idx.answers[k].id, label: idx.answers[k].label })) };
    }
    if (m.status !== "match") return { ok: false, reason: "notFound" };
    return { ok: true, i: m.ids[0] };
  }

  // ── hot potato ────────────────────────────────────────────
  private startPotato() {
    this.phase = "potato";
    this.potato = null;
    this.newSequence(null);
  }

  private alive() { return this.list.filter((x) => !x.out); }

  private newSequence(prevHolder: Player | null) {
    this.clearTimer();
    const alive = this.alive();
    if (alive.length <= 1) {
      if (this.potato) this.potato.winnerId = alive[0]?.id ?? null;
      this.emit.state(this);
      this.timer = setTimeout(() => this.finish(), 2500);
      return;
    }
    this.round++;
    const q = this.content.pickQuestion(this.settings.categories, this.used, 150, this.settings.difficulty);
    this.used.add(q.id);
    this.q = q; this.idx = this.content.index(q.id);
    const holder = prevHolder && !prevHolder.out ? prevHolder : alive[randomInt(alive.length)];
    const fuse = process.env.CP_TEST_FUSE_MS ? Number(process.env.CP_TEST_FUSE_MS) : randomInt(14_000, 34_000); // secret, server-only (env override for tests)
    const now = Date.now();
    this.potato = {
      holderId: holder.id, question: toPublic(q), used: [], sequence: this.round, lastPass: null,
      startedAt: now, explodedId: null, winnerId: null, usedIds: new Set(), fuseEnd: now + fuse,
    };
    for (const x of this.list) { x.typing = false; x.text = ""; }
    this.emit.state(this);
    this.timer = setTimeout(() => this.explode(), fuse);
  }

  private explode() {
    if (!this.potato) return;
    const holder = this.players.get(this.potato.holderId ?? "");
    if (holder) {
      holder.lives--;
      if (holder.lives <= 0) { holder.out = true; holder.outAt = Date.now(); }
    }
    this.potato.explodedId = holder?.id ?? null;
    this.emit.event(this, "potato:boom", { id: holder?.id });
    this.emit.state(this);
    this.timer = setTimeout(() => this.newSequence(holder ?? null), 2600);
  }

  private passPotato(from: Player, answer: { label: Loc; tier: RarityTier } | null) {
    if (!this.potato) return;
    const others = this.alive().filter((x) => x !== from && x.online);
    const pool = others.length ? others : this.alive().filter((x) => x !== from);
    if (!pool.length) return;
    const to = pool[randomInt(pool.length)];
    this.potato.holderId = to.id;
    if (answer) this.potato.lastPass = { from: from.id, to: to.id, answer: answer.label, tier: answer.tier };
    from.typing = false; from.text = "";
    this.emit.state(this);
  }

  private potatoSubmit(p: Player, idx: QuestionIndex, raw: unknown, choiceId?: unknown): SubmitResult {
    const pt = this.potato!;
    if (pt.explodedId || pt.winnerId) return { ok: false, reason: "closed" };
    if (pt.holderId !== p.id) return { ok: false, reason: "notYourTurn" };
    const r = this.resolve(idx, raw, choiceId);
    if (!r.ok) return r;
    const a = idx.answers[r.i];
    if (pt.usedIds.has(a.id)) return { ok: false, reason: "used" };
    pt.usedIds.add(a.id); pt.used.push(a.label);
    const st = this.stats.get(idx.meta.id, a.id);
    const sc = score(a.rank, idx.answers.length, st.picks, st.total);
    this.stats.record(idx.meta.id, [a.id]);
    p.score += sc.points; p.correct++;
    if (sc.points >= 85) { // rare or better → star shard; 3 shards = bonus life
      p.shards++;
      if (p.shards >= 3) { p.shards = 0; p.lives = Math.min(this.settings.lives + 2, p.lives + 1); this.emit.event(this, "potato:life", { id: p.id }); }
    }
    this.emit.event(this, "player:answered", { id: p.id, tier: sc.tier, points: sc.points });
    this.passPotato(p, { label: a.label, tier: sc.tier });
    return { ok: true, answer: { id: a.id, label: a.label } };
  }

  // ── snapshot ──────────────────────────────────────────────
  snapshot(): RoomSnapshot {
    const live = this.settings.visibility === "live";
    const players: PublicPlayer[] = this.list.map((x) => ({
      id: x.id, name: x.name, avatar: x.avatar, color: x.color, ready: x.ready, host: x.host, online: x.online, score: x.score,
      typing: x.typing, answered: x.answered, liveText: live ? x.text : undefined, textLen: x.text.length,
      lives: x.lives, shards: x.shards, out: x.out,
    }));
    let potato: PotatoState | null = null;
    if (this.potato) { const { usedIds, fuseEnd, ...pub } = this.potato; potato = pub; }
    const showQuestion = this.phase === "question" || this.phase === "intro" || this.phase === "reveal";
    return {
      code: this.code, phase: this.phase, settings: this.settings, players, round: this.round,
      totalRounds: this.settings.rounds, question: showQuestion && this.q ? toPublic(this.q) : null,
      endsAt: this.endsAt, reveal: this.phase === "reveal" ? this.reveal : null, end: this.phase === "finished" ? this.end : null,
      potato, serverNow: Date.now(),
    };
  }

  dispose() { this.clearTimer(); for (const p of this.list) if (p.graceTimer) clearTimeout(p.graceTimer); }
}

export class RoomManager {
  rooms = new Map<string, Room>();
  constructor(private content: ContentStore, private stats: StatsStore, private emit: Emitter) {
    setInterval(() => this.gc(), 60_000).unref();
  }
  newCode(): string {
    for (;;) {
      let c = "";
      for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
  }
  create(): Room {
    const r = new Room(this.newCode(), this.content, this.stats, this.emit);
    this.rooms.set(r.code, r);
    return r;
  }
  get(code: unknown) { return typeof code === "string" ? this.rooms.get(code.toUpperCase().trim()) : undefined; }
  private gc() {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      if (r.online.length === 0 && now - r.lastActive > 10 * 60_000) { r.dispose(); this.rooms.delete(code); }
      else if (r.online.length) r.lastActive = now;
    }
  }
}
