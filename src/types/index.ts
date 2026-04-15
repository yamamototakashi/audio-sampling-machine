// Core domain types shared across the app.
// Audio buffers themselves are kept off this struct: they live in IndexedDB
// (raw PCM Float32 + meta) and are only loaded into memory on demand.

export type SampleId = string;
export type PadId = number; // 0..PAD_COUNT-1
export type PatternId = string;

/** Persisted sample metadata (the raw audio is stored separately as a Blob/Float32). */
export interface SampleMeta {
  id: SampleId;
  name: string;
  /** Sample rate of the stored PCM data. */
  sampleRate: number;
  /** Channel count (we store mono for memory; recordings are downmixed). */
  channels: 1;
  /** Frames in the stored buffer. */
  length: number;
  /** Trim points in frames; default is 0..length. */
  trimStart: number;
  trimEnd: number;
  /** dB-ish gain applied at playback. -24..+12. */
  gainDb: number;
  /** Semitone offset for one-shot pad playback (keyboard adds on top). */
  pitchSemitones: number;
  /** Booleans for processing flags applied at edit-bake time. */
  reversed: boolean;
  /** Fade in/out as fraction of trimmed length, 0..0.5. */
  fadeIn: number;
  fadeOut: number;
  /** ISO timestamp. */
  createdAt: string;
}

/** A pad slot in the performance grid. */
export interface PadSlot {
  id: PadId;
  sampleId: SampleId | null;
  /** When true, pad triggers loop playback until released. */
  loop: boolean;
}

/** A 16-step sequencer track. */
export interface SeqTrack {
  sampleId: SampleId | null;
  steps: boolean[]; // length === STEP_COUNT
  gainDb: number;
}

export interface Pattern {
  id: PatternId;
  name: string;
  bpm: number;
  tracks: SeqTrack[];
  updatedAt: string;
}

/** Persisted top-level project state. Restored on app load. */
export interface ProjectState {
  pads: PadSlot[];
  activePatternId: PatternId | null;
  /** Last selected sample id in the editor. */
  selectedSampleId: SampleId | null;
}

export const PAD_COUNT = 12;
export const STEP_COUNT = 16;
export const TRACK_COUNT = 4;
export const DEFAULT_BPM = 100;
