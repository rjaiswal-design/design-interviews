import { useMemo, useState } from 'react';
import { toCsv, download } from '../lib/csv';
import { initials, relative } from '../lib/format';
import { DECISION_LABELS, LADDER, STATUS_LABELS, ladderFor, rung,
  TRACKS,
  TRACK_LABELS,
  byLadder,
} from '../lib/ladder';
import { go } from '../lib/route';
import { CANDIDATE_STATUSES, CANDIDATE_STATUS_LABELS, inProcess } from '../lib/candidateStatus';
import { useStore } from '../lib/store';
import type { TCandidate, TCandidateStatus, TEvent, TRound, TRoundStatus } from '../types';
import FilterChip from './FilterChip';
import { Close, Download, Search } from './Icons';
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
 * from being at culture fit, and the one state where the board should be
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
  const patchRound = useStore((s) => s.patchRound);
  const addCandidate = useStore((s) => s.addCandidate);
  const events = useStore((s) => s.events);

  const [q, setQ] = useState('');
  const [fTrack, setFTrack] = useState('');
  const [fRung, setFRung] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPanel, setFPanel] = useState('');

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
   * Only candidates in the process. Somebody nobody has shortlisted has no
   * rounds and nothing to be at; they belong on the Candidates tab, which is
   * where shortlisting happens.
   */
  const visibleRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates
      .filter((c) => {
        if (!inProcess(c.status)) return false;
        if (fTrack && c.track !== fTrack) return false;

        const ladder = ladders.get(c.id) ?? [];
        const where = whereNow(ladder);

        // Round and Status filter on where they are *now*, which is what the
        // column shows — "who is at the craft round" is the question, not "who
        // has a craft round somewhere on their ladder".
        if (fRung && where.round?.kind !== fRung) return false;
        if (fStatus && where.round?.status !== fStatus) return false;
        // Panel matches anywhere on their ladder. Scoped to the current round
        // it would hide a candidate whose portfolio you ran and who has since
        // moved on, which is exactly who you want to find.
        if (fPanel && !ladder.some((r) => r.interviewers.includes(fPanel))) return false;

        if (!needle) return true;
        return (
          c.name.toLowerCase().includes(needle) ||
          c.role.toLowerCase().includes(needle) ||
          c.level.toLowerCase().includes(needle) ||
          ladder.some((r) => r.interviewers.join(' ').toLowerCase().includes(needle))
        );
      })
      .sort(orderByActivity(latestByCandidate, liveCandidates));
  }, [candidates, ladders, latestByCandidate, liveCandidates, q, fTrack, fRung, fStatus, fPanel]);

  const visiblePeople = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates.filter((c) => {
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.role.toLowerCase().includes(needle) ||
        c.level.toLowerCase().includes(needle) ||
        c.location.toLowerCase().includes(needle) ||
        c.source.toLowerCase().includes(needle)
      );
    });
  }, [candidates, q]);

  /** Add one and open it, because a blank row on a board you cannot see is not
   *  a useful outcome of pressing "Add a candidate". */
  const addAndOpen = async () => {
    const id = await addCandidate();
    go({ view: 'candidate', id });
  };

  const exportCandidatesCsv = () => {
    const rows: (string | number)[][] = [
      [
        'ref',
        'candidate',
        'track',
        'applying for',
        'level',
        'status',
        'location',
        'email',
        'phone',
        'company',
        'their title',
        'portfolio',
        'source',
      ],
      ...visiblePeople.map((c) => [
        c.ref,
        c.name,
        TRACK_LABELS[c.track],
        c.role,
        c.level,
        CANDIDATE_STATUS_LABELS[c.status],
        c.location,
        c.email,
        c.phone,
        c.previousCompany,
        c.previousPosition,
        c.portfolio,
        c.source,
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
        'level',
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
          c.level,
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

        {mode === 'rounds' && (
          <>
            <FilterChip
              label="Track"
              value={fTrack}
              onChange={setFTrack}
              options={TRACKS.map((t) => ({
                value: t,
                label: TRACK_LABELS[t],
                n: rounds.filter((x) => byId.get(x.candidateId)?.track === t).length,
              }))}
            />
            <FilterChip
              label="Round"
              value={fRung}
              onChange={setFRung}
              // Nine rungs across two ladders, so each is prefixed with its
              // track — there is a "Portfolio" and a "Culture fit" on both.
              options={LADDER.map((r) => ({
                value: r.kind,
                label: `${r.track === 'visual' ? 'VD' : 'PD'} ${r.no}. ${r.label}`,
                n: rounds.filter((x) => x.kind === r.kind).length,
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
                          onClick={() => go({ view: 'candidate', id: c.id })}
                        >
                          <span className="av u-circle">{initials(c.name) || '—'}</span>
                          <span className="lines">
                            <span className="nm">{c.name || 'Unnamed'}</span>
                            <span className="rl">{c.level}</span>
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
                          <>
                            <button
                              type="button"
                              className="rung-open"
                              onClick={() => go({ view: 'room', id: where.round?.id ?? '' })}
                              title="Open this round — link, script, scorecard, transcript, log"
                            >
                              <span className="lb">{rg.label}</span>
                            </button>
                            <span className="rung-foot">
                              {/* Marking this one complete is what moves them
                                  on: `whereNow` then names the next round owed
                                  and the row redraws around it. */}
                              <Pill<TRoundStatus>
                                value={where.round.status}
                                options={ROUND_STATUSES}
                                labels={STATUS_LABELS}
                                onChange={(v) =>
                                  void patchRound(where.round?.id ?? '', { status: v })
                                }
                                title="Complete this round to move them to the next"
                              />
                              <span className="when">
                                {where.round.scheduledAt
                                  ? relative(where.round.scheduledAt)
                                  : where.round.status === 'scheduled'
                                    ? 'no date yet'
                                    : ''}
                              </span>
                            </span>
                          </>
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
                          onOpen={() => go({ view: 'candidate', id: c.id })}
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
          <table className="log" style={{ minWidth: 1440 }}>
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
                <th className="col-ref">Ref</th>
                <th className="col-who">Candidate</th>
                <th style={{ width: 130 }}>Track</th>
                <th className="col-role">Applying for</th>
                {/* "Status", not "Where" — that read fine until there was a
                    real Location column beside it. */}
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 120 }}>Location</th>
                <th style={{ width: 190 }}>Email</th>
                <th style={{ width: 150 }}>Phone</th>
                <th style={{ width: 150 }}>Company</th>
                <th style={{ width: 180 }}>Their title</th>
              </tr>
            </thead>
            <tbody>
              {visiblePeople.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-ref">#{c.ref}</td>
                    <td>
                      <button
                        type="button"
                        className="who"
                        onClick={() => go({ view: 'candidate', id: c.id })}
                      >
                        <span className="av u-circle">{initials(c.name) || '—'}</span>
                        <span className="lines">
                          <span className="nm">{c.name || 'Unnamed'}</span>
                          {/* Level and where they came from. The opening has
                              its own column, so the sub-line carries the two
                              facts that are about the person rather than the
                              req — and how someone reached us is the one that
                              decides who chases them. */}
                          <span className="rl">
                            {c.level}
                            {c.source ? ` · ${c.source}` : ''}
                          </span>
                        </span>
                      </button>
                    </td>
                    {/* Which ladder they walk — it decides their rounds and who
                        runs them, so it is a column and not a detail. */}
                    <td className="panel-cell">{TRACK_LABELS[c.track]}</td>
                    <td className="panel-cell">{c.role || <span className="none">—</span>}</td>
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
                        details exist to be used, and asking someone to select
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
                    <td className="panel-cell">
                      {c.previousCompany || <span className="none">—</span>}
                    </td>
                    <td className="panel-cell">
                      {c.previousPosition || <span className="none">—</span>}
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </>
  );
};

export default Board;
