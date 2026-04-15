import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/useAppStore';
import { AudioEngine } from '../audio/AudioEngine';
import { STEP_COUNT } from '../types';

/**
 * 16-step / 4-track sequencer using the standard "schedule ahead" pattern
 * driven by the audio clock. We schedule all step events that fall within
 * the next ~150ms window, then advance with setInterval.
 *
 * Reference: https://www.html5rocks.com/en/tutorials/audio/scheduling/
 */
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.15; // seconds

export function Sequencer() {
  const patterns = useAppStore((s) => s.patterns);
  const activePatternId = useAppStore((s) => s.activePatternId);
  const setActivePattern = useAppStore((s) => s.setActivePattern);
  const newPattern = useAppStore((s) => s.newPattern);
  const setBpm = useAppStore((s) => s.setBpm);
  const toggleStep = useAppStore((s) => s.toggleStep);
  const setTrackSample = useAppStore((s) => s.setTrackSample);
  const savePattern = useAppStore((s) => s.savePattern);
  const deletePattern = useAppStore((s) => s.deletePattern);
  const samples = useAppStore((s) => s.samples);
  const unlock = useAppStore((s) => s.unlockAudio);

  const pattern = activePatternId ? patterns[activePatternId] : null;
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);

  // Refs so the scheduler can read the latest values without re-binding.
  const stepRef = useRef(0);
  const nextTimeRef = useRef(0);
  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    if (!playing) return;
    const engine = AudioEngine.instance;
    nextTimeRef.current = engine.now() + 0.05;
    stepRef.current = 0;

    const id = window.setInterval(() => {
      const ctxNow = engine.now();
      const pat = patternRef.current;
      if (!pat) return;
      const stepDur = 60 / pat.bpm / 4; // 16th notes
      while (nextTimeRef.current < ctxNow + SCHEDULE_AHEAD) {
        const when = nextTimeRef.current;
        const step = stepRef.current;
        // Schedule all enabled tracks at this step.
        for (const track of pat.tracks) {
          if (!track.sampleId) continue;
          if (!track.steps[step]) continue;
          const meta = samples[track.sampleId];
          if (!meta) continue;
          // Apply per-track gain by overriding gainDb in trigger args via a clone.
          engine.trigger({ ...meta, gainDb: meta.gainDb + track.gainDb }, { when });
        }
        // Visualize the playhead near its real time.
        const visualStep = step;
        engine.scheduleAt(when, () => {
          if (playingRef.current) setCurrentStep(visualStep);
        });
        stepRef.current = (step + 1) % STEP_COUNT;
        nextTimeRef.current += stepDur;
      }
    }, LOOKAHEAD_MS);

    return () => {
      window.clearInterval(id);
      setCurrentStep(-1);
    };
  }, [playing, samples]);

  const start = async () => {
    await unlock();
    setPlaying(true);
  };
  const stop = () => {
    setPlaying(false);
    AudioEngine.instance.stopAll();
  };

  if (!pattern) return <section className="view seq-view">パターンがありません</section>;

  const sampleList = Object.values(samples);

  return (
    <section className="view seq-view">
      <div className="seq-toolbar">
        <select
          className="select"
          value={pattern.id}
          onChange={(e) => setActivePattern(e.target.value)}
        >
          {Object.values(patterns).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="btn small" onClick={() => newPattern()}>+ 新規</button>
        <button className="btn small" onClick={savePattern}>保存</button>
        <button className="btn small ghost" onClick={() => deletePattern(pattern.id)}>削除</button>
      </div>

      <div className="seq-toolbar">
        <span className="lbl">BPM</span>
        <input
          className="bpm"
          type="number"
          min={40}
          max={220}
          value={pattern.bpm}
          onChange={(e) => setBpm(parseInt(e.target.value, 10) || 100)}
        />
        {!playing ? (
          <button className="btn primary" onClick={start}>▶ PLAY</button>
        ) : (
          <button className="btn danger" onClick={stop}>■ STOP</button>
        )}
      </div>

      <div className="seq-grid">
        {pattern.tracks.map((track, ti) => (
          <div key={ti} className="seq-track">
            <select
              className="select small"
              value={track.sampleId ?? ''}
              onChange={(e) => setTrackSample(ti, e.target.value || null)}
            >
              <option value="">— track {ti + 1} —</option>
              {sampleList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="seq-steps">
              {track.steps.map((on, si) => (
                <button
                  key={si}
                  className={`step ${on ? 'on' : ''} ${si === currentStep ? 'play' : ''} ${si % 4 === 0 ? 'beat' : ''}`}
                  onClick={() => toggleStep(ti, si)}
                  aria-pressed={on}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
