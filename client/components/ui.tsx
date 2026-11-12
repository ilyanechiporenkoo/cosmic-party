import { useEffect, useRef, useState } from "react";
import { motion, animate, useMotionValue, useTransform } from "motion/react";
import type { RarityTier } from "../../shared/types.ts";
import { play } from "../sound.ts";
import { useGame } from "../store.ts";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; silent?: boolean };
/** Button: 2px lift + slight scale on hover, compression on press (CSS, no springs), soft click. */
export function Btn({ variant = "primary", silent, className = "", children, onClick, ...rest }: BtnProps) {
  return (
    <button {...rest} className={`btn ${variant} ${className}`} onClick={(e) => { if (!silent) play("click"); onClick?.(e); }}>
      {children}
    </button>
  );
}

/** Server-synchronized thin circular countdown; emphasis grows near zero, final seconds pulse. */
export function Timer({ endsAt, total, size = 60 }: { endsAt: number | null; total: number; size?: number }) {
  const now = useGame((s) => s.now);
  const [left, setLeft] = useState(total * 1000);
  const lastSec = useRef<number>(99);
  useEffect(() => {
    if (!endsAt) { setLeft(total * 1000); return; }
    let raf = 0;
    const tick = () => {
      const l = Math.max(0, endsAt - now());
      setLeft(l);
      const s = Math.ceil(l / 1000);
      if (s !== lastSec.current) { if (s <= 3 && s > 0) play("tick"); lastSec.current = s; }
      if (l > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAt, total, now]);
  const sec = Math.ceil(left / 1000);
  const frac = Math.max(0, Math.min(1, left / (total * 1000)));
  const urgent = endsAt !== null && sec <= 5 && left > 0;
  const stroke = !endsAt ? 1 : sec <= 3 ? 2.6 : sec <= 10 ? 1.8 : 1.2;
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  return (
    <div className={urgent ? "timer-pulse" : ""} style={{ width: size, height: size, position: "relative", opacity: endsAt ? 1 : 0.45, transition: "opacity .4s" }} data-testid="timer" data-left={sec}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#fff" strokeOpacity="0.1" strokeWidth="1" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#fff" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-width .4s" }} />
        {endsAt && <circle cx={size / 2 + r * Math.cos(2 * Math.PI * frac)} cy={size / 2 + r * Math.sin(2 * Math.PI * frac)} r={stroke + 1.2} fill="#fff" />}
      </svg>
      <div className="mono-num" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: size * (sec <= 3 && endsAt ? 0.36 : 0.3), transition: "font-size .3s" }}>{sec}</div>
    </div>
  );
}

/** Animated number that counts toward its value and briefly brightens when it changes. */
export function CountUp({ value, sound = false, style }: { value: number; sound?: boolean; style?: React.CSSProperties }) {
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, (v) => Math.round(v).toString());
  const prev = useRef(value);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (prev.current === value) return;
    const from = prev.current; prev.current = value;
    setFlash((f) => f + 1);
    let lastTick = 0;
    const ctl = animate(mv, value, {
      duration: Math.min(1.2, 0.35 + Math.abs(value - from) / 300), ease: [0.2, 0.7, 0.3, 1],
      onUpdate: (v) => { if (sound && Math.floor(v / 10) !== lastTick) { lastTick = Math.floor(v / 10); play("score", lastTick % 10); } },
    });
    return () => ctl.stop();
  }, [value, mv, sound]);
  return (
    <motion.span key={flash} initial={flash ? { opacity: 0.55 } : false} animate={{ opacity: 1, textShadow: flash ? ["0 0 14px rgba(255,255,255,0.9)", "0 0 0 rgba(255,255,255,0)"] : "none" }}
      transition={{ duration: 1.1 }} style={{ fontVariantNumeric: "tabular-nums", display: "inline-block", ...style }}>
      <motion.span>{rounded}</motion.span>
    </motion.span>
  );
}

const STAR = "M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8Z";
const Sparkle = ({ size = 10, ...m }: { size?: number } & Record<string, any>) => (
  <motion.svg width={size} height={size} viewBox="0 0 10 10" style={{ position: "absolute", left: -size / 2, top: -size / 2, overflow: "visible" }} {...m}>
    <path d={STAR} fill="#fff" />
  </motion.svg>
);

/**
 * Monochrome rarity effects. Rarity is told apart by shape, particle count, scale and
 * complexity: sparkle → particles → orbiting dots → orbit ring → expanding circles →
 * shooting star → full burst.
 */
export function RarityBurst({ tier }: { tier: RarityTier }) {
  const center: React.CSSProperties = { position: "absolute", left: "50%", top: "50%", width: 0, height: 0, pointerEvents: "none" };
  const ease = [0.2, 0.8, 0.3, 1] as const;
  const ring = (i: number, max: number, dur = 0.9, width = 1, op = 0.9) => (
    <motion.div key={"r" + i + max} style={{ position: "absolute", left: -10, top: -10, width: 20, height: 20, borderRadius: "50%", border: `${width}px solid #fff` }}
      initial={{ scale: 0.3, opacity: op }} animate={{ scale: max, opacity: 0 }} transition={{ duration: dur, delay: i * 0.12, ease }} />
  );
  const stars = (n: number, dist: number, size = 9, delay = 0) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + 0.4;
      return <Sparkle key={"s" + i + dist + delay} size={size} initial={{ x: 0, y: 0, scale: 0.2, opacity: 1 }}
        animate={{ x: Math.cos(a) * dist, y: Math.sin(a) * dist, scale: [0.2, 1.1, 0.5], opacity: [1, 1, 0], rotate: 120 }} transition={{ duration: 0.9, delay, ease }} />;
    });
  const dots = (n: number, dist: number, r = 2) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return <motion.div key={"d" + i} style={{ position: "absolute", left: -r, top: -r, width: r * 2, height: r * 2, borderRadius: r, background: "#fff" }}
        initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(a) * dist, y: Math.sin(a) * dist, opacity: [1, 1, 0] }} transition={{ duration: 0.8, ease }} />;
    });
  return (
    <div style={center} data-testid={`burst-${tier}`} aria-hidden>
      {tier === "common" && <Sparkle size={12} initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.2, 0], opacity: [0, 1, 0], rotate: 90 }} transition={{ duration: 0.7 }} />}
      {tier === "uncommon" && dots(3, 26, 2)}
      {tier === "interesting" && (
        <motion.div style={{ position: "absolute" }} initial={{ rotate: 0, opacity: 1 }} animate={{ rotate: 300, opacity: [1, 1, 0] }} transition={{ duration: 1.3, ease: "linear" }}>
          {[0, 1, 2, 3].map((i) => { const a = (i / 4) * Math.PI * 2; return <div key={i} style={{ position: "absolute", left: Math.cos(a) * 26 - 2, top: Math.sin(a) * 26 - 2, width: 4, height: 4, borderRadius: 2, background: "#fff", opacity: 0.4 + i * 0.2 }} />; })}
        </motion.div>
      )}
      {tier === "rare" && (
        <motion.div style={{ position: "absolute", left: -44, top: -13, width: 88, height: 26 }} initial={{ opacity: 0, rotate: -18, scale: 0.6 }} animate={{ opacity: [0, 1, 0], rotate: 8, scale: [0.6, 1, 1.12] }} transition={{ duration: 1.3, ease }}>
          <svg width="88" height="26" viewBox="0 0 88 26" style={{ overflow: "visible" }}>
            <ellipse cx="44" cy="13" rx="43" ry="12" fill="none" stroke="#fff" strokeWidth="1" />
            <circle r="2.4" fill="#fff"><animateMotion dur="1.2s" repeatCount="1" path="M87 13 A43 12 0 1 1 1 13 A43 12 0 1 1 87 13" /></circle>
          </svg>
        </motion.div>
      )}
      {tier === "veryRare" && (<>
        {ring(0, 4, 1)}{ring(1, 5.5, 1.1)}{ring(2, 7, 1.2, 1, 0.6)}
        <motion.div style={{ position: "absolute", left: -14, top: -14, width: 28, height: 28, border: "1px solid #fff", rotate: 45 }} initial={{ scale: 0.3, opacity: 1 }} animate={{ scale: 2.6, opacity: 0, rotate: 135 }} transition={{ duration: 1, ease }} />
      </>)}
      {tier === "extreme" && (<>
        <motion.div style={{ position: "absolute", left: 0, top: 0, width: 120, height: 1.5, transformOrigin: "0 50%", background: "linear-gradient(90deg, #fff, transparent)", rotate: 210 }}
          initial={{ x: 110, y: -64, opacity: 0, scaleX: 0.2 }} animate={{ x: 0, y: 0, opacity: [0, 1, 0], scaleX: [0.2, 1, 0.3] }} transition={{ duration: 0.85, ease }} />
        <motion.div style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: 4, background: "#fff", boxShadow: "0 0 14px #fff" }}
          initial={{ x: 110, y: -64, scale: 0.5 }} animate={{ x: 0, y: 0, scale: [0.5, 1, 0], opacity: [1, 1, 0] }} transition={{ duration: 0.95, ease }} />
        {stars(6, 44, 8, 0.75)}
      </>)}
      {tier === "exceptional" && (<>
        <motion.div style={{ position: "absolute", left: -40, top: -40, width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.45), transparent 70%)" }}
          initial={{ scale: 0 }} animate={{ scale: [0, 1.5, 2.1], opacity: [1, 0.7, 0] }} transition={{ duration: 1.6, ease }} />
        <motion.div style={{ position: "absolute", left: -60, top: -18, width: 120, height: 36 }} initial={{ opacity: 0, rotate: -20, scale: 0.5 }} animate={{ opacity: [0, 1, 0], rotate: 15, scale: [0.5, 1.1, 1.3] }} transition={{ duration: 1.6, ease }}>
          <svg width="120" height="36" viewBox="0 0 120 36" style={{ overflow: "visible" }}><ellipse cx="60" cy="18" rx="59" ry="17" fill="none" stroke="#fff" strokeWidth="1" /></svg>
        </motion.div>
        {ring(0, 6, 1.3)}{ring(1, 8, 1.4, 1, 0.7)}{ring(2, 10, 1.5, 1, 0.5)}
        {stars(10, 84, 10)}{stars(6, 50, 7, 0.2)}{dots(12, 120, 1.2)}
      </>)}
    </div>
  );
}

/** grayscale brightness per tier: rarer → brighter */
export const TIER_COLOR: Record<RarityTier, string> = {
  common: "#737373", uncommon: "#8f8f8f", interesting: "#a3a3a3", rare: "#c4c4c4", veryRare: "#dedede", extreme: "#ffffff", exceptional: "#ffffff",
};
export const TIER_LEVEL: Record<RarityTier, number> = { common: 0, uncommon: 1, interesting: 2, rare: 3, veryRare: 4, extreme: 5, exceptional: 6 };

/** 7 tiny segments; lit count = rarity level */
export function TierMeter({ tier, width = 42 }: { tier: RarityTier; width?: number }) {
  const lvl = TIER_LEVEL[tier];
  return (
    <span aria-hidden style={{ display: "inline-flex", gap: 2, verticalAlign: "middle" }}>
      {Array.from({ length: 7 }, (_, i) => (
        <motion.span key={i} initial={{ opacity: 0, scaleY: 0.3 }} animate={{ opacity: i <= lvl ? 1 : 0.18, scaleY: 1 }} transition={{ delay: 0.05 * i, duration: 0.2 }}
          style={{ width: (width - 12) / 7, height: 4 + i * 0.9, background: "#fff", borderRadius: 1, alignSelf: "flex-end" }} />
      ))}
    </span>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="9" fill="#fff" />
      <ellipse cx="20" cy="21" rx="17" ry="5" fill="none" stroke="#fff" strokeWidth="1.4" transform="rotate(-18 20 21)" />
      <circle cx="33" cy="9" r="1.8" fill="#fff" />
    </svg>
  );
}

export const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

/** thin orbital arc that draws itself (question entrance) */
export function OrbitLine({ k, width = 520 }: { k: string | number; width?: number }) {
  return (
    <svg key={k} width={width} height="28" viewBox={`0 0 ${width} 28`} style={{ maxWidth: "90%", overflow: "visible" }} aria-hidden>
      <motion.path d={`M4 22 Q${width / 2} -8 ${width - 4} 22`} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.22, 0.8, 0.24, 1] }} />
      <motion.circle r="2.4" fill="#fff" initial={{ cx: 4, cy: 22, opacity: 0 }} animate={{ cx: [4, width / 2, width - 4], cy: [22, 7, 22], opacity: [0, 1, 1] }} transition={{ duration: 1.1, ease: [0.22, 0.8, 0.24, 1] }} />
    </svg>
  );
}
