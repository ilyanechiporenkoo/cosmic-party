import { useEffect, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { CATEGORY_IDS, type CategoryId, type RoomSettings } from "../../shared/types.ts";
import { useGame } from "../store.ts";
import { t, CATEGORY_NAMES, ERRORS } from "../i18n.ts";
import { Btn, Logo } from "../components/ui.tsx";
import { PlayerToken } from "../components/Avatar.tsx";
import { ProfileEditor } from "./Menu.tsx";
import { SettingsButton, LangSwitch } from "./Settings.tsx";

export function RoomHeader({ compact = false }: { compact?: boolean }) {
  const { lang, room, leave } = useGame();
  const [copied, setCopied] = useState(false);
  if (!room) return null;
  const copy = async () => {
    const url = `${location.origin}${location.pathname}?room=${room.code}`;
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  return (
    <header style={{ width: "100%", maxWidth: 1100, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Logo size={24} />
        {!compact && <span className="label" style={{ whiteSpace: "nowrap" }}>{t(lang, "room")}</span>}
        <button onClick={copy} className="display" data-testid="room-code" title={t(lang, "copyLink")}
          style={{ fontSize: 17, letterSpacing: "0.22em", padding: "6px 12px", borderRadius: 10, boxShadow: "inset 0 0 0 1px var(--border)" }}>
          {room.code}
        </button>
        <AnimatePresence>{copied && <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{t(lang, "copied")}</motion.span>}</AnimatePresence>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {!compact && <LangSwitch />}
        <SettingsButton />
        <Btn variant="ghost" onClick={leave}>{t(lang, "leave")}</Btn>
      </div>
    </header>
  );
}

const Seg = <T extends string | number | boolean>({ value, options, onChange, disabled, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; disabled?: boolean; label: string }) => (
  <div style={{ display: "grid", gap: 8 }}>
    <div className="label">{label}</div>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={String(o.v)} className={`chip ${value === o.v ? "on" : ""}`} disabled={disabled} onClick={() => onChange(o.v)} aria-pressed={value === o.v} style={disabled && value !== o.v ? { opacity: 0.45 } : undefined}>{o.l}</button>
      ))}
    </div>
  </div>
);

function SettingsPanel({ isHost }: { isHost: boolean }) {
  const { lang, room, updateSettings } = useGame();
  const [cats, setCats] = useState<Record<string, number>>({});
  useEffect(() => { fetch("/api/meta").then((r) => r.json()).then((m) => setCats(m.categories)).catch(() => {}); }, []);
  if (!room) return null;
  const s = room.settings;
  const set = (p: Partial<RoomSettings>) => updateSettings(p);
  const toggleCat = (c: CategoryId) => set({ categories: s.categories.includes(c) ? s.categories.filter((x) => x !== c) : [...s.categories, c] });
  const available = CATEGORY_IDS.filter((c) => cats[c]);
  return (
    <div className="card" style={{ display: "grid", gap: 18, width: "100%" }}>
      <Seg label={t(lang, "mode")} value={s.mode} disabled={!isHost} onChange={(v) => set({ mode: v })} options={[{ v: "classic", l: t(lang, "modeClassic") }, { v: "potato", l: t(lang, "modePotato") }]} />
      <Seg label={t(lang, "difficulty")} value={s.difficulty ?? 1} disabled={!isHost} onChange={(v) => set({ difficulty: v })}
        options={[{ v: 1 as const, l: t(lang, "diffEasy") }, { v: 2 as const, l: t(lang, "diffMedium") }, { v: 3 as const, l: t(lang, "diffAll") }]} />
      {s.mode === "classic" ? (<>
        <Seg label={t(lang, "rounds")} value={s.rounds} disabled={!isHost} onChange={(v) => set({ rounds: v })} options={[5, 10, 15, 20, 0].map((v) => ({ v: v as RoomSettings["rounds"], l: v ? String(v) : t(lang, "endless") }))} />
        <Seg label={t(lang, "timer")} value={s.timer} disabled={!isHost} onChange={(v) => set({ timer: v })} options={[10, 15, 20, 30, 45].map((v) => ({ v: v as RoomSettings["timer"], l: `${v} ${t(lang, "sec")}` }))} />
        <Seg label={t(lang, "visibility")} value={s.visibility} disabled={!isHost} onChange={(v) => set({ visibility: v })} options={[{ v: "hidden", l: t(lang, "visHidden") }, { v: "live", l: t(lang, "visLive") }]} />
        <Seg label={t(lang, "earlyEnd")} value={s.earlyEnd} disabled={!isHost} onChange={(v) => set({ earlyEnd: v })} options={[{ v: true, l: "✓" }, { v: false, l: "—" }]} />
      </>) : (<>
        <Seg label={t(lang, "lives")} value={s.lives} disabled={!isHost} onChange={(v) => set({ lives: v })} options={[1, 2, 3, 4, 5].map((v) => ({ v, l: "♥".repeat(v) }))} />
        <Seg label={t(lang, "visibility")} value={s.visibility} disabled={!isHost} onChange={(v) => set({ visibility: v })} options={[{ v: "live", l: t(lang, "visLive") }, { v: "hidden", l: t(lang, "visHidden") }]} />
        <div className="muted" style={{ fontSize: 14 }}>{t(lang, "shardsHint")}</div>
      </>)}
      <div style={{ display: "grid", gap: 8 }}>
        <div className="label">{t(lang, "categories")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className={`chip ${s.categories.length === 0 ? "on" : ""}`} disabled={!isHost} onClick={() => set({ categories: [] })}>{t(lang, "allCategories")}</button>
          {available.map((c) => (
            <button key={c} className={`chip ${s.categories.includes(c) ? "on" : ""}`} disabled={!isHost} onClick={() => toggleCat(c)} aria-pressed={s.categories.includes(c)}>
              {CATEGORY_NAMES[c][lang]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Lobby() {
  const { lang, room, me, ready, start } = useGame();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  if (!room) return null;
  const mine = room.players.find((p) => p.id === me);
  const isHost = !!mine?.host;
  const online = room.players.filter((p) => p.online);
  const canStart = online.length >= 2 && online.every((p) => p.host || p.ready);
  const doStart = async () => { const e = await start(); setErr(e); if (e) setTimeout(() => setErr(null), 2500); };
  const big = room.players.length <= 6;

  return (
    <div className="screen layer-ui" style={{ gap: 18 }}>
      <RoomHeader />
      <div style={{ width: "100%", maxWidth: 1100, display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 22, alignItems: "start" }} className="lobby-grid">
        <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, paddingTop: 8 }}>
          <motion.div className="display" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: "clamp(24px,3.6vw,38px)", textAlign: "center", maxWidth: 520 }}>
            {isHost ? t(lang, canStart ? "allReady" : online.length < 2 ? "needPlayers" : "notReadyAll") : t(lang, "waitingHost")}
          </motion.div>
          <LayoutGroup>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: big ? "22px 18px" : "14px 8px", minHeight: 160, padding: "20px 0" }} data-testid="lobby-players">
              <AnimatePresence>
                {room.players.map((p) => (
                  <motion.div key={p.id} layout initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)", transition: { duration: 0.6 } }}
                    transition={{ duration: 0.5, ease: [0.22, 0.8, 0.24, 1] }}>
                    <PlayerToken p={p} size={big ? 84 : 62} isMe={p.id === me}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: p.host || p.ready ? "#fff" : "var(--dim)" }}>
                        {p.host ? t(lang, "host") : p.ready ? t(lang, "ready") : t(lang, "notReady")}
                      </div>
                    </PlayerToken>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {isHost ? (
              <Btn variant="primary" disabled={!canStart} onClick={doStart} data-testid="start">{t(lang, "start")}</Btn>
            ) : (
              <Btn variant={mine?.ready ? "secondary" : "primary"} onClick={() => ready(!mine?.ready)} data-testid="ready" silent>
                {mine?.ready ? t(lang, "cancelReady") : t(lang, "imReady")}
              </Btn>
            )}
            <Btn variant="ghost" onClick={() => setEditing((v) => !v)}>{t(lang, "chooseAvatar")}</Btn>
          </div>
          <AnimatePresence>{err && <motion.div role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ color: "#fff", fontWeight: 700 }}>{ERRORS[err as keyof typeof ERRORS]?.[lang]}</motion.div>}</AnimatePresence>
          <AnimatePresence>
            {editing && <motion.div className="card" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ width: "100%", maxWidth: 440, overflow: "hidden" }}><ProfileEditor /></motion.div>}
          </AnimatePresence>
        </section>
        <aside><SettingsPanel isHost={isHost} /></aside>
      </div>
      <style>{`@media (max-width: 820px) { .lobby-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
