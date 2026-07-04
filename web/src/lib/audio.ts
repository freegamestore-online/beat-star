/** Minimal Web Audio helper for Beat Star */

let ctx: AudioContext | null = null;
let muted = true;

export function getAudioContext(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}

/** Resume context (needed after user gesture) */
export function resumeAudio(): void {
  const c = getAudioContext();
  if (c && c.state === "suspended") {
    c.resume().catch(() => {});
  }
}

/** Play a short beep/click sound */
export function playClick(freq = 440, duration = 0.06, vol = 0.18): void {
  if (muted) return;
  const c = getAudioContext();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, c.currentTime);
  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

/** Play a perfect hit sound */
export function playPerfect(): void {
  if (muted) return;
  const c = getAudioContext();
  if (!c) return;
  [523, 659, 784].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, c.currentTime + i * 0.04);
    gain.gain.setValueAtTime(0.15, c.currentTime + i * 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.04 + 0.12);
    osc.start(c.currentTime + i * 0.04);
    osc.stop(c.currentTime + i * 0.04 + 0.15);
  });
}

/** Play a miss sound */
export function playMiss(): void {
  if (muted) return;
  const c = getAudioContext();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.2);
  gain.gain.setValueAtTime(0.12, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.22);
}

/** Play a metronome tick */
export function playTick(accent = false): void {
  if (muted) return;
  const c = getAudioContext();
  if (!c) return;
  const freq = accent ? 880 : 660;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, c.currentTime);
  gain.gain.setValueAtTime(accent ? 0.08 : 0.05, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.05);
}

/** Play good hit sound */
export function playGood(): void {
  if (muted) return;
  const c = getAudioContext();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(660, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.08);
  gain.gain.setValueAtTime(0.14, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.12);
}
