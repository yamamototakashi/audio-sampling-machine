import { useState } from 'react';
import { useAppStore } from '../state/useAppStore';
import { AudioEngine } from '../audio/AudioEngine';
import { PAD_COUNT } from '../types';

/**
 * 12-pad performance grid. Tap = trigger; long-press opens an assign menu
 * for picking a sample / toggling loop mode.
 */
export function PadGrid() {
  const pads = useAppStore((s) => s.pads);
  const samples = useAppStore((s) => s.samples);
  const assignPad = useAppStore((s) => s.assignPad);
  const togglePadLoop = useAppStore((s) => s.togglePadLoop);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [pressed, setPressed] = useState<Set<number>>(new Set());

  const onDown = (padId: number) => {
    const pad = pads[padId];
    if (!pad.sampleId) {
      setMenuFor(padId);
      return;
    }
    const meta = samples[pad.sampleId];
    if (!meta) return;
    setPressed((p) => new Set(p).add(padId));
    AudioEngine.instance.trigger(meta, {
      loop: pad.loop,
      voiceId: `pad-${padId}`,
    });
  };

  const onUp = (padId: number) => {
    const pad = pads[padId];
    if (pad.loop) AudioEngine.instance.stopVoice(`pad-${padId}`);
    setPressed((p) => {
      const n = new Set(p);
      n.delete(padId);
      return n;
    });
  };

  return (
    <section className="view play-view">
      <h2 className="view-title">パッド</h2>
      <div className="pad-grid" style={{ ['--pads' as string]: PAD_COUNT }}>
        {pads.map((pad) => {
          const meta = pad.sampleId ? samples[pad.sampleId] : null;
          const on = pressed.has(pad.id);
          return (
            <button
              key={pad.id}
              className={`pad ${on ? 'down' : ''} ${pad.loop ? 'loop' : ''}`}
              onPointerDown={(e) => { e.preventDefault(); onDown(pad.id); }}
              onPointerUp={() => onUp(pad.id)}
              onPointerCancel={() => onUp(pad.id)}
              onPointerLeave={() => onUp(pad.id)}
              onContextMenu={(e) => { e.preventDefault(); setMenuFor(pad.id); }}
            >
              <span className="pad-num">{String(pad.id + 1).padStart(2, '0')}</span>
              <span className="pad-name">{meta ? meta.name : '— empty —'}</span>
              {pad.loop && <span className="pad-flag">LOOP</span>}
            </button>
          );
        })}
      </div>

      {menuFor !== null && (
        <PadAssignSheet
          padId={menuFor}
          onClose={() => setMenuFor(null)}
          onAssign={(id) => { assignPad(menuFor, id); setMenuFor(null); }}
          onToggleLoop={() => togglePadLoop(menuFor)}
          loop={pads[menuFor].loop}
        />
      )}
    </section>
  );
}

interface SheetProps {
  padId: number;
  onClose: () => void;
  onAssign: (id: string | null) => void;
  onToggleLoop: () => void;
  loop: boolean;
}
function PadAssignSheet({ padId, onClose, onAssign, onToggleLoop, loop }: SheetProps) {
  const samples = useAppStore((s) => s.samples);
  const list = Object.values(samples).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-inner" onClick={(e) => e.stopPropagation()}>
        <h3>PAD {padId + 1} へ割当</h3>
        <div className="sheet-row">
          <label className="checkbox">
            <input type="checkbox" checked={loop} onChange={onToggleLoop} /> ループ再生
          </label>
        </div>
        <div className="sample-list scrollable">
          <button className="sample-chip" onClick={() => onAssign(null)}>— なし —</button>
          {list.map((s) => (
            <button key={s.id} className="sample-chip" onClick={() => onAssign(s.id)}>{s.name}</button>
          ))}
        </div>
        <button className="btn ghost wide" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
