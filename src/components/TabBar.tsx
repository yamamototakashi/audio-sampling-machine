import { useAppStore, type Tab } from '../state/useAppStore';

const TABS: { id: Tab; label: string }[] = [
  { id: 'rec', label: 'REC' },
  { id: 'edit', label: 'EDIT' },
  { id: 'play', label: 'PLAY' },
  { id: 'seq', label: 'SEQ' },
];

export function TabBar() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  return (
    <nav className="tabbar" aria-label="primary">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab ${tab === t.id ? 'on' : ''}`}
          onClick={() => setTab(t.id)}
          aria-pressed={tab === t.id}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
