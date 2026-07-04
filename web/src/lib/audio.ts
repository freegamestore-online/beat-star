/** Beat Star — Web Audio engine */

import type { Song, SongNote } from "./songs";

let ctx: AudioContext | null = null;
let muted = true;

// Master gain for music vs SFX
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

// Current song playback state
let songTimer: ReturnType<typeof setTimeout> | null = null;
let currentSong: Song | null = null;
let noteIndex = 0;
let songPlaying = false;

/** How long (seconds) the star travels before reaching the hit line.
 *  The audio note is scheduled this many seconds in the future,
 *  so the star arrives at the hit zone exactly when the note sounds. */
export const STAR_TRAVEL_TIME = 1.8;

export function getAudioContext(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.gain.value = 0.35;
      sfxGain.gain.value = 0.7;
      musicGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return ctx;
}

export function isMuted(): boolean { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  if (ctx && musicGain && sfxGain) {
    musicGain.gain.value = muted ? 0 : 0.35;
    sfxGain.gain.value   = muted ? 0 : 0.7;
  }
  return muted;
}

export function resumeAudio(): void {
  const c = getAudioContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

// ─── Piano note synthesizer ───────────────────────────────────────────────────

/** Schedule a piano-like note to play at `startAt` (AudioContext time). */
function schedulePianoNote(freq: number, duration: number, vol: number, startAt: number): void {
  const c = getAudioContext();
  if (!c || !musicGain) return;
  if (freq <= 0) return; // REST

  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  const g1 = c.createGain();
  const g2 = c.createGain();

  osc1.connect(g1); g1.connect(musicGain);
  osc2.connect(g2); g2.connect(musicGain);

  osc1.type = "triangle";
  osc2.type = "sine";
  osc1.frequency.setValueAtTime(freq, startAt);
  osc2.frequency.setValueAtTime(freq * 2.001, startAt);

  // ADSR on g1
  g1.gain.setValueAtTime(0, startAt);
  g1.gain.linearRampToValueAtTime(vol, startAt + 0.008);
  g1.gain.exponentialRampToValueAtTime(vol * 0.6, startAt + 0.05);
  g1.gain.setValueAtTime(vol * 0.6, startAt + duration * 0.7);
  g1.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

  g2.gain.setValueAtTime(0, startAt);
  g2.gain.linearRampToValueAtTime(vol * 0.15, startAt + 0.01);
  g2.gain.exponentialRampToValueAtTime(0.001, startAt + duration * 0.5);

  osc1.start(startAt); osc1.stop(startAt + duration + 0.01);
  osc2.start(startAt); osc2.stop(startAt + duration + 0.01);
}

// ─── Song playback ─────────────────────────────────────────────────────────────

/** Called immediately when a star should be spawned (TRAVEL_TIME before the note sounds). */
type NoteCallback = (note: SongNote, idx: number) => void;
let onNoteCallback: NoteCallback | null = null;

export function setNoteCallback(cb: NoteCallback | null): void {
  onNoteCallback = cb;
}

function scheduleNextNote(): void {
  if (!songPlaying || !currentSong) return;
  const song = currentSong;
  const note = song.notes[noteIndex % song.notes.length];
  if (!note) return;

  const beatDuration = 60 / song.bpm; // seconds per beat
  const noteDuration = note.dur * beatDuration;

  const c = getAudioContext();
  if (c) {
    // Schedule the audio TRAVEL_TIME seconds from now — star spawns NOW and arrives then
    const playAt = c.currentTime + STAR_TRAVEL_TIME;
    schedulePianoNote(note.freq, noteDuration * 0.85, note.accent ? 0.28 : 0.18, playAt);
  }

  // Spawn the star immediately — it will reach the hit line in TRAVEL_TIME seconds
  if (onNoteCallback && note.freq > 0) {
    onNoteCallback(note, noteIndex % song.notes.length);
  }

  noteIndex++;

  // Schedule next note callback after `noteDuration` ms
  songTimer = setTimeout(scheduleNextNote, noteDuration * 1000);
}

export function startSong(song: Song): void {
  stopSong();
  currentSong = song;
  noteIndex = 0;
  songPlaying = true;
  resumeAudio();
  scheduleNextNote();
}

export function stopSong(): void {
  songPlaying = false;
  if (songTimer !== null) {
    clearTimeout(songTimer);
    songTimer = null;
  }
  currentSong = null;
}

export function getCurrentSong(): Song | null {
  return currentSong;
}

// ─── SFX ──────────────────────────────────────────────────────────────────────

function playSfxNote(
  freq: number,
  duration: number,
  vol = 0.18,
  type: OscillatorType = "triangle"
): void {
  if (muted) return;
  const c = getAudioContext();
  if (!c || !sfxGain) return;
  if (freq <= 0) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration + 0.01);
}

export function playPerfect(): void {
  if (muted) return;
  const c = getAudioContext();
  if (!c || !sfxGain) return;
  [523, 659, 784].forEach((freq, i) => {
    const at = c.currentTime + i * 0.04;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(sfxGain!);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.2, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
    osc.start(at);
    osc.stop(at + 0.15);
  });
}

export function playGood(): void {
  if (muted) return;
  playSfxNote(660, 0.1, 0.14, "sine");
}

export function playMiss(): void {
  if (muted) return;
  const c = getAudioContext();
  if (!c || !sfxGain) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.2);
  gain.gain.setValueAtTime(0.1, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.22);
}

export function playMenuClick(): void {
  if (muted) return;
  playSfxNote(440, 0.05, 0.1, "sine");
}
