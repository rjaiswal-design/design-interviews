import { useMemo, useState } from 'react';
import { toCsv, download } from '../lib/csv';
import { initials, relative } from '../lib/format';
import { DECISION_LABELS, STAGES, STATUS_LABELS, inStage, ladderFor, rung,
  TRACKS,
  TRACK_LABELS,
  byLadder,
} from '../lib/ladder';
import { go } from '../lib/route';
import { httpUrl } from '../lib/url';
import { CANDIDATE_STATUSES, CANDIDATE_STATUS_LABELS, inProcess, isLive } from '../lib/candidateStatus';
import { useStore } from '../lib/store';
import type {
  TCandidate,
  TCandidateStatus,
  TEvent,
  TRound,
  TRoundStatus,
  TTrack,
} from '../types';
import FilterChip from './FilterChip';
import { Caret, Close, Download, Search } from './Icons';
import { LadderMini } from './LadderTrack';
import Pill from './Pill';

/**
 * The board. Every round anyone has scheduled, on one sheet.
 *
 * This is the answer to "the source for all our interviews": one row per
 * conversation, with the evidence on the row rather than described in it — who,
 * which rung, when, the call, and the recording, reachable in one click.
 *
 * It has a second mode, by candidate, because the two questions people actually
 * arrive with are different shapes. "What am I doing this week" is a list of
 * rounds sorted by date; "how is Noor doing" is one row per person with their
 * ladder on it. The same data, and neither view is the other's filter.
 */

/**
 * Status is a filter but no longer a column.
 *
 * The two are different jobs. As a column it repeated what the log already
 * said, one pill per row, forty times down the page. As a filter it is how the
 * sheet gets scoped — "everything still to happen", "everything done" — and it
 * is also what bands the sort, so it has to stay reachable.
 */
const ROUND_STATUSES: TRoundStatus[] = ['scheduled', 'in_progress', 'complete', 'cancelled'];


type TProps = {
  mode: 'rounds' | 'people';
};

/**
 * Where a candidate is now.
 *
 * The first round on their ladder that is not finished: the one in progress if
 * there is one, otherwise the next one owed. Cancelled rounds are stepped over
 * — a cancelled portfolio does not leave somebody stuck at portfolio for ever.
 *
 * Everything complete is its own answer rather than the last round again. They
 * are through the loop and waiting on a decision, which is a different thing
 * from being at the head-of-design round, and the one state where the board should be
 * telling somebody to act.
 */
type TWhere = { round?: TRound; done: boolean };

const whereNow = (ladder: TRound[]): TWhere => {
  const live = ladder.find((r) => r.status === 'in_progress');
  if (live) return { round: live, done: false };
  const next = ladder.find((r) => r.status === 'scheduled');
  if (next) return { round: next, done: false };
  // Nothing scheduled and nothing running. If anything was ever completed they
  // are through; if the whole ladder was cancelled they are not, and the last
  // round is the most honest thing to name.
  const anyComplete = ladder.some((r) => r.status === 'complete');
  return { round: ladder[ladder.length - 1], done: anyComplete };
};

/**
 * The order the board reads in.
 *
 * Most recent activity first, because the only time on a row is the time in the
 * Latest column and a board sorted on something it does not show is a board in
 * an order nobody can explain.
 *
 * Two exceptions. A candidate with a round happening right now pins to the top
 * — there is rarely more than one and it is the whole screen while it lasts.
 * Candidates nothing has happened to yet fall to the bottom, newest first,
 * because the newest is the one somebody is about to start booking.
 */
const orderByActivity =
  (latest: Map<string, TEvent>, liveIds: Set<string>) =>
  (a: TCandidate, b: TCandidate): number => {
    const liveA = liveIds.has(a.id);
    const liveB = liveIds.has(b.id);
    if (liveA !== liveB) return liveA ? -1 : 1;

    const ta = latest.get(a.id)?.t ?? 0;
    const tb = latest.get(b.id)?.t ?? 0;
    if (ta !== tb) return tb - ta;

    return b.ref - a.ref;
  };

/**
 * One line of log in a table cell.
 *
 * Sentence on top, who and when under it — the same shape as a row in the
 * trail, at row height. The whole cell is the button: a link inside a cell
 * gives you a target the width of the text, and the text here is a sentence of
 * unpredictable length.
 */
const LatestCell = ({ event, onOpen }: { event?: TEvent; onOpen: () => void }) => {
  if (!event) return <span className="latest-none">Nothing yet</span>;
  return (
    <button type="button" className="latest" onClick={onOpen} title="Open the full log">
      <span className="what">{event.what}</span>
      <span className="who">
        {event.actor} · {relative(event.t)}
      </span>
    </button>
  );
};

const Board = ({ mode }: TProps) => {
  const candidates = useStore((s) => s.candidates);
  const rounds = useStore((s) => s.rounds);
  const patchCandidate = useStore((s) => s.patchCandidate);
  const patchCandidates = useStore((s) => s.patchCandidates);
  const moveToRound = useStore((s) => s.moveToRound);
  const addCandidate = useStore((s) => s.addCandidate);
  const events = useStore((s) => s.events);

  const [q, setQ] = useState('');
  const [fTrack, setFTrack] = useState('');
  const [fRung, setFRung] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPanel, setFPanel] = useState('');

  /**
   * Picked rows, by id, and the row a range extends from.
   *
   * Ids rather than indices: the table re-sorts and re-filters under you, and a
   * selection of positions would silently come to mean different people. The
   * anchor is an id for the same reason.
   *
   * Only the candidates board has this. Triage is a decision about people —
   * sixty-seven of them, arriving in one import — and the rounds board is one
   * row per person already in the process, where the work is per conversation
   * and does not batch.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState('');
  /** A bulk write in flight. Disables the bar rather than queueing clicks. */
  const [bulk, setBulk] = useState('');
  /** Shortlisting builds ladders, so it asks once. Holds the pending action. */
  const [confirm, setConfirm] = useState<TCandidateStatus | ''>('');

  /** Selected as a list and narrowed here, never filtered inside the selector:
   *  `useStore((s) => s.rounds.filter(…))` builds a new array on every read, the
   *  snapshot never compares equal, and React re-renders until it gives up. */
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const panelNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of rounds) for (const p of r.interviewers) set.add(p);
    return [...set].sort();
  }, [rounds]);

  /**
   * Each candidate's rounds, in ladder order, indexed once.
   *
   * Both tables need this per row — the rounds board draws the ladder on every
   * row, the candidates board once per person — and `rounds.filter(...).sort()`
   * inside a cell is O(rows × rounds) with a sort on top of it. Same lesson as
   * `latest` above: build the index, read it in the cell.
   */
  const ladders = useMemo(() => {
    const m = new Map<string, TRound[]>();
    for (const r of rounds) {
      const list = m.get(r.candidateId);
      if (list) list.push(r);
      else m.set(r.candidateId, [r]);
    }
    // Sorted against the candidate's own ladder — the two tracks have different
    // rungs in different orders, so one shared order would scramble one of them.
    for (const [candidateId, list] of m) {
      const track = byId.get(candidateId)?.track ?? 'product';
      list.sort(byLadder(ladderFor(track).map((r) => r.kind)));
    }
    return m;
  }, [rounds, byId]);

  /** The newest event per candidate, for the Latest column and the sort. */
  const latestByCandidate = useMemo(() => {
    const m = new Map<string, TEvent>();
    // The store keeps events newest-first, so the first hit wins.
    for (const e of events) if (!m.has(e.candidateId)) m.set(e.candidateId, e);
    return m;
  }, [events]);

  /** Live candidates per track, for the tag counts — the same population the
   *  board draws, so the number on the tag is the number of rows it gives you. */
  /**
   * Candidates per track, counted twice: everybody, and just the ones in
   * rounds.
   *
   * The tag carries the number you are choosing between, so it has to be the
   * number the view under it lists. The rounds board lists people in process
   * and the candidates board lists everyone, and with sixty-nine CVs waiting
   * on a shortlist decision those are not close — a tag reading "4" above a
   * table of forty would be read as a filter that had already been applied.
   */
  const byTrack = useMemo(() => {
    const all = new Map<TTrack, number>();
    const live = new Map<TTrack, number>();
    for (const c of candidates) {
      all.set(c.track, (all.get(c.track) ?? 0) + 1);
      if (isLive(c.status)) live.set(c.track, (live.get(c.track) ?? 0) + 1);
    }
    return { all, live };
  }, [candidates]);

  const countByTrack = mode === 'people' ? byTrack.all : byTrack.live;

  const liveCandidates = useMemo(
    () => new Set(rounds.filter((r) => r.status === 'in_progress').map((r) => r.candidateId)),
    [rounds],
  );

  /**
   * One row per candidate being interviewed.
   *
   * It was one row per round, which put a freshly shortlisted candidate on the
   * board four or five times over — the same name, the same role, the same
   * everything but the round. That reads as duplication however correct it is,
   * and the question this board answers is "where is everyone", not "list every
   * conversation we have ever planned".
   *
   * Only candidates still being interviewed — `isLive`, not `inProcess`.
   * Somebody nobody has shortlisted has no rounds and nothing to be at; and
   * somebody rejected, hired, or whose offer fell through is not being
   * interviewed either. All of them belong on the Candidates tab, which is
   * where those decisions get made. Their rounds stay on their record.
   */
  const visibleRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates
      .filter((c) => {
        if (!isLive(c.status)) return false;
        if (fTrack && c.track !== fTrack) return false;

        const ladder = ladders.get(c.id) ?? [];
        const where = whereNow(ladder);

        // Round and Status filter on where they are *now*, which is what the
        // column shows — "who is at the craft round" is the question, not "who
        // has a craft round somewhere on their ladder".
        //
        // Round filters by stage, so picking the HR round finds everybody
        // waiting on it across both ladders rather than one track's half.
        if (!inStage(fRung, where.round?.kind)) return false;
        if (fStatus && where.round?.status !== fStatus) return false;
        // Panel matches anywhere on their ladder. Scoped to the current round
        // it would hide a candidate whose portfolio you ran and who has since
        // moved on, which is exactly who you want to find.
        if (fPanel && !ladder.some((r) => r.interviewers.includes(fPanel))) return false;

        if (!needle) return true;
        return (
          c.name.toLowerCase().includes(needle) ||
          c.role.toLowerCase().includes(needle) ||
          ladder.some((r) => r.interviewers.join(' ').toLowerCase().includes(needle))
        );
      })
      .sort(orderByActivity(latestByCandidate, liveCandidates));
  }, [candidates, ladders, latestByCandidate, liveCandidates, q, fTrack, fRung, fStatus, fPanel]);

  const visiblePeople = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates.filter((c) => {
      if (fTrack && c.track !== fTrack) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.role.toLowerCase().includes(needle) ||
        c.location.toLowerCase().includes(needle) ||
        c.source.toLowerCase().includes(needle)
      );
    });
  }, [candidates, q, fTrack]);

  /** Selection is scoped to what is on screen. A filter narrowing the table
   *  under a live selection would otherwise leave rows picked that nobody can
   *  see, and "Reject 40" would mean something different from the forty rows
   *  being looked at. */
  const pickedHere = useMemo(
    () => visiblePeople.filter((c) => picked.has(c.id)),
    [visiblePeople, picked],
  );

  /** Click picks one; shift-click takes everything between it and the last
   *  click, which is how a sheet is expected to behave and the only way to
   *  take forty rows without forty clicks. */
  const pick = (id: string, shift: boolean) => {
    setConfirm('');
    setPicked((was) => {
      const next = new Set(was);
      const ids = visiblePeople.map((c) => c.id);
      const from = ids.indexOf(anchor);
      const to = ids.indexOf(id);
      if (shift && from !== -1 && to !== -1) {
        const [a, b] = from < to ? [from, to] : [to, from];
        // The anchor's own state is what the range takes, so shift-clicking
        // after unpicking clears a range instead of filling it.
        const on = was.has(anchor);
        for (const between of ids.slice(a, b + 1)) {
          if (on) next.add(between);
          else next.delete(between);
        }
        return next;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!shift) setAnchor(id);
  };

  const pickAll = (on: boolean) => {
    setConfirm('');
    setPicked((was) => {
      const next = new Set(was);
      for (const c of visiblePeople) {
        if (on) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  };

  const clearPicked = () => {
    setPicked(new Set());
    setAnchor('');
    setConfirm('');
  };

  /**
   * How many rounds a bulk shortlist would book.
   *
   * Shortlisting is the one status that creates work: it builds the whole
   * ladder. Seven rungs times sixty-seven CVs is four hundred and sixty-nine
   * rounds, which is why this number is on the button before the click rather
   * than discovered afterwards on the rounds board.
   */
  const roundsFromShortlist = useMemo(
    () =>
      pickedHere
        .filter((c) => !inProcess(c.status))
        .reduce((n, c) => n + ladderFor(c.track).length, 0),
    [pickedHere],
  );

  const applyStatus = async (status: TCandidateStatus) => {
    const rows = pickedHere.filter((c) => c.status !== status);
    if (!rows.length) return;
    setConfirm('');
    setBulk(status);
    try {
      // One request per table for the whole selection, not one per row. Still
      // a log line per candidate — see `patchCandidates`.
      await patchCandidates(rows.map((c) => c.id), { status });
      clearPicked();
    } finally {
      setBulk('');
    }
  };

  /** Add one and open it, because a blank row on a board you cannot see is not
   *  a useful outcome of pressing "Add a candidate". */
  const addAndOpen = async () => {
    const id = await addCandidate();
    go({ view: 'candidate', id, from: mode });
  };

  const exportCandidatesCsv = () => {
    const rows: (string | number)[][] = [
      // Same order as the table, plus the two things the table does not have
      // room for: the track, and the LinkedIn beside the portfolio.
      [
        'ref',
        'candidate',
        'source',
        'current title',
        'applying for',
        'company',
        'portfolio',
        'linkedin',
        'status',
        'track',
        'location',
        'email',
        'phone',
      ],
      ...visiblePeople.map((c) => [
        c.ref,
        c.name,
        c.source,
        c.previousPosition,
        c.role,
        c.previousCompany,
        c.portfolio,
        c.linkedin,
        CANDIDATE_STATUS_LABELS[c.status],
        TRACK_LABELS[c.track],
        c.location,
        c.email,
        c.phone,
      ]),
    ];
    download('candidates.csv', toCsv(rows));
  };

  const exportRoundsCsv = () => {
    const rows: (string | number)[][] = [
      [
        'ref',
        'candidate',
        'track',
        'applying for',
        'round',
        'panel',
        'when',
        'status',
        'call',
        'lines',
      ],
      // Every round of every candidate on screen, not one row per candidate.
      // The board summarises; an export is the data behind it, and a
      // spreadsheet with four rounds collapsed into "currently at portfolio"
      // cannot answer anything you would open a spreadsheet for.
      ...visibleRows.flatMap((c) => (ladders.get(c.id) ?? []).map((r) => [
          c.ref,
          c.name,
          TRACK_LABELS[c.track],
          c.role,
          rung(r.kind).label,
          r.interviewers.join('; '),
          r.scheduledAt ? new Date(r.scheduledAt).toISOString() : '',
          STATUS_LABELS[r.status],
          DECISION_LABELS[r.decision],
          r.lineCount,
        ]),
      ),
    ];
    download('interviews.csv', toCsv(rows));
  };

  /** The button exports what is on screen. It always wrote the rounds sheet,
   *  which on the candidates view meant the export had none of the columns you
   *  were looking at. */
  const exportCsv = mode === 'people' ? exportCandidatesCsv : exportRoundsCsv;

  const active = fTrack || fRung || fStatus || fPanel || q;

  return (
    <>
      <div className="wrap chips">
        <div className="search">
          <span className="icon">
            <Search />
          </span>
          <input
            placeholder={mode === 'rounds' ? 'Candidate, role, interviewer' : 'Candidate, role, market'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button type="button" className="clear" onClick={() => setQ('')} title="Clear">
              <Close size={12} />
            </button>
          )}
        </div>

        {/* Two tags rather than a dropdown. A menu for a two-value filter
            costs a click to open and a click to choose, and hides both options
            until you do — when the whole point of a track filter is that there
            are exactly two and you want one of them.

            Clicking the lit one clears it, which is what "Any" was doing inside
            the menu. The count is on the tag because that is the number you are
            choosing between. */}
        {TRACKS.map((t) => (
          <button
            key={t}
            type="button"
            className="chip"
            data-active={fTrack === t}
            onClick={() => setFTrack(fTrack === t ? '' : t)}
            title={fTrack === t ? `Showing ${TRACK_LABELS[t]} only — click to clear` : `Show ${TRACK_LABELS[t]} only`}
          >
            <span className="v">{TRACK_LABELS[t]}</span>
            <span className="n">{countByTrack.get(t) ?? 0}</span>
          </button>
        ))}

        {/* Round, status and panel are questions about a conversation, so they
            belong to the board that lists conversations. Track is a question
            about a person and reads the same on both. */}
        {mode === 'rounds' && (
          <>
            <FilterChip
              label="Round"
              value={fRung}
              onChange={setFRung}
              // Stages, not rungs. The rounds both tracks run the same way are
              // one option — "HR round", not "PD 1. HR round" and "VD 1. HR
              // round" — and the ones that exist on a single ladder say which,
              // since "AI coding" alone would read as something both tracks do.
              options={STAGES.map((st) => ({
                value: st.id,
                label: st.tracks.length === 1 ? `${st.label} · ${st.tracks[0] === 'visual' ? 'VD' : 'PD'}` : st.label,
                n: rounds.filter((x) => st.kinds.includes(x.kind)).length,
              }))}
            />
            <FilterChip
              label="Status"
              value={fStatus}
              onChange={setFStatus}
              options={ROUND_STATUSES.map((s) => ({
                value: s,
                label: STATUS_LABELS[s],
                n: rounds.filter((x) => x.status === s).length,
              }))}
            />
            {panelNames.length > 0 && (
              <FilterChip
                label="Panel"
                value={fPanel}
                onChange={setFPanel}
                options={panelNames.map((p) => ({
                  value: p,
                  label: p,
                  n: rounds.filter((x) => x.interviewers.includes(p)).length,
                }))}
              />
            )}
          </>
        )}

        <div className="spacer" />

        {active && (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              setQ('');
              setFTrack('');
              setFRung('');
              setFStatus('');
              setFPanel('');
            }}
          >
            Clear filters
          </button>
        )}

        <button type="button" className="btn-quiet" onClick={exportCsv}>
          <Download />
          Export
        </button>
      </div>

      {/* Nested, not combined: `.sheet`'s -12px inline margin cancels part of a
          *parent's* gutter so the row hover band can extend past the content,
          and its own 12px padding puts the columns back on the gutter. On one
          element `.sheet`'s padding simply replaced `.wrap`'s, and the first
          column sat 24px left of the filter row above it. */}
      <div className="wrap sheet-wrap">
        <div className="sheet">
        {mode === 'rounds' ? (
          visibleRows.length === 0 ? (
            <div className="empty">
              <h2>{active ? 'Nothing matches' : 'Nobody in the process'}</h2>
              <p>
                {active
                  ? 'Nobody on the board fits those filters. Clear them to see everyone.'
                  : 'This board is everyone being interviewed and where they have got to. Rounds appear when somebody is shortlisted — a candidate nobody has decided to interview has none. Add a candidate, or bring a pile in with Import, then shortlist the ones worth talking to.'}
              </p>
              {!active && (
                <div className="row-acts">
                  <button type="button" className="btn" onClick={() => void addAndOpen()}>
                    Add a candidate
                  </button>
                  <button type="button" className="btn-quiet" onClick={() => go({ view: 'people' })}>
                    See the candidates
                  </button>
                </div>
              )}
            </div>
          ) : (
            <table className="log">
              <thead>
                <tr>
                  <th className="col-ref">Ref</th>
                  <th className="col-who">Candidate</th>
                  <th className="col-role">Applying for</th>
                  <th className="col-rung">Round</th>
                  <th className="col-ladder">Ladder</th>
                  <th className="col-act-log">Latest</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((c) => {
                  const ladder = ladders.get(c.id) ?? [];
                  const where = whereNow(ladder);
                  const rg = where.round ? rung(where.round.kind) : undefined;
                  const live = where.round?.status === 'in_progress';
                  return (
                    <tr key={c.id} className={live ? 'live' : undefined}>
                      <td className="cell-ref">#{c.ref}</td>

                      <td>
                        <button
                          type="button"
                          className="who"
                          onClick={() => go({ view: 'candidate', id: c.id, from: mode })}
                        >
                          <span className="av u-circle">{initials(c.name) || '—'}</span>
                          <span className="lines">
                            <span className="nm">{c.name || 'Unnamed'}</span>
                            {/* The track, which is what explains why this
                                person's rounds are named what they are — and
                                the one thing about them this board does not
                                carry in a column of its own. */}
                            <span className="rl">{TRACK_LABELS[c.track]}</span>
                          </span>
                        </button>
                      </td>

                      <td className="panel-cell">{c.role || <span className="none">—</span>}</td>

                      <td className="rung-cell">
                        {/* Where they are, and the one control that moves them
                            on. One row per candidate means this column carries
                            the whole answer to "where is everyone" — which is
                            also why the Status column that used to sit beside
                            it was redundant and this is not.

                            The name and the status are two controls, not one:
                            a select nested inside a button is invalid markup
                            and, more to the point, opening the round and
                            advancing it are different intentions. */}
                        {where.done ? (
                          <span className="rung-done">
                            <span className="lb">All rounds done</span>
                            <span className="sub">Waiting on a decision</span>
                          </span>
                        ) : rg && where.round ? (
                          <span className="rung-at">
                            <button
                              type="button"
                              className="rung-open"
                              onClick={() => go({ view: 'room', id: where.round?.id ?? '' })}
                              title="Open this round — link, script, scorecard, transcript, log"
                            >
                              <span className="lb">{rg.label}</span>
                            </button>

                            {/* Move them to a different round. A native select
                                under a caret, the same trick the status pill
                                uses: the browser's own control is what makes it
                                keyboard-operable and touch-friendly for free,
                                and drawing a listbox by hand is the version
                                that ends up trapping focus. */}
                            <span className="rung-pick" title="Move them to another round">
                              <Caret />
                              <select
                                value={where.round.kind}
                                aria-label={`Move ${c.name || 'this candidate'} to another round`}
                                onChange={(e) => void moveToRound(c.id, e.target.value as TRound['kind'])}
                              >
                                {ladder
                                  .filter((r) => !rung(r.kind).retired)
                                  .map((r) => (
                                    <option key={r.id} value={r.kind}>
                                      {rung(r.kind).no}. {rung(r.kind).label}
                                    </option>
                                  ))}
                              </select>
                            </span>
                          </span>
                        ) : (
                          <span className="none">No rounds</span>
                        )}
                      </td>

                      <td>
                        <LadderMini
                          rounds={ladder}
                          activeId={where.round?.id}
                          onPick={(id) => go({ view: 'room', id })}
                        />
                      </td>

                      <td>
                        {/* The last thing that happened to this person — which
                            with one row each is the right grain: the log is
                            read to find out what changed, and "who changed it
                            and when" is the whole of that. */}
                        <LatestCell
                          event={latestByCandidate.get(c.id)}
                          onOpen={() => go({ view: 'candidate', id: c.id, from: mode })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : visiblePeople.length === 0 ? (
          <div className="empty">
            <h2>{q ? 'Nobody matches' : 'Nobody here yet'}</h2>
            <p>
              {q
                ? 'No candidate matches that search.'
                : 'Import a pile from wherever they came from — the button is in the bar, and it reads most exports as they are — or add one by hand.'}
            </p>
            {!q && (
              <div className="row-acts">
                <button type="button" className="btn" onClick={() => void addAndOpen()}>
                  Add a candidate
                </button>
              </div>
            )}
          </div>
        ) : (
          <table className="log" style={{ minWidth: 1400 }}>
            <thead>
              {/*
                * This view is about the person, not their progress.
                *
                * Ladder / Done / Next / Last contacted all lived here and all
                * described where someone had got to — which is the rounds
                * board's job, one row per conversation, with the ladder on it.
                * What this table is for is the facts you need *about* a
                * candidate: how to reach them, and where they are coming from.
                */}
              <tr>
                <th className="col-pick">
                  {/* Takes everything the filters have left on screen, which is
                      what "all" means when a table is filtered. Indeterminate
                      when the selection is partial, so the box reports the
                      state rather than just offering the action. */}
                  <input
                    type="checkbox"
                    aria-label={`Select all ${visiblePeople.length} on screen`}
                    title={`Select all ${visiblePeople.length} on screen`}
                    checked={visiblePeople.length > 0 && pickedHere.length === visiblePeople.length}
                    ref={(el) => {
                      if (el) el.indeterminate = pickedHere.length > 0 && pickedHere.length < visiblePeople.length;
                    }}
                    onChange={(e) => pickAll(e.target.checked)}
                  />
                </th>
                <th className="col-ref">Ref</th>
                <th className="col-who">Candidate</th>
                {/* What they do now, what they are up for, and where they do
                    it — in that order, because that is the sentence somebody
                    reads to place a candidate: "Senior Product Designer at
                    Zomato, up for Senior Product Designer here". Then the
                    portfolio and the status, which are what you act on. */}
                <th style={{ width: 170 }}>Current title</th>
                <th className="col-role">Applying for</th>
                <th style={{ width: 160 }}>Company</th>
                <th style={{ width: 104 }}>Portfolio</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 120 }}>Location</th>
                <th style={{ width: 190 }}>Email</th>
                <th style={{ width: 150 }}>Phone</th>
              </tr>
            </thead>
            <tbody>
              {visiblePeople.map((c) => (
                  <tr key={c.id} data-picked={picked.has(c.id)}>
                    <td className="cell-pick">
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.name || 'this candidate'}`}
                        checked={picked.has(c.id)}
                        // `onClick` rather than `onChange`, because the modifier
                        // key is only on the mouse event. Space still toggles:
                        // the keyboard path fires a click with shiftKey false.
                        onChange={() => {}}
                        onClick={(e) => pick(c.id, e.shiftKey)}
                      />
                    </td>
                    <td className="cell-ref">#{c.ref}</td>

                    <td>
                      <button
                        type="button"
                        className="who"
                        onClick={() => go({ view: 'candidate', id: c.id, from: mode })}
                      >
                        <span className="av u-circle">{initials(c.name) || '—'}</span>
                        <span className="lines">
                          <span className="nm">{c.name || 'Unnamed'}</span>
                          {/* How they reached us, which is the fact that
                              decides who chases them. */}
                          <span className="rl">{c.source}</span>
                        </span>
                      </button>
                    </td>

                    <td className="panel-cell">
                      {c.previousPosition || <span className="none">—</span>}
                    </td>

                    <td className="panel-cell">{c.role || <span className="none">—</span>}</td>

                    <td className="panel-cell">
                      {c.previousCompany || <span className="none">—</span>}
                    </td>

                    {/* The link, not the URL: a portfolio address is a slug and
                        often a string of tracking parameters, and dropping one
                        into a column makes every other column unreadable.
                        LinkedIn is on the record and in the export; this is the
                        column, because for a design hire the portfolio is the
                        link somebody actually opens. */}
                    <td className="panel-cell">
                      {httpUrl(c.portfolio) ? (
                        <a
                          className="quiet-link"
                          href={httpUrl(c.portfolio) ?? undefined}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Portfolio ↗
                        </a>
                      ) : (
                        <span className="none">—</span>
                      )}
                    </td>

                    <td>
                      {/* The most load-bearing column on this view. Without it
                          a rejected candidate with no rounds booked is drawn
                          exactly like a new one nobody has scheduled yet. */}
                      <Pill<TCandidateStatus>
                        value={c.status}
                        options={CANDIDATE_STATUSES}
                        labels={CANDIDATE_STATUS_LABELS}
                        onChange={(v) => void patchCandidate(c.id, { status: v })}
                        title="Where they are in the funnel"
                      />
                    </td>

                    <td className="panel-cell">
                      {c.location || <span className="none">—</span>}
                    </td>

                    {/* Both reachable in one click. A hiring board's contact
                        details exist to be used, and asking somebody to select
                        and copy a cell is asking them to open their mail client
                        by hand. */}
                    <td className="panel-cell">
                      {c.email ? (
                        <a className="quiet-link" href={`mailto:${c.email}`}>
                          {c.email}
                        </a>
                      ) : (
                        <span className="none">—</span>
                      )}
                    </td>

                    <td className="panel-cell cell-phone">
                      {c.phone ? (
                        <a className="quiet-link" href={`tel:${c.phone.replace(/\s+/g, '')}`}>
                          {c.phone}
                        </a>
                      ) : (
                        <span className="none">—</span>
                      )}
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/*
        * What you do with a selection, docked to the bottom of the window.
        *
        * Docked rather than above the table: the rows being acted on are the
        * ones you are looking at, and a bar that pushes the table down moves
        * them out from under the cursor mid-triage. It exists only while
        * something is picked, so it costs nothing when it has nothing to say.
        *
        * Reject and Shortlist are the two ends of a triage pass and nothing
        * else — offer and hire are decisions about one person, made on their
        * record with their rounds in front of you, and a batch of them would
        * mean nobody read the evidence.
        */}
      {mode === 'people' && pickedHere.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Selected candidates">
          <span className="n">{pickedHere.length} selected</span>

          <div className="spacer" />

          {confirm === 'shortlisted' ? (
            <>
              {/* The number the click is really committing to. Four hundred
                  rounds appearing on the rounds board is the kind of surprise
                  you cannot undo with one click, so it is said first. */}
              <span className="warn">
                Books {roundsFromShortlist} round{roundsFromShortlist === 1 ? '' : 's'}
              </span>
              <button type="button" className="btn" disabled={!!bulk} onClick={() => void applyStatus('shortlisted')}>
                {bulk === 'shortlisted' ? 'Shortlisting…' : 'Yes, shortlist'}
              </button>
              <button type="button" className="btn-quiet" onClick={() => setConfirm('')}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-quiet"
                disabled={!!bulk}
                onClick={() => void applyStatus('rejected')}
                title="Mark these as rejected. No rounds are created, and anything already recorded stays on the record."
              >
                {bulk === 'rejected' ? 'Rejecting…' : 'Reject'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!!bulk}
                onClick={() => setConfirm('shortlisted')}
                title="Shortlist these and build their ladders"
              >
                Shortlist
              </button>
              <button type="button" className="btn-quiet" onClick={clearPicked}>
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default Board;
