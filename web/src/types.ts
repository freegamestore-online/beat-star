export type StarLane = 0 | 1 | 2 | 3;

export interface FallingStar {
  id: number;
  lane: StarLane;
  y: number;        // 0..1 normalized position
  speed: number;    // normalized units per second
  hit: boolean;
  missed: boolean;
  hitTime: number;  // timestamp when hit (for animation)
  color: string;
  freq: number;     // note frequency (for visual tuning)
}

export interface HitEffect {
  id: number;
  lane: StarLane;
  y: number;
  label: string;
  color: string;
  alpha: number;
  vy: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  radius: number;
  color: string;
}

export type GamePhase = "idle" | "playing" | "gameover";

export interface GameState {
  phase: GamePhase;
  score: number;
  combo: number;
  maxCombo: number;
  lives: number;
  stars: FallingStar[];
  effects: HitEffect[];
  particles: Particle[];
  time: number;
  level: number;
  lastJudge: string;
  songId: string;
}
