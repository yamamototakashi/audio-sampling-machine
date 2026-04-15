import { useEffect } from 'react';
import { useAppStore } from './state/useAppStore';
import { Display } from './components/Display';
import { TabBar } from './components/TabBar';
import { RecorderView } from './components/RecorderView';
import { SampleEditor } from './components/SampleEditor';
import { PadGrid } from './components/PadGrid';
import { Keyboard } from './components/Keyboard';
import { Sequencer } from './components/Sequencer';

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const init = useAppStore((s) => s.init);
  const tab = useAppStore((s) => s.tab);
  const audioUnlocked = useAppStore((s) => s.audioUnlocked);
  const unlockAudio = useAppStore((s) => s.unlockAudio);

  useEffect(() => {
    void init();
  }, [init]);

  // First-tap audio unlock overlay. iOS Safari requires a user gesture
  // to start the AudioContext; this guarantees the gesture happens
  // before we ever try to play sound.
  if (!ready) {
    return <div className="boot">Booting…</div>;
  }

  return (
    <div className="app">
      <Display />
      <main className="content">
        {tab === 'rec' && <RecorderView />}
        {tab === 'edit' && <SampleEditor />}
        {tab === 'play' && (
          <>
            <PadGrid />
            <Keyboard />
          </>
        )}
        {tab === 'seq' && <Sequencer />}
      </main>
      <TabBar />

      {!audioUnlocked && (
        <div className="boot-overlay" onClick={unlockAudio}>
          <div className="boot-card">
            <h1>SMPLR</h1>
            <p>タップしてオーディオを開始</p>
            <button className="btn primary big" onClick={unlockAudio}>START</button>
          </div>
        </div>
      )}
    </div>
  );
}
