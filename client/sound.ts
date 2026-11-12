// Original synthesized sounds (Web Audio). Soft sine/triangle blips, no samples.
export type Sfx = "click" | "join" | "ready" | "submit" | "correct" | "rare" | "tick" | "score" | "rank" | "win" | "error" | "boom" | "pass";

export interface Volumes { master: number; music: number; effects: number; muted: boolean }

let ctx: AudioContext | null = null;
let master: GainNode, fx: GainNode, mus: GainNode;
let vols: Volumes = { master: 0.8, music: 0.35, effects: 0.8, muted: false };
let musicNodes: { stop: () => void } | null = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); fx = ctx.createGain(); mus = ctx.createGain();
  fx.connect(master); mus.connect(master); master.connect(ctx.destination);
  apply();
  return ctx;
}
function apply() {
  if (!ctx) return;
  master.gain.value = vols.muted ? 0 : vols.master;
  fx.gain.value = vols.effects;
  mus.gain.value = vols.music * 0.5;
}
export function setVolumes(v: Volumes) { vols = v; apply(); if (ctx) syncMusic(); }

/** must be called from a user gesture once */
export function unlockAudio() { const c = ensure(); if (c && c.state === "suspended") c.resume(); syncMusic(); }

function tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", gain = 0.18, slideTo?: number) {
  const c = ctx!;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(fx);
  o.start(at); o.stop(at + dur + 0.05);
}
function noise(at: number, dur: number, gain = 0.12, lp = 900) {
  const c = ctx!;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(fx); src.start(at);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

export function play(s: Sfx, intensity = 0) {
  const c = ensure();
  if (!c || vols.muted || c.state !== "running") return;
  const n = c.currentTime + 0.005;
  switch (s) {
    case "click": tone(660, n, 0.07, "triangle", 0.12, 520); break;
    case "join": tone(392, n, 0.14, "sine", 0.14); tone(587, n + 0.08, 0.2, "sine", 0.12); break;
    case "ready": tone(523, n, 0.1, "triangle", 0.12); tone(784, n + 0.07, 0.18, "triangle", 0.12); break;
    case "submit": tone(880, n, 0.09, "sine", 0.14, 1320); break;
    case "correct": tone(659, n, 0.12, "sine", 0.14); tone(988, n + 0.09, 0.22, "sine", 0.12); break;
    case "error": tone(330, n, 0.12, "triangle", 0.08, 260); break;
    case "tick": tone(1046, n, 0.05, "sine", 0.09); break;
    case "pass": tone(700, n, 0.12, "triangle", 0.12, 1200); break;
    case "score": tone(1200 + intensity * 40, n, 0.04, "sine", 0.05); break;
    case "rank": tone(523, n, 0.08, "sine", 0.08, 784); break;
    case "rare": {
      const steps = 2 + Math.min(5, intensity);
      for (let i = 0; i < steps; i++) tone(PENTA[i + 1], n + i * 0.07, 0.35, "sine", 0.1);
      if (intensity >= 5) tone(PENTA[7] * 2, n + steps * 0.07, 0.6, "sine", 0.06);
      break;
    }
    case "win": [0, 2, 4, 5, 7].forEach((k, i) => tone(PENTA[k], n + i * 0.11, 0.5, "triangle", 0.12)); break;
    case "boom": noise(n, 0.5, 0.25, 700); tone(160, n, 0.4, "sine", 0.2, 60); break;
  }
}

// very soft generative ambient pad
function syncMusic() {
  if (!ctx) return;
  const want = !vols.muted && vols.music > 0;
  if (want && !musicNodes) {
    const c = ctx;
    const chords = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 329.63]];
    const voices = [0, 1, 2].map(() => {
      const o = c.createOscillator(); const g = c.createGain(); const f = c.createBiquadFilter();
      o.type = "sine"; f.type = "lowpass"; f.frequency.value = 900; g.gain.value = 0.0;
      o.connect(f); f.connect(g); g.connect(mus); o.start();
      return { o, g };
    });
    let i = 0;
    const step = () => {
      const ch = chords[i++ % chords.length]; const t0 = c.currentTime;
      voices.forEach((v, k) => {
        v.o.frequency.setTargetAtTime(ch[k], t0, 1.2);
        v.g.gain.setTargetAtTime(0.05, t0, 1.5);
      });
    };
    step();
    const id = setInterval(step, 7000);
    musicNodes = { stop: () => { clearInterval(id); voices.forEach((v) => { v.g.gain.setTargetAtTime(0, c.currentTime, 0.4); v.o.stop(c.currentTime + 2); }); } };
  } else if (!want && musicNodes) { musicNodes.stop(); musicNodes = null; }
}
