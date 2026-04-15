import { useAppStore } from '../state/useAppStore';
import { isStandalone } from '../utils/helpers';

/**
 * Top "display" strip — like the LCD on hardware. Shows current sample, BPM,
 * and any transient toast / warnings (storage eviction, etc).
 */
export function Display() {
  const samples = useAppStore((s) => s.samples);
  const selectedId = useAppStore((s) => s.selectedSampleId);
  const patterns = useAppStore((s) => s.patterns);
  const activePatternId = useAppStore((s) => s.activePatternId);
  const toast = useAppStore((s) => s.toast);
  const storageWarning = useAppStore((s) => s.storageWarning);

  const sample = selectedId ? samples[selectedId] : null;
  const pattern = activePatternId ? patterns[activePatternId] : null;

  return (
    <header className="display">
      <div className="display-row">
        <div className="brand">SMPLR</div>
        <div className="display-meta">
          <span className="lbl">BPM</span>
          <strong>{pattern?.bpm ?? '—'}</strong>
          <span className="lbl">PAT</span>
          <strong className="ellipsis">{pattern?.name ?? '—'}</strong>
        </div>
      </div>
      <div className="display-row sub">
        <span className="lbl">SMPL</span>
        <strong className="ellipsis">{sample ? sample.name : '— select —'}</strong>
        {!isStandalone() && <span className="hint">「ホーム画面に追加」推奨</span>}
      </div>
      {storageWarning && (
        <div className="warning">
          ⚠ ブラウザがストレージを永続化していません。Safari のキャッシュ削除でデータが消える場合があります。
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </header>
  );
}
