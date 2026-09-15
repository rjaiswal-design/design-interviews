import { useEffect, useState } from 'react';

/**
 * The route, in the hash.
 *
 * Not a router — there are four views and one of them is a modal. What this
 * buys is the thing a router is usually adopted for: the URL says what you are
 * looking at, so the link you send someone opens the round you are talking
 * about rather than the board. Sentinel's `?v=` does the same job for its
 * variant switcher.
 *
 *   #/rounds                 the board, by round
 *   #/people                 the board, by candidate
 *   #/pipeline               the process, with the funnel on it
 *   #/rounds/c/<id>          the panel, over the rounds board
 *   #/people/c/<id>          the panel, over the candidates board
 *   #/room/<roundId>         the round
 *   #/t/<roundId>            the transcript
 *
 * The panel carries the board it was opened from, which is not decoration: the
 * panel is an overlay, something has to be drawn behind it, and a route that
 * only said "candidate" left that to a default. Opening somebody from the
 * candidates list put the *rounds* board behind the panel, lit the wrong nav
 * tab, and dropped you on rounds when you closed it.
 *
 * `#/c/<id>` still parses, over the rounds board, because links to it exist.
 */

export type TRoute =
  | { view: 'rounds' }
  | { view: 'people' }
  | { view: 'pipeline' }
  | { view: 'candidate'; id: string; from: 'rounds' | 'people' }
  | { view: 'room'; id: string }
  | { view: 'transcript'; id: string };

export const parse = (hash: string): TRoute => {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  // Longest match first. `#/people/c/<id>` shares its first segment with
  // `#/people`, so testing the board route above it swallowed every panel link
  // opened from the candidates list — the hash was right, the panel simply
  // never rendered.
  if ((parts[0] === 'rounds' || parts[0] === 'people') && parts[1] === 'c' && parts[2]) {
    return { view: 'candidate', id: parts[2], from: parts[0] };
  }
  // The shape before the board was carried. Kept working, over rounds.
  if (parts[0] === 'c' && parts[1]) return { view: 'candidate', id: parts[1], from: 'rounds' };
  if (parts[0] === 'room' && parts[1]) return { view: 'room', id: parts[1] };
  if (parts[0] === 't' && parts[1]) return { view: 'transcript', id: parts[1] };

  if (parts[0] === 'people') return { view: 'people' };
  if (parts[0] === 'pipeline') return { view: 'pipeline' };
  return { view: 'rounds' };
};

export const href = (r: TRoute): string => {
  switch (r.view) {
    case 'people':
      return '#/people';
    case 'pipeline':
      return '#/pipeline';
    case 'candidate':
      return `#/${r.from}/c/${r.id}`;
    case 'room':
      return `#/room/${r.id}`;
    case 'transcript':
      return `#/t/${r.id}`;
    default:
      return '#/rounds';
  }
};

export const go = (r: TRoute) => {
  window.location.hash = href(r);
};

export const useRoute = (): TRoute => {
  const [route, setRoute] = useState<TRoute>(() => parse(window.location.hash));
  useEffect(() => {
    const read = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return route;
};
