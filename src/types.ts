/**
 * The record of a design interview.
 *
 * Two entities and two blobs. A `TCandidate` is a person in the funnel; a
 * `TRound` is one conversation with them. Every round belongs to exactly one
 * candidate and exactly one rung of the ladder, and a candidate has at most one
 * round per rung — that invariant is what makes the ladder drawable as a track
 * rather than as a list of whatever happened to be scheduled.
 *
 * The transcript and the audio are kept out of `TRound` on purpose. A round row
 * is read constantly — every filter, every table paint — and a forty-minute
 * transcript is two hundred kilobytes of text that none of those reads want.
 */

/**
 * Which process a candidate walks.
 *
 * Product and visual design are interviewed differently — different rounds,
 * different people, different things being judged — so they are different
 * ladders rather than one ladder with optional rungs. See `lib/ladder.ts`.
 */
export type TTrack = 'product' | 'visual';

/**
 * The rungs, across both tracks.
 *
 * Prefixed by track and globally unique, even where two tracks have a round of
 * the same name: a portfolio review with Ayaneshu and one with Sanket are
 * different conversations, judged against different things, by different
 * people. Distinct ids keep a stored round unambiguous without having to look
 * up its candidate's track to read it — and the moment the two scripts diverge,
 * which they will, shared ids would have had to be split anyway.
 */
export type TRoundKind =
  | 'pd_portfolio'
  | 'pd_critique'
  | 'pd_ai_coding'
  | 'pd_culture'
  | 'pd_product'
  | 'vd_portfolio'
  | 'vd_working'
  | 'vd_product'
  | 'vd_culture';

/**
 * Rungs the process used to have.
 *
 * They are in the type because they are in the database. A round that happened
 * under an older ladder is still a conversation somebody had, and deleting it
 * to tidy up an enum would be destroying the record this tool exists to keep —
 * so a retired round is kept, labelled as retired, and simply not offered when
 * a new ladder is generated. `lib/ladder.ts` holds their labels.
 *
 * Adding to this list is how a rung is retired. Removing one from it is how its
 * rounds become unreadable, so don't.
 */
export type TRetiredKind = 'intro' | 'craft' | 'systems' | 'bar';

/** What a stored round's `kind` can be: on the ladder, or retired off it. */
export type TStoredRoundKind = TRoundKind | TRetiredKind;

export type TRoundStatus = 'scheduled' | 'in_progress' | 'complete' | 'cancelled';

/**
 * One interviewer's call on one round, on the four-point scale. `pending` is the
 * absence of an answer rather than a neutral middle — there is deliberately no
 * "maybe", because a scale with a midpoint collects midpoints.
 */
export type TDecision = 'pending' | 'strong_no' | 'no' | 'yes' | 'strong_yes';

/**
 * Where a candidate is in the funnel, which is not the same as how their rounds
 * are going.
 *
 * `pending` is before anyone has decided to interview them, and it is the state
 * every candidate is added and imported in. **Rounds do not exist until they
 * are shortlisted** — see `store.enterProcess`. That is what keeps the rounds
 * board a list of conversations somebody actually intends to have, rather than
 * four rows for every CV that ever arrived.
 */
export type TCandidateStatus =
  | 'pending'
  | 'shortlisted'
  | 'rejected'
  | 'offer_out'
  | 'offer_dropped'
  | 'hired';

/** 0 is not scored. 1–4 map onto the same four points as `TDecision`. */
export type TScore = 0 | 1 | 2 | 3 | 4;

/** What a rung is looking for. Scored 1–4 or left at 0. */
export type TSignal =
  | 'craft'
  | 'product'
  | 'systems'
  | 'collaboration'
  | 'communication'
  | 'ambition';

export type TCandidate = {
  id: string;
  /** The number people say out loud. Global, and never reused. */
  ref: number;
  name: string;
  /** Which ladder they walk. Decides their rounds and who runs them. */
  track: TTrack;
  /**
   * The opening they are up for — "Product Designer, noonFood".
   *
   * Not to be confused with `previousPosition`, which is what they do now.
   * Free text, not an enum: the alternative is a list of openings this app has
   * to be told about before anyone can be added to one.
   */
  role: string;
  level: string;
  location: string;
  portfolio: string;
  email: string;
  phone: string;
  /** Where they are now — or most recently, for someone between jobs. */
  previousCompany: string;
  /** Their own title there, which is not `role`: a Staff designer at Careem
   *  can be up for an IC4 opening here, and both facts matter. */
  previousPosition: string;
  /** Referral, inbound, agency, sourced — free text for the same reason. */
  source: string;
  status: TCandidateStatus;
  notes: string;
  createdAt: number;
  updatedAt: number;
};

export type TRound = {
  id: string;
  candidateId: string;
  /** Wider than `TRoundKind`: see `TRetiredKind`. New rounds are only ever
   *  created on a current rung, but old ones are read back as they were. */
  kind: TStoredRoundKind;
  /** Names, not ids. There is no people table and inventing one would be a
   *  second source of truth for something the calendar already knows. */
  interviewers: string[];
  /** Epoch ms. 0 means unscheduled, which is a real state on an active funnel. */
  scheduledAt: number;
  durationMin: number;
  status: TRoundStatus;
  decision: TDecision;
  scores: Partial<Record<TSignal, TScore>>;
  /** The interviewer's own write-up. Never derived from the transcript. */
  notes: string;
  /** Where the conversation happens. One per round, because each interview is
   *  its own meeting. */
  zoomUrl: string;
  /**
   * Where the recording of it lives, pasted in afterwards.
   *
   * A link, not a file — the same reasoning as the transcript. Zoom, Meet and
   * Teams already host the recording behind a URL with their own access
   * control; copying the video into this app would mean storing gigabytes and
   * re-implementing who is allowed to watch it.
   */
  recordingUrl: string;
  /**
   * How many transcript lines this round has.
   *
   * Cached on the round so the board can say "380 lines" without walking the
   * segment store once per row — a table paint must not be a transcript read.
   * The transcript itself is the truth; this is a cache of it, repaired when
   * the round is opened.
   */
  lineCount: number;
  createdAt: number;
  updatedAt: number;
};

export type TSpeaker = 'interviewer' | 'candidate' | 'unknown';

/**
 * A line of transcript.
 *
 * Almost always parsed out of a transcript pasted from the meeting — Zoom,
 * Meet and Teams all export one, and asking for a paste is a great deal simpler
 * and more accurate than recording and transcribing the call ourselves.
 *
 * `t` is milliseconds into the meeting when the export carries timestamps, and
 * `0` when it does not. It is an ordering and a citation ("at 12:04 they said"),
 * not a seek position — there is no audio here to seek.
 */
export type TSegment = {
  id: string;
  roundId: string;
  t: number;
  /** Whoever the export named on the line. `unknown` when it named nobody. */
  speaker: TSpeaker;
  /** The name as the transcript spelled it, when it is neither of the two
   *  known sides — a third interviewer, an observer. Empty otherwise. */
  speakerName: string;
  text: string;
  /** A moment someone marked as worth coming back to. */
  starred: boolean;
  /** True for a line typed here rather than pasted from the meeting. The
   *  provenance matters: "we wrote this down" and "the meeting recorded this"
   *  are different claims about the same sentence. */
  manual: boolean;
};

/**
 * One line of the activity log.
 *
 * Derived from the difference between the stored row and the patch, never
 * written by the caller — so every path that edits a round records itself for
 * free, and a new edit surface cannot forget to log. See `lib/events.ts`.
 *
 * `roundId` is empty for an event about the candidate rather than about one
 * conversation, which is why the log is keyed on `candidateId` too: the trail
 * for a person has to include "offer out" alongside "portfolio complete".
 */
export type TEvent = {
  id: string;
  candidateId: string;
  /** Empty when the event is about the candidate, not a round. */
  roundId: string;
  /**
   * When it happened. **Always in the past** — an event records an act, and
   * booking next week's round is an act performed today. Nothing may stamp an
   * event from the date of the thing it is about; the board sorts on this, and
   * one future timestamp puts an unstarted round above every interview that has
   * actually taken place.
   */
  t: number;
  /** Who did it, as a name — what the line reads as. */
  actor: string;
  /**
   * And as an email, which is the part that will still be attributable.
   *
   * Names collide and change; this is the stable key that maps onto a real
   * account once there is a backend with auth behind it. Empty on lines written
   * before anyone was asked.
   */
  actorEmail: string;
  /** The sentence. Written once, at the moment of the change, because it
   *  describes a before-and-after that is gone by the time anything reads it. */
  what: string;
};

export type TDoc = {
  candidates: TCandidate[];
  rounds: TRound[];
};
