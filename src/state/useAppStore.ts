import { create } from 'zustand';
import {
  DEFAULT_BPM,
  PAD_COUNT,
  STEP_COUNT,
  TRACK_COUNT,
  type PadSlot,
  type Pattern,
  type SampleMeta,
} from '../types';
import { Storage } from '../storage/Storage';
import { AudioEngine } from '../audio/AudioEngine';
import { uid } from '../utils/helpers';

export type Tab = 'rec' | 'edit' | 'play' | 'seq';

interface AppState {
  // boot
  ready: boolean;
  audioUnlocked: boolean;
  storageWarning: boolean;
  // ui
  tab: Tab;
  toast: string | null;
  // library
  samples: Record<string, SampleMeta>;
  selectedSampleId: string | null;
  // performance
  pads: PadSlot[];
  // sequencer
  patterns: Record<string, Pattern>;
  activePatternId: string | null;
  // actions
  init: () => Promise<void>;
  unlockAudio: () => Promise<void>;
  setTab: (t: Tab) => void;
  showToast: (m: string) => void;
  // samples
  addSample: (meta: SampleMeta, pcm: Float32Array) => Promise<void>;
  updateSampleMeta: (meta: SampleMeta) => Promise<void>;
  replaceSample: (meta: SampleMeta, pcm: Float32Array) => Promise<void>;
  deleteSample: (id: string) => Promise<void>;
  selectSample: (id: string | null) => void;
  // pads
  assignPad: (padId: number, sampleId: string | null) => void;
  togglePadLoop: (padId: number) => void;
  // patterns
  newPattern: (name?: string) => void;
  setActivePattern: (id: string) => void;
  setBpm: (bpm: number) => void;
  toggleStep: (track: number, step: number) => void;
  setTrackSample: (track: number, sampleId: string | null) => void;
  savePattern: () => Promise<void>;
  deletePattern: (id: string) => Promise<void>;
  // persistence
  persistProject: () => Promise<void>;
}

const emptyPads = (): PadSlot[] =>
  Array.from({ length: PAD_COUNT }, (_, i) => ({ id: i, sampleId: null, loop: false }));

const emptyPattern = (name = 'Pattern 1'): Pattern => ({
  id: uid('pat'),
  name,
  bpm: DEFAULT_BPM,
  tracks: Array.from({ length: TRACK_COUNT }, () => ({
    sampleId: null,
    steps: Array.from({ length: STEP_COUNT }, () => false),
    gainDb: 0,
  })),
  updatedAt: new Date().toISOString(),
});

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  audioUnlocked: false,
  storageWarning: false,
  tab: 'play',
  toast: null,
  samples: {},
  selectedSampleId: null,
  pads: emptyPads(),
  patterns: {},
  activePatternId: null,

  init: async () => {
    // Request persistent storage best-effort. Show a soft warning if denied.
    const persisted = await Storage.requestPersistence();

    const [metas, patterns, project] = await Promise.all([
      Storage.getAllSampleMeta(),
      Storage.getAllPatterns(),
      Storage.loadProject(),
    ]);

    // Pre-load PCM into AudioEngine for quick triggering.
    const engine = AudioEngine.instance;
    const samples: Record<string, SampleMeta> = {};
    await Promise.all(
      metas.map(async (m) => {
        samples[m.id] = m;
        const pcm = await Storage.getSamplePCM(m.id);
        if (pcm) engine.setBuffer(m.id, engine.bufferFromPCM(pcm, m.sampleRate));
      }),
    );

    const patternMap: Record<string, Pattern> = {};
    patterns.forEach((p) => (patternMap[p.id] = p));

    let activePatternId: string | null = project?.activePatternId ?? null;
    if (!activePatternId || !patternMap[activePatternId]) {
      // ensure at least one pattern exists
      const p = emptyPattern();
      patternMap[p.id] = p;
      activePatternId = p.id;
      await Storage.putPattern(p);
    }

    set({
      ready: true,
      storageWarning: !persisted,
      samples,
      patterns: patternMap,
      activePatternId,
      pads: project?.pads ?? emptyPads(),
      selectedSampleId: project?.selectedSampleId ?? null,
    });
  },

  unlockAudio: async () => {
    await AudioEngine.instance.unlock();
    set({ audioUnlocked: true });
  },

  setTab: (t) => set({ tab: t }),

  showToast: (m) => {
    set({ toast: m });
    setTimeout(() => {
      if (get().toast === m) set({ toast: null });
    }, 2200);
  },

  addSample: async (meta, pcm) => {
    await Storage.putSample(meta, pcm);
    const engine = AudioEngine.instance;
    engine.setBuffer(meta.id, engine.bufferFromPCM(pcm, meta.sampleRate));
    set((s) => ({
      samples: { ...s.samples, [meta.id]: meta },
      selectedSampleId: meta.id,
    }));
    await get().persistProject();
  },

  updateSampleMeta: async (meta) => {
    await Storage.updateSampleMeta(meta);
    set((s) => ({ samples: { ...s.samples, [meta.id]: meta } }));
  },

  replaceSample: async (meta, pcm) => {
    await Storage.putSample(meta, pcm);
    const engine = AudioEngine.instance;
    engine.setBuffer(meta.id, engine.bufferFromPCM(pcm, meta.sampleRate));
    set((s) => ({ samples: { ...s.samples, [meta.id]: meta } }));
  },

  deleteSample: async (id) => {
    await Storage.deleteSample(id);
    set((s) => {
      const next = { ...s.samples };
      delete next[id];
      const pads = s.pads.map((p) => (p.sampleId === id ? { ...p, sampleId: null } : p));
      // strip from patterns
      const patterns = { ...s.patterns };
      Object.values(patterns).forEach((pat) => {
        pat.tracks.forEach((t) => {
          if (t.sampleId === id) t.sampleId = null;
        });
      });
      return {
        samples: next,
        pads,
        patterns,
        selectedSampleId: s.selectedSampleId === id ? null : s.selectedSampleId,
      };
    });
    await get().persistProject();
  },

  selectSample: (id) => {
    set({ selectedSampleId: id });
    void get().persistProject();
  },

  assignPad: (padId, sampleId) => {
    set((s) => ({
      pads: s.pads.map((p) => (p.id === padId ? { ...p, sampleId } : p)),
    }));
    void get().persistProject();
  },

  togglePadLoop: (padId) => {
    set((s) => ({
      pads: s.pads.map((p) => (p.id === padId ? { ...p, loop: !p.loop } : p)),
    }));
    void get().persistProject();
  },

  newPattern: (name) => {
    const p = emptyPattern(name ?? `Pattern ${Object.keys(get().patterns).length + 1}`);
    set((s) => ({ patterns: { ...s.patterns, [p.id]: p }, activePatternId: p.id }));
    void Storage.putPattern(p);
    void get().persistProject();
  },

  setActivePattern: (id) => {
    set({ activePatternId: id });
    void get().persistProject();
  },

  setBpm: (bpm) => {
    const id = get().activePatternId;
    if (!id) return;
    set((s) => ({
      patterns: {
        ...s.patterns,
        [id]: { ...s.patterns[id], bpm, updatedAt: new Date().toISOString() },
      },
    }));
  },

  toggleStep: (track, step) => {
    const id = get().activePatternId;
    if (!id) return;
    set((s) => {
      const pat = s.patterns[id];
      const tracks = pat.tracks.map((t, i) =>
        i === track ? { ...t, steps: t.steps.map((v, j) => (j === step ? !v : v)) } : t,
      );
      return {
        patterns: { ...s.patterns, [id]: { ...pat, tracks, updatedAt: new Date().toISOString() } },
      };
    });
  },

  setTrackSample: (track, sampleId) => {
    const id = get().activePatternId;
    if (!id) return;
    set((s) => {
      const pat = s.patterns[id];
      const tracks = pat.tracks.map((t, i) => (i === track ? { ...t, sampleId } : t));
      return {
        patterns: { ...s.patterns, [id]: { ...pat, tracks, updatedAt: new Date().toISOString() } },
      };
    });
  },

  savePattern: async () => {
    const id = get().activePatternId;
    if (!id) return;
    await Storage.putPattern(get().patterns[id]);
    get().showToast('パターン保存');
  },

  deletePattern: async (id) => {
    await Storage.deletePattern(id);
    set((s) => {
      const next = { ...s.patterns };
      delete next[id];
      let active = s.activePatternId;
      if (active === id) active = Object.keys(next)[0] ?? null;
      return { patterns: next, activePatternId: active };
    });
    await get().persistProject();
  },

  persistProject: async () => {
    const s = get();
    await Storage.saveProject({
      pads: s.pads,
      activePatternId: s.activePatternId,
      selectedSampleId: s.selectedSampleId,
    });
  },
}));
