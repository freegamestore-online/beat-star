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

// ─── Instrument synthesizers ──────────────────────────────────────────────────

function playNote(
  freq: number,
  duration: number,
  vol = 0.18,
  type: OscillatorType = "triangle",
  target: GainNode | null = sfxGain
): void {
  const c = getAudioContext();
  if (!c || !target) return;
  if (freq <= 0) return; // REST

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(target);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);

  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(vol, c.currentTime + 0.01);
  gain.gain.setValueAtTime(vol, c.currentTime + duration * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration + 0.01);
}

/** Piano-like tone: triangle + slight detuned sawtooth for warmth */
function playPianoNote(freq: number, duration: number, vol = 0.22): void {
  const c = getAudioContext();
  if (!c || !musicGain) return;
  if (freq <= 0) return;

  // Main tone
  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  const gain = c.createGain();
  const gain2 = c.createGain();

  osc1.connect(gain);
  osc2.connect(gain2);
  gain.connect(musicGain);
  gain2.connect(musicGain);

  osc1.type = "triangle";
  osc2.type = "sine";
  osc1.frequency.setValueAtTime(freq, c.currentTime);
  osc2.frequency.setValueAtTime(freq * 2.001, c.currentTime); // slight octave shimmer

  // Attack-decay-sustain-release
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(vol, c.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(vol * 0.6, c.currentTime + 0.05);
  gain.gain.setValueAtTime(vol * 0.6, c.currentTime + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  gain2.gain.setValueAtTime(0, c.currentTime);
  gain2.gain.linearRampToValueAtTime(vol * 0.15, c.currentTime + 0.01);
  gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration * 0.5);

  osc1.start(c.currentTime);
  osc1.stop(c.currentTime + duration + 0.01);
  osc2.start(c.currentTime);
  osc2.stop(c.currentTime + duration + 0.01);
}

// ─── Song playback ─────────────────────────────────────────────────────────────

/** Callback called for each note: (note, noteIndex) */
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

  // Play the note
  playPianoNote(note.freq, noteDuration * 0.85, note.accent ? 0.28 : 0.18);

  // Notify game to spawn a star for this note
  if (onNoteCallback && note.freq > 0) {
    onNoteCallback(note, noteIndex % song.notes.length);
  }

  noteIndex++;

  // Schedule next note
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

export function playPerfect(): void {
  if (muted) return;
  const c = getAudioContext();
  if (!c || !sfxGain) return;
  [523, 659, 784].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(sfxGain!);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, c.currentTime + i * 0.04);
    gain.gain.setValueAtTime(0.18, c.currentTime + i * 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.04 + 0.12);
    osc.start(c.currentTime + i * 0.04);
    osc.stop(c.currentTime + i * 0.04 + 0.15);
  });
}

export function playGood(): void {
  if (muted) return;
  playNote(660, 0.1, 0.14, "sine", sfxGain);
  playNote(880, 0.08, 0.1, "sine", sfxGain);
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
  playNote(440, 0.05, 0.1, "sine", sfxGain);
}
