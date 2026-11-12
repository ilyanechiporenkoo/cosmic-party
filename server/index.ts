import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Server, type Socket } from "socket.io";
import { ContentStore } from "./content.ts";
import { StatsStore } from "./rarity.ts";
import { RoomManager, Room, Player, sanitizeName } from "./rooms.ts";
import { AVATAR_KINDS, type AvatarKind } from "../shared/types.ts";

export function createGameServer(opts: { port?: number; statsFile?: string; contentFile?: string } = {}) {
  const content = new ContentStore(opts.contentFile);
  const stats = new StatsStore(opts.statsFile);
  const app = express();
  const http = createServer(app);
  const io = new Server(http, { cors: { origin: true }, maxHttpBufferSize: 4096, pingInterval: 10_000, pingTimeout: 8_000 });

  const rooms = new RoomManager(content, stats, {
    state: (room) => io.to(room.code).emit("room:state", room.snapshot()),
    event: (room, name, payload) => io.to(room.code).emit(name, payload),
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));
  app.get("/api/meta", (_req, res) => res.json({ questions: content.questions.length, categories: content.categoriesAvailable() }));

  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  if (existsSync(dist)) {
    // hashed assets cache long; index.html must revalidate so new builds show up immediately
    app.use(express.static(dist, { index: "index.html", maxAge: "7d", setHeaders: (res, p) => { if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); } }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile("index.html", { root: dist }));
  }

  const validAvatar = (a: unknown): AvatarKind => ((AVATAR_KINDS as readonly string[]).includes(a as string) ? (a as AvatarKind) : "astro");
  const validToken = (t: unknown) => typeof t === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(t);

  io.on("connection", (socket: Socket) => {
    let room: Room | null = null;
    let me: Player | null = null;
    const ack = (cb: unknown) => (typeof cb === "function" ? (cb as (x: unknown) => void) : () => {});

    const attach = (r: Room, p: Player) => {
      if (room && room !== r) socket.leave(room.code);
      room = r; me = p;
      socket.join(r.code);
      r.connect(p, socket.id);
    };

    socket.on("time:ping", (_d, cb) => ack(cb)(Date.now()));

    socket.on("room:create", (d: any, cb) => {
      const name = sanitizeName(d?.name);
      if (!name) return ack(cb)({ ok: false, error: "badName" });
      if (!validToken(d?.token)) return ack(cb)({ ok: false, error: "badName" });
      if (room && me) room.remove(me);
      const r = rooms.create();
      const p = r.addPlayer(d.token, name, validAvatar(d?.avatar)) as Player;
      attach(r, p);
      ack(cb)({ ok: true, code: r.code, playerId: p.id, state: r.snapshot() });
    });

    socket.on("room:join", (d: any, cb) => {
      const r = rooms.get(d?.code);
      if (!r) return ack(cb)({ ok: false, error: "roomNotFound" });
      if (!validToken(d?.token)) return ack(cb)({ ok: false, error: "badName" });
      const existing = r.byToken(d.token);
      if (existing) { // session recovery: same browser token → same player, score kept
        attach(r, existing);
        return ack(cb)({ ok: true, code: r.code, playerId: existing.id, state: r.snapshot(), resumed: true });
      }
      if (d?.resumeOnly) return ack(cb)({ ok: false, error: "roomNotFound" });
      const name = sanitizeName(d?.name);
      if (!name) return ack(cb)({ ok: false, error: "badName" });
      if (room && me) room.remove(me);
      const p = r.addPlayer(d.token, name, validAvatar(d?.avatar));
      if (typeof p === "string") return ack(cb)({ ok: false, error: p });
      attach(r, p);
      ack(cb)({ ok: true, code: r.code, playerId: p.id, state: r.snapshot() });
    });

    socket.on("room:leave", (_d, cb) => {
      if (room && me) { room.remove(me); socket.leave(room.code); }
      room = null; me = null;
      ack(cb)({ ok: true });
    });

    const guard = (fn: (r: Room, p: Player, d: any, cb: (x: unknown) => void) => void) => (d: any, cb: unknown) => {
      if (!room || !me || !room.players.has(me.id)) return ack(cb)({ ok: false, error: "roomNotFound" });
      try { fn(room, me, d, ack(cb)); } catch (e) { console.error(e); ack(cb)({ ok: false, error: "rate" }); }
    };

    socket.on("player:update", guard((r, p, d, cb) => { r.updatePlayer(p, d ?? {}); cb({ ok: true }); }));
    socket.on("player:ready", guard((r, p, d, cb) => { r.setReady(p, !!d?.ready); cb({ ok: true }); }));
    socket.on("room:settings", guard((r, p, d, cb) => { const e = r.updateSettings(p, d ?? {}); cb(e ? { ok: false, error: e } : { ok: true }); }));
    socket.on("game:start", guard((r, p, _d, cb) => { const e = r.start(p); cb(e ? { ok: false, error: e } : { ok: true }); }));
    socket.on("game:typing", guard((r, p, d) => r.typing(p, d?.text)));
    socket.on("game:preview", guard((r, p, d, cb) => cb(r.preview(p, d?.text))));
    socket.on("game:submit", guard((r, p, d, cb) => cb(r.submit(p, d?.text, d?.choiceId))));
    socket.on("game:skip", guard((r, p, _d, cb) => { r.skipReveal(p); cb({ ok: true }); }));
    socket.on("game:finish", guard((r, p, _d, cb) => { r.finishNow(p); cb({ ok: true }); }));
    socket.on("game:lobby", guard((r, p, _d, cb) => { r.backToLobby(p); cb({ ok: true }); }));

    socket.on("disconnect", () => {
      if (room && me && room.players.has(me.id) && me.socketId === socket.id) room.disconnect(me);
    });
  });

  const port = opts.port ?? Number(process.env.PORT ?? 3210);
  return new Promise<{ port: number; close: () => Promise<void>; rooms: RoomManager; content: ContentStore }>((resolve) => {
    http.listen(port, () => {
      const addr = http.address();
      const actual = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        port: actual, rooms, content,
        close: () => new Promise((res) => { for (const r of rooms.rooms.values()) r.dispose(); io.close(); http.close(() => res()); }),
      });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = await createGameServer();
  console.log(`COSMIC PARTY server on http://localhost:${s.port} (${s.content.questions.length} questions)`);
}
