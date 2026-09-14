import type {
  TDecision,
  TRetiredKind,
  TRoundStatus,
  TSignal,
  TStoredRoundKind,
  TTrack,
} from '../types';

/**
 * The two ladders.
 *
 * Product and visual designers are interviewed differently, by different
 * people, against different things — so they are two processes rather than one
 * with optional rungs. A candidate's `track` decides which they walk, and every
 * candidate on a track walks all of it: a ladder that varies within a track
 * would mean two people up for the same opening compared on different
 * evidence, and the argument at the end would be about who got which rounds.
 *
 * `owners` is who runs the round by default. New rounds are pre-assigned to
 * them, because "Portfolio with Ayaneshu" is how the process is actually
 * described out loud — and an unassigned round is one nobody is going to book.
 * It is a default, not a rule: the panel on any round is editable.
 *
 * `signals` is what a round is qualified to judge, and it is load-bearing.
 * Scoring craft in the culture round is the failure mode it prevents: every
 * interviewer scoring every signal produces six averages and no information,
 * because most were guesses from people who never saw the work.
 */
export type TRung = {
  kind: TStoredRoundKind;
  /** Position on its own ladder, 1-based. `0` means retired. */
  no: number;
  label: string;
  /** What it is for, in one line, shown above the question script. */
  purpose: string;
  durationMin: number;
  /** Who runs it by default. */
  owners: string[];
  /**
   * Whether `owners` is a choice or a pair.
   *
   * "Sanket / Jithin" means either of them takes the round; "Rahul & Aanchal"
   * means both sit in it. The difference is not decoration — it decides what a
   * new round is pre-assigned to. Booking two people into a round only one of
   * them is going to run is a panel somebody has to correct, and leaving one
   * name off a round two people attend is a panel that is simply wrong.
   *
   * Absent means a pair, because that is the common case and the loud one to
   * get wrong.
   */
  either?: boolean;
  signals: TSignal[];
  /** The script. A spine, not a questionnaire. */
  prompts: string[];
  /** Which ladder it belongs to. Absent on a retired rung. */
  track?: TTrack;
  /** True for a rung no ladder has any more. Its rounds stay readable. */
  retired?: boolean;
};

export const TRACK_LABELS: Record<TTrack, string> = {
  product: 'Product design',
  visual: 'Visual design',
};

export const TRACKS: TTrack[] = ['product', 'visual'];

const PRODUCT: TRung[] = [
  {
    kind: 'pd_hr',
    no: 1,
    label: 'HR round',
    purpose:
      'Is there a role here, and do they want it? Scope, level, market and money, said out loud before anyone spends an hour on a portfolio.',
    durationMin: 30,
    owners: ['Rahul', 'Aanchal'],
    track: 'product',
    signals: ['communication', 'ambition'],
    prompts: [
      'What are you working on right now, and what pulled you to look?',
      'What kind of problem do you want to be holding in two years?',
      'Scope, level, market, comp band. Say the numbers out loud.',
      'Notice period, and anything else in flight?',
      'What does a good design team look like to you — and a bad one?',
      'What do you want to know about us?',
    ],
  },
  {
    kind: 'pd_portfolio',
    no: 2,
    label: 'Portfolio',
    purpose: 'One project, end to end, in their own words. Depth over breadth.',
    durationMin: 60,
    owners: ['Ayaneshu'],
    track: 'product',
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
    kind: 'pd_critique',
    no: 3,
    label: 'Design critique & whiteboarding',
    purpose:
      'A live problem on our surface, then our work put in front of them. Watching them think, and watching them judge.',
    durationMin: 60,
    owners: ['Rahul'],
    track: 'product',
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
    kind: 'pd_ai_coding',
    no: 4,
    label: 'AI coding',
    purpose:
      'Can they build the thing, with the tools that now exist? Not whether they are an engineer — whether they can get an idea running and judge what comes back.',
    durationMin: 60,
    owners: ['Arnab'],
    track: 'product',
    signals: ['craft', 'systems', 'product'],
    prompts: [
      'Show me something you have built with an AI tool. Anything that ran.',
      'Take this brief and get something on screen. Talk while you do it.',
      'It gave you the wrong thing. How do you tell, and what do you say next?',
      'Where does it stop being faster than doing it yourself?',
      'What would you not let it decide?',
      'How would you hand this to an engineer without insulting them?',
    ],
  },
  {
    kind: 'pd_culture',
    no: 5,
    label: 'Culture fit',
    purpose: 'Whether they make the people around them better, and want to be here.',
    durationMin: 45,
    owners: ['Ayush'],
    track: 'product',
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
  {
    kind: 'pd_product',
    no: 6,
    label: 'Product thinking',
    purpose: 'Whether they can hold a business problem, not just a screen.',
    durationMin: 45,
    owners: ['Saumya'],
    track: 'product',
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
    kind: 'pd_offer',
    no: 7,
    label: 'Offer rollout',
    purpose:
      'Aanchal and the hiring manager make the offer together. Not an assessment — the decision is already made, and this is the conversation that lands it.',
    durationMin: 30,
    owners: ['Aanchal', 'Rahul'],
    track: 'product',
    // Nothing to score. The outcome of this round is the candidate's status —
    // offer rollout, then hired or offer dropped — not a mark out of four, and
    // an empty scorecard is more honest than inventing signals for a
    // conversation that is not judging anybody.
    signals: [],
    prompts: [
      'Here is the offer: level, comp, start date.',
      'What were you hoping for, and where is the gap?',
      'What would make this an easy yes?',
      'Who else are you talking to, and when do they get back to you?',
      'What do you need from us to decide?',
      'When can you tell us?',
    ],
  },
];

const VISUAL: TRung[] = [
  {
    kind: 'vd_hr',
    no: 1,
    label: 'HR round',
    purpose:
      'Is there a role here, and do they want it? Scope, level, market and money, said out loud before anyone spends an hour on a portfolio.',
    durationMin: 30,
    owners: ['Rahul', 'Aanchal'],
    track: 'visual',
    signals: ['communication', 'ambition'],
    prompts: [
      'What are you working on right now, and what pulled you to look?',
      'What kind of problem do you want to be holding in two years?',
      'Scope, level, market, comp band. Say the numbers out loud.',
      'Notice period, and anything else in flight?',
      'What does a good design team look like to you — and a bad one?',
      'What do you want to know about us?',
    ],
  },
  {
    kind: 'vd_portfolio',
    no: 2,
    label: 'Portfolio',
    purpose: 'The work itself, and whether they can say why it looks the way it does.',
    durationMin: 60,
    owners: ['Sanket', 'Jithin'],
    either: true,
    track: 'visual',
    signals: ['craft', 'communication'],
    prompts: [
      'Take me through the piece you are proudest of.',
      'What was the brief, and what did you do that was not in it?',
      'Show me an early version. What changed and why?',
      'Whose work do you steal from?',
      'Which of these would you redo now?',
      'What is the best thing you have made that nobody saw?',
    ],
  },
  {
    kind: 'vd_motion',
    no: 3,
    label: 'Motion ⇄ Visual',
    purpose:
      'How the work is built, not how it looks. Saswata opens the file: is the illustration layered so it can move, or is it one flat thing that has to be redrawn to animate?',
    durationMin: 45,
    owners: ['Saswata'],
    track: 'visual',
    // Craft and systems, not communication. The subject is the file — how it is
    // constructed and whether the next person can pick it up — and that is the
    // same question the design system asks of a component.
    signals: ['craft', 'systems'],
    prompts: [
      'Open the file for the piece you are proudest of. Show me the layer stack.',
      'Which parts of this were you thinking about in motion while you drew them?',
      'What would you have to redo to make this animate?',
      'How do you name and group things so somebody else can take it on?',
      'Show me something you built for motion from the start. What changed in how you drew it?',
      'Where does handing off to a motion designer usually go wrong?',
      'What do you want from us to make that handoff smoother?',
    ],
  },
  {
    kind: 'vd_working',
    no: 4,
    label: 'Working session',
    purpose: 'Making something together, live. How they take direction and how they push back.',
    durationMin: 90,
    owners: ['Tamanna'],
    track: 'visual',
    signals: ['craft', 'collaboration', 'communication'],
    prompts: [
      'Here is the brief and the assets. Start wherever you like.',
      'Talk me through what you are reaching for before you reach for it.',
      'Now make it work at 320px, and in Arabic.',
      'I do not like it. Ask me better questions than "why not".',
      'Take it somewhere I have not asked for.',
      'Which version would you ship, and what are you giving up?',
    ],
  },
  {
    kind: 'vd_product',
    no: 5,
    label: 'Product round',
    purpose: 'Whether the work is doing a job, not just looking right.',
    durationMin: 45,
    owners: ['Rahul'],
    track: 'visual',
    signals: ['product', 'systems', 'communication'],
    prompts: [
      'What was this campaign for? Did it work?',
      'How do you know when a visual decision is costing conversion?',
      'Tell me about working inside a brand you did not write.',
      'A PM asks for something you think is ugly and effective. What then?',
      'How do you make fifty assets without making fifty decisions?',
      'What is the difference between a brand system and a template?',
    ],
  },
  {
    kind: 'vd_culture',
    no: 6,
    label: 'Culture fit',
    purpose: 'Whether they make the people around them better, and want to be here.',
    durationMin: 45,
    owners: ['Ayush'],
    track: 'visual',
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
  {
    kind: 'vd_offer',
    no: 7,
    label: 'Offer rollout',
    purpose:
      'Aanchal and the hiring manager make the offer together. Not an assessment — the decision is already made, and this is the conversation that lands it.',
    durationMin: 30,
    owners: ['Aanchal', 'Rahul'],
    track: 'visual',
    // Nothing to score. The outcome of this round is the candidate's status —
    // offer rollout, then hired or offer dropped — not a mark out of four, and
    // an empty scorecard is more honest than inventing signals for a
    // conversation that is not judging anybody.
    signals: [],
    prompts: [
      'Here is the offer: level, comp, start date.',
      'What were you hoping for, and where is the gap?',
      'What would make this an easy yes?',
      'Who else are you talking to, and when do they get back to you?',
      'What do you need from us to decide?',
      'When can you tell us?',
    ],
  },
];

export const LADDERS: Record<TTrack, TRung[]> = { product: PRODUCT, visual: VISUAL };

/** Every rung on every ladder, in track order. For filters and the pipeline. */
export const LADDER: TRung[] = [...PRODUCT, ...VISUAL];

/** The rungs a candidate on this track walks. All of them. */
export const ladderFor = (track: TTrack): TRung[] => LADDERS[track] ?? PRODUCT;

/**
 * Rungs the process used to have, by the name their rounds are stored under.
 *
 * Without this, `rung()` fell through to the first rung of the first ladder and
 * a completed intro round rendered as "1. Portfolio" — two rows claiming to be
 * the same conversation, one of which never happened. A retired rung has no
 * script and no signals, because nothing new is ever run on it.
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
    owners: [],
    signals: [],
    prompts: [],
    retired: true,
  };
};

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
 * How a rung is drawn on the track: by the call, not by the status.
 *
 * A complete round with a no on it is amber and a cancelled one is grey,
 * because what the eye is looking for when it scans a track is "how is this
 * going" — and status alone cannot answer that. Four green "complete" bars look
 * identical whether they were four yeses or four nos.
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

/**
 * Ladder order, with retired rungs last.
 *
 * `order.indexOf(kind)` returns -1 for a rung no longer on the ladder, which
 * sorts it *above* round one — so a retired intro round appeared at the top of
 * the track as though the process began with it.
 */
export const byLadder =
  (order: TStoredRoundKind[]) =>
  (a: { kind: TStoredRoundKind }, b: { kind: TStoredRoundKind }): number => {
    const ia = order.indexOf(a.kind);
    const ib = order.indexOf(b.kind);
    return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
  };
