import { useEffect, useRef, useState } from 'react';
import { startRecording, type RecorderHandle, MAX_RECORD_SECONDS } from '../audio/Recorder';
import { AudioEngine } from '../audio/AudioEngine';
import { audioBufferToMono, resamplePCM } from '../audio/SampleProcessor';
import { useAppStore } from '../state/useAppStore';
import { uid } from '../utils/helpers';
import type { SampleMeta } from '../types';

/**
 * Sample acquisition: microphone or file import.
 * After saving, the sample becomes "selected" so the EDIT tab opens it.
 */
export function RecorderView() {
  const addSample = useAppStore((s) => s.addSample);
  const setTab = useAppStore((s) => s.setTab);
  const showToast = useAppStore((s) => s.showToast);
  const unlock = useAppStore((s) => s.unlockAudio);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const handleRef = useRef<RecorderHandle | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const tickMeter = () => {
    const h = handleRef.current;
    if (!h) return;
    setElapsed(h.getElapsed());
    setLevel(h.getLevel());
    rafRef.current = requestAnimationFrame(tickMeter);
  };

  const onStart = async () => {
    try {
      await unlock();
      const h = await startRecording();
      handleRef.current = h;
      setRecording(true);
      tickMeter();
    } catch (e) {
      showToast(`マイク開始失敗: ${(e as Error).message}`);
    }
  };

  const onStop = async () => {
    const h = handleRef.current;
    if (!h) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setRecording(false);
    const { pcm, sampleRate } = await h.stop();
    handleRef.current = null;
    if (pcm.length < 1024) {
      showToast('録音が短すぎます');
      return;
    }
    await saveAsSample(pcm, sampleRate, `Rec ${new Date().toLocaleTimeString()}`);
  };

  const saveAsSample = async (pcm: Float32Array, sampleRate: number, name: string) => {
    const meta: SampleMeta = {
      id: uid('smp'),
      name,
      sampleRate,
      channels: 1,
      length: pcm.length,
      trimStart: 0,
      trimEnd: pcm.length,
      gainDb: 0,
      pitchSemitones: 0,
      reversed: false,
      fadeIn: 0,
      fadeOut: 0,
      createdAt: new Date().toISOString(),
    };
    await addSample(meta, pcm);
    showToast('サンプル保存');
    setTab('edit');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      await unlock();
      const ab = await f.arrayBuffer();
      const decoded = await AudioEngine.instance.decodeFile(ab);
      let pcm = audioBufferToMono(decoded);
      // Match engine sample rate so playback rate math is predictable.
      const targetRate = AudioEngine.instance.ctx.sampleRate;
      pcm = resamplePCM(pcm, decoded.sampleRate, targetRate);
      // Soft cap (~30s @44.1k = ~5MB) to protect memory on iPhone.
      const maxFrames = targetRate * MAX_RECORD_SECONDS;
      if (pcm.length > maxFrames) pcm = pcm.slice(0, maxFrames);
      await saveAsSample(pcm, targetRate, f.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      showToast(`読み込み失敗: ${(err as Error).message}`);
    }
  };

  const meterPct = Math.min(100, Math.round(level * 140));

  return (
    <section className="view rec-view">
      <h2 className="view-title">録音 / 取り込み</h2>

      <div className="card">
        <div className="rec-meter">
          <div className="rec-meter-fill" style={{ width: `${meterPct}%` }} />
        </div>
        <div className="rec-time">
          {elapsed.toFixed(1)}s / {MAX_RECORD_SECONDS}s
        </div>
        {!recording ? (
          <button className="btn primary big" onClick={onStart}>
            ● 録音開始
          </button>
        ) : (
          <button className="btn danger big" onClick={onStop}>
            ■ 停止して保存
          </button>
        )}
        <p className="hint">
          初回はマイク許可が必要です。HTTPS でアクセスしてください（localhost も可）。
        </p>
      </div>

      <div className="card">
        <h3>ファイルから取り込み</h3>
        <label className="btn ghost big file">
          <input type="file" accept="audio/*" onChange={onFile} />
          ファイル選択
        </label>
        <p className="hint">m4a / mp3 / wav / aac など Safari 対応形式</p>
      </div>
    </section>
  );
}
