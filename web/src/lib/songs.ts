/** Note frequencies (Hz) */
const NOTE: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0,  A3: 220.0,  B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0,  A4: 440.0,  B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,  B5: 987.77,
  C6: 1046.5,
  Bb3: 233.08, Bb4: 466.16, F3s: 185.0, G3s: 207.65, A3s: 233.08,
  Db4: 277.18, Eb4: 311.13, Ab4: 415.3, Gb4: 369.99, F4s: 369.99,
  Db5: 554.37, Eb5: 622.25, Ab5: 830.61,
  REST: 0,
};

/** A single note event in a song pattern */
export interface SongNote {
  freq: number;
  dur: number;   // duration in beats
  lane: number;  // 0-3 which lane the star falls in
  accent: boolean; // louder/brighter
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  color: string;       // theme color
  notes: SongNote[];   // the repeating pattern
}

function n(name: string, dur: number, lane: number, accent = false): SongNote {
  return { freq: NOTE[name] ?? 0, dur, lane, accent };
}

// ─── ODE TO JOY — Beethoven (Symphony No. 9) ─────────────────────────────────
const odeToJoy: Song = {
  id: "ode",
  title: "Ode to Joy",
  artist: "Beethoven",
  bpm: 112,
  color: "#6366f1",
  notes: [
    n("E4",1,1), n("E4",1,1), n("F4",1,2), n("G4",1,3),
    n("G4",1,3), n("F4",1,2), n("E4",1,1), n("D4",1,0),
    n("C4",1,0), n("C4",1,0), n("D4",1,0), n("E4",1,1),
    n("E4",1.5,1,true), n("D4",0.5,0), n("D4",2,0),

    n("E4",1,1), n("E4",1,1), n("F4",1,2), n("G4",1,3),
    n("G4",1,3), n("F4",1,2), n("E4",1,1), n("D4",1,0),
    n("C4",1,0), n("C4",1,0), n("D4",1,0), n("E4",1,1),
    n("D4",1.5,0,true), n("C4",0.5,0), n("C4",2,0),
  ],
};

// ─── FÜR ELISE — Beethoven ────────────────────────────────────────────────────
const furElise: Song = {
  id: "furelise",
  title: "Für Elise",
  artist: "Beethoven",
  bpm: 126,
  color: "#ec4899",
  notes: [
    n("E5",0.5,3), n("Eb5",0.5,2), n("E5",0.5,3), n("Eb5",0.5,2),
    n("E5",0.5,3), n("B4",0.5,1), n("D5",0.5,2), n("C5",0.5,1),
    n("A4",1,0,true), n("REST",0.5,0), n("C4",0.5,0),
    n("E4",0.5,1), n("A4",0.5,2), n("B4",1,3,true),
    n("REST",0.5,3), n("E4",0.5,0), n("Ab4",0.5,2), n("B4",0.5,3),
    n("C5",1,3,true), n("REST",0.5,3), n("E4",0.5,0),
    n("E5",0.5,3), n("Eb5",0.5,2), n("E5",0.5,3), n("Eb5",0.5,2),
    n("E5",0.5,3), n("B4",0.5,1), n("D5",0.5,2), n("C5",0.5,1),
    n("A4",1,0,true), n("REST",0.5,0), n("C4",0.5,0),
    n("E4",0.5,1), n("A4",0.5,2), n("B4",1,3,true),
    n("REST",0.5,3), n("E4",0.5,0), n("C5",0.5,1), n("B4",0.5,3),
    n("A4",2,0,true),
  ],
};

// ─── CANON IN D — Pachelbel ───────────────────────────────────────────────────
const canonInD: Song = {
  id: "canon",
  title: "Canon in D",
  artist: "Pachelbel",
  bpm: 100,
  color: "#10b981",
  notes: [
    n("F4s",1,2), n("E4",1,1), n("D4",1,0), n("Db4",1,0),
    n("B3",1,1), n("A3",1,0), n("B3",1,1), n("Db4",1,0),
    n("D4",0.5,0), n("E4",0.5,1), n("F4s",0.5,2), n("G4",0.5,3),
    n("F4s",0.5,2), n("E4",0.5,1), n("D4",0.5,0), n("E4",0.5,1),
    n("F4s",0.5,2), n("A4",0.5,3,true), n("G4",0.5,3), n("F4s",0.5,2),
    n("E4",0.5,1), n("F4s",0.5,2), n("G4",0.5,3), n("A4",0.5,3,true),
    n("B4",0.5,3), n("A4",0.5,3), n("G4",0.5,3), n("F4s",0.5,2),
    n("G4",0.5,3), n("F4s",0.5,2), n("E4",0.5,1), n("D4",1,0,true),
  ],
};

// ─── TWINKLE TWINKLE — Mozart variation ──────────────────────────────────────
const twinkle: Song = {
  id: "twinkle",
  title: "Twinkle Twinkle",
  artist: "Mozart",
  bpm: 108,
  color: "#f59e0b",
  notes: [
    n("C4",1,0,true), n("C4",1,0), n("G4",1,3), n("G4",1,3),
    n("A4",1,3,true), n("A4",1,3), n("G4",2,3,true),
    n("F4",1,2), n("F4",1,2), n("E4",1,1), n("E4",1,1),
    n("D4",1,0), n("D4",1,0), n("C4",2,0,true),
    n("G4",1,3), n("G4",1,3), n("F4",1,2), n("F4",1,2),
    n("E4",1,1), n("E4",1,1), n("D4",2,0,true),
    n("G4",1,3), n("G4",1,3), n("F4",1,2), n("F4",1,2),
    n("E4",1,1), n("E4",1,1), n("D4",2,0,true),
    n("C4",1,0,true), n("C4",1,0), n("G4",1,3), n("G4",1,3),
    n("A4",1,3,true), n("A4",1,3), n("G4",2,3,true),
    n("F4",1,2), n("F4",1,2), n("E4",1,1), n("E4",1,1),
    n("D4",1,0), n("D4",1,0), n("C4",2,0,true),
  ],
};

// ─── WE WILL ROCK YOU — Queen (melody/riff approximation) ────────────────────
const weWillRockYou: Song = {
  id: "rock",
  title: "We Will Rock You",
  artist: "Queen",
  bpm: 82,
  color: "#ef4444",
  notes: [
    // Stomp stomp clap pattern + vocal melody "buddy you're a boy..."
    n("B3",0.5,1,true), n("B3",0.5,1,true), n("REST",0.5,0), n("B3",0.5,1),
    n("B3",0.5,1,true), n("B3",0.5,1,true), n("REST",0.5,0), n("B3",0.5,1),
    n("E4",1,2,true), n("D4",0.5,0), n("E4",0.5,2),
    n("B3",1,1,true), n("A3",0.5,0), n("B3",0.5,1),
    n("E4",1,2,true), n("D4",0.5,0), n("E4",0.5,2),
    n("B3",2,1,true),
    // "We will, we will rock you"
    n("B3",0.5,1), n("B3",0.5,1), n("B3",0.5,1), n("E4",0.5,2,true),
    n("B3",0.5,1), n("B3",0.5,1), n("B3",0.5,1), n("E4",0.5,2,true),
    n("G4",1,3,true), n("F4s",0.5,2), n("E4",0.5,2),
    n("B3",2,1,true),
  ],
};

// ─── HAPPY BIRTHDAY ───────────────────────────────────────────────────────────
const happyBirthday: Song = {
  id: "birthday",
  title: "Happy Birthday",
  artist: "Traditional",
  bpm: 96,
  color: "#8b5cf6",
  notes: [
    n("C4",0.75,0), n("C4",0.25,0), n("D4",1,0,true),
    n("C4",1,0), n("F4",1,2,true), n("E4",2,1),
    n("C4",0.75,0), n("C4",0.25,0), n("D4",1,0,true),
    n("C4",1,0), n("G4",1,3,true), n("F4",2,2),
    n("C4",0.75,0), n("C4",0.25,0), n("C5",1,3,true),
    n("A4",1,3), n("F4",1,2), n("E4",1,1), n("D4",2,0,true),
    n("Bb4",0.75,3), n("Bb4",0.25,3), n("A4",1,3,true),
    n("F4",1,2), n("G4",1,3,true), n("F4",2,2,true),
  ],
};

export const SONGS: Song[] = [
  odeToJoy,
  furElise,
  canonInD,
  twinkle,
  weWillRockYou,
  happyBirthday,
];
