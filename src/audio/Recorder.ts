import { AudioEngine } from './AudioEngine';

/**
 * Recorder — captures microphone input and returns mono Float32 PCM
 * at the AudioContext's sample rate.
 *
 * iPhone Safari notes:
 *  - getUserMedia requires HTTPS (or localhost) and a user gesture for the prompt.
 *  - We use a ScriptProcessorNode for compatibility (AudioWorklet support on iOS
 *    has historically been spotty for sampling-rate-conversion edge cases). It's
 *    deprecated but reliable cross-version. Buffer size 4096 keeps CPU low while
 *    avoiding excessive latency for a record-and-stop UX.
 *  - We hard-cap recording length to avoid memory blow-ups on long sessions.
 */

export const MAX_RECORD_SECONDS = 30; // safe MVP cap

export interface RecorderHandle {
  stop: () => Promise<{ pcm: Float32Array; sampleRate: number }>;
  cancel: () => void;
  getElapsed: () => number;
  getLevel: () => number;
}

export async function startRecording(): Promise<RecorderHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('このブラウザはマイク録音に対応していません');
  }
  const engine = AudioEngine.instance;
  await engine.unlock();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
    video: false,
  });

  const ctx = engine.ctx;
  const source = ctx.createMediaStreamSource(stream);
  const bufSize = 4096;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (ctx as any).createScriptProcessor(bufSize, 1, 1) as ScriptProcessorNode;
  // Silent gain — needed because Safari requires the node graph to terminate
  // at destination for ScriptProcessor onaudioprocess to fire.
  const sink = ctx.createGain();
  sink.gain.value = 0;

  const chunks: Float32Array[] = [];
  const startedAt = ctx.currentTime;
  let level = 0;
  let stopped = false;
  let totalFrames = 0;
  const maxFrames = Math.floor(MAX_RECORD_SECONDS * ctx.sampleRate);

  proc.onaudioprocess = (e: AudioProcessingEvent) => {
    if (stopped) return;
    const input = e.inputBuffer.getChannelData(0);
    // Compute peak level for UI meter.
    let peak = 0;
    for (let i = 0; i < input.length; i++) {
      const a = Math.abs(input[i]);
      if (a > peak) peak = a;
    }
    level = peak;
    if (totalFrames + input.length > maxFrames) {
      const remain = maxFrames - totalFrames;
      if (remain > 0) chunks.push(input.slice(0, remain));
      totalFrames = maxFrames;
      stopped = true;
      return;
    }
    chunks.push(input.slice(0)); // copy: input buffer is reused
    totalFrames += input.length;
  };

  source.connect(proc);
  proc.connect(sink);
  sink.connect(ctx.destination);

  const cleanup = () => {
    try {
      proc.disconnect();
      source.disconnect();
      sink.disconnect();
    } catch {
      /* noop */
    }
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    getElapsed: () => ctx.currentTime - startedAt,
    getLevel: () => level,
    cancel: () => {
      stopped = true;
      cleanup();
    },
    stop: async () => {
      stopped = true;
      cleanup();
      const sampleRate = ctx.sampleRate;
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const out = new Float32Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      return { pcm: out, sampleRate };
    },
  };
}
