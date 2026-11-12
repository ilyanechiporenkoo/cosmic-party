import { useMemo } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useGame } from "./store.ts";
import { t } from "./i18n.ts";
import { Starfield, SpaceBackdrop } from "./components/Space.tsx";
import { Menu } from "./screens/Menu.tsx";
import { Lobby } from "./screens/Lobby.tsx";
import { Game } from "./screens/Game.tsx";
import { End } from "./screens/End.tsx";
import { Potato } from "./screens/Potato.tsx";

const SCREENS = ["menu", "lobby", "game", "end", "potato"];
// subtle "camera" offset per screen: background layers glide when the screen changes
const CAMERA: Record<string, Record<string, string>> = {
  menu: { "--cam-x": "0px", "--cam-y": "0px" }, lobby: { "--cam-x": "-28px", "--cam-y": "10px" },
  game: { "--cam-x": "-12px", "--cam-y": "-22px" }, potato: { "--cam-x": "-12px", "--cam-y": "-22px" }, end: { "--cam-x": "18px", "--cam-y": "-8px" },
};

export function App() {
  const { room, connected, lang, reducedMotion } = useGame();
  const phase = room?.phase;
  const screen = !room ? "menu" : phase === "lobby" ? "lobby" : phase === "finished" ? "end" : phase === "potato" ? "potato" : "game";
  // background gets more energetic when players are actually typing
  const energy = useMemo(() => {
    if (!room) return 0;
    const active = room.players.filter((p) => p.typing && !p.answered).length;
    return Math.min(1, active / Math.max(2, room.players.length));
  }, [room]);

  return (
    <MotionConfig reducedMotion="never">
      <div className={`app ${reducedMotion ? "reduced" : ""}`}>
        <Starfield energy={energy} kick={SCREENS.indexOf(screen)} />
        <div className="camera layer-bg" style={{ zIndex: 1, ...CAMERA[screen] } as React.CSSProperties}>
          <SpaceBackdrop variant={screen === "menu" ? "menu" : screen === "end" ? "end" : "game"} />
        </div>
        {!connected && <div className="offline-bar">{t(lang, "reconnecting")}</div>}
        <AnimatePresence mode="wait">
          <motion.div key={screen} style={{ position: "absolute", inset: 0 }}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: [0.22, 0.8, 0.24, 1] }}>
            {screen === "menu" && <Menu />}
            {screen === "lobby" && <Lobby />}
            {screen === "game" && <Game />}
            {screen === "end" && <End />}
            {screen === "potato" && <Potato />}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
