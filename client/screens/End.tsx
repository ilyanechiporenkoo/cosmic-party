import { motion } from "motion/react";
import { useGame } from "../store.ts";
import { t, TIER_NAMES } from "../i18n.ts";
import { Btn, CountUp, RarityBurst, TierMeter } from "../components/ui.tsx";
import { Creature, StarPop } from "../components/Avatar.tsx";
import { RoomHeader } from "./Lobby.tsx";

const EASE = [0.22, 0.8, 0.24, 1] as const;

export function End() {
  const { lang, room, me, start, host } = useGame();
  if (!room?.end) return null;
  const end = room.end;
  // final standings carry their own name/avatar, so players who already left still show up
  const winner = end.ranking[0];
  const isHost = room.players.find((p) => p.id === me)?.host;

  return (
    <div className="screen layer-ui" style={{ gap: 14 }}>
      <RoomHeader compact />
      <div style={{ flex: 1, width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, paddingTop: 10 }}>
        {winner && (
          <motion.div initial={{ opacity: 0, y: 30, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, ease: EASE }}
            style={{ position: "relative", display: "grid", placeItems: "center" }} data-testid="winner">
            <div style={{ position: "absolute", left: "50%", top: "50%" }}><RarityBurst tier="exceptional" /></div>
            <StarPop count={10} spread={86} />
            <motion.div animate={{ y: [0, -8, 0], rotate: [-2, 2, -2] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}>
              <Creature kind={winner.avatar} color={winner.color} size={124} mood="happy" />
            </motion.div>
            <motion.svg width="54" height="28" viewBox="0 0 60 32" style={{ position: "absolute", top: -22 }} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, duration: 0.5, ease: EASE }}>
              <path d="M5 28 L9 7 L20 18 L30 3 L40 18 L51 7 L55 28Z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="30" cy="3" r="2" fill="#fff" />
            </motion.svg>
          </motion.div>
        )}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6, ease: EASE }} style={{ textAlign: "center" }}>
          <div className="label">{t(lang, "winner")}</div>
          <div className="display" style={{ fontSize: "clamp(38px,7vw,72px)" }}>{winner?.name}</div>
          {room.settings.mode === "classic" && <div className="mono-num" style={{ fontSize: 20, marginTop: 2 }}><CountUp value={winner?.score ?? 0} /> <span className="dim" style={{ fontSize: 13, fontWeight: 600 }}>{t(lang, "points")}</span></div>}
        </motion.div>

        {end.rarest && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5, ease: EASE }}
            style={{ textAlign: "center", padding: "14px 26px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
            <div className="label">{t(lang, "rarest")}</div>
            <div style={{ fontWeight: 800, fontSize: 24, marginTop: 4 }}>{end.rarest.answer[lang]}</div>
            <div className="muted" style={{ fontWeight: 600, fontSize: 13, display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 4 }}>
              {end.rarest.name} · <TierMeter tier={end.rarest.tier} /> {TIER_NAMES[end.rarest.tier][lang]} · +{end.rarest.points}
            </div>
          </motion.div>
        )}

        <div style={{ width: "100%", display: "grid" }} data-testid="final-ranking">
          {end.ranking.map((r, i) => (
            <motion.div key={r.playerId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + i * 0.08, duration: 0.45, ease: EASE }}
              style={{ display: "grid", gridTemplateColumns: "26px 40px 1fr auto", alignItems: "center", gap: 14, padding: "10px 14px", borderBottom: "1px solid var(--line)",
                background: i === 0 ? "rgba(255,255,255,0.06)" : "transparent", borderRadius: i === 0 ? 12 : 0 }}>
              <div className="mono-num" style={{ color: i === 0 ? "#fff" : "var(--dim)", fontSize: 13 }}>{i === 0 ? "✦" : i + 1}</div>
              <Creature kind={r.avatar} color={r.color} size={38} mood={i === 0 ? "happy" : "idle"} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{r.name}{r.playerId === me && <span className="dim" style={{ fontWeight: 600, fontSize: 12 }}> · {t(lang, "you")}</span>}</div>
                <div className="dim" style={{ fontSize: 12, fontWeight: 600 }}>
                  {t(lang, "correct")}: {r.correct}{r.bestRound ? ` · ${t(lang, "bestRound")}: ${r.bestRound} (+${r.bestRoundPoints})` : ""}
                </div>
              </div>
              <div className="display" style={{ fontSize: 26, color: i === 0 ? "#fff" : "var(--muted)" }}>{r.score}</div>
            </motion.div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", padding: "6px 0 20px" }}>
          {isHost ? (<>
            <Btn variant="primary" onClick={() => start()} data-testid="again">{t(lang, "playAgain")}</Btn>
            <Btn variant="secondary" onClick={() => host("game:lobby")}>{t(lang, "toLobby")}</Btn>
          </>) : <div className="muted" style={{ fontWeight: 600 }}>{t(lang, "waitingHost")}</div>}
        </div>
      </div>
    </div>
  );
}
