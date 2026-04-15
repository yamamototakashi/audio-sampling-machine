import { useMemo, useState } from 'react';
import { useAppStore } from '../state/useAppStore';
import { AudioEngine } from '../audio/AudioEngine';

/**
 * 2-octave mini keyboard. Plays the currently selected sample at the
 * tapped pitch (semitones relative to root C). White & black key layout
 * is rendered with overlaid black keys.
 */
const WHITE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// semitone offsets for white keys within an octave
const WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11];
// position of the black key relative to the white-key index (or null if none)
const BLACK_AFTER = [1, 3, null, 6, 8, 10, null] as const;

interface KeyDef {
  semi: number;
  label: string;
  isBlack: boolean;
  whiteIndex: number; // for absolute positioning
}

function buildKeys(octaves: number, baseOctave: number): { whites: KeyDef[]; blacks: KeyDef[] } {
  const whites: KeyDef[] = [];
  const blacks: KeyDef[] = [];
  let wi = 0;
  for (let o = 0; o < octaves; o++) {
    for (let i = 0; i < 7; i++) {
      const semi = WHITE_SEMIS[i] + o * 12;
      whites.push({ semi, label: `${WHITE[i]}${baseOctave + o}`, isBlack: false, whiteIndex: wi });
      const bk = BLACK_AFTER[i];
      if (bk !== null) {
        blacks.push({ semi: bk + o * 12, label: '', isBlack: true, whiteIndex: wi });
      }
      wi++;
    }
  }
  return { whites, blacks };
}

export function Keyboard() {
  const samples = useAppStore((s) => s.samples);
  const selectedId = useAppStore((s) => s.selectedSampleId);
  const sample = selectedId ? samples[selectedId] : null;

  const [root, setRoot] = useState(0); // semitone offset for the leftmost C
  const [held, setHeld] = useState<Set<number>>(new Set());

  const { whites, blacks } = useMemo(() => buildKeys(2, 4), []);

  const trigger = (semi: number) => {
    if (!sample) return;
    AudioEngine.instance.trigger(sample, {
      extraSemitones: semi + root - 12, // center C5-ish
      voiceId: `key-${semi}`,
    });
    setHeld((h) => new Set(h).add(semi));
  };
  const release = (semi: number) => {
    AudioEngine.instance.stopVoice(`key-${semi}`);
    setHeld((h) => {
      const n = new Set(h);
      n.delete(semi);
      return n;
    });
  };

  return (
    <section className="view kbd-view">
      <div className="kbd-toolbar">
        <span className="lbl">ROOT</span>
        <button className="btn small" onClick={() => setRoot((r) => r - 12)}>-12</button>
        <button className="btn small" onClick={() => setRoot((r) => r - 1)}>-1</button>
        <strong className="root-val">{root}</strong>
        <button className="btn small" onClick={() => setRoot((r) => r + 1)}>+1</button>
        <button className="btn small" onClick={() => setRoot((r) => r + 12)}>+12</button>
        <span className="hint inline">{sample ? sample.name : 'サンプル未選択'}</span>
      </div>
      <div className="keyboard">
        <div className="keys-white">
          {whites.map((k) => (
            <button
              key={`w-${k.semi}`}
              className={`key white ${held.has(k.semi) ? 'down' : ''}`}
              onPointerDown={(e) => { e.preventDefault(); trigger(k.semi); }}
              onPointerUp={() => release(k.semi)}
              onPointerCancel={() => release(k.semi)}
              onPointerLeave={() => release(k.semi)}
            >
              <span className="key-label">{k.label}</span>
            </button>
          ))}
        </div>
        <div className="keys-black">
          {blacks.map((k) => (
            <button
              key={`b-${k.semi}`}
              className={`key black ${held.has(k.semi) ? 'down' : ''}`}
              style={{ left: `calc(${k.whiteIndex + 1} * (100% / ${whites.length}) - (100% / ${whites.length}) * 0.3)` }}
              onPointerDown={(e) => { e.preventDefault(); trigger(k.semi); }}
              onPointerUp={() => release(k.semi)}
              onPointerCancel={() => release(k.semi)}
              onPointerLeave={() => release(k.semi)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
