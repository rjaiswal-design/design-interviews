/** mm:ss, or h:mm:ss past an hour. Tabular everywhere it is shown. */
export const clock = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const DAY = 86_400_000;

/** "Tue 16 Sep, 14:30". Unscheduled reads as a dash, not as 1970. */
export const when = (ms: number): string => {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** "Tue 16 Sept" — the date alone, for a column that is planned from at day
 *  resolution. The time is set and read on the round itself. */
export const day = (ms: number): string => {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

/** How far off, in words. Past rounds read as "3 days ago". */
export const relative = (ms: number, from = Date.now()): string => {
  if (!ms) return 'Unscheduled';
  const d = ms - from;
  const days = Math.round(d / DAY);
  if (Math.abs(d) < 3_600_000) {
    const mins = Math.round(d / 60_000);
    if (Math.abs(mins) < 2) return 'Now';
    return mins > 0 ? `In ${mins} min` : `${-mins} min ago`;
  }
  if (days === 0) return d > 0 ? 'Later today' : 'Earlier today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
};

/** For a `datetime-local` input, which wants local time with no zone. */
export const toLocalInput = (ms: number): string => {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromLocalInput = (v: string): number => (v ? new Date(v).getTime() : 0);

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
