import { useMemo, useState } from 'react';
import { toCsv, download } from '../lib/csv';
import { initials, relative } from '../lib/format';
import { DECISION_LABELS, LADDER, STATUS_LABELS, ladderFor, rung,
  TRACKS,
  TRACK_LABELS,
  byLadder,
} from '../lib/ladder';
import { go } from '../lib/route';
import { CANDIDATE_STATUSES, CANDIDATE_STATUS_LABELS } from '../lib/candidateStatus';
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
 * The order the board reads in.
 *
 * Most recent activity first. The only time on a row is now the time in the
 * Latest column, and a board sorted on a date it does not show is a board in an
 * order nobody can explain — the previous sort banded rows by their scheduled
 * date, which was legible only while that date was a column.
 *
 * Two exceptions, both earned:
 *
 *   The round happening now pins to the top. There is at most one, it is the
 *   only highlighted row, and it is the whole screen while it lasts.
 *
 *   Rounds nothing has happened to yet fall to the bottom, ordered by when they
 *   are scheduled. They have no activity to sort by, and the next one owed is
 *   the most useful of them — an unscheduled round is last, not first, because
 *   a 0 date sorted as an epoch lands in 1970.
 */
const orderByActivity =
  (latest: Map<string, TEvent>) =>
  (a: TRound, b: TRound): number => {
    const liveA = a.status === 'in_progress';
    const liveB = b.status === 'in_progress';
    if (liveA !== liveB) return liveA ? -1 : 1;

    const ta = latest.get(a.id)?.t ?? 0;
    const tb = latest.get(b.id)?.t ?? 0;
    if (ta !== tb) return tb - ta;

    return (a.scheduledAt || Number.MAX_SAFE_INTEGER) - (b.scheduledAt || Number.MAX_SAFE_INTEGER);
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

  /**
   * The newest event per round, as a map.
   *
   * Built once per paint rather than searched per row: `events.find(...)` in a
   * cell is O(rows × events), which on a busy funnel is the kind of quadratic
   * that only shows up once there is enough history to matter. The store keeps
   * events newest-first, so the first hit for a round is its latest.
   */
  const latest = useMemo(() => {
    const m = new Map<string, TEvent>();
    for (const e of events) {
      if (e.roundId && !m.has(e.roundId)) m.set(e.roundId, e);
    }
    return m;
  }, [events]);
  const latestFor = (roundId: string) => latest.get(roundId);

  const panelNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of rounds) for (const p of r.interviewers) set.add(p);
    return [...set].sort();
  }, [rounds]);

  const visibleRounds = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rounds
      .filter((r) => {
        const c = byId.get(r.candidateId);
        if (!c) return false;
        if (fTrack && c.track !== fTrack) return false;
        if (fRung && r.kind !== fRung) return false;
        if (fStatus && r.status !== fStatus) return false;
        if (fPanel && !r.interviewers.includes(fPanel)) return false;
        if (!needle) return true;
        return (
          c.name.toLowerCase().includes(needle) ||
          c.role.toLowerCase().includes(needle) ||
          c.level.toLowerCase().includes(needle) ||
          r.interviewers.join(' ').toLowerCase().includes(needle)
        );
      })
      .sort(orderByActivity(latest));
  }, [rounds, byId, latest, q, fTrack, fRung, fStatus, fPanel]);

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

  const roundsOf = (c: TCandidate): TRound[] => ladders.get(c.id) ?? [];

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
      ...visibleRounds.map((r) => {
        const c = byId.get(r.candidateId);
        return [
          c?.ref ?? '',
          c?.name ?? '',
          c ? TRACK_LABELS[c.track] : '',
          c?.role ?? '',
          c?.level ?? '',
          rung(r.kind).label,
          r.interviewers.join('; '),
          r.scheduledAt ? new Date(r.scheduledAt).toISOString() : '',
          STATUS_LABELS[r.status],
          DECISION_LABELS[r.decision],
          r.lineCount,
        ];
      }),
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
          visibleRounds.length === 0 ? (
            <div className="empty">
              <h2>Nothing matches</h2>
              <p>
                {active
                  ? 'No round on the board fits those filters. Clear them to see everything.'
                  : 'No rounds yet. Import candidates from the database, or add one by hand — the ladder is generated from their level.'}
              </p>
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
                {visibleRounds.map((r) => {
                  const c = byId.get(r.candidateId);
                  if (!c) return null;
                  const rg = rung(r.kind);
                  return (
                    <tr key={r.id} className={r.status === 'in_progress' ? 'live' : undefined}>
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
                            {/* The role has its own column now, so the
                                sub-line carries only what is left. */}
                            <span className="rl">{c.level}</span>
                          </span>
                        </button>
                      </td>

                      <td className="panel-cell">
                        {c.role || <span className="none">—</span>}
                      </td>

                      <td className="rung-cell">
                        {/* The way into the round, now that the row has no
                            button. Clicking the round to open the round needs
                            no label; a column of "Activity" buttons was one
                            word repeated forty times to say so. */}
                        {/* No rung number here. The ladder in the next column
                            already says which of the four this is, and says it
                            in a form you can read down the page — a digit in
                            front of the name was the same fact in words. It
                            stays where there is no ladder beside it: the round
                            cards in the panel, and the round page's own bar. */}
                        <button
                          type="button"
                          className="rung-open"
                          onClick={() => go({ view: 'room', id: r.id })}
                          title="Open this round — link, script, scorecard, transcript, log"
                        >
                          <span className="lb">{rg.label}</span>
                        </button>
                      </td>

                      <td>
                        <LadderMini
                          rounds={roundsOf(c)}
                          activeId={r.id}
                          onPick={(id) => go({ view: 'room', id })}
                        />
                      </td>

                      <td>
                        {/* The last thing that happened, not the current state
                            of three fields. A status pill and a call pill say
                            what a round *is*; one line of log says what someone
                            did and when, which is the question being asked when
                            anyone scans this sheet. The state itself is edited
                            where it is decided — in the room and the panel.

                            Last on the row, because it is the one column that
                            holds a sentence: everything to its left can be
                            sized exactly, so this is what should absorb the
                            slack at any window width. */}
                        <LatestCell
                          event={latestFor(r.id)}
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
            <h2>Nobody here</h2>
            <p>Import candidates from the database, or add one by hand.</p>
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
