import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Loc } from "../../shared/types.ts";
import { useGame } from "../store.ts";
import { t, CATEGORY_NAMES, TIER_NAMES } from "../i18n.ts";
import { TIER_COLOR, RarityBurst, SendIcon } from "../components/ui.tsx";
import { PlayerToken } from "../components/Avatar.tsx";
import { RoomHeader } from "./Lobby.tsx";
import { play } from "../sound.ts";

/** the unstable cosmic object: a little pulsing nova with a fizzing core */
function Nova({ heat }: { heat: number }) {
  const wob = 2 + heat * 10;
  return (
    <motion.div animate={{ rotate: [-wob, wob, -wob], scale: [1, 1 + heat * 0.12, 1] }} transition={{ duration: Math.max(0.18, 0.7 - heat * 0.5), repeat: Infinity, ease: "easeInOut" }}
      style={{ width: 54, height: 54, filter: `drop-shadow(0 0 ${4 + heat * 16}px rgba(255,255,255,${0.25 + heat * 0.6}))` }} data-testid="nova">
      <svg viewBox="0 0 60 60" width="54" height="54">
        <path d="M30 4 L36 22 L55 22 L40 34 L46 53 L30 42 L14 53 L20 34 L5 22 L24 22Z" fill="#fff" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
        <circle cx="30" cy="31" r={5 + heat * 4} fill="none" stroke="#050505" strokeOpacity={0.15 + heat * 0.35} strokeWidth="1" />
        <circle cx="24" cy="27" r="2" fill="#050505" /><circle cx="36" cy="27" r="2" fill="#050505" />
        <path d={heat > 0.5 ? "M26 36 Q30 33 34 36" : "M26 34 Q30 37 34 34"} stroke="#050505" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </motion.div>
  );
}

export function Potato() {
  const { lang, room, me, now } = useGame();
  const [heat, setHeat] = useState(0);
  const pt = room?.potato;
  useEffect(() => {
    if (!pt) return;
    // heat only reflects time since the sequence started — the real fuse length stays secret on the server
    const id = setInterval(() => setHeat(Math.min(1, Math.max(0, (now() - pt.startedAt) / 26000))), 200);
    return () => clearInterval(id);
  }, [pt?.startedAt, now]);
  if (!room || !pt) return null;
  const holder = room.players.find((p) => p.id === pt.holderId);
  const myTurn = pt.holderId === me && !pt.explodedId && !pt.winnerId;
  const exploded = room.players.find((p) => p.id === pt.explodedId);

  return (
    <div className="screen layer-ui" style={{ gap: 12, paddingBottom: 0 }}>
      <RoomHeader compact />
      <div style={{ textAlign: "center", display: "grid", gap: 8, justifyItems: "center" }}>
        {pt.question && <div className="label">{CATEGORY_NAMES[pt.question.category][lang]}</div>}
        <AnimatePresence mode="wait">
          {pt.question && (
            <motion.h1 key={pt.sequence} className="display title-q" style={{ margin: 0, fontSize: "clamp(26px,4.6vw,50px)" }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45 }}>
              {pt.question.text[lang]}
            </motion.h1>
          )}
        </AnimatePresence>
        <div className="muted" style={{ fontWeight: 700, minHeight: 22 }}>
          {pt.winnerId ? "" : exploded ? <span style={{ color: "#fff" }}>{t(lang, "boom")} {exploded.name} −♥</span> : holder ? `${holder.name} ${t(lang, "holds")}` : ""}
        </div>
      </div>

      <motion.div animate={exploded ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.5 }}
        style={{ flex: "1 0 auto", display: "flex", flexWrap: "wrap", justifyContent: "center", alignContent: "center", gap: "22px 14px", maxWidth: 900, width: "100%" }}>
        {room.players.map((p) => (
          <div key={p.id} style={{ position: "relative", opacity: p.out ? 0.35 : 1, transition: "opacity .6s", filter: p.out ? "grayscale(1)" : undefined }}>
            <PlayerToken p={p} size={room.players.length > 6 ? 54 : 70} isMe={p.id === me}>
              <div style={{ fontSize: 12, letterSpacing: 2, color: "#fff" }} aria-label={t(lang, "lives")}>{p.out ? t(lang, "out") : "♥".repeat(Math.max(0, p.lives))}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", minHeight: 14, letterSpacing: 2 }}>{"✦".repeat(p.shards)}</div>
              {room.settings.visibility === "live" && p.id === pt.holderId && p.liveText && <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{p.liveText}</div>}
            </PlayerToken>
            {p.id === pt.holderId && !p.out && (
              <motion.div layoutId="nova" transition={{ type: "spring", stiffness: 220, damping: 18 }} style={{ position: "absolute", right: -16, top: -18, zIndex: 3 }}>
                {pt.explodedId === p.id ? <div style={{ position: "relative", width: 54, height: 54 }}><RarityBurst tier="extreme" /></div> : <Nova heat={heat} />}
              </motion.div>
            )}
          </div>
        ))}
      </motion.div>

      <AnimatePresence>
        {pt.lastPass && !pt.winnerId && (
          <motion.div key={pt.lastPass.answer.uk + pt.used.length} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ fontWeight: 800, textAlign: "center" }}>
            <span style={{ color: TIER_COLOR[pt.lastPass.tier] }}>{pt.lastPass.answer[lang]}</span> <span className="muted" style={{ fontSize: 13 }}>· {TIER_NAMES[pt.lastPass.tier][lang]}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {pt.used.length > 0 && (
        <div className="muted scroll-hide" style={{ fontSize: 13, fontWeight: 700, maxWidth: 720, textAlign: "center", maxHeight: 40, overflow: "auto" }}>
          {t(lang, "usedAnswers")}: {pt.used.map((u) => u[lang]).join(" · ")}
        </div>
      )}
      <PotatoInput active={myTurn} sequence={pt.sequence} holderKey={pt.holderId + ":" + pt.used.length} />
    </div>
  );
}

function PotatoInput({ active, sequence, holderKey }: { active: boolean; sequence: number; holderKey: string }) {
  const { lang, typing, submit, preview } = useGame();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [opts, setOpts] = useState<{ id: string; label: Loc }[] | null>(null);
  const [pv, setPv] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const pvT = useRef(0);
  useEffect(() => { setText(""); setMsg(null); setOpts(null); setPv(null); if (active) { play("pass"); requestAnimationFrame(() => ref.current?.focus()); } }, [active, sequence, holderKey]);
  const send = async (choiceId?: string) => {
    if (!text.trim()) return;
    const r = await submit(text, choiceId);
    if (r.ok) { play("correct"); return; }
    if (r.reason === "ambiguous") { setOpts(r.options ?? null); return; }
    setMsg(t(lang, r.reason === "used" ? "used" : r.reason === "notYourTurn" ? "notYourTurn" : r.reason === "rate" ? "tooFast" : "notFound"));
    play("error"); ref.current?.focus();
  };
  return (
    <div style={{ width: "100%", maxWidth: 680, paddingBottom: 16, position: "sticky", bottom: 0, background: "linear-gradient(transparent, var(--bg) 40%)", paddingTop: 6 }}>
      <div style={{ minHeight: 28, textAlign: "center", fontWeight: 800 }}>
        {opts ? (
          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>{opts.map((o) => <button key={o.id} className="chip" onClick={() => { setOpts(null); send(o.id); }}>{o.label[lang]}</button>)}</span>
        ) : msg ? <span style={{ color: "#fff" }}>— {msg}</span> : pv ? <span style={{ color: "#fff" }}><span className="muted">→</span> {pv}</span> : active ? <span style={{ color: "#fff" }}>{t(lang, "yourTurn")}</span> : null}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ position: "relative" }}>
        <input ref={ref} className="field" value={text} disabled={!active} maxLength={60} placeholder={t(lang, "answerPh")} autoComplete="off" spellCheck={false} data-testid="potato-answer"
          onChange={(e) => {
            const v = e.target.value; setText(v); setMsg(null); setOpts(null); typing(v);
          }}
          style={{ height: 64, fontSize: 20, paddingRight: 72, boxShadow: active ? "inset 0 0 0 1px #fff, 0 0 24px -6px rgba(255,255,255,0.35)" : undefined }} />
        <button type="submit" aria-label={t(lang, "send")} disabled={!active || !text.trim()} className="icon-btn"
          style={{ position: "absolute", right: 9, top: 9, width: 46, height: 46, background: active && text.trim() ? "#fff" : "var(--bg3)", color: active && text.trim() ? "#000" : "var(--dim)", transition: "background .2s, color .2s" }}><SendIcon /></button>
      </form>
    </div>
  );
}
