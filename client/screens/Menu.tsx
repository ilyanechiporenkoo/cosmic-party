import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AVATAR_KINDS } from "../../shared/types.ts";
import { useGame } from "../store.ts";
import { t, AVATAR_NAMES, ERRORS } from "../i18n.ts";
import { Btn, Logo } from "../components/ui.tsx";
import { Creature } from "../components/Avatar.tsx";
import { unlockAudio } from "../sound.ts";
import { SettingsButton, LangSwitch } from "./Settings.tsx";

const enter = (i: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.35 + i * 0.1, duration: 0.55, ease: [0.22, 0.8, 0.24, 1] as [number, number, number, number] } });

export function ProfileEditor() {
  const { lang, name, avatar, setProfile } = useGame();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
      <label className="label" htmlFor="nick">{t(lang, "nickname")}</label>
      <input id="nick" className="field" value={name} maxLength={16} placeholder={t(lang, "nicknamePh")} autoComplete="off"
        onChange={(e) => setProfile({ name: e.target.value })} />
      <div className="label" style={{ marginTop: 4 }}>{t(lang, "chooseAvatar")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {AVATAR_KINDS.map((k, i) => (
          <motion.button key={k} aria-label={AVATAR_NAMES[k][lang]} aria-pressed={avatar === k} onClick={() => setProfile({ avatar: k })}
            whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} transition={{ duration: 0.18 }}
            style={{ borderRadius: 18, padding: "8px 0 4px", display: "grid", placeItems: "center", background: avatar === k ? "rgba(255,255,255,0.07)" : "transparent", boxShadow: avatar === k ? "inset 0 0 0 1px #fff" : "inset 0 0 0 1px var(--line)", transition: "background .2s, box-shadow .2s" }}>
            <div className="av-float" style={{ "--dur": `${3.4 + i * 0.3}s`, "--delay": `${-i * 0.7}s` } as React.CSSProperties}>
              <Creature kind={k} color="#fff" size={50} mood={avatar === k ? "happy" : "idle"} />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function Menu() {
  const { lang, name, joinCode, createRoom, joinRoom, error, setError } = useGame();
  const [panel, setPanel] = useState<null | "create" | "join">(joinCode ? "join" : null);
  const [code, setCode] = useState(joinCode);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    unlockAudio();
    if (!name.trim()) { setError("badName"); return; }
    setBusy(true);
    if (panel === "create") await createRoom(); else await joinRoom(code);
    setBusy(false);
  };

  return (
    <div className="screen layer-ui" style={{ justifyContent: "space-between" }}>
      <header style={{ width: "100%", maxWidth: 1100, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo /><span className="display" style={{ fontSize: 13, letterSpacing: "0.14em", fontWeight: 700 }}>COSMIC PARTY</span>
        </motion.div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}><LangSwitch /><SettingsButton /></div>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, width: "100%", maxWidth: 560, textAlign: "center", padding: "16px 0" }}>
        <AnimatePresence mode="wait">
          {!panel ? (
            <motion.div key="hero" exit={{ opacity: 0, y: -16, transition: { duration: 0.2 } }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
              <HeroOrbit />
              <motion.h1 className="display title-xl" style={{ margin: 0 }} initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 0.8, 0.24, 1] }}>
                Cosmic<br />Party
              </motion.h1>
              <motion.p {...enter(0)} className="muted" style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>{t(lang, "subtitle")}</motion.p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
                <motion.div {...enter(1)}><Btn variant="primary" onClick={() => { unlockAudio(); setPanel("create"); }} data-testid="create">{t(lang, "create")}</Btn></motion.div>
                <motion.div {...enter(2)}><Btn variant="secondary" onClick={() => { unlockAudio(); setPanel("join"); }} data-testid="join">{t(lang, "join")}</Btn></motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="panel" className="card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.4, ease: [0.22, 0.8, 0.24, 1] }} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
              {panel === "join" && (<>
                <label className="label" htmlFor="code">{t(lang, "joinTitle")}</label>
                <input id="code" className="field display" value={code} maxLength={6} autoComplete="off" spellCheck={false} placeholder="ABC234"
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  style={{ letterSpacing: "0.35em", fontSize: 24, textAlign: "center" }} />
              </>)}
              <ProfileEditor />
              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 6 }}>
                <Btn variant="ghost" onClick={() => { setPanel(null); setError(null); }}>{t(lang, "back")}</Btn>
                <Btn variant="primary" disabled={busy || (panel === "join" && code.length !== 6)} onClick={go} data-testid="go">
                  {panel === "create" ? t(lang, "create") : t(lang, "enter")}
                </Btn>
              </div>
              {error && <div role="alert" style={{ color: "#fff", fontWeight: 700 }}>{ERRORS[error as keyof typeof ERRORS]?.[lang] ?? ERRORS.offline[lang]}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <footer style={{ height: 24 }} />
    </div>
  );
}

/** central idle illustration: a white planet with thin orbits; a tiny crew rides along */
function HeroOrbit() {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, duration: 0.9, ease: [0.22, 0.8, 0.24, 1] }}
      style={{ position: "relative", width: 240, height: 130 }} aria-hidden>
      <svg width="240" height="130" viewBox="0 0 240 130" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <motion.ellipse cx="120" cy="66" rx="112" ry="34" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.3, ease: [0.22, 0.8, 0.24, 1] }} transform="rotate(-8 120 66)" />
        <ellipse cx="120" cy="66" rx="84" ry="24" fill="none" stroke="#fff" strokeOpacity="0.1" strokeDasharray="1 5" strokeLinecap="round" transform="rotate(-8 120 66)" />
        <circle cx="120" cy="64" r="30" fill="#fff" />
        <circle cx="110" cy="56" r="5" fill="#000" opacity="0.08" /><circle cx="132" cy="74" r="7" fill="#000" opacity="0.08" />
        <path d="M120 34 A30 30 0 0 1 120 94 A22 30 0 0 0 120 34" fill="#000" opacity="0.2" />
        <g transform="rotate(-8 120 66)">
          <circle r="3" fill="#fff"><animateMotion dur="14s" repeatCount="indefinite" path="M232 66 A112 34 0 1 1 8 66 A112 34 0 1 1 232 66" /></circle>
          <circle r="1.8" fill="#fff" opacity="0.6"><animateMotion dur="22s" repeatCount="indefinite" path="M36 66 A84 24 0 1 0 204 66 A84 24 0 1 0 36 66" /></circle>
        </g>
      </svg>
      <motion.div style={{ position: "absolute", left: 4, top: 46 }} animate={{ y: [0, -6, 0], rotate: [-5, 5, -5] }} transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}>
        <Creature kind="astro" color="#fff" size={40} />
      </motion.div>
      <motion.div style={{ position: "absolute", right: 2, top: 14 }} animate={{ y: [0, 6, 0], rotate: [4, -4, 4] }} transition={{ duration: 3.9, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}>
        <Creature kind="alien" color="#fff" size={36} />
      </motion.div>
    </motion.div>
  );
}
