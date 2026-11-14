import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import type { PreviewResult, PublicPlayer, RevealEntry, Loc } from "../../shared/types.ts";
import { useGame } from "../store.ts";
import { t, CATEGORY_NAMES, TIER_NAMES } from "../i18n.ts";
import { Btn, Timer, CountUp, RarityBurst, TIER_COLOR, TIER_LEVEL, TierMeter, SendIcon, OrbitLine } from "../components/ui.tsx";
import { PlayerToken, Creature } from "../components/Avatar.tsx";
import { RoomHeader } from "./Lobby.tsx";
import { play } from "../sound.ts";

const EASE = [0.22, 0.8, 0.24, 1] as const;

export function Game() {
  const { lang, room, me } = useGame();
  if (!room) return null;
  const q = room.question ?? room.reveal?.question ?? null;
  const total = room.totalRounds;
  const isHost = room.players.find((p) => p.id === me)?.host;

  return (
    <div className="screen layer-ui" style={{ gap: 8, paddingBottom: 0 }}>
      <RoomHeader compact />
      {/* top: round · category · progress · timer, separated by thin lines */}
      <div style={{ width: "100%", maxWidth: 920, display: "flex", alignItems: "center", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", minWidth: 0 }}>
          <span className="label" data-testid="round" style={{ color: "#fff" }}>{t(lang, "round")} {room.round}{total ? ` / ${total}` : ""}</span>
          <span style={{ width: 1, height: 14, background: "var(--border)" }} />
          {q && <span className="label">{CATEGORY_NAMES[q.category][lang]}</span>}
          {total > 0 && (
            <div style={{ display: "flex", gap: 3, flexBasis: "100%", maxWidth: 260 }} aria-hidden>
              {Array.from({ length: total }, (_, i) => (
                <motion.span key={i} animate={{ opacity: i + 1 < room.round ? 0.75 : i + 1 === room.round ? 1 : 0.15, flexGrow: i + 1 === room.round ? 3 : 1 }}
                  transition={{ duration: 0.5, ease: EASE }} style={{ height: 2, borderRadius: 1, background: "#fff", display: "block", flexBasis: 0 }} />
              ))}
            </div>
          )}
        </div>
        <Timer endsAt={room.phase === "question" ? room.endsAt : null} total={room.settings.timer} size={58} />
      </div>

      {/* center: the question is the focus */}
      <div style={{ flex: "1 0 auto", width: "100%", maxWidth: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: 0, padding: "8px 0" }}>
        <AnimatePresence mode="wait">
          {room.phase === "intro" ? (
            <motion.div key={"intro" + room.round} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.45, ease: EASE }} style={{ textAlign: "center" }}>
              <div className="label">{t(lang, "intro")}</div>
              <div className="display" style={{ fontSize: "clamp(64px,12vw,140px)" }}>{String(room.round).padStart(2, "0")}</div>
            </motion.div>
          ) : q && (
            <motion.div key={q.id + room.round} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -22 }} transition={{ duration: 0.55, ease: EASE }}>
              <h1 className="display title-q" data-testid="question" style={{ margin: 0, maxWidth: 900 }}>{q.text[lang]}</h1>
              <OrbitLine k={q.id + room.round} width={Math.min(560, q.text[lang].length * 18)} />
            </motion.div>
          )}
        </AnimatePresence>
        {room.phase === "reveal" && room.reveal ? <Reveal /> : <Arena />}
      </div>

      {room.phase === "reveal" ? (
        <div style={{ display: "flex", gap: 8, paddingBottom: 18 }}>
          {isHost && <Btn variant="secondary" onClick={() => useGame.getState().host("game:skip")}>{t(lang, "next")}</Btn>}
          {isHost && total === 0 && <Btn variant="ghost" onClick={() => useGame.getState().host("game:finish")}>{t(lang, "finishGame")}</Btn>}
        </div>
      ) : <AnswerBox />}
    </div>
  );
}

/** players during the question — avatars react to real typing/submission events */
function Arena() {
  const { lang, room, me } = useGame();
  if (!room) return null;
  const n = room.players.length;
  const size = n <= 4 ? 64 : n <= 8 ? 52 : 42;
  const live = room.settings.visibility === "live";
  return (
    <LayoutGroup>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: n > 8 ? "8px 2px" : "14px 12px", width: "100%" }} data-testid="arena">
        {room.players.map((p) => (
          <PlayerToken key={p.id} p={p} size={size} isMe={p.id === me}>
            <div className="mono-num" style={{ fontSize: 13, color: "var(--muted)" }}><CountUp value={p.score} /></div>
            <div style={{ minHeight: 17, fontSize: 12, fontWeight: 600, maxWidth: size + 34, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: p.answered ? "#fff" : "var(--muted)" }}>
              {p.answered ? t(lang, "answered") : live && p.liveText ? p.liveText : p.typing ? "·".repeat(Math.min(8, p.textLen)) : ""}
            </div>
          </PlayerToken>
        ))}
      </div>
    </LayoutGroup>
  );
}

function AnswerBox() {
  const { lang, room, me, typing, preview, submit } = useGame();
  const [text, setText] = useState("");
  const [pv, setPv] = useState<PreviewResult | null>(null);
  const [status, setStatus] = useState<null | { kind: "notFound" | "wrongLetter" | "rate" | "closed" | "ambiguous"; options?: { id: string; label: Loc }[] }>(null);
  const [accepted, setAccepted] = useState<Loc | null>(null);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const typingT = useRef<number>(0);
  const pvTimer = useRef<number>(0);
  const mine = room?.players.find((p) => p.id === me);
  const qid = room?.question?.id;
  const open = room?.phase === "question" && !mine?.answered;

  useEffect(() => { setText(""); setPv(null); setStatus(null); setAccepted(null); }, [qid, room?.round]);
  useEffect(() => { if (room?.phase === "question") requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true })); }, [room?.phase, qid]);

  const onChange = (v: string) => {
    setText(v); setStatus(null);
    // typing relay: throttled to ~10/s, trailing update guaranteed
    clearTimeout(typingT.current);
    const now = performance.now();
    if (now - lastTyping.current > 90) { typing(v); lastTyping.current = now; }
    else typingT.current = window.setTimeout(() => { typing(inputRef.current?.value ?? v); lastTyping.current = performance.now(); }, 100);
    // no live suggestions while typing — similar answers appear only after Enter (server reply to submit)
  };

  const send = async (choiceId?: string) => {
    if (!text.trim() || !open) return;
    play("submit");
    const r = await submit(text, choiceId);
    if (r.ok) { setAccepted(r.answer.label); setStatus(null); play("correct"); typing(""); return; }
    if (r.reason === "ambiguous") { setStatus({ kind: "ambiguous", options: r.options }); return; }
    setStatus({ kind: r.reason === "rate" ? "rate" : r.reason === "closed" ? "closed" : r.reason === "wrongLetter" ? "wrongLetter" : "notFound" });
    setShake((s) => s + 1); play("error");
    inputRef.current?.focus(); // never lock or clear after an invalid attempt
  };

  const showPreview = pv?.status === "match" && pv.answer && pv.kind !== "exact" && text.trim();
  return (
    <div style={{ width: "100%", maxWidth: 720, position: "sticky", bottom: 0, paddingBottom: 18, paddingTop: 10, background: "linear-gradient(transparent, var(--bg) 38%)" }}>
      <div style={{ minHeight: 30, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8, fontSize: 14 }} aria-live="polite">
        <AnimatePresence mode="popLayout">
          {accepted ? (
            <motion.div key="acc" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ fontWeight: 700 }} data-testid="accepted">
              ✓ {t(lang, "accepted")} <span className="dim">·</span> <span className="muted">{t(lang, "waitOthers")}</span>
            </motion.div>
          ) : status?.kind === "ambiguous" ? (
            <motion.div key="amb" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <span className="muted" style={{ fontWeight: 600 }}>{t(lang, "pickOne")}</span>
              {status.options?.map((o) => <button key={o.id} className="chip" onClick={() => send(o.id)}>{o.label[lang]}</button>)}
            </motion.div>
          ) : status ? (
            <motion.div key={"st" + shake} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ fontWeight: 700, color: "#fff" }} data-testid="not-found">
              — {t(lang, status.kind === "rate" ? "tooFast" : status.kind === "closed" ? "closed" : status.kind === "wrongLetter" ? "wrongLetter" : "notFound")}
            </motion.div>
          ) : showPreview ? (
            <motion.div key="pv" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ fontWeight: 600 }} data-testid="preview">
              <span className="dim">{text.trim()}</span> <span className="muted">→</span> <span style={{ color: "#fff", fontWeight: 800 }}>{pv!.answer!.label[lang]}</span>
            </motion.div>
          ) : pv?.status === "ambiguous" ? (
            <motion.div key="pva" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="muted" style={{ fontWeight: 600 }}>
              {pv.options!.slice(0, 3).map((o) => o.label[lang]).join(" · ")} …
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <motion.form key={shake} animate={shake ? { x: [0, -6, 5, -3, 2, 0] } : {}} transition={{ duration: 0.32 }}
        onSubmit={(e) => { e.preventDefault(); send(); }} style={{ position: "relative" }}>
        <input ref={inputRef} className="field" data-testid="answer" value={accepted ? accepted[lang] : text} disabled={!open} enterKeyHint="send"
          onChange={(e) => onChange(e.target.value)} placeholder={room?.phase === "intro" ? t(lang, "intro") + "…" : t(lang, "answerPh")} maxLength={60}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          style={{ height: 64, fontSize: 20, paddingRight: 72, boxShadow: accepted ? "inset 0 0 0 1px #fff" : status?.kind === "notFound" ? "inset 0 0 0 1px #8a8a8a" : undefined }} />
        <button type="submit" aria-label={t(lang, "send")} data-testid="send" disabled={!open || !text.trim()} className="icon-btn"
          style={{ position: "absolute", right: 9, top: 9, width: 46, height: 46, background: open && text.trim() ? "#fff" : "var(--bg3)", color: open && text.trim() ? "#000" : "var(--dim)", transition: "background .2s, color .2s, transform .2s" }}>
          {accepted ? "✓" : <SendIcon />}
        </button>
      </motion.form>
    </div>
  );
}

/** round results: sequential reveal → rarity effect → points count → rows glide to new ranking */
function Reveal() {
  const { lang, room, me } = useGame();
  const rv = room!.reveal!;
  const [step, setStep] = useState(0);
  const players = useMemo(() => new Map(room!.players.map((p) => [p.id, p] as const)), [room!.players]);
  // reveal order: rarest last for drama
  const order: RevealEntry[] = useMemo(() => [...rv.entries].sort((a, b) => (a.answer ? 0 : -1) - (b.answer ? 0 : -1) || a.points - b.points), [rv]);
  const n = order.length;
  const done = step >= n;
  useEffect(() => {
    setStep(0);
    const id = setInterval(() => setStep((s) => { if (s >= n) { clearInterval(id); return s; } return s + 1; }), 620);
    return () => clearInterval(id);
  }, [rv.round, n]);
  useEffect(() => {
    if (step === 0 || step > n) return;
    const e = order[step - 1];
    if (e.tier) play(TIER_LEVEL[e.tier] >= 3 ? "rare" : "correct", TIER_LEVEL[e.tier]);
    if (step === n) setTimeout(() => play("rank"), 500);
  }, [step]); // eslint-disable-line
  const revealed = new Set(order.slice(0, step).map((e) => e.playerId));
  const before = [...rv.entries].sort((a, b) => (b.total - b.points) - (a.total - a.points)).map((e) => e.playerId);
  const after = [...rv.entries].sort((a, b) => b.total - a.total).map((e) => e.playerId);
  const rows = done ? after : before;

  return (
    <div style={{ width: "100%", maxWidth: 620, display: "grid" }} data-testid="reveal">
      <LayoutGroup>
        {rows.map((pid, rank) => {
          const e = rv.entries.find((x) => x.playerId === pid)!;
          const p = players.get(pid) as PublicPlayer | undefined;
          if (!p) return null;
          const shown = revealed.has(pid);
          const climbed = done && before.indexOf(pid) > after.indexOf(pid);
          const leader = done && rank === 0;
          return (
            <motion.div key={pid} layout transition={{ duration: 0.7, ease: EASE }}
              style={{ display: "grid", gridTemplateColumns: "26px 44px 1fr auto", alignItems: "center", gap: 14, padding: "10px 14px", borderBottom: "1px solid var(--line)", borderRadius: leader ? 12 : 0,
                background: leader ? "rgba(255,255,255,0.06)" : p.id === me ? "rgba(255,255,255,0.025)" : "transparent", transition: "background .6s" }}
              data-testid="reveal-row">
              <div className="mono-num" style={{ fontSize: 13, color: leader ? "#fff" : "var(--dim)", display: "flex", alignItems: "center", gap: 2 }}>
                {leader ? "✦" : rank + 1}
              </div>
              <motion.div animate={shown && e.tier ? { y: [0, -6, 0], rotate: [0, -4, 4, 0] } : {}} transition={{ duration: 0.45 }}>
                <Creature kind={p.avatar} color={p.color} size={40} mood={shown ? (e.answer ? "happy" : "sad") : "idle"} />
              </motion.div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  {p.name}
                  <AnimatePresence>{climbed && <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} style={{ color: "#fff", fontSize: 12 }} data-testid="climb">↑</motion.span>}</AnimatePresence>
                </div>
                <AnimatePresence mode="wait">
                  {shown ? (
                    <motion.div key="a" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
                      style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: 18, color: e.answer ? "#fff" : "var(--dim)" }}>{e.answer ? e.answer[lang] : t(lang, "noAnswer")}</span>
                      {e.tier && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: TIER_COLOR[e.tier], textTransform: "uppercase", letterSpacing: "0.1em" }} data-testid="tier">
                        <TierMeter tier={e.tier} />{TIER_NAMES[e.tier][lang]}</span>}
                    </motion.div>
                  ) : <motion.div key="q" className="dim" style={{ fontWeight: 800, letterSpacing: 4 }}>···</motion.div>}
                </AnimatePresence>
              </div>
              <div style={{ position: "relative", textAlign: "right", minWidth: 76 }}>
                {shown && e.tier && <RarityBurst tier={e.tier} />}
                <AnimatePresence>{shown && e.points > 0 && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
                    className="mono-num" style={{ fontSize: 13, color: e.tier ? TIER_COLOR[e.tier] : "var(--dim)" }} data-testid="points">+{e.points}</motion.div>
                )}</AnimatePresence>
                <div className="display" style={{ fontSize: 26 }}><CountUp value={shown ? e.total : e.total - e.points} sound={shown && e.points > 0} /></div>
              </div>
            </motion.div>
          );
        })}
      </LayoutGroup>
      <AnimatePresence>{done && rv.topAnswers.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="dim" style={{ textAlign: "center", fontSize: 12, fontWeight: 600, marginTop: 12 }}>
          {t(lang, "popular")}: {rv.topAnswers.map((a) => a.label[lang]).join(" · ")} — {rv.question.answerCount} {t(lang, "answers")}
        </motion.div>
      )}</AnimatePresence>
      {!done && <button className="label" style={{ justifySelf: "center", padding: 10, marginTop: 4 }} onClick={() => setStep(n)}>{t(lang, "skip")} ›</button>}
    </div>
  );
}
