import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import type { AvatarKind, Lang, PreviewResult, RoomSettings, RoomSnapshot, SubmitResult, ErrorCode, RarityTier } from "../shared/types.ts";
import { play, setVolumes, type Volumes } from "./sound.ts";

// per-tab session (token + current room): survives refresh, separate player per tab
const SS = {
  get<T>(k: string, def: T): T { try { const v = sessionStorage.getItem("cp:" + k); return v ? (JSON.parse(v) as T) : def; } catch { return def; } },
  set(k: string, v: unknown) { try { sessionStorage.setItem("cp:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const LS = {
  get<T>(k: string, def: T): T { try { const v = localStorage.getItem("cp:" + k); return v ? (JSON.parse(v) as T) : def; } catch { return def; } },
  set(k: string, v: unknown) { try { localStorage.setItem("cp:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function token(): string {
  let tk = SS.get<string>("token", "");
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(tk)) {
    const a = new Uint8Array(18); crypto.getRandomValues(a);
    tk = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    SS.set("token", tk);
  }
  return tk;
}

export type FxEvent =
  | { kind: "joined" | "left" | "ready" | "answered" | "boom" | "life"; id: string; n: number; tier?: RarityTier; points?: number };

interface State {
  lang: Lang;
  name: string;
  avatar: AvatarKind;
  volumes: Volumes;
  reducedMotion: boolean;
  connected: boolean;
  room: RoomSnapshot | null;
  me: string | null;
  clockOffset: number;
  error: string | null;
  events: FxEvent[];
  joinCode: string;
  setLang(l: Lang): void;
  setProfile(p: { name?: string; avatar?: AvatarKind }): void;
  setVolumes(v: Partial<Volumes>): void;
  setReducedMotion(v: boolean): void;
  setError(e: string | null): void;
  createRoom(): Promise<boolean>;
  joinRoom(code: string): Promise<boolean>;
  leave(): void;
  ready(v: boolean): void;
  updateSettings(s: Partial<RoomSettings>): void;
  start(): Promise<ErrorCode | null>;
  typing(text: string): void;
  preview(text: string): Promise<PreviewResult | null>;
  submit(text: string, choiceId?: string): Promise<SubmitResult>;
  host(action: "game:skip" | "game:finish" | "game:lobby"): void;
  now(): number;
}

const prefersReduced = typeof matchMedia !== "undefined" && (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(max-width: 640px)").matches);
let evN = 0;

export const socket: Socket = io({ transports: ["websocket", "polling"], reconnectionDelay: 500, reconnectionDelayMax: 3000 });
const call = <T,>(ev: string, d?: unknown) => new Promise<T>((res, rej) => {
  if (!socket.connected) return rej(new Error("offline"));
  socket.timeout(6000).emit(ev, d, (err: unknown, r: T) => (err ? rej(err) : res(r)));
});

export const useGame = create<State>((set, get) => ({
  lang: LS.get<Lang>("lang", navigator.language?.startsWith("ru") ? "ru" : "uk"),
  name: LS.get("name", ""),
  avatar: LS.get<AvatarKind>("avatar", "astro"),
  volumes: LS.get<Volumes>("volumes", { master: 0.8, music: 0.3, effects: 0.8, muted: false }),
  reducedMotion: LS.get("reducedMotion", prefersReduced),
  connected: false,
  room: null,
  me: null,
  clockOffset: 0,
  error: null,
  events: [],
  joinCode: new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "",

  setLang(l) { LS.set("lang", l); document.documentElement.lang = l; set({ lang: l }); },
  setProfile(p) {
    if (p.name !== undefined) LS.set("name", p.name);
    if (p.avatar) LS.set("avatar", p.avatar);
    set(p as Partial<State>);
    if (get().room) socket.emit("player:update", p);
  },
  setVolumes(v) { const volumes = { ...get().volumes, ...v }; LS.set("volumes", volumes); setVolumes(volumes); set({ volumes }); },
  setReducedMotion(v) { LS.set("reducedMotion", v); set({ reducedMotion: v }); },
  setError(e) { set({ error: e }); },

  async createRoom() {
    try {
      const r: any = await call("room:create", { name: get().name, avatar: get().avatar, token: token() });
      if (!r.ok) { set({ error: r.error }); return false; }
      enterRoom(r); return true;
    } catch { set({ error: "offline" }); return false; }
  },
  async joinRoom(code) {
    try {
      const r: any = await call("room:join", { code: code.trim().toUpperCase(), name: get().name, avatar: get().avatar, token: token() });
      if (!r.ok) { set({ error: r.error }); return false; }
      enterRoom(r); return true;
    } catch { set({ error: "offline" }); return false; }
  },
  leave() {
    socket.emit("room:leave");
    SS.set("room", null);
    history.replaceState(null, "", location.pathname);
    set({ room: null, me: null });
  },
  ready(v) { socket.emit("player:ready", { ready: v }); },
  updateSettings(s) { socket.emit("room:settings", s); },
  async start() { try { const r: any = await call("game:start"); return r.ok ? null : r.error; } catch { return "rate"; } },
  typing(text) { socket.emit("game:typing", { text }); },
  async preview(text) { try { return await call<PreviewResult | null>("game:preview", { text }); } catch { return null; } },
  async submit(text, choiceId) { try { return await call<SubmitResult>("game:submit", { text, choiceId }); } catch { return { ok: false, reason: "closed" }; } },
  host(action) { socket.emit(action); },
  now() { return Date.now() + get().clockOffset; },
}));

function enterRoom(r: { code: string; playerId: string; state: RoomSnapshot }) {
  SS.set("room", r.code);
  history.replaceState(null, "", `?room=${r.code}`);
  useGame.setState({ me: r.playerId, error: null });
  applyState(r.state);
}

function applyState(s: RoomSnapshot) {
  const prev = useGame.getState().room;
  // keep the latest live typing info we got from lightweight events if the snapshot is older
  useGame.setState({ room: s });
  if (prev && prev.phase !== s.phase) {
    if (s.phase === "question") play("tick");
    if (s.phase === "finished") play("win");
  }
}

const pushEvent = (e: Omit<FxEvent, "n">) => {
  const ev = { ...e, n: ++evN } as FxEvent;
  useGame.setState((st) => ({ events: [...st.events.slice(-30), ev] }));
};

socket.on("room:state", (s: RoomSnapshot) => applyState(s));
socket.on("player:typing", (e: { id: string; typing: boolean; len: number; text?: string }) => {
  const room = useGame.getState().room;
  if (!room) return;
  useGame.setState({
    room: { ...room, players: room.players.map((p) => (p.id === e.id ? { ...p, typing: e.typing, textLen: e.len, liveText: e.text ?? p.liveText } : p)) },
  });
});
socket.on("player:joined", (e: { id: string }) => { pushEvent({ kind: "joined", id: e.id }); play("join"); });
socket.on("player:left", (e: { id: string }) => pushEvent({ kind: "left", id: e.id }));
socket.on("player:ready", (e: { id: string }) => { pushEvent({ kind: "ready", id: e.id }); play("ready"); });
socket.on("player:answered", (e: { id: string; tier?: RarityTier; points?: number }) => {
  pushEvent({ kind: "answered", id: e.id, tier: e.tier, points: e.points });
  if (e.id !== useGame.getState().me) play("submit");
});
socket.on("potato:boom", (e: { id: string }) => { pushEvent({ kind: "boom", id: e.id }); play("boom"); });
socket.on("potato:life", (e: { id: string }) => { pushEvent({ kind: "life", id: e.id }); play("rare", 3); });

async function syncClock() {
  const samples: number[] = [];
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    try {
      const server = await call<number>("time:ping");
      const t1 = Date.now();
      samples.push(server - (t0 + t1) / 2);
    } catch { /* ignore */ }
  }
  if (samples.length) { samples.sort((a, b) => a - b); useGame.setState({ clockOffset: samples[Math.floor(samples.length / 2)] }); }
}

socket.on("connect", async () => {
  useGame.setState({ connected: true });
  syncClock();
  // session recovery after refresh / network drop
  const code = SS.get<string | null>("room", null);
  if (code) {
    try {
      const r: any = await call("room:join", { code, token: token(), resumeOnly: true });
      if (r.ok) enterRoom(r); else { SS.set("room", null); useGame.setState({ room: null, me: null }); }
    } catch { /* retry on next connect */ }
  }
});
socket.on("disconnect", () => useGame.setState({ connected: false }));

setVolumes(useGame.getState().volumes);
document.documentElement.lang = useGame.getState().lang;
