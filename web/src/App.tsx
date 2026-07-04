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
  playTick,
  isMuted,
  toggleMute,
} from "./lib/audio";
import type { FallingStar, HitEffect, Particle, GameState, StarLane } from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────
const LANES = 4;
const HIT_ZONE = 0.88;        // normalized y of the hit line
const PERFECT_WINDOW = 0.06;  // ±6% of height
const GOOD_WINDOW = 0.12;
const INITIAL_BPM = 80;
const STAR_COLORS = ["#f59e0b", "#ec4899", "#6366f1", "#10b981"];
const LANE_KEYS = ["a", "s", "k", "l"];
const LANE_LABELS = ["A", "S", "K", "L"];
const MAX_LIVES = 5;

let nextId = 1;

function makeState(): GameState {
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
    bpm: INITIAL_BPM,
    beatInterval: 60 / INITIAL_BPM,
    nextBeat: 0.5,
    level: 1,
    lastJudge: "",
  };
}

function spawnStar(state: GameState): FallingStar {
  const lane = Math.floor(Math.random() * LANES) as StarLane;
  const speed = 0.28 + (state.level - 1) * 0.025;
  return {
    id: nextId++,
    lane,
    y: -0.05,
    speed,
    hit: false,
    missed: false,
    hitTime: 0,
    color: STAR_COLORS[lane] ?? "#f59e0b",
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
    const speed = 60 + Math.random() * 80;
    particles.push({
      id: nextId++,
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      radius: 3 + Math.random() * 4,
      color,
    });
  }
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawStar(
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
    const outerAngle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const innerAngle = outerAngle + Math.PI / 5;
    const ox = cx + Math.cos(outerAngle) * r;
    const oy = cy + Math.sin(outerAngle) * r;
    const ix = cx + Math.cos(innerAngle) * (r * 0.42);
    const iy = cy + Math.sin(innerAngle) * (r * 0.42);
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.restore();
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(makeState());
  const [displayScore, setDisplayScore] = useState(0);
  const [displayPhase, setDisplayPhase] = useState<"idle" | "playing" | "gameover">("idle");
  const [displayLives, setDisplayLives] = useState(MAX_LIVES);
  const [displayCombo, setDisplayCombo] = useState(0);
  const [displayJudge, setDisplayJudge] = useState("");
  const [muteState, setMuteState] = useState(true);
  const [highScore, updateHighScore] = useHighScore("beatstar_highscore");

  // ── Resize canvas ──────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.clientWidth;
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
      const w = canvas?.width ?? 400;
      const h = canvas?.height ?? 700;

      // Find closest unhit star in lane within good window
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

      const cx = getLaneX(lane, w);
      const cy = HIT_ZONE * h;

      if (!best) {
        // Empty tap — small penalty feedback
        return;
      }

      best.hit = true;
      best.hitTime = s.time;

      const isPerfect = bestDist < PERFECT_WINDOW;
      const pts = isPerfect ? 300 : 100;
      const label = isPerfect ? "✦ PERFECT!" : "GOOD";
      const col = isPerfect ? "#f59e0b" : "#6366f1";

      s.score += pts * Math.max(1, s.combo);
      s.combo += 1;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.lastJudge = label;

      // Hit effect
      s.effects.push({
        id: nextId++,
        lane,
        y: cy,
        label,
        color: col,
        alpha: 1,
        vy: -60,
      });

      spawnParticles(s.particles, cx, cy, best.color, isPerfect ? 16 : 8);

      if (isPerfect) playPerfect();
      else playGood();

      setDisplayScore(s.score);
      setDisplayCombo(s.combo);
      setDisplayJudge(label);
    },
    [getLaneX]
  );

  // ── Keyboard input ─────────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const idx = LANE_KEYS.indexOf(key);
      if (idx >= 0) {
        resumeAudio();
        hitLane(idx as StarLane);
      }
      if (key === " " || key === "enter") {
        resumeAudio();
        if (s.phase === "idle" || s.phase === "gameover") startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hitLane]);

  // ── Start game ─────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    resumeAudio();
    const fresh = makeState();
    fresh.phase = "playing";
    stateRef.current = fresh;
    setDisplayScore(0);
    setDisplayPhase("playing");
    setDisplayLives(MAX_LIVES);
    setDisplayCombo(0);
    setDisplayJudge("");
  }, []);

  // ── Game loop ──────────────────────────────────────────────────────────────
  useGameLoop(
    useCallback(
      (dt: number) => {
        const s = stateRef.current;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;

        // ── Update ──────────────────────────────────────────────────────────
        if (s.phase === "playing") {
          s.time += dt;

          // Level up every 20s
          const newLevel = 1 + Math.floor(s.time / 20);
          if (newLevel !== s.level) {
            s.level = newLevel;
            s.bpm = INITIAL_BPM + (s.level - 1) * 8;
            s.beatInterval = 60 / s.bpm;
          }

          // Spawn stars on beat
          if (s.time >= s.nextBeat) {
            s.nextBeat += s.beatInterval;
            playTick(Math.floor(s.time / s.beatInterval) % 4 === 0);

            // Spawn 1–2 stars per beat depending on level
            const count = s.level >= 4 ? 2 : 1;
            const usedLanes = new Set<number>();
            for (let i = 0; i < count; i++) {
              let lane = Math.floor(Math.random() * LANES);
              let tries = 0;
              while (usedLanes.has(lane) && tries < 8) {
                lane = Math.floor(Math.random() * LANES);
                tries++;
              }
              usedLanes.add(lane);
              s.stars.push(spawnStar({ ...s, level: s.level }));
            }
          }

          // Move stars
          for (const star of s.stars) {
            if (!star.hit && !star.missed) {
              star.y += star.speed * dt;
              // Miss detection
              if (star.y > HIT_ZONE + GOOD_WINDOW + 0.02 && !star.missed) {
                star.missed = true;
                s.combo = 0;
                s.lives -= 1;
                playMiss();
                setDisplayLives(s.lives);
                setDisplayCombo(0);
                setDisplayJudge("MISS");
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

          // Remove old stars
          s.stars = s.stars.filter(
            (st) => !(st.hit && s.time - st.hitTime > 0.4) && !(st.missed && st.y > 1.2)
          );

          // Update effects
          for (const ef of s.effects) {
            ef.y += ef.vy * dt;
            ef.alpha -= 1.8 * dt;
          }
          s.effects = s.effects.filter((ef) => ef.alpha > 0);

          // Update particles
          for (const p of s.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 200 * dt; // gravity
            p.alpha -= 1.5 * dt;
          }
          s.particles = s.particles.filter((p) => p.alpha > 0);

          // Game over
          if (s.lives <= 0) {
            s.phase = "gameover";
            setDisplayPhase("gameover");
            updateHighScore(s.score);
          }
        }

        // ── Render ──────────────────────────────────────────────────────────
        const isDark =
          window.matchMedia("(prefers-color-scheme: dark)").matches;

        // Background
        ctx.clearRect(0, 0, w, h);
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, isDark ? "#0f0f1a" : "#f0f4ff");
        bgGrad.addColorStop(1, isDark ? "#1a0a2e" : "#e8d5ff");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        const laneW = w / LANES;

        // Lane separators
        for (let i = 1; i < LANES; i++) {
          ctx.beginPath();
          ctx.moveTo(i * laneW, 0);
          ctx.lineTo(i * laneW, h);
          ctx.strokeStyle = isDark
            ? "rgba(255,255,255,0.07)"
            : "rgba(0,0,0,0.07)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Lane backgrounds (subtle)
        for (let i = 0; i < LANES; i++) {
          const col = STAR_COLORS[i] ?? "#fff";
          const grad = ctx.createLinearGradient(i * laneW, 0, (i + 1) * laneW, 0);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(
            0.5,
            isDark ? `${col}18` : `${col}22`
          );
          grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.fillRect(i * laneW, 0, laneW, h);
        }

        // Hit zone line
        const hitY = HIT_ZONE * h;
        const lineGrad = ctx.createLinearGradient(0, hitY, w, hitY);
        lineGrad.addColorStop(0, "transparent");
        lineGrad.addColorStop(0.2, isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)");
        lineGrad.addColorStop(0.8, isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)");
        lineGrad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.moveTo(0, hitY);
        ctx.lineTo(w, hitY);
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Hit zone circles per lane
        for (let i = 0; i < LANES; i++) {
          const cx = getLaneX(i, w);
          const col = STAR_COLORS[i] ?? "#fff";
          ctx.beginPath();
          ctx.arc(cx, hitY, 22, 0, Math.PI * 2);
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Key labels
          drawText(ctx, LANE_LABELS[i] ?? "", cx, hitY + 36, {
            font: "bold 14px Manrope, sans-serif",
            color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)",
          });
        }

        // Particles
        for (const p of s.particles) {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.restore();
        }

        // Stars
        for (const star of s.stars) {
          if (star.missed) continue;
          const cx = getLaneX(star.lane, w);
          const cy = star.y * h;
          const alpha = star.hit ? Math.max(0, 1 - (s.time - star.hitTime) * 4) : 1;
          const r = star.hit
            ? 18 + (s.time - star.hitTime) * 60
            : 18;

          if (!star.hit) {
            drawGlow(ctx, cx, cy, 40, star.color);
          }
          drawStar(ctx, cx, cy, r, star.color, alpha);
        }

        // Hit effects
        for (const ef of s.effects) {
          const cx = getLaneX(ef.lane, w);
          drawText(ctx, ef.label, cx, ef.y, {
            font: "bold 20px Fraunces, serif",
            color: ef.color,
            shadow: ef.color,
            shadowBlur: 12,
          });
          ctx.globalAlpha = ef.alpha;
          ctx.globalAlpha = 1;
        }

        // Idle screen
        if (s.phase === "idle") {
          ctx.save();
          ctx.fillStyle = isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.6)";
          ctx.fillRect(0, 0, w, h);
          ctx.restore();

          drawText(ctx, "BEAT STAR", w / 2, h / 2 - 60, {
            font: "bold 48px Fraunces, serif",
            color: "#f59e0b",
            shadow: "#f59e0b",
            shadowBlur: 30,
          });
          drawText(ctx, "Tap lanes to hit the stars!", w / 2, h / 2, {
            font: "18px Manrope, sans-serif",
            color: isDark ? "#fff" : "#333",
          });
          drawText(ctx, "Tap here or press SPACE to start", w / 2, h / 2 + 40, {
            font: "16px Manrope, sans-serif",
            color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)",
          });
          drawText(ctx, "Keys: A  S  K  L", w / 2, h / 2 + 80, {
            font: "bold 15px Manrope, sans-serif",
            color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
          });
        }

        // Game over screen
        if (s.phase === "gameover") {
          ctx.save();
          ctx.fillStyle = isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.75)";
          ctx.fillRect(0, 0, w, h);
          ctx.restore();

          drawText(ctx, "GAME OVER", w / 2, h / 2 - 80, {
            font: "bold 44px Fraunces, serif",
            color: "#ef4444",
            shadow: "#ef4444",
            shadowBlur: 24,
          });
          drawText(ctx, `Score: ${s.score}`, w / 2, h / 2 - 20, {
            font: "bold 28px Manrope, sans-serif",
            color: isDark ? "#fff" : "#111",
          });
          drawText(ctx, `Best Combo: ${s.maxCombo}x`, w / 2, h / 2 + 20, {
            font: "20px Manrope, sans-serif",
            color: isDark ? "rgba(255,255,255,0.7)" : "#555",
          });
          drawText(ctx, `High Score: ${Math.max(highScore, s.score)}`, w / 2, h / 2 + 58, {
            font: "18px Manrope, sans-serif",
            color: "#f59e0b",
            shadow: "#f59e0b",
            shadowBlur: 10,
          });
          drawText(ctx, "Tap or SPACE to play again", w / 2, h / 2 + 108, {
            font: "16px Manrope, sans-serif",
            color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
          });
        }
      },
      [getLaneX, highScore, updateHighScore]
    )
  );

  // ── Canvas tap handler ─────────────────────────────────────────────────────
  const handleCanvasTap = useCallback(
    (clientX: number, _clientY: number) => {
      resumeAudio();
      const s = stateRef.current;
      if (s.phase === "idle" || s.phase === "gameover") {
        startGame();
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const laneW = canvas.width / LANES;
      const lane = Math.floor(x / laneW) as StarLane;
      if (lane >= 0 && lane < LANES) hitLane(lane);
    },
    [hitLane, startGame]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => handleCanvasTap(e.clientX, e.clientY),
    [handleCanvasTap]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touches = Array.from(e.changedTouches);
      for (const t of touches) {
        handleCanvasTap(t.clientX, t.clientY);
      }
    },
    [handleCanvasTap]
  );

  // ── Mute toggle ────────────────────────────────────────────────────────────
  const handleMute = useCallback(() => {
    resumeAudio();
    const m = toggleMute();
    setMuteState(m);
  }, []);

  // Sync display phase on mount
  useEffect(() => {
    setDisplayPhase(stateRef.current.phase);
  }, []);

  return (
    <GameShell topbar={<GameTopbar title="Beat Star" score={displayScore} />}>
      {/* Game canvas */}
      <div className="relative w-full h-full select-none">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          style={{ touchAction: "none", cursor: "pointer" }}
        />

        {/* HUD overlays */}
        {displayPhase === "playing" && (
          <div className="absolute top-3 left-0 right-0 flex justify-between items-start px-4 pointer-events-none">
            {/* Lives */}
            <div className="flex gap-1">
              {Array.from({ length: MAX_LIVES }).map((_, i) => (
                <span
                  key={i}
                  className="text-xl"
                  style={{ opacity: i < displayLives ? 1 : 0.2 }}
                >
                  ★
                </span>
              ))}
            </div>

            {/* Combo */}
            {displayCombo >= 2 && (
              <div
                className="text-right"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                <div
                  className="text-2xl font-bold"
                  style={{ color: "#f59e0b", textShadow: "0 0 12px #f59e0b" }}
                >
                  {displayCombo}x
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  COMBO
                </div>
              </div>
            )}
          </div>
        )}

        {/* Judge flash */}
        {displayPhase === "playing" && displayJudge && (
          <div
            key={displayJudge + displayScore}
            className="absolute top-1/3 left-0 right-0 text-center pointer-events-none"
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "1.4rem",
              fontWeight: "bold",
              color:
                displayJudge.includes("PERFECT")
                  ? "#f59e0b"
                  : displayJudge === "MISS"
                  ? "#ef4444"
                  : "#6366f1",
              textShadow: "0 0 16px currentColor",
              animation: "fadeUp 0.5s ease-out forwards",
            }}
          >
            {displayJudge}
          </div>
        )}

        {/* Mute button */}
        <button
          onClick={handleMute}
          className="absolute bottom-4 right-4 w-11 h-11 rounded-full flex items-center justify-center text-xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--ink)",
          }}
          aria-label={muteState ? "Unmute" : "Mute"}
        >
          {muteState ? "🔇" : "🔊"}
        </button>

        {/* High score badge */}
        {highScore > 0 && displayPhase !== "gameover" && (
          <div
            className="absolute bottom-4 left-4 text-xs px-3 py-1 rounded-full"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
            }}
          >
            Best: {highScore}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-30px); }
        }
      `}</style>
    </GameShell>
  );
}
