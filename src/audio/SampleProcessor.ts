// Pure DSP helpers operating on Float32 PCM. No AudioContext required.
// Used by SampleEditor when the user "bakes" trim / reverse / normalize / fades.

export function trimPCM(pcm: Float32Array, start: number, end: number): Float32Array {
  const s = Math.max(0, Math.min(pcm.length, Math.floor(start)));
  const e = Math.max(s, Math.min(pcm.length, Math.floor(end)));
  return pcm.slice(s, e);
}

export function reversePCM(pcm: Float32Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[pcm.length - 1 - i];
  return out;
}

/** Peak normalize: scale so max(|x|) === target (default 0.98). In-place. */
export function normalizePCM(pcm: Float32Array, target = 0.98): Float32Array {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-6) return pcm;
  const g = target / peak;
  for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
  return pcm;
}

/** Apply linear fade in/out as fractions (0..0.5) of the buffer. In-place. */
export function applyFades(pcm: Float32Array, fadeIn: number, fadeOut: number): Float32Array {
  const n = pcm.length;
  const inN = Math.floor(Math.min(0.5, Math.max(0, fadeIn)) * n);
  const outN = Math.floor(Math.min(0.5, Math.max(0, fadeOut)) * n);
  for (let i = 0; i < inN; i++) pcm[i] *= i / inN;
  for (let i = 0; i < outN; i++) pcm[n - 1 - i] *= i / outN;
  return pcm;
}

/**
 * Resample a Float32 PCM buffer between sample rates using linear interpolation.
 * Good enough for sample import; we don't need true sinc quality for MVP.
 */
export function resamplePCM(pcm: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return pcm;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const x0 = Math.floor(x);
    const x1 = Math.min(pcm.length - 1, x0 + 1);
    const t = x - x0;
    out[i] = pcm[x0] * (1 - t) + pcm[x1] * t;
  }
  return out;
}

/** Downmix multi-channel AudioBuffer to mono Float32. */
export function audioBufferToMono(ab: AudioBuffer): Float32Array {
  const ch = ab.numberOfChannels;
  const n = ab.length;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const data = ab.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  if (ch > 1) for (let i = 0; i < n; i++) out[i] /= ch;
  return out;
}

/**
 * Build a downsampled peak waveform suitable for canvas rendering.
 * Returns interleaved [min, max] per output bin to preserve dynamic shape.
 */
export function computeWaveformPeaks(pcm: Float32Array, bins: number): Float32Array {
  const out = new Float32Array(bins * 2);
  if (pcm.length === 0) return out;
  const step = pcm.length / bins;
  for (let i = 0; i < bins; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(pcm.length, Math.floor((i + 1) * step));
    let mn = 1.0,
      mx = -1.0;
    for (let j = start; j < end; j++) {
      const v = pcm[j];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    out[i * 2] = mn;
    out[i * 2 + 1] = mx;
  }
  return out;
}
