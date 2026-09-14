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
 *   #/c/<candidateId>        the panel, over whichever board you were on
 *   #/room/<roundId>         the interview room
 *   #/t/<roundId>            the transcript
 */

export type TRoute =
  | { view: 'rounds' }
  | { view: 'people' }
  | { view: 'pipeline' }
  | { view: 'candidate'; id: string }
  | { view: 'room'; id: string }
  | { view: 'transcript'; id: string };

export const parse = (hash: string): TRoute => {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'people') return { view: 'people' };
  if (parts[0] === 'pipeline') return { view: 'pipeline' };
  if (parts[0] === 'c' && parts[1]) return { view: 'candidate', id: parts[1] };
  if (parts[0] === 'room' && parts[1]) return { view: 'room', id: parts[1] };
  if (parts[0] === 't' && parts[1]) return { view: 'transcript', id: parts[1] };
  return { view: 'rounds' };
};

export const href = (r: TRoute): string => {
  switch (r.view) {
    case 'people':
      return '#/people';
    case 'pipeline':
      return '#/pipeline';
    case 'candidate':
      return `#/c/${r.id}`;
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
