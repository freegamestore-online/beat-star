import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import { useGameLoop } from "./hooks/useGameLoop";
import { useHighScore } from "./hooks/useHighScore";
import { drawGlow, drawText } from "./lib/canvas";
import {
  resumeAudio,
  playPerfect,
  playGood,
  playMiss,
  playMenuClick,
  toggleMute,
  startSong,
  stopSong,
  setNoteCallback,
  STAR_TRAVEL_TIME,
} from "./lib/audio";
import { SONGS } from "./lib/songs";
import type { Song, SongNote } from "./lib/songs";
import type { FallingStar, HitEffect, Particle, GameState, StarLane } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────
const LANES = 4;
const HIT_ZONE = 0.86;          // normalized Y of the hit line (0=top, 1=bottom)
const PERFECT_WINDOW = 0.055;   // ± fraction of canvas height
const GOOD_WINDOW    = 0.11;
// Star speed: must travel from y=0 to y=HIT_ZONE in exactly STAR_TRAVEL_TIME seconds
const STAR_SPEED = HIT_ZONE / STAR_TRAVEL_TIME;

const STAR_COLORS = ["#f59e0b", "#ec4899", "#6366f1", "#10b981"];
const LANE_KEYS   = ["a", "s", "k", "l"];
const LANE_LABELS = ["A", "S", "K", "L"];
const MAX_LIVES   = 5;

let nextId = 1;

function makeState(songId = ""): GameState {
  return {
    phase: "idle",
    score: 0,
    combo: 0,
    maxCombo: 0,
    lives: MAX_LIVES,
    stars: [],
    effects: [],
    particles: [],
    time: 0,
    level: 1,
    lastJudge: "",
    songId,
  };
}

function spawnParticles(
  particles: Particle[],
  cx: number,
  cy: number,
  color: string,
  count = 10
): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 60 + Math.random() * 90;
    particles.push({
      id: nextId++,
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      alpha: 1,
      radius: 3 + Math.random() * 4,
      color,
    });
  }
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawStar5(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha = 1
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outerA = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const innerA = outerA + Math.PI / 5;
    if (i === 0) ctx.moveTo(cx + Math.cos(outerA) * r, cy + Math.sin(outerA) * r);
    else         ctx.lineTo(cx + Math.cos(outerA) * r, cy + Math.sin(outerA) * r);
    ctx.lineTo(cx + Math.cos(innerA) * (r * 0.42), cy + Math.sin(innerA) * (r * 0.42));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.fill();
  ctx.restore();
}

// ─── Song Selection Screen ────────────────────────────────────────────────────
function SongSelect({
  onSelect,
  highScores,
}: {
  onSelect: (song: Song) => void;
  highScores: Record<string, number>;
}) {
  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <div className="text-center pt-6 pb-4 px-4">
        <h1
          className="text-4xl font-bold mb-1"
          style={{ fontFamily: "Fraunces, serif", color: "#f59e0b", textShadow: "0 0 20px #f59e0b88" }}
        >
          ✦ Beat Star
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Choose a song — tap the stars as they cross the line!
        </p>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-6">
        {SONGS.map((song) => {
          const hs = highScores[song.id] ?? 0;
          return (
            <button
              key={song.id}
              onClick={() => onSelect(song)}
              className="flex items-center gap-4 rounded-2xl p-4 text-left transition-transform active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${song.color}22 0%, ${song.color}11 100%)`,
                border: `2px solid ${song.color}55`,
                minHeight: 72,
              }}
            >
              <div
                className="rounded-full flex-shrink-0 flex items-center justify-center text-2xl"
                style={{
                  width: 52, height: 52,
                  background: `${song.color}33`,
                  border: `2px solid ${song.color}88`,
                  boxShadow: `0 0 14px ${song.color}55`,
                }}
              >
                {song.id === "ode"      ? "🎼" :
                 song.id === "furelise" ? "🎹" :
                 song.id === "canon"    ? "🎻" :
                 song.id === "twinkle"  ? "⭐" :
                 song.id === "rock"     ? "🎸" : "🎂"}
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className="font-bold text-base truncate"
                  style={{ fontFamily: "Fraunces, serif", color: song.color }}
                >
                  {song.title}
                </div>
                <div className="text-sm" style={{ color: "var(--muted)" }}>
                  {song.artist} · {song.bpm} BPM
                </div>
                {hs > 0 && (
                  <div className="text-xs mt-0.5" style={{ color: song.color, opacity: 0.8 }}>
                    Best: {hs.toLocaleString()}
                  </div>
                )}
              </div>

              <div className="text-lg flex-shrink-0" style={{ color: song.color }}>▶</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const stateRef     = useRef<GameState>(makeState());
  const activeSongRef = useRef<Song | null>(null);

  const [screen,          setScreen]          = useState<"select" | "game">("select");
  const [displayScore,    setDisplayScore]    = useState(0);
  const [displayPhase,    setDisplayPhase]    = useState<"idle" | "playing" | "gameover">("idle");
  const [displayLives,    setDisplayLives]    = useState(MAX_LIVES);
  const [displayCombo,    setDisplayCombo]    = useState(0);
  const [displayJudge,    setDisplayJudge]    = useState("");
  const [judgeKey,        setJudgeKey]        = useState(0);
  const [muteState,       setMuteState]       = useState(true);
  const [activeSongTitle, setActiveSongTitle] = useState("");
  const [highScores,      setHighScores]      = useState<Record<string, number>>({});

  const loadHighScores = useCallback((): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const song of SONGS) {
      const raw = localStorage.getItem(`beatstar_hs_${song.id}`);
      result[song.id] = raw ? parseInt(raw, 10) : 0;
    }
    return result;
  }, []);

  const saveHighScore = useCallback((songId: string, score: number) => {
    const current = parseInt(localStorage.getItem(`beatstar_hs_${songId}`) ?? "0", 10);
    if (score > current) {
      localStorage.setItem(`beatstar_hs_${songId}`, String(score));
      setHighScores((prev) => ({ ...prev, [songId]: score }));
    }
  }, []);

  const [, updateGlobalHigh] = useHighScore("beatstar_global");

  useEffect(() => { setHighScores(loadHighScores()); }, [loadHighScores]);

  // ── Resize canvas ──────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width  = parent.clientWidth;
    canvas.height = parent.clientHeight;
  }, []);

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    const parent = canvasRef.current?.parentElement;
    if (parent) ro.observe(parent);
    return () => ro.disconnect();
  }, [resizeCanvas]);

  // ── Lane geometry ──────────────────────────────────────────────────────────
  const getLaneX = useCallback((lane: number, w: number): number => {
    const laneW = w / LANES;
    return laneW * lane + laneW / 2;
  }, []);

  // ── Hit a lane ─────────────────────────────────────────────────────────────
  const hitLane = useCallback(
    (lane: StarLane) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;

      const canvas = canvasRef.current;
      const w = canvas?.width  ?? 400;
      const h = canvas?.height ?? 700;

      // Find the closest star in this lane within the hit window
      let best: FallingStar | null = null;
      let bestDist = Infinity;
      for (const star of s.stars) {
        if (star.lane !== lane || star.hit || star.missed) continue;
        const dist = Math.abs(star.y - HIT_ZONE);
        if (dist < GOOD_WINDOW && dist < bestDist) {
          best = star;
          bestDist = dist;
        }
      }

      if (!best) return;

      best.hit = true;
      best.hitTime = s.time;

      const isPerfect = bestDist < PERFECT_WINDOW;
      const pts   = isPerfect ? 300 : 100;
      const label = isPerfect ? "✦ PERFECT!" : "GOOD";
      const col   = isPerfect ? "#f59e0b" : "#6366f1";

      s.score     += pts * Math.max(1, s.combo);
      s.combo     += 1;
      s.maxCombo   = Math.max(s.maxCombo, s.combo);
      s.lastJudge  = label;

      const cx = getLaneX(lane, w);
      const cy = HIT_ZONE * h;

      s.effects.push({ id: nextId++, lane, y: cy, label, color: col, alpha: 1, vy: -65 });
      spawnParticles(s.particles, cx, cy, best.color, isPerfect ? 18 : 9);

      if (isPerfect) playPerfect();
      else           playGood();

      setDisplayScore(s.score);
      setDisplayCombo(s.combo);
      setDisplayJudge(label);
      setJudgeKey((k) => k + 1);
    },
    [getLaneX]
  );

  // ── Note callback: spawn star NOW, audio plays TRAVEL_TIME seconds later ──
  const handleNote = useCallback(
    (note: SongNote, _idx: number) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const lane  = (note.lane % LANES) as StarLane;
      const color = STAR_COLORS[lane] ?? "#f59e0b";
      s.stars.push({
        id: nextId++,
        lane,
        y: 0,           // start at top
        speed: STAR_SPEED,
        hit: false,
        missed: false,
        hitTime: 0,
        color,
        freq: note.freq,
      });
    },
    []
  );

  // ── Keyboard input ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const idx = LANE_KEYS.indexOf(key);
      if (idx >= 0) {
        resumeAudio();
        hitLane(idx as StarLane);
      }
      if ((key === " " || key === "enter") && stateRef.current.phase === "gameover") {
        resumeAudio();
        returnToSelect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitLane]);

  // ── Start game ─────────────────────────────────────────────────────────────
  const startGame = useCallback(
    (song: Song) => {
      resumeAudio();
      stopSong();

      const fresh = makeState(song.id);
      fresh.phase = "playing";
      stateRef.current = fresh;
      activeSongRef.current = song;

      setDisplayScore(0);
      setDisplayPhase("playing");
      setDisplayLives(MAX_LIVES);
      setDisplayCombo(0);
      setDisplayJudge("");
      setActiveSongTitle(song.title);
      setScreen("game");

      setNoteCallback(handleNote);
      startSong(song);
    },
    [handleNote]
  );

  const returnToSelect = useCallback(() => {
    stopSong();
    setNoteCallback(null);
    stateRef.current = makeState();
    setScreen("select");
    setDisplayPhase("idle");
    setHighScores(loadHighScores());
  }, [loadHighScores]);

  // ── Game loop ──────────────────────────────────────────────────────────────
  useGameLoop(
    useCallback(
      (dt: number) => {
        const s      = stateRef.current;
        const canvas = canvasRef.current;
        if (!canvas || screen !== "game") return;
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) return;
        const w    = canvas.width;
        const h    = canvas.height;
        const song = activeSongRef.current;

        // ── Update ────────────────────────────────────────────────────────
        if (s.phase === "playing") {
          s.time += dt;

          // Move stars downward
          for (const star of s.stars) {
            if (!star.hit && !star.missed) {
              star.y += star.speed * dt;
              // Miss: star passed the hit zone without being tapped
              if (star.y > HIT_ZONE + GOOD_WINDOW + 0.04) {
                star.missed = true;
                s.combo = 0;
                s.lives -= 1;
                playMiss();
                setDisplayLives(s.lives);
                setDisplayCombo(0);
                setDisplayJudge("MISS");
                setJudgeKey((k) => k + 1);
                s.effects.push({
                  id: nextId++,
                  lane: star.lane,
                  y: HIT_ZONE * h,
                  label: "MISS",
                  color: "#ef4444",
                  alpha: 1,
                  vy: -50,
                });
              }
            }
          }

          // Remove expired stars
          s.stars = s.stars.filter(
            (st) =>
              !(st.hit    && s.time - st.hitTime > 0.45) &&
              !(st.missed && st.y > 1.15)
          );

          // Update floating text effects
          for (const ef of s.effects) {
            ef.y    += ef.vy * dt;
            ef.alpha -= 2.0 * dt;
          }
          s.effects = s.effects.filter((ef) => ef.alpha > 0);

          // Update particles
          for (const p of s.particles) {
            p.x  += p.vx * dt;
            p.y  += p.vy * dt;
            p.vy += 220 * dt;
            p.alpha -= 1.6 * dt;
          }
          s.particles = s.particles.filter((p) => p.alpha > 0);

          // Game over
          if (s.lives <= 0) {
            s.phase = "gameover";
            setDisplayPhase("gameover");
            stopSong();
            setNoteCallback(null);
            saveHighScore(s.songId, s.score);
            updateGlobalHigh(s.score);
          }
        }

        // ── Render ────────────────────────────────────────────────────────
        const isDark    = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const songColor = song?.color ?? "#6366f1";

        ctx2d.clearRect(0, 0, w, h);

        // Background
        const bgGrad = ctx2d.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, isDark ? "#0a0a18" : "#f0f4ff");
        bgGrad.addColorStop(1, isDark ? "#150520" : "#ede0ff");
        ctx2d.fillStyle = bgGrad;
        ctx2d.fillRect(0, 0, w, h);

        const laneW = w / LANES;

        // Lane tints
        for (let i = 0; i < LANES; i++) {
          const col = STAR_COLORS[i] ?? "#fff";
          const g = ctx2d.createLinearGradient(i * laneW, 0, (i + 1) * laneW, 0);
          g.addColorStop(0,   "transparent");
          g.addColorStop(0.5, isDark ? `${col}15` : `${col}20`);
          g.addColorStop(1,   "transparent");
          ctx2d.fillStyle = g;
          ctx2d.fillRect(i * laneW, 0, laneW, h);
        }

        // Lane dividers
        for (let i = 1; i < LANES; i++) {
          ctx2d.beginPath();
          ctx2d.moveTo(i * laneW, 0);
          ctx2d.lineTo(i * laneW, h);
          ctx2d.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
          ctx2d.lineWidth = 1;
          ctx2d.stroke();
        }

        // Scrolling speed lines
        for (let i = 0; i < 20; i++) {
          const lineY = ((s.time * 120 + i * (h / 10)) % h);
          ctx2d.beginPath();
          ctx2d.moveTo(0, lineY);
          ctx2d.lineTo(w, lineY);
          ctx2d.strokeStyle = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)";
          ctx2d.lineWidth = 1;
          ctx2d.stroke();
        }

        // ── Hit zone line ────────────────────────────────────────────────
        const hitY = HIT_ZONE * h;
        const lg = ctx2d.createLinearGradient(0, hitY, w, hitY);
        lg.addColorStop(0,    "transparent");
        lg.addColorStop(0.15, isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.28)");
        lg.addColorStop(0.85, isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.28)");
        lg.addColorStop(1,    "transparent");
        ctx2d.beginPath();
        ctx2d.moveTo(0, hitY);
        ctx2d.lineTo(w, hitY);
        ctx2d.strokeStyle = lg;
        ctx2d.lineWidth = 2;
        ctx2d.stroke();

        // Hit zone circles per lane
        for (let i = 0; i < LANES; i++) {
          const cx  = getLaneX(i, w);
          const col = STAR_COLORS[i] ?? "#fff";
          ctx2d.beginPath();
          ctx2d.arc(cx, hitY, 26, 0, Math.PI * 2);
          ctx2d.strokeStyle = col;
          ctx2d.globalAlpha = 0.45;
          ctx2d.lineWidth = 2;
          ctx2d.stroke();
          ctx2d.globalAlpha = 1;
          ctx2d.beginPath();
          ctx2d.arc(cx, hitY, 10, 0, Math.PI * 2);
          ctx2d.fillStyle = `${col}44`;
          ctx2d.fill();
          drawText(ctx2d, LANE_LABELS[i] ?? "", cx, hitY + 44, {
            font: "bold 13px Manrope, sans-serif",
            color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
          });
        }

        // Particles
        for (const p of s.particles) {
          ctx2d.save();
          ctx2d.globalAlpha = p.alpha;
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx2d.fillStyle   = p.color;
          ctx2d.shadowColor = p.color;
          ctx2d.shadowBlur  = 8;
          ctx2d.fill();
          ctx2d.restore();
        }

        // Stars
        for (const star of s.stars) {
          if (star.missed) continue;
          const cx  = getLaneX(star.lane, w);
          const cy  = star.y * h;
          const age = star.hit ? s.time - star.hitTime : 0;
          const alpha = star.hit ? Math.max(0, 1 - age * 5) : 1;
          const r     = star.hit ? 18 + age * 80 : 18;
          if (!star.hit) drawGlow(ctx2d, cx, cy, 38, star.color);
          drawStar5(ctx2d, cx, cy, r, star.color, alpha);
        }

        // Floating judge text
        for (const ef of s.effects) {
          const cx = getLaneX(ef.lane, w);
          ctx2d.globalAlpha = ef.alpha;
          drawText(ctx2d, ef.label, cx, ef.y, {
            font: "bold 20px Fraunces, serif",
            color: ef.color,
            shadow: ef.color,
            shadowBlur: 14,
          });
          ctx2d.globalAlpha = 1;
        }

        // Song watermark
        if (s.phase === "playing" && song) {
          drawText(ctx2d, `♪ ${song.title}`, w / 2, 18, {
            font: "13px Manrope, sans-serif",
            color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.18)",
          });
        }

        // ── Game over overlay ────────────────────────────────────────────
        if (s.phase === "gameover") {
          ctx2d.save();
          ctx2d.fillStyle = isDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.78)";
          ctx2d.fillRect(0, 0, w, h);
          ctx2d.restore();

          drawText(ctx2d, "GAME OVER", w / 2, h / 2 - 90, {
            font: "bold 44px Fraunces, serif",
            color: "#ef4444",
            shadow: "#ef4444",
            shadowBlur: 28,
          });
          if (song) {
            drawText(ctx2d, `♪ ${song.title}`, w / 2, h / 2 - 44, {
              font: "18px Manrope, sans-serif",
              color: songColor,
              shadow: songColor,
              shadowBlur: 10,
            });
          }
          drawText(ctx2d, `Score: ${s.score.toLocaleString()}`, w / 2, h / 2 + 4, {
            font: "bold 30px Manrope, sans-serif",
            color: isDark ? "#fff" : "#111",
          });
          drawText(ctx2d, `Best Combo: ${s.maxCombo}×`, w / 2, h / 2 + 44, {
            font: "20px Manrope, sans-serif",
            color: isDark ? "rgba(255,255,255,0.65)" : "#555",
          });
          const hs = song ? (highScores[song.id] ?? 0) : 0;
          if (hs > 0) {
            drawText(ctx2d, `High Score: ${Math.max(hs, s.score).toLocaleString()}`, w / 2, h / 2 + 82, {
              font: "17px Manrope, sans-serif",
              color: "#f59e0b",
              shadow: "#f59e0b",
              shadowBlur: 10,
            });
          }
          drawText(ctx2d, "Tap to choose another song", w / 2, h / 2 + 130, {
            font: "15px Manrope, sans-serif",
            color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
          });
        }
      },
      [getLaneX, highScores, saveHighScore, updateGlobalHigh, screen]
    ),
    screen !== "game"
  );

  // ── Canvas tap ─────────────────────────────────────────────────────────────
  const handleCanvasTap = useCallback(
    (clientX: number, _clientY: number) => {
      resumeAudio();
      const s = stateRef.current;
      if (s.phase === "gameover") {
        returnToSelect();
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x    = clientX - rect.left;
      const lane = Math.floor((x / canvas.width) * LANES) as StarLane;
      if (lane >= 0 && lane < LANES) hitLane(lane);
    },
    [hitLane, returnToSelect]
  );

  const handleMouseDown  = useCallback(
    (e: React.MouseEvent)  => handleCanvasTap(e.clientX, e.clientY),
    [handleCanvasTap]
  );
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      Array.from(e.changedTouches).forEach((t) => handleCanvasTap(t.clientX, t.clientY));
    },
    [handleCanvasTap]
  );

  const handleMute = useCallback(() => {
    resumeAudio();
    const m = toggleMute();
    setMuteState(m);
  }, []);

  const handleSongSelect = useCallback(
    (song: Song) => {
      playMenuClick();
      startGame(song);
    },
    [startGame]
  );

  return (
    <GameShell
      topbar={
        <GameTopbar
          title={screen === "game" ? `Beat Star — ${activeSongTitle}` : "Beat Star"}
          score={displayScore}
        />
      }
    >
      {screen === "select" ? (
        <SongSelect onSelect={handleSongSelect} highScores={highScores} />
      ) : (
        <div className="relative w-full h-full select-none">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            style={{ touchAction: "none", cursor: "pointer" }}
          />

          {/* Lives HUD */}
          {displayPhase === "playing" && (
            <div className="absolute top-2 left-0 right-0 flex justify-between items-start px-3 pointer-events-none">
              <div className="flex gap-1">
                {Array.from({ length: MAX_LIVES }).map((_, i) => (
                  <span
                    key={i}
                    className="text-lg leading-none"
                    style={{
                      opacity: i < displayLives ? 1 : 0.15,
                      filter:  i < displayLives ? "drop-shadow(0 0 4px #f59e0b)" : "none",
                    }}
                  >
                    ★
                  </span>
                ))}
              </div>

              {displayCombo >= 2 && (
                <div className="text-right" style={{ fontFamily: "Fraunces, serif" }}>
                  <div
                    className="text-2xl font-bold leading-none"
                    style={{ color: "#f59e0b", textShadow: "0 0 12px #f59e0b" }}
                  >
                    {displayCombo}×
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>COMBO</div>
                </div>
              )}
            </div>
          )}

          {/* Judge flash */}
          {displayPhase === "playing" && (
            <div
              key={judgeKey}
              className="absolute left-0 right-0 text-center pointer-events-none"
              style={{
                top: "30%",
                fontFamily: "Fraunces, serif",
                fontSize: "1.35rem",
                fontWeight: "bold",
                color: displayJudge.includes("PERFECT") ? "#f59e0b"
                     : displayJudge === "MISS"          ? "#ef4444"
                     : "#6366f1",
                textShadow: "0 0 16px currentColor",
                animation: "fadeUp 0.55s ease-out forwards",
              }}
            >
              {displayJudge}
            </div>
          )}

          {/* Back to song list */}
          <button
            onClick={() => { stopSong(); setNoteCallback(null); returnToSelect(); }}
            className="absolute top-2 right-14 h-9 px-3 rounded-full text-xs font-bold flex items-center"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
            }}
          >
            ← Songs
          </button>

          {/* Mute toggle */}
          <button
            onClick={handleMute}
            className="absolute top-2 right-2 w-10 h-9 rounded-full flex items-center justify-center text-base"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
            aria-label={muteState ? "Unmute" : "Mute"}
          >
            {muteState ? "🔇" : "🔊"}
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          0%   { opacity: 1; transform: translateY(0px); }
          100% { opacity: 0; transform: translateY(-36px); }
        }
      `}</style>
    </GameShell>
  );
}
