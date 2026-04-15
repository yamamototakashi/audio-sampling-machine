// Small utilities — kept dependency-free.

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export const semitonesToRate = (semis: number): number => Math.pow(2, semis / 12);

export const formatSeconds = (s: number): string => {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
};

/** True when the page is opened from the iOS home screen as a standalone PWA. */
export const isStandalone = (): boolean => {
  // iOS uses navigator.standalone; modern browsers expose display-mode media query.
  // Cast to any to avoid pulling iOS-only types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ios = (navigator as any).standalone === true;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches;
  return Boolean(ios || mq);
};
