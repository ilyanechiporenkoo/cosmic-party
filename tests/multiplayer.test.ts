import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioc, type Socket } from "socket.io-client";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGameServer } from "../server/index.ts";
import type { RoomSnapshot } from "../shared/types.ts";

let srv: Awaited<ReturnType<typeof createGameServer>>;
const url = () => `http://localhost:${srv.port}`;
const tok = (n: string) => (n + "x".repeat(20)).slice(0, 24);
const call = <T = any>(s: Socket, ev: string, d?: unknown) => new Promise<T>((r) => s.emit(ev, d, r));
const until = <T>(s: Socket, ev: string, pred: (x: T) => boolean, ms = 8000) => new Promise<T>((res, rej) => {
  const t = setTimeout(() => { s.off(ev, h); rej(new Error("timeout waiting " + ev)); }, ms);
  const h = (x: T) => { if (pred(x)) { clearTimeout(t); s.off(ev, h); res(x); } };
  s.on(ev, h);
});
const connect = () => new Promise<Socket>((r) => { const s = ioc(url(), { transports: ["websocket"], forceNew: true }); s.on("connect", () => r(s)); });

beforeAll(async () => { srv = await createGameServer({ port: 0, statsFile: join(mkdtempSync(join(tmpdir(), "cp-")), "stats.db") }); });
afterAll(async () => { await srv.close(); });

describe("two real players", () => {
  it("full classic round: join, ready, same question, synced timer, typing, invalid retries, scoring, consistent reveal", async () => {
    const a = await connect(), b = await connect();
    const created = await call(a, "room:create", { name: "Аня", avatar: "moon", token: tok("a") });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
    const joined = await call(b, "room:join", { code: created.code.toLowerCase(), name: "Борис", avatar: "robot", token: tok("b") });
    expect(joined.ok).toBe(true);
    expect(joined.state.players).toHaveLength(2);

    await call(a, "room:settings", { categories: ["programming"], timer: 10, visibility: "live", earlyEnd: true, rounds: 5 });
    expect((await call(a, "game:start")).error).toBe("notReady");
    await call(b, "player:ready", { ready: true });

    const qa = until<RoomSnapshot>(a, "room:state", (s) => s.phase === "question");
    const qb = until<RoomSnapshot>(b, "room:state", (s) => s.phase === "question");
    expect((await call(a, "game:start")).ok).toBe(true);
    const [sa, sb] = await Promise.all([qa, qb]);
    expect(sa.question!.id).toBe(sb.question!.id);
    expect(sa.endsAt).toBe(sb.endsAt);
    expect(sa.question!.category).toBe("programming");
    // real answers of the drawn question: the most popular one and the least popular one
    const qAnswers = srv.content.index(sa.question!.id).answers;
    const common = qAnswers[0].label, rare = qAnswers[qAnswers.length - 1].label;

    // typing is relayed with live text
    const seen = until<any>(b, "player:typing", (e) => e.id === joined.state.players[0].id && e.text === "pyth");
    a.emit("game:typing", { text: "pyth" });
    expect((await seen).typing).toBe(true);

    // invalid answers never lock: several in a row, then valid
    for (const bad of ["абракадабра", "zzzzzz", "coffee"]) {
      const r = await call(a, "game:submit", { text: bad });
      expect(r).toEqual({ ok: false, reason: "notFound" });
    }
    const prev = await call(a, "game:preview", { text: common.ru.toLowerCase() + "  " });
    expect(prev.status).toBe("match");
    const ok = await call(a, "game:submit", { text: common.ru });
    expect(ok.ok).toBe(true);
    expect((await call(a, "game:submit", { text: "lua" })).reason).toBe("already");

    const ra = until<RoomSnapshot>(a, "room:state", (s) => s.phase === "reveal");
    const rb = until<RoomSnapshot>(b, "room:state", (s) => s.phase === "reveal");
    const okB = await call(b, "game:submit", { text: rare.uk }); // Ukrainian label, Russian-speaking room is fine
    expect(okB.ok).toBe(true);
    const [va, vb] = await Promise.all([ra, rb]);
    expect(va.reveal).toEqual(vb.reveal);
    const ea = va.reveal!.entries.find((e) => e.answer?.ru === common.ru)!;
    const eb = va.reveal!.entries.find((e) => e.answer?.ru === rare.ru)!;
    expect(ea.points).toBeGreaterThan(0);
    expect(eb.points).toBeGreaterThan(ea.points); // least popular answer scores more than the most popular
    expect(va.players.find((p) => p.id === ea.playerId)!.score).toBe(ea.points);
    a.close(); b.close();
  }, 30000);

  it("reconnect with the same token restores the same player and score", async () => {
    const a = await connect(), b = await connect();
    const c = await call(a, "room:create", { name: "Хост", avatar: "astro", token: tok("h1") });
    const j = await call(b, "room:join", { code: c.code, name: "Гість", avatar: "alien", token: tok("g1") });
    const left = until<RoomSnapshot>(a, "room:state", (s) => s.players.some((p) => p.id === j.playerId && !p.online));
    b.close();
    await left;
    const b2 = await connect();
    const back = await call(b2, "room:join", { code: c.code, token: tok("g1"), resumeOnly: true });
    expect(back.ok).toBe(true);
    expect(back.resumed).toBe(true);
    expect(back.playerId).toBe(j.playerId);
    expect(back.state.players.find((p: any) => p.id === j.playerId).online).toBe(true);
    a.close(); b2.close();
  });

  it("hidden mode never leaks typed text", async () => {
    const a = await connect(), b = await connect();
    const c = await call(a, "room:create", { name: "А", avatar: "astro", token: tok("h2") });
    await call(b, "room:join", { code: c.code, name: "Б", avatar: "alien", token: tok("g2") });
    await call(a, "room:settings", { visibility: "hidden", timer: 10 });
    await call(b, "player:ready", { ready: true });
    const q = until<RoomSnapshot>(b, "room:state", (s) => s.phase === "question");
    await call(a, "game:start");
    await q;
    const ev = until<any>(b, "player:typing", () => true);
    a.emit("game:typing", { text: "secret" });
    const e = await ev;
    expect(e.text).toBeUndefined();
    expect(e.len).toBe(6);
    a.close(); b.close();
  }, 15000);

  it("rejects unknown rooms and bad names", async () => {
    const a = await connect();
    expect((await call(a, "room:join", { code: "ZZZZZZ", name: "x", token: tok("q") })).error).toBe("roomNotFound");
    expect((await call(a, "room:create", { name: "   ", token: tok("q") })).error).toBe("badName");
    a.close();
  });
});

describe("hot potato", () => {
  it("only the holder answers, repeats are refused, the object passes, the fuse costs a life, last one wins", async () => {
    process.env.CP_TEST_FUSE_MS = "2500";
    const a = await connect(), b = await connect();
    const c = await call(a, "room:create", { name: "А", avatar: "star", token: tok("p1") });
    const j = await call(b, "room:join", { code: c.code, name: "Б", avatar: "comet", token: tok("p2") });
    await call(a, "room:settings", { mode: "potato", lives: 1, categories: ["programming"] });
    await call(b, "player:ready", { ready: true });
    const first = until<RoomSnapshot>(a, "room:state", (s) => s.phase === "potato" && !!s.potato?.holderId);
    await call(a, "game:start");
    const s0 = await first;
    const ids: Record<string, Socket> = { [c.playerId]: a, [j.playerId]: b };
    const holder = ids[s0.potato!.holderId!], other = holder === a ? b : a;
    // use a real answer of whichever question was drawn, so the test does not depend on the question pool
    const ans = srv.content.index(s0.potato!.question!.id).answers[0].label.ru;
    expect((await call(other, "game:submit", { text: ans })).reason).toBe("notYourTurn");
    expect((await call(holder, "game:submit", { text: "абракадабра" })).reason).toBe("notFound");
    const passed = until<RoomSnapshot>(a, "room:state", (s) => s.potato?.used.length === 1);
    expect((await call(holder, "game:submit", { text: ans })).ok).toBe(true);
    const s1 = await passed;
    expect(s1.potato!.holderId).not.toBe(s0.potato!.holderId);
    expect((await call(other, "game:submit", { text: ans.toUpperCase() })).reason).toBe("used");
    const fin = await until<RoomSnapshot>(a, "room:state", (s) => s.phase === "finished", 9000);
    expect(fin.end!.ranking[0].playerId).toBe(s0.potato!.holderId); // the one who passed survived
    expect(fin.players.filter((p) => p.out)).toHaveLength(1);
    delete process.env.CP_TEST_FUSE_MS;
    a.close(); b.close();
  }, 20000);
});
