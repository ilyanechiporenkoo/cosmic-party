import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls, AnimatePresence } from "motion/react";
import type { AvatarKind, PublicPlayer } from "../../shared/types.ts";
import { useGame, type FxEvent } from "../store.ts";

const INK = "#050505";
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };

type Mood = "idle" | "typing" | "happy" | "sad";

function Face({ cx = 50, cy = 56, gap = 9, mood, ink = INK, r = 3.4 }: { cx?: number; cy?: number; gap?: number; mood: Mood; ink?: string; r?: number }) {
  return (
    <g>
      <ellipse className="av-eye" cx={cx - gap} cy={cy} rx={r} ry={r * 1.2} fill={ink} />
      <ellipse className="av-eye" cx={cx + gap} cy={cy} rx={r} ry={r * 1.2} fill={ink} />
      {mood === "happy" && <path d={`M${cx - 5.5} ${cy + 7} Q${cx} ${cy + 14} ${cx + 5.5} ${cy + 7} Z`} fill={ink} />}
      {mood === "typing" && <ellipse cx={cx} cy={cy + 9} rx={2.3} ry={2.7} fill={ink} />}
      {mood === "idle" && <path d={`M${cx - 4} ${cy + 8} Q${cx} ${cy + 11} ${cx + 4} ${cy + 8}`} stroke={ink} strokeWidth={2} strokeLinecap="round" fill="none" />}
      {mood === "sad" && <path d={`M${cx - 4} ${cy + 11} Q${cx} ${cy + 7.5} ${cx + 4} ${cy + 11}`} stroke={ink} strokeWidth={2} strokeLinecap="round" fill="none" />}
    </g>
  );
}

/**
 * Original monochrome space characters. Each has a distinct silhouette so players are
 * recognizable without color; `tone` (white…light gray) only nudges brightness.
 */
export function Creature({ kind, color: tone, mood = "idle", size = 72 }: { kind: AvatarKind; color: string; mood?: Mood; size?: number }) {
  const W = "#fff";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible", display: "block" }} aria-hidden>
      <ellipse cx="50" cy="97" rx="20" ry="2.6" fill="#fff" opacity="0.06" />
      {kind === "astro" && (<g>
        <rect x="31" y="67" width="38" height="23" rx="11" fill={tone} />
        <rect x="43" y="73" width="14" height="6" rx="3" fill={INK} opacity="0.25" />
        <circle cx="50" cy="47" r="29" fill={tone} />
        <rect x="28" y="34" width="44" height="32" rx="16" fill={INK} />
        <rect x="33" y="38" width="10" height="4" rx="2" fill={W} opacity="0.5" />
        <Face cy={51} mood={mood} ink={W} />
        <line className="av-antenna" x1="66" y1="22" x2="72" y2="10" stroke={tone} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="72.5" cy="9" r="3.4" fill={W} />
      </g>)}
      {kind === "moon" && (<g>
        <circle cx="50" cy="56" r="33" fill={tone} />
        <circle cx="33" cy="41" r="5" fill={INK} opacity="0.12" /><circle cx="68" cy="71" r="6" fill={INK} opacity="0.12" /><circle cx="70" cy="42" r="3" fill={INK} opacity="0.12" />
        <path d="M50 23 A33 33 0 0 1 50 89 A25 33 0 0 0 50 23" fill={INK} opacity="0.14" />
        <Face cy={58} mood={mood} />
      </g>)}
      {kind === "alien" && (<g>
        <line className="av-antenna" x1="38" y1="30" x2="30" y2="12" stroke={W} strokeWidth="2" strokeLinecap="round" />
        <line className="av-antenna" x1="62" y1="30" x2="70" y2="12" stroke={W} strokeWidth="2" strokeLinecap="round" />
        <circle cx="30" cy="11" r="3.6" fill={W} /><circle cx="70" cy="11" r="3.6" fill={W} />
        <path d="M18 62 C18 30 82 30 82 62 C82 84 66 92 50 92 C34 92 18 84 18 62Z" fill={INK} stroke={tone} strokeWidth="2.2" />
        <ellipse className="av-eye" cx="50" cy="56" rx="11" ry="12" fill={W} />
        <circle cx="52" cy="57" r="5.5" fill={INK} />
        {mood === "happy" ? <path d="M42 75 Q50 83 58 75 Z" fill={W} /> : mood === "typing" ? <ellipse cx="50" cy="77" rx="2.6" ry="3" fill={W} /> : <path d={mood === "sad" ? "M44 80 Q50 75 56 80" : "M44 76 Q50 80 56 76"} stroke={W} strokeWidth="2" fill="none" strokeLinecap="round" />}
      </g>)}
      {kind === "planet" && (<g>
        <circle cx="50" cy="56" r="27" fill={tone} />
        <path d="M25 49 Q50 43 75 49" stroke={INK} strokeOpacity="0.18" strokeWidth="3.5" fill="none" />
        <Face cy={60} mood={mood} gap={8} />
        <g className="av-ring" style={{ animation: "wiggle 7s ease-in-out infinite" }}>
          <path d="M7 60 A43 11 0 0 0 93 60" fill="none" stroke={W} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M7 60 A43 11 0 0 1 93 60" fill="none" stroke={W} strokeWidth="1.2" opacity="0.35" />
        </g>
      </g>)}
      {kind === "robot" && (<g>
        <line className="av-antenna" x1="50" y1="26" x2="50" y2="12" stroke={tone} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="50" cy="10" r="4" fill={W} />
        <rect x="20" y="26" width="60" height="54" rx="15" fill={tone} />
        <rect x="27" y="34" width="46" height="34" rx="10" fill={INK} />
        <rect className="av-eye" x="35" y="44" width="9" height="9" rx="2.5" fill={W} />
        <rect className="av-eye" x="56" y="44" width="9" height="9" rx="2.5" fill={W} />
        {mood === "happy" ? <path d="M42 58 Q50 65 58 58" stroke={W} strokeWidth="2.6" fill="none" strokeLinecap="round" /> : <rect x={mood === "typing" ? 47 : 44} y="59" width={mood === "typing" ? 6 : 12} height="2.6" rx="1.3" fill={W} opacity="0.9" />}
        <rect x="34" y="80" width="10" height="10" rx="3" fill={tone} opacity="0.7" /><rect x="56" y="80" width="10" height="10" rx="3" fill={tone} opacity="0.7" />
      </g>)}
      {kind === "comet" && (<g>
        <path className="av-antenna" d="M60 40 C80 20 96 22 98 14 C92 30 86 46 70 58Z" fill={W} opacity="0.18" />
        <path d="M62 46 C80 34 90 38 96 32 C88 48 80 58 66 64Z" fill={W} opacity="0.4" />
        <circle cx="46" cy="58" r="27" fill={tone} />
        <Face cx={44} cy={60} mood={mood} gap={8} />
      </g>)}
      {kind === "octo" && (<g>
        {[26, 40, 56, 70].map((x, i) => (
          <path key={x} className="av-antenna" style={{ animationDelay: `${i * 0.2}s` }} d={`M${x} 72 q ${i % 2 ? 4 : -4} 10 0 18`} stroke={tone} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        ))}
        <path d="M18 72 C16 30 84 30 82 72 Z" fill={INK} stroke={tone} strokeWidth="2.2" strokeLinejoin="round" />
        <Face cy={57} mood={mood} ink={W} />
      </g>)}
      {kind === "star" && (<g>
        <path d="M50 12 L60 38 L88 40 L66 58 L74 86 L50 70 L26 86 L34 58 L12 40 L40 38 Z" fill={tone} stroke={tone} strokeWidth="7" strokeLinejoin="round" />
        <Face cy={54} mood={mood} gap={7.5} r={3} />
      </g>)}
    </svg>
  );
}

const STAR = "M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8Z";
/** small burst of white stars (join / submit / bonus life) */
export function StarPop({ count = 6, spread = 32 }: { count?: number; spread?: number }) {
  return (
    <div style={{ position: "absolute", left: "50%", top: "42%", pointerEvents: "none" }} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + 0.3;
        return (
          <motion.svg key={i} width="8" height="8" viewBox="0 0 10 10" style={{ position: "absolute", left: -4, top: -4 }}
            initial={{ x: 0, y: 0, scale: 0.2, opacity: 1 }} animate={{ x: Math.cos(a) * spread, y: Math.sin(a) * spread - 8, scale: 1, opacity: 0, rotate: 90 }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.3, 1] }}>
            <path d={STAR} fill="#fff" />
          </motion.svg>
        );
      })}
    </div>
  );
}

/** thin circular pulse that expands from a point */
export function Pulse({ size = 60 }: { size?: number }) {
  return (
    <motion.div aria-hidden style={{ position: "absolute", left: "50%", top: "45%", width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderRadius: "50%", border: "1px solid #fff", pointerEvents: "none" }}
      initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.3, 1] }} />
  );
}

/**
 * A player on screen: creature + idle float + event-driven reactions.
 * Reactions are triggered only by real multiplayer events from the server.
 */
export function PlayerToken({ p, size = 72, showName = true, children, isMe }: { p: PublicPlayer; size?: number; showName?: boolean; children?: React.ReactNode; isMe?: boolean }) {
  const controls = useAnimationControls();
  const events = useGame((s) => s.events);
  const seen = useRef(events.length ? events[events.length - 1].n : 0);
  const [fx, setFx] = useState<{ n: number; count: number; pulse: boolean } | null>(null);
  const [check, setCheck] = useState(0);
  const seed = hash(p.id);
  const vars = { "--dur": `${3.6 + seed * 1.8}s`, "--delay": `${-seed * 4}s`, "--blink": `${4 + seed * 3}s` } as React.CSSProperties;

  useEffect(() => {
    const fresh = events.filter((e: FxEvent) => e.n > seen.current && e.id === p.id);
    if (events.length) seen.current = Math.max(seen.current, events[events.length - 1].n);
    for (const e of fresh) {
      if (e.kind === "joined") { controls.set({ opacity: 0, y: -14, scale: 0.92 }); controls.start({ opacity: 1, y: [-14, 3, 0], scale: 1, transition: { duration: 0.6, ease: [0.22, 0.8, 0.24, 1] } }); setFx({ n: e.n, count: 6, pulse: false }); }
      if (e.kind === "ready") { controls.start({ y: [0, -10, 0], rotate: [0, -5, 5, 0], transition: { duration: 0.45 } }); setCheck(e.n); }
      if (e.kind === "answered") { controls.start({ scaleY: [1, 0.88, 1.06, 1], scaleX: [1, 1.08, 0.96, 1], y: [0, 0, -8, 0], transition: { duration: 0.42 } }); setFx({ n: e.n, count: 4, pulse: true }); }
      if (e.kind === "boom") controls.start({ x: [0, -7, 7, -4, 4, 0], rotate: [0, -8, 8, -4, 0], transition: { duration: 0.5 } });
      if (e.kind === "life") { controls.start({ scale: [1, 1.18, 1], transition: { duration: 0.5 } }); setFx({ n: e.n, count: 8, pulse: true }); }
    }
  }, [events, p.id, controls]);

  const active = p.online && ((p.typing && !p.answered) || p.answered);
  const mood: Mood = !p.online ? "sad" : p.typing && !p.answered ? "typing" : p.answered || p.ready ? "happy" : "idle";
  return (
    <motion.div layout="position" className={`token ${active ? "lit" : ""} ${p.typing && !p.answered ? "av-typing" : ""} ${p.online ? "" : "av-offline"}`}
      style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: size + 34 }}
      data-player={p.name} data-typing={p.typing ? "1" : "0"} data-answered={p.answered ? "1" : "0"}>
      <motion.div animate={controls} style={{ position: "relative" }}>
        <div className="av-float" style={vars}>
          <Creature kind={p.avatar} color={p.color} mood={mood} size={size} />
        </div>
        <AnimatePresence>
          {p.typing && !p.answered && p.online && (
            <motion.div key="dots" initial={{ opacity: 0, scale: 0.5, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.18 }}
              style={{ position: "absolute", right: -10, top: -4 }}>
              <span className="typing-dots"><i /><i /><i /></span>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {((check > 0 && p.ready) || p.answered) && (
            <motion.div key={"c" + (p.answered ? "a" : check)} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 0.8, 0.24, 1] }}
              style={{ position: "absolute", left: -6, top: -2, width: 20, height: 20, borderRadius: 10, background: "#fff", display: "grid", placeItems: "center" }}>
              <svg width="11" height="11" viewBox="0 0 14 14"><path d="M3 7.5 L6 10 L11 4" stroke="#000" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </motion.div>
          )}
        </AnimatePresence>
        {fx && <StarPop key={"s" + fx.n} count={fx.count} />}
        {fx?.pulse && <Pulse key={"p" + fx.n} size={size} />}
      </motion.div>
      {showName && (
        <div style={{ textAlign: "center", maxWidth: size + 34, lineHeight: 1.2 }}>
          <div style={{ fontWeight: 700, fontSize: size < 60 ? 12 : 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#fff", textDecoration: isMe ? "underline" : undefined, textUnderlineOffset: 4, textDecorationThickness: 1 }}>
            {p.host && <span style={{ marginRight: 4, fontSize: "0.85em" }}>✦</span>}{p.name}
          </div>
          {children}
        </div>
      )}
    </motion.div>
  );
}
