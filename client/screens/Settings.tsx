import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useGame } from "../store.ts";
import { t } from "../i18n.ts";
import { Btn } from "../components/ui.tsx";
import { play, unlockAudio } from "../sound.ts";

export function LangSwitch() {
  const { lang, setLang } = useGame();
  return (
    <div role="group" aria-label={t(lang, "language")} style={{ display: "flex", borderRadius: 10, padding: 3, boxShadow: "inset 0 0 0 1px var(--border)" }}>
      {(["uk", "ru"] as const).map((l) => (
        <button key={l} onClick={() => { setLang(l); play("click"); }} aria-pressed={lang === l} data-testid={`lang-${l}`}
          style={{ position: "relative", padding: "7px 12px", borderRadius: 7, fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", color: lang === l ? "#000" : "var(--muted)", transition: "color .2s" }}>
          {lang === l && <motion.span layoutId="lang-pill" style={{ position: "absolute", inset: 0, borderRadius: 7, background: "#fff", zIndex: 0 }} transition={{ duration: 0.25, ease: [0.22, 0.8, 0.24, 1] }} />}
          <span style={{ position: "relative", zIndex: 1 }}>{l === "uk" ? "УКР" : "РУС"}</span>
        </button>
      ))}
    </div>
  );
}

const Gear = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" /></svg>
);

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const { lang } = useGame();
  return (<>
    <motion.button className="icon-btn" aria-label={t(lang, "settings")} onClick={() => { unlockAudio(); play("click"); setOpen(true); }} whileHover={{ rotate: 45 }} transition={{ duration: 0.4 }} data-testid="settings">
      <Gear />
    </motion.button>
    <AnimatePresence>{open && <SettingsModal onClose={() => setOpen(false)} />}</AnimatePresence>
  </>);
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { lang, volumes, setVolumes, reducedMotion, setReducedMotion } = useGame();
  const slider = (k: "master" | "music" | "effects") => (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}><span>{t(lang, k)}</span><span className="muted">{Math.round(volumes[k] * 100)}</span></span>
      <input type="range" min={0} max={1} step={0.05} value={volumes[k]} onChange={(e) => setVolumes({ [k]: Number(e.target.value) })} onPointerUp={() => play("click")} />
    </label>
  );
  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button onClick={() => { set(!on); play("click"); }} aria-pressed={on} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, fontSize: 14, padding: "6px 0" }}>
      <span>{label}</span>
      <span style={{ width: 44, height: 26, borderRadius: 13, background: on ? "#fff" : "var(--bg3)", boxShadow: "inset 0 0 0 1px var(--border)", position: "relative", transition: "background .2s" }}>
        <motion.span animate={{ x: on ? 20 : 2 }} transition={{ duration: 0.22, ease: [0.22, 0.8, 0.24, 1] }} style={{ position: "absolute", top: 3, left: 0, width: 20, height: 20, borderRadius: 10, background: on ? "#000" : "#a3a3a3" }} />
      </span>
    </button>
  );
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 40, display: "grid", placeItems: "center", padding: 16 }}>
      <motion.div className="card" role="dialog" aria-label={t(lang, "settings")} onClick={(e) => e.stopPropagation()}
        initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.96 }} transition={{ duration: 0.3, ease: [0.22, 0.8, 0.24, 1] }}
        style={{ width: "min(420px, 100%)", display: "grid", gap: 16, background: "var(--bg2)" }}>
        <div className="display" style={{ fontSize: 22 }}>{t(lang, "settings")}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 700, fontSize: 14 }}>{t(lang, "language")}</span><LangSwitch /></div>
        {slider("master")}{slider("music")}{slider("effects")}
        {toggle(volumes.muted, (v) => setVolumes({ muted: v }), t(lang, "mute"))}
        {toggle(reducedMotion, setReducedMotion, t(lang, "reducedMotion"))}
        <Btn variant="secondary" onClick={onClose}>{t(lang, "close")}</Btn>
      </motion.div>
    </motion.div>
  );
}
