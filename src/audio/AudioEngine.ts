import { dbToGain, semitonesToRate } from '../utils/helpers';
import type { SampleMeta } from '../types';

/**
 * AudioEngine — single AudioContext that drives pads, keyboard and sequencer.
 *
 * iPhone Safari notes:
 *  - AudioContext starts in "suspended" state until a user gesture resumes it.
 *    Always call `engine.unlock()` from a tap/click handler before producing sound.
 *  - Safari accepts a webkitAudioContext fallback. We use the standard ctor first.
 *  - Decoded buffers + raw PCM stay in memory only when needed; this class
 *    keeps a small LRU-ish Map keyed by sample id.
 *  - For low latency we set `latencyHint: 'interactive'`.
 */
export class AudioEngine {
  private static _instance: AudioEngine | null = null;
  static get instance(): AudioEngine {
    if (!this._instance) this._instance = new AudioEngine();
    return this._instance;
  }

  readonly ctx: AudioContext;
  readonly master: GainNode;
  /** Cached AudioBuffers keyed by sample id. */
  private buffers = new Map<string, AudioBuffer>();
  /** Active loop sources keyed by an arbitrary voice id (used for pad loops). */
  private activeLoops = new Map<string, AudioBufferSourceNode>();

  private constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.AudioContext as any) || (window as any).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  }

  /** Resume the AudioContext. Must be called from a user gesture on iOS. */
  async unlock(): Promise<void> {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore — user can retry */
      }
    }
    // Play a tiny silent buffer to fully wake Safari's audio stack.
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start(0);
  }

  setMasterGainDb(db: number): void {
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  /** Register / replace cached AudioBuffer for a sample. */
  setBuffer(id: string, buffer: AudioBuffer): void {
    this.buffers.set(id, buffer);
  }

  getBuffer(id: string): AudioBuffer | undefined {
    return this.buffers.get(id);
  }

  /** Build an AudioBuffer from raw mono Float32 PCM at a given sample rate. */
  bufferFromPCM(pcm: Float32Array, sampleRate: number): AudioBuffer {
    const buf = this.ctx.createBuffer(1, pcm.length, sampleRate);
    // copyToChannel expects an ArrayBuffer-backed Float32Array; clone to be safe
    // (also detaches the source from any SharedArrayBuffer typing concerns).
    const safe = new Float32Array(pcm.length);
    safe.set(pcm);
    buf.copyToChannel(safe, 0);
    return buf;
  }

  /** Decode arbitrary audio file bytes into an AudioBuffer (mono-sum). */
  async decodeFile(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    // Safari's older decodeAudioData wants the callback form; modern returns a Promise.
    return await new Promise<AudioBuffer>((resolve, reject) => {
      try {
        // .slice() because Safari may detach the buffer post-decode.
        this.ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Trigger one-shot or looped playback of a sample.
   *
   * @param meta sample metadata (trim, gain, pitch, fades, reversed)
   * @param extraSemitones additional semitone offset (used by keyboard)
   * @param voiceId optional id; pass to allow stop() of looped voice
   */
  trigger(
    meta: SampleMeta,
    opts: {
      loop?: boolean;
      extraSemitones?: number;
      voiceId?: string;
      when?: number;
    } = {},
  ): void {
    const buf = this.buffers.get(meta.id);
    if (!buf) return;
    const { loop = false, extraSemitones = 0, voiceId, when } = opts;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = semitonesToRate(meta.pitchSemitones + extraSemitones);

    const trimStartSec = meta.trimStart / meta.sampleRate;
    const trimEndSec = meta.trimEnd / meta.sampleRate;
    const trimDur = Math.max(0.01, trimEndSec - trimStartSec);

    if (loop) {
      src.loop = true;
      src.loopStart = trimStartSec;
      src.loopEnd = trimEndSec;
    }

    // Per-voice gain envelope for fade in/out (cheap, in real time).
    const g = this.ctx.createGain();
    const baseGain = dbToGain(meta.gainDb);
    const t0 = when ?? this.ctx.currentTime;
    const fadeIn = Math.min(meta.fadeIn, 0.5) * trimDur;
    const fadeOut = Math.min(meta.fadeOut, 0.5) * trimDur;

    if (fadeIn > 0.001) {
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(baseGain, t0 + fadeIn);
    } else {
      g.gain.setValueAtTime(baseGain, t0);
    }
    if (!loop && fadeOut > 0.001) {
      const endT = t0 + trimDur / src.playbackRate.value;
      g.gain.setValueAtTime(baseGain, endT - fadeOut);
      g.gain.linearRampToValueAtTime(0, endT);
    }

    src.connect(g).connect(this.master);
    src.start(t0, trimStartSec, loop ? undefined : trimDur);

    if (voiceId) {
      // Stop a pre-existing loop on the same voice before overwriting.
      this.stopVoice(voiceId);
      this.activeLoops.set(voiceId, src);
      src.onended = () => {
        if (this.activeLoops.get(voiceId) === src) this.activeLoops.delete(voiceId);
      };
    }
  }

  stopVoice(voiceId: string): void {
    const v = this.activeLoops.get(voiceId);
    if (v) {
      try {
        v.stop();
      } catch {
        /* already stopped */
      }
      this.activeLoops.delete(voiceId);
    }
  }

  stopAll(): void {
    this.activeLoops.forEach((v) => {
      try {
        v.stop();
      } catch {
        /* noop */
      }
    });
    this.activeLoops.clear();
  }

  /** Schedule a tick callback at a precise audio-clock time (used by sequencer). */
  scheduleAt(when: number, cb: () => void): void {
    // Use a silent oscillator end-event to fire at `when`. Cheap and accurate.
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(this.ctx.destination);
    o.start(when);
    o.stop(when + 0.001);
    o.onended = cb;
  }

  now(): number {
    return this.ctx.currentTime;
  }
}
