import type {
  TDecision,
  TRetiredKind,
  TRoundStatus,
  TSignal,
  TStoredRoundKind,
} from '../types';

/**
 * The ladder. Four rounds, the same four for everyone.
 *
 * It is a fixed list rather than a per-level one: a ladder that varies by band
 * means two candidates for the same role can be compared on different evidence,
 * and the argument at the end is then about who got which rounds rather than
 * about the work.
 *
 * `signals` is what each rung is actually qualified to judge, and it is the
 * load-bearing field here. Scoring craft in the culture round is the failure
 * mode it exists to prevent: every interviewer scoring every signal produces
 * six averages and no information, because most of them were guesses from
 * people who never saw the work.
 */
export type TRung = {
  kind: TStoredRoundKind;
  /** Position on the ladder, 1-based. `0` means retired — off the ladder, kept
   *  because rounds were run on it. */
  no: number;
  label: string;
  /** What it is for, in one line, shown above the question script. */
  purpose: string;
  durationMin: number;
  signals: TSignal[];
  /** The script. A spine, not a questionnaire — the room shows them as prompts
   *  the interviewer ticks off, and going off them is the point of a good
   *  interview. */
  prompts: string[];
  /** True for a rung the process no longer has. Its rounds are readable and
   *  editable; they are just not part of anybody's ladder any more. */
  retired?: boolean;
};

export const LADDER: TRung[] = [
  {
    kind: 'portfolio',
    no: 1,
    label: 'Portfolio',
    purpose: 'One project, end to end, in their own words. Depth over breadth.',
    durationMin: 60,
    signals: ['craft', 'product', 'communication'],
    prompts: [
      'Pick one project. Not the prettiest — the one you learned most from.',
      'What was the state of it when you arrived? Who decided it mattered?',
      'Walk me through what you tried that did not work.',
      'Show me the version you shipped and the version you wanted to ship.',
      'What did the numbers do? What did you expect them to do?',
      'What would you tear up if you started it again on Monday?',
    ],
  },
  {
    kind: 'critique',
    no: 2,
    label: 'Whiteboarding & critique',
    purpose:
      'A live problem on our surface, then our work put in front of them. Watching them think, and watching them judge.',
    durationMin: 60,
    signals: ['craft', 'systems', 'communication'],
    prompts: [
      'Here is the brief. Take five minutes and ask me anything first.',
      'Who is this for, and what are they doing thirty seconds before this screen?',
      'Draw the unhappy path before the happy one.',
      'This has to work in Arabic at 130% of the string length. What changes?',
      'Here is a screen we shipped. Critique it as if you owned it.',
      'When is it correct to break the design system?',
      'Now critique your own screen as if someone else made it.',
    ],
  },
  {
    kind: 'product',
    no: 3,
    label: 'Product',
    purpose: 'With a PM. Whether they can hold a business problem, not just a screen.',
    durationMin: 45,
    signals: ['product', 'collaboration', 'communication'],
    prompts: [
      'What is the business actually paying you to change?',
      'A PM wants a date you know is wrong. What do you actually do?',
      'Pick a metric you have moved and tell me what you broke doing it.',
      'How do you decide what not to build?',
      'An engineer ships something 80% right. Walk me through the next hour.',
      'What is the team you are on now wrong about?',
    ],
  },
  {
    kind: 'culture',
    no: 4,
    label: 'Culture',
    purpose: 'Whether they make the people around them better, and want to be here.',
    durationMin: 45,
    signals: ['ambition', 'collaboration'],
    prompts: [
      'What is the hardest feedback you have been given, and what came of it?',
      'Tell me about a time you were the reason something did not ship.',
      'Who have you made better, and how do you know?',
      'What kind of problem do you want to be holding in two years?',
      'What would make you leave a job you liked?',
      'What do you want to know about us?',
    ],
  },
];

/**
 * Rungs the ladder used to have, by the name their rounds are stored under.
 *
 * Without this, `rung()` fell through to `LADDER[0]` and a completed intro
 * round rendered as "1. Portfolio" — two rows claiming to be the same
 * conversation, one of which never happened. A retired rung has no script and
 * no signals, because nothing new is ever run on it.
 */
const RETIRED: Record<TRetiredKind, string> = {
  intro: 'Intro',
  craft: 'Craft',
  systems: 'Systems & craft partners',
  bar: 'Bar raiser',
};

export const isRetired = (kind: TStoredRoundKind): kind is TRetiredKind => kind in RETIRED;

export const rung = (kind: TStoredRoundKind): TRung => {
  const hit = LADDER.find((r) => r.kind === kind);
  if (hit) return hit;
  return {
    kind,
    no: 0,
    label: RETIRED[kind as TRetiredKind] ?? 'Retired round',
    purpose:
      'This round was run on a rung the process no longer has. It is kept because it happened; nothing new is scheduled on it.',
    durationMin: 0,
    signals: [],
    prompts: [],
    retired: true,
  };
};

/**
 * The rungs a candidate walks. Everyone walks all four.
 *
 * Kept as a function rather than exporting `LADDER` directly at every call
 * site: it used to depend on level, it is the one place that would change again
 * if a round ever became conditional, and the callers already read the right
 * way round.
 */
export const ladderFor = (): TRung[] => LADDER;

export const SIGNAL_LABELS: Record<TSignal, string> = {
  craft: 'Craft',
  product: 'Product thinking',
  systems: 'Systems',
  collaboration: 'Collaboration',
  communication: 'Communication',
  ambition: 'Ambition',
};

export const DECISION_LABELS: Record<TDecision, string> = {
  pending: 'No call yet',
  strong_no: 'Strong no',
  no: 'No',
  yes: 'Yes',
  strong_yes: 'Strong yes',
};

export const STATUS_LABELS: Record<TRoundStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  complete: 'Complete',
  cancelled: 'Cancelled',
};

/** The four points, as words, so a score reads as a call and not as a rating. */
export const SCORE_LABELS = ['—', 'Strong no', 'No', 'Yes', 'Strong yes'] as const;

/**
 * Ladder order, with retired rungs last.
 *
 * `order.indexOf(kind)` returns -1 for a rung that is no longer on the ladder,
 * which sorts it *above* round one — so a retired intro round appeared at the
 * top of the track as though the process began with it. Anything off the
 * ladder belongs after everything on it.
 */
export const byLadder =
  (order: TStoredRoundKind[]) =>
  (a: { kind: TStoredRoundKind }, b: { kind: TStoredRoundKind }): number => {
    const ia = order.indexOf(a.kind);
    const ib = order.indexOf(b.kind);
    return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
  };

/**
 * How a rung is drawn on the track: by the call, not by the status.
 *
 * A complete round with a no on it is amber and a cancelled one is grey,
 * because what the eye is looking for when it scans a track is "how is this
 * going" — and status alone cannot answer that. Four green "complete" bars
 * look identical whether they were four yeses or four nos.
 *
 * It lives here rather than beside the component that uses it because a file
 * that exports both a component and a helper cannot Fast Refresh, and Vite
 * says so out loud on every save.
 */
export const rungClass = (r: TRoundLike | undefined): string => {
  if (!r) return 'off';
  if (r.status === 'cancelled') return 'off';
  if (r.status === 'in_progress') return 'now';
  if (r.status !== 'complete') return '';
  if (r.decision === 'strong_no') return 'bad';
  if (r.decision === 'no') return 'weak';
  if (r.decision === 'pending') return 'on';
  return 'done';
};

/** Only the two fields the class depends on, so this does not import the row. */
type TRoundLike = { status: TRoundStatus; decision: TDecision };
