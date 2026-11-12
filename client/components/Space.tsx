import { useEffect, useRef } from "react";
import { useGame } from "../store.ts";

/** shared smoothed pointer for parallax, exposed as CSS vars --px/--py (≈ -10..10) */
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
let pointerBound = false;
function bindPointer() {
  if (pointerBound) return; pointerBound = true;
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
}

interface Star { x: number; y: number; z: number; r: number; ph: number; sp: number; pulse: number }
interface Dust { x: number; y: number; r: number; a: number; vx: number; vy: number }
interface Shoot { x: number; y: number; vx: number; vy: number; life: number; max: number; len: number }

/**
 * Monochrome canvas starfield: hundreds of white stars on 3 depths with independent twinkle,
 * slow drift + pointer parallax, faint drifting dust, occasional bright pulses and rare shooting
 * stars. Star count adapts to frame time; loop pauses when the tab is hidden.
 * `energy` (0..1) speeds things up while players act; `kick` changes on screen transitions.
 */
export function Starfield({ energy = 0, kick = 0 }: { energy?: number; kick?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useGame((s) => s.reducedMotion);
  const energyRef = useRef(energy); energyRef.current = energy;
  const kickRef = useRef({ v: 0, last: kick });
  if (kickRef.current.last !== kick) { kickRef.current.last = kick; kickRef.current.v = 1; }

  useEffect(() => {
    bindPointer();
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let w = 0, h = 0, dpr = 1, raf = 0;
    let stars: Star[] = [], dust: Dust[] = [], shoots: Shoot[] = [];
    let nextShoot = performance.now() + 4000 + Math.random() * 6000;
    let budget = reduced ? 0.4 : 1;
    const frameTimes: number[] = [];

    const make = () => {
      const target = Math.round(Math.min(560, (w * h) / 2400) * budget);
      stars = Array.from({ length: Math.max(90, target) }, () => {
        const z = Math.random() ** 1.9 * 0.85 + 0.15;
        return { x: Math.random() * w, y: Math.random() * h, z, r: 0.3 + z * 1.15 + (Math.random() < 0.03 ? 0.7 : 0), ph: Math.random() * 6.28, sp: 0.35 + Math.random() * 1.7, pulse: 0 };
      });
      dust = Array.from({ length: Math.round(26 * budget) + 6 }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: 40 + Math.random() * 120, a: 0.006 + Math.random() * 0.01,
        vx: (Math.random() - 0.5) * 0.006, vy: (Math.random() - 0.5) * 0.004,
      }));
    };
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth; h = innerHeight;
      if (!w || !h) return;
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      make();
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(50, now - last); last = now;
      if (!w) { resize(); raf = requestAnimationFrame(loop); return; }
      frameTimes.push(dt);
      if (frameTimes.length > 90) {
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        frameTimes.length = 0;
        if (avg > 24 && budget > 0.3) { budget *= 0.7; make(); } // weaker device → fewer stars
      }
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      const root = document.documentElement.style;
      root.setProperty("--px", (pointer.x * 10).toFixed(2));
      root.setProperty("--py", (pointer.y * 10).toFixed(2));

      const k = kickRef.current; k.v *= 0.965;
      const speed = (reduced ? 0.25 : 1) * (1 + energyRef.current * 2.5 + k.v * 6);
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);

      // cosmic dust: very faint, very slow soft blobs
      for (const d of dust) {
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < -d.r) d.x = w + d.r; if (d.x > w + d.r) d.x = -d.r;
        if (d.y < -d.r) d.y = h + d.r; if (d.y > h + d.r) d.y = -d.r;
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        g.addColorStop(0, `rgba(255,255,255,${d.a})`); g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
      }

      // occasional bright pulse on a random star
      if (Math.random() < dt / (reduced ? 4000 : 1400)) stars[(Math.random() * stars.length) | 0].pulse = 1;

      ctx.fillStyle = "#fff";
      for (const s of stars) {
        s.x -= s.z * 0.011 * dt * speed;
        s.y += s.z * 0.0035 * dt * speed;
        if (s.x < -4) s.x = w + 4; if (s.y > h + 4) s.y = -4;
        const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
        const px = s.x - pointer.x * s.z * 18, py = s.y - pointer.y * s.z * 12;
        if (s.pulse > 0.01) {
          s.pulse *= 0.975;
          ctx.globalAlpha = s.pulse * 0.35;
          ctx.beginPath(); ctx.arc(px, py, s.r * (2 + 5 * s.pulse), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = Math.min(1, (0.18 + s.z * 0.7) * tw + s.pulse * 0.6);
        ctx.beginPath(); ctx.arc(px, py, s.r * (0.8 + tw * 0.25 + s.pulse * 0.8), 0, Math.PI * 2); ctx.fill();
      }

      // rare shooting stars: thin white streak, short fading trail
      if (now > nextShoot && !document.hidden) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        shoots.push({ x: dir > 0 ? Math.random() * w * 0.5 : w * (0.5 + Math.random() * 0.5), y: Math.random() * h * 0.45, vx: dir * (0.8 + Math.random() * 0.5), vy: 0.35 + Math.random() * 0.2, life: 0, max: 650 + Math.random() * 450, len: 70 + Math.random() * 70 });
        nextShoot = now + (reduced ? 18000 : 8000) + Math.random() * 10000 - energyRef.current * 4000;
      }
      shoots = shoots.filter((s) => s.life < s.max);
      for (const s of shoots) {
        s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
        const a = Math.sin(Math.PI * (s.life / s.max));
        const tx = s.x - s.vx * s.len, ty = s.y - s.vy * s.len;
        const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
        g.addColorStop(0, `rgba(255,255,255,${0.85 * a})`); g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 1.1; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const vis = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(loop); } };
    document.addEventListener("visibilitychange", vis);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", vis); };
  }, [reduced]);

  return <canvas ref={ref} className="layer-bg" data-testid="starfield" aria-hidden />;
}

/* ── Grayscale planets ─────────────────────────────────────── */
type PlanetKind = "moon" | "rim" | "ringed" | "giant" | "dot";
let uid = 0;
export function Planet({ kind, size, style, depth = 1, dur = 12, delay = 0 }: { kind: PlanetKind; size: number; style?: React.CSSProperties; depth?: number; dur?: number; delay?: number }) {
  const id = useRef(`pl${++uid}`).current;
  const vars = { "--depth": depth, "--dur": `${dur}s`, "--delay": `${delay}s`, ...style } as React.CSSProperties;
  return (
    <div className="planet" style={vars} aria-hidden data-planet={kind}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        {kind === "moon" && (<>
          <defs><radialGradient id={id} cx="38%" cy="34%" r="70%"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#bdbdbd" /></radialGradient></defs>
          <circle cx="50" cy="50" r="40" fill={`url(#${id})`} />
          <g className="spin" style={{ "--spin": "160s" } as React.CSSProperties}>
            <circle cx="36" cy="40" r="7" fill="#d0d0d0" /><circle cx="35" cy="39" r="5.5" fill="#c4c4c4" />
            <circle cx="62" cy="62" r="9" fill="#cfcfcf" /><circle cx="61" cy="61" r="7" fill="#c2c2c2" />
            <circle cx="64" cy="34" r="3.5" fill="#cacaca" /><circle cx="44" cy="68" r="2.5" fill="#cacaca" />
          </g>
          <path d="M50 10 A40 40 0 0 1 50 90 A30 40 0 0 0 50 10" fill="#000" opacity="0.28" />
        </>)}
        {kind === "rim" && (<>
          <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.95" /><stop offset="0.35" stopColor="#fff" stopOpacity="0.15" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
          <circle cx="50" cy="50" r="38" fill="#0b0b0b" />
          <circle cx="50" cy="50" r="38" fill="none" stroke={`url(#${id})`} strokeWidth="0.9" />
        </>)}
        {kind === "ringed" && (
          <g className="av-ring" style={{ animation: "wiggle 18s ease-in-out infinite" }}>
            <path d="M6 54 A44 11 0 0 1 94 54" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
            <circle cx="50" cy="50" r="22" fill="#050505" stroke="#fff" strokeWidth="1.2" />
            <path d="M30 44 Q50 40 70 44" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.8" />
            <path d="M29 55 Q50 59 71 55" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="0.8" />
            <path d="M6 54 A44 11 0 0 0 94 54" fill="none" stroke="#fff" strokeWidth="1.2" />
          </g>
        )}
        {kind === "giant" && (<>
          <defs><radialGradient id={id} cx="30%" cy="25%" r="85%"><stop offset="0" stopColor="#2a2a2a" /><stop offset="0.6" stopColor="#0d0d0d" /><stop offset="1" stopColor="#050505" /></radialGradient></defs>
          <circle cx="50" cy="50" r="48" fill={`url(#${id})`} />
          <g className="spin" style={{ "--spin": "300s" } as React.CSSProperties} opacity="0.5">
            {[28, 40, 52, 64, 76].map((y, i) => <path key={y} d={`M${6 + i % 2 * 3} ${y} Q50 ${y + (i - 2) * 3} ${94 - i % 2 * 3} ${y}`} stroke="#fff" strokeOpacity={0.05 + (i % 3) * 0.02} strokeWidth="0.6" fill="none" />)}
          </g>
          <path d="M14 30 A48 48 0 0 1 70 4" stroke="#fff" strokeOpacity="0.45" strokeWidth="0.3" fill="none" />
        </>)}
        {kind === "dot" && <circle cx="50" cy="50" r="30" fill="#e5e5e5" />}
      </svg>
    </div>
  );
}

/** thin orbits with moving dots, circular outlines and tiny coordinate markers */
export function OrbitalGeometry({ variant }: { variant: "menu" | "game" | "end" }) {
  const small = typeof innerWidth !== "undefined" && innerWidth < 640;
  const vw = 1000, vh = 700;
  const marker = (x: number, y: number, txt: string) => (
    <g key={txt} opacity="0.4">
      <path d={`M${x - 5} ${y} H${x + 5} M${x} ${y - 5} V${y + 5}`} stroke="#fff" strokeWidth="0.7" />
      <text x={x + 9} y={y + 3} fill="#fff" fontSize="9" fontFamily="Manrope Variable, sans-serif" letterSpacing="1">{txt}</text>
    </g>
  );
  const orbit = (cx: number, cy: number, rx: number, ry: number, rot: number, spin: number, dotR = 2.4, op = 0.1, dashed = false) => (
    <g key={`${cx}${cy}${rx}`} transform={`rotate(${rot} ${cx} ${cy})`}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#fff" strokeOpacity={op} strokeWidth="0.8" strokeDasharray={dashed ? "1 6" : undefined} strokeLinecap="round" />
      <circle r={dotR} fill="#fff">
        <animateMotion dur={`${spin}s`} repeatCount="indefinite" path={`M${cx + rx} ${cy} A${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`} />
      </circle>
    </g>
  );
  return (
    <svg className="layer-bg" style={{ zIndex: 1, width: "100%", height: "100%" }} viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {variant === "menu" && (<>
        {orbit(500, 330, 380, 120, -8, 90, 2.2, 0.09)}
        {orbit(500, 330, 470, 175, -8, 140, 1.6, 0.06, true)}
        <circle cx="500" cy="330" r="250" fill="none" stroke="#fff" strokeOpacity="0.04" />
        {!small && marker(110, 120, "+47°12′")}
        {!small && marker(860, 560, "14 · 29 · 06")}
        {marker(820, 90, "α · 0.3")}
      </>)}
      {variant === "game" && (<>
        {orbit(500, 300, 460, 150, -4, 120, 1.8, 0.05, true)}
        {!small && marker(60, 640, "−12°44′")}
        {!small && marker(900, 70, "06 · 45 · 12")}
      </>)}
      {variant === "end" && (<>
        {orbit(500, 220, 260, 70, -10, 40, 2.4, 0.1)}
        {orbit(500, 220, 340, 100, -10, 70, 1.6, 0.06, true)}
        <circle cx="500" cy="220" r="160" fill="none" stroke="#fff" strokeOpacity="0.05" />
      </>)}
    </svg>
  );
}

/** decorative planets that live behind every screen */
export function SpaceBackdrop({ variant = "menu" }: { variant?: "menu" | "game" | "end" }) {
  const small = typeof innerWidth !== "undefined" && innerWidth < 640;
  return (
    <div className="layer-bg" style={{ zIndex: 1 }}>
      <OrbitalGeometry variant={variant} />
      {variant === "menu" && (<>
        <Planet kind="giant" size={small ? 300 : 560} depth={0.6} dur={22} style={{ right: small ? "-170px" : "-260px", bottom: small ? "-150px" : "-300px" }} />
        <Planet kind="moon" size={small ? 46 : 70} depth={2.8} dur={11} delay={-3} style={{ left: small ? "8%" : "13%", top: small ? "16%" : "20%" }} />
        <Planet kind="ringed" size={small ? 80 : 130} depth={1.8} dur={15} style={{ right: small ? "4%" : "12%", top: small ? "9%" : "13%" }} />
        <Planet kind="dot" size={10} depth={3.5} dur={9} delay={-2} style={{ left: "26%", bottom: "18%" }} />
      </>)}
      {variant === "game" && (<>
        <Planet kind="rim" size={small ? 140 : 260} depth={0.6} dur={20} style={{ right: small ? "-80px" : "-110px", bottom: small ? "20%" : "-90px", opacity: 0.9 }} />
        <Planet kind="moon" size={small ? 22 : 32} depth={2.4} dur={10} delay={-1} style={{ left: "4%", top: "18%", opacity: 0.7 }} />
      </>)}
      {variant === "end" && (<>
        <Planet kind="ringed" size={small ? 170 : 300} depth={1} dur={16} style={{ left: "50%", top: small ? "2%" : "0%", marginLeft: small ? -85 : -150, opacity: 0.32 }} />
        <Planet kind="moon" size={44} depth={2.4} dur={10} style={{ left: "9%", top: "34%" }} />
        <Planet kind="rim" size={70} depth={2} dur={12} delay={-3} style={{ right: "10%", top: "44%" }} />
      </>)}
    </div>
  );
}
