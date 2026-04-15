import { useEffect, useState } from 'react';
import { useAppStore } from '../state/useAppStore';
import { AudioEngine } from '../audio/AudioEngine';
import { Storage } from '../storage/Storage';
import {
  applyFades,
  normalizePCM,
  reversePCM,
  trimPCM,
} from '../audio/SampleProcessor';
import { Waveform } from './Waveform';
import { clamp } from '../utils/helpers';
import type { SampleMeta } from '../types';

/**
 * SampleEditor — set trim, gain, pitch, fades; preview; bake destructive
 * operations (reverse/normalize/trim) into a new PCM buffer.
 */
export function SampleEditor() {
  const samples = useAppStore((s) => s.samples);
  const selectedId = useAppStore((s) => s.selectedSampleId);
  const selectSample = useAppStore((s) => s.selectSample);
  const updateMeta = useAppStore((s) => s.updateSampleMeta);
  const replaceSample = useAppStore((s) => s.replaceSample);
  const deleteSample = useAppStore((s) => s.deleteSample);
  const showToast = useAppStore((s) => s.showToast);

  const [pcm, setPcm] = useState<Float32Array | null>(null);
  const sample = selectedId ? samples[selectedId] : null;

  // Lazy-load PCM whenever the selected sample changes.
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setPcm(null);
      return;
    }
    Storage.getSamplePCM(selectedId).then((p) => {
      if (!cancelled) setPcm(p);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (!sample) {
    return (
      <section className="view edit-view">
        <h2 className="view-title">編集</h2>
        <SampleList onPick={selectSample} />
        <p className="hint">サンプルを選択してください。</p>
      </section>
    );
  }

  const onChangeTrim = (start: number, end: number) => {
    void updateMeta({ ...sample, trimStart: start, trimEnd: end });
  };

  const setMeta = (patch: Partial<SampleMeta>) => {
    void updateMeta({ ...sample, ...patch });
  };

  const preview = (loop = false) => {
    AudioEngine.instance.trigger(sample, { loop, voiceId: 'preview' });
  };
  const stopPreview = () => AudioEngine.instance.stopVoice('preview');

  const bakeReverse = async () => {
    if (!pcm) return;
    const reversed = reversePCM(pcm);
    await replaceSample(
      { ...sample, reversed: !sample.reversed, length: reversed.length, trimStart: 0, trimEnd: reversed.length },
      reversed,
    );
    setPcm(reversed);
    showToast('リバース適用');
  };

  const bakeNormalize = async () => {
    if (!pcm) return;
    const out = normalizePCM(new Float32Array(pcm));
    await replaceSample(sample, out);
    setPcm(out);
    showToast('ノーマライズ');
  };

  const bakeTrimAndFades = async () => {
    if (!pcm) return;
    let out = trimPCM(pcm, sample.trimStart, sample.trimEnd);
    out = applyFades(out, sample.fadeIn, sample.fadeOut);
    await replaceSample(
      {
        ...sample,
        length: out.length,
        trimStart: 0,
        trimEnd: out.length,
        fadeIn: 0,
        fadeOut: 0,
      },
      out,
    );
    setPcm(out);
    showToast('トリム/フェード書き込み');
  };

  return (
    <section className="view edit-view">
      <h2 className="view-title">編集</h2>

      <SampleList onPick={selectSample} />

      <div className="card">
        <div className="row">
          <input
            className="text"
            value={sample.name}
            onChange={(e) => setMeta({ name: e.target.value })}
            maxLength={40}
          />
          <button className="btn ghost" onClick={() => deleteSample(sample.id)}>削除</button>
        </div>

        {pcm ? (
          <Waveform
            pcm={pcm}
            trimStart={sample.trimStart}
            trimEnd={sample.trimEnd}
            onChangeTrim={onChangeTrim}
          />
        ) : (
          <div className="wave-placeholder">読み込み中...</div>
        )}

        <div className="row tools">
          <button className="btn primary" onPointerDown={() => preview(false)}>▶ ワンショット</button>
          <button className="btn" onPointerDown={() => preview(true)} onPointerUp={stopPreview} onPointerLeave={stopPreview}>↻ ループ</button>
          <button className="btn ghost" onClick={stopPreview}>■ 停止</button>
        </div>

        <div className="grid2">
          <Slider label="ピッチ (semi)" min={-24} max={24} step={1} value={sample.pitchSemitones}
            onChange={(v) => setMeta({ pitchSemitones: clamp(v, -24, 24) })} />
          <Slider label="ゲイン (dB)" min={-24} max={12} step={0.5} value={sample.gainDb}
            onChange={(v) => setMeta({ gainDb: clamp(v, -24, 12) })} />
          <Slider label="フェードイン" min={0} max={0.5} step={0.01} value={sample.fadeIn}
            onChange={(v) => setMeta({ fadeIn: clamp(v, 0, 0.5) })} />
          <Slider label="フェードアウト" min={0} max={0.5} step={0.01} value={sample.fadeOut}
            onChange={(v) => setMeta({ fadeOut: clamp(v, 0, 0.5) })} />
        </div>

        <div className="row tools">
          <button className="btn" onClick={bakeReverse}>リバース</button>
          <button className="btn" onClick={bakeNormalize}>ノーマライズ</button>
          <button className="btn" onClick={bakeTrimAndFades}>トリム/フェード書き込み</button>
        </div>
      </div>
    </section>
  );
}

function SampleList({ onPick }: { onPick: (id: string) => void }) {
  const samples = useAppStore((s) => s.samples);
  const selectedId = useAppStore((s) => s.selectedSampleId);
  const list = Object.values(samples).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (list.length === 0) {
    return <p className="hint">まず録音 / 取り込みでサンプルを作成してください。</p>;
  }
  return (
    <div className="sample-list">
      {list.map((s) => (
        <button
          key={s.id}
          className={`sample-chip ${s.id === selectedId ? 'on' : ''}`}
          onClick={() => onPick(s.id)}
          title={s.name}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

interface SliderProps {
  label: string;
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
}
function Slider({ label, min, max, step, value, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider-label">
        {label} <em>{value.toFixed(step < 1 ? 2 : 0)}</em>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}
