import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/db';
import { clock, fromLocalInput, toLocalInput, when } from '../lib/format';
import {
  DECISION_LABELS,
  SCORE_LABELS,
  SIGNAL_LABELS,
  STATUS_LABELS,
  TRACKS,
  TRACK_LABELS,
  byLadder,
  isRetired,
  ladderFor,
  rung,
} from '../lib/ladder';
import { CANDIDATE_STATUSES, CANDIDATE_STATUS_LABELS, inProcess } from '../lib/candidateStatus';
import { useStore } from '../lib/store';
import { httpUrl } from '../lib/url';
import type {
  TCandidate,
  TCandidateStatus,
  TDecision,
  TRound,
  TTrack,
  TRoundStatus,
  TSegment,
} from '../types';
import { Close, Play, Trash, Video } from './Icons';
import ActivityLog from './ActivityLog';
import LadderTrack from './LadderTrack';
import Pill from './Pill';

/**
 * One candidate, and every round they have walked.
 *
 * The panel is the place the record is *edited* — the board is for scanning and
 * this is for changing. Editing in a table cell works for one value on one row;
 * it does not work for a person with four rounds, each with a panel, a date, a
 * scorecard and a write-up.
 */

const ROUND_STATUSES: TRoundStatus[] = ['scheduled', 'in_progress', 'complete', 'cancelled'];
const DECISIONS: TDecision[] = ['pending', 'strong_no', 'no', 'yes', 'strong_yes'];

type TProps = {
  candidate: TCandidate;
  rounds: TRound[];
  onClose: () => void;
  onEnterRoom: (roundId: string) => void;
  onReadTranscript: (roundId: string) => void;
};

const CandidatePanel = ({
  candidate,
  rounds,
  onClose,
  onEnterRoom,
  onReadTranscript,
}: TProps) => {
  const patchCandidate = useStore((s) => s.patchCandidate);
  const patchRound = useStore((s) => s.patchRound);
  const removeCandidate = useStore((s) => s.removeCandidate);
  const events = useStore((s) => s.events);
  const [moments, setMoments] = useState<TSegment[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** This candidate's log. Narrowed in a memo, not in the selector: a filter
   *  inside `useStore` builds a new array on every read and the snapshot never
   *  compares equal. */
  const trail = useMemo(
    () => events.filter((e) => e.candidateId === candidate.id),
    [events, candidate.id],
  );

  /** In ladder order, not insertion order — the track is meaningless otherwise. */
  const ordered = useMemo(() => {
    const order = ladderFor(candidate.track).map((r) => r.kind);
    return [...rounds].sort(byLadder(order));
  }, [rounds, candidate.track]);

  /** Every starred line across every round of this candidate. The one view that
   *  answers "what actually happened in these conversations" without reading
   *  four transcripts. */
  useEffect(() => {
    let live = true;
    void Promise.all(rounds.map((r) => db.segments.byRound(r.id))).then((lists) => {
      if (!live) return;
      setMoments(lists.flat().filter((s) => s.starred));
    });
    return () => {
      live = false;
    };
  }, [rounds]);

  const esc = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  /**
   * Click-away, but only for a click that began and ended on the scrim.
   *
   * `e.target === e.currentTarget` on mousedown alone is not enough. Dismissing
   * a native picker — and every round card has a `datetime-local` — delivers
   * its closing click to whatever is behind it, which is this scrim, and the
   * panel would vanish with a half-typed write-up in it. Requiring both ends of
   * the gesture on the scrim also means a drag that starts on a field and ends
   * outside no longer counts, which is the other way people lost it.
   */
  const downOnScrim = useRef(false);

  return (
    <div
      className="sheet-scrim"
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) onClose();
        downOnScrim.current = false;
      }}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the
          panel owns Escape; the scrim owns the click-away. */}
      <div className="side-sheet" role="dialog" aria-modal="true" onKeyDown={esc}>
        <div className="side-sheet-head">
          <p className="side-sheet-crumb">
            #{candidate.ref} · {candidate.name || 'Unnamed candidate'}
          </p>
          <Pill<TCandidateStatus>
            value={candidate.status}
            options={CANDIDATE_STATUSES}
            labels={CANDIDATE_STATUS_LABELS}
            onChange={(v) => void patchCandidate(candidate.id, { status: v })}
            title="Where they are"
          />
          <button type="button" className="side-sheet-close" onClick={onClose} title="Close">
            <Close />
          </button>
        </div>

        <div className="side-sheet-body">
          {inProcess(candidate.status) ? (
            <div className="block">
              <h3>The ladder · {ordered.filter((r) => !isRetired(r.kind)).length} rounds</h3>
              <LadderTrack rounds={ordered} />
            </div>
          ) : (
            /* No rounds until somebody decides to interview them. Stated here
               with the button that does it, because an empty ladder with no
               explanation reads as the tool having lost something. */
            <div className="block">
              <h3>Not shortlisted yet</h3>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--prism-text-secondary)' }}>
                Nobody has decided to interview {candidate.name || 'this candidate'} yet, so they
                have no rounds. Shortlisting them creates the{' '}
                {ladderFor(candidate.track).length} rounds of the{' '}
                {TRACK_LABELS[candidate.track].toLowerCase()} ladder, each assigned to whoever runs
                it.
              </p>
              <div className="row-acts">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void patchCandidate(candidate.id, { status: 'shortlisted' })}
                >
                  Shortlist
                </button>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => void patchCandidate(candidate.id, { status: 'rejected' })}
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          <div className="block">
            <h3>Who they are</h3>
            <dl className="facts">
              <dt>Name</dt>
              <dd>
                <input
                  className="field"
                  defaultValue={candidate.name}
                  placeholder="Full name"
                  onBlur={(e) => void patchCandidate(candidate.id, { name: e.target.value })}
                />
              </dd>

              <dt>Track</dt>
              <dd>
                {/* Changing this changes which ladder they walk. `syncLadder`
                    adds the new track's rungs and drops the old track's empty
                    ones; anything that actually happened is kept. */}
                <select
                  className="field"
                  value={candidate.track}
                  onChange={(e) =>
                    void patchCandidate(candidate.id, { track: e.target.value as TTrack })
                  }
                >
                  {TRACKS.map((t) => (
                    <option key={t} value={t}>
                      {TRACK_LABELS[t]}
                    </option>
                  ))}
                </select>
              </dd>

              <dt>Applying for</dt>
              <dd>
                <input
                  className="field"
                  defaultValue={candidate.role}
                  placeholder="Product Designer, noonFood"
                  onBlur={(e) => void patchCandidate(candidate.id, { role: e.target.value })}
                />
              </dd>

              <dt>Level</dt>
              <dd>
                <input
                  className="field"
                  defaultValue={candidate.level}
                  placeholder="IC3"
                  onBlur={(e) => void patchCandidate(candidate.id, { level: e.target.value })}
                />
              </dd>

              <dt>Location</dt>
              <dd>
                <input
                  className="field"
                  defaultValue={candidate.location}
                  placeholder="Dubai"
                  onBlur={(e) => void patchCandidate(candidate.id, { location: e.target.value })}
                />
              </dd>

              <dt>Portfolio</dt>
              <dd>
                <input
                  className="field"
                  defaultValue={candidate.portfolio}
                  placeholder="https://"
                  onBlur={(e) => void patchCandidate(candidate.id, { portfolio: e.target.value })}
                />
              </dd>

              <dt>Email</dt>
              <dd>
                <input
                  className="field"
                  type="email"
                  defaultValue={candidate.email}
                  placeholder="name@example.com"
                  onBlur={(e) => void patchCandidate(candidate.id, { email: e.target.value })}
                />
              </dd>

              <dt>Phone</dt>
              <dd>
                <input
                  className="field"
                  type="tel"
                  defaultValue={candidate.phone}
                  placeholder="+971 50 000 0000"
                  onBlur={(e) => void patchCandidate(candidate.id, { phone: e.target.value })}
                />
              </dd>

              <dt>Company</dt>
              <dd>
                <input
                  className="field"
                  defaultValue={candidate.previousCompany}
                  placeholder="Where they are now"
                  onBlur={(e) =>
                    void patchCandidate(candidate.id, { previousCompany: e.target.value })
                  }
                />
              </dd>

              <dt>Their title</dt>
              <dd>
                {/* Their own title, not the opening. A Staff designer at Careem
                    can be up for an IC4 role here and both facts matter. */}
                <input
                  className="field"
                  defaultValue={candidate.previousPosition}
                  placeholder="Their title there"
                  onBlur={(e) =>
                    void patchCandidate(candidate.id, { previousPosition: e.target.value })
                  }
                />
              </dd>

              <dt>Source</dt>
              <dd>
                <input
                  className="field"
                  defaultValue={candidate.source}
                  placeholder="Referral, inbound, agency"
                  onBlur={(e) => void patchCandidate(candidate.id, { source: e.target.value })}
                />
              </dd>
            </dl>

          </div>

          {moments.length > 0 && (
            <div className="block">
              <h3>Moments · {moments.length} starred</h3>
              <div className="moments">
                {moments.map((s) => {
                  const r = rounds.find((x) => x.id === s.roundId);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="moment"
                      onClick={() => onReadTranscript(s.roundId)}
                    >
                      {/* The rung number, not a truncated label: four
                          characters of "Systems & craft partners" is "SYST",
                          which is not a word and not a clue. */}
                      <span className="t">
                        R{r ? rung(r.kind).no : '?'} · {clock(s.t)}
                      </span>
                      <span className="tx">{s.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {ordered.length > 0 && (
          <div className="block">
            <h3>The rounds</h3>
            {ordered.map((round) => {
              const r = rung(round.kind);
              return (
                <div
                  key={round.id}
                  className={`round-card${round.status === 'in_progress' ? ' now' : ''}`}
                >
                  <div className="round-card-head">
                    {/* A retired rung has no number because it has no position
                        — it is not on the ladder any more. */}
                    <span className="no">{r.retired ? '—' : r.no}</span>
                    <span className="lb">{r.label}</span>
                    {r.retired && (
                      <span className="typed" title="Run on a rung the process no longer has">
                        retired
                      </span>
                    )}
                    <Pill<TRoundStatus>
                      value={round.status}
                      options={ROUND_STATUSES}
                      labels={STATUS_LABELS}
                      onChange={(v) => void patchRound(round.id, { status: v })}
                      title="Round status"
                    />
                  </div>

                  <div className="round-grid">
                    <label className="lbl">
                      When
                      <input
                        type="datetime-local"
                        className="field"
                        defaultValue={toLocalInput(round.scheduledAt)}
                        onBlur={(e) =>
                          void patchRound(round.id, { scheduledAt: fromLocalInput(e.target.value) })
                        }
                      />
                    </label>
                    <label className="lbl">
                      Panel
                      <input
                        className="field"
                        defaultValue={round.interviewers.join(', ')}
                        placeholder="Names, comma separated"
                        onBlur={(e) =>
                          void patchRound(round.id, {
                            interviewers: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="card-rows">
                    {r.retired && (
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--prism-text-tertiary)' }}>
                        {r.purpose}
                      </p>
                    )}
                    {r.signals.map((sig) => (
                      <div className="card-row" key={sig}>
                        <span className="sig">{SIGNAL_LABELS[sig]}</span>
                        <span className="scale">
                          {[1, 2, 3, 4].map((v) => (
                            <button
                              key={v}
                              type="button"
                              aria-pressed={round.scores[sig] === v}
                              title={SCORE_LABELS[v]}
                              onClick={() =>
                                void patchRound(round.id, {
                                  scores: {
                                    ...round.scores,
                                    [sig]: round.scores[sig] === v ? 0 : (v as 1 | 2 | 3 | 4),
                                  },
                                })
                              }
                            >
                              {v}
                            </button>
                          ))}
                        </span>
                      </div>
                    ))}
                    <div className="card-row">
                      <span className="sig">The call</span>
                      <Pill<TDecision>
                        value={round.decision}
                        options={DECISIONS}
                        labels={DECISION_LABELS}
                        onChange={(v) => void patchRound(round.id, { decision: v })}
                        title="The call on this round"
                      />
                    </div>
                  </div>

                  {/* The two links, paired. One is where the conversation
                      happens and the other is where it can be watched
                      afterwards — they are the same kind of fact and belong
                      side by side. The meeting link used to sit alone below the
                      write-up, which scattered them. */}
                  <div className="round-grid">
                    <label className="lbl">
                      Meeting link
                      <input
                        className="field"
                        placeholder="https://zoom.us/j/…"
                        defaultValue={round.zoomUrl}
                        onBlur={(e) => void patchRound(round.id, { zoomUrl: e.target.value.trim() })}
                      />
                    </label>
                    <label className="lbl">
                      Recording link
                      <input
                        className="field"
                        placeholder="Paste the cloud recording URL"
                        defaultValue={round.recordingUrl}
                        onBlur={(e) =>
                          void patchRound(round.id, { recordingUrl: e.target.value.trim() })
                        }
                      />
                    </label>
                  </div>

                  <textarea
                    className="field"
                    placeholder="Write-up. What you saw, in your own words."
                    defaultValue={round.notes}
                    onBlur={(e) => void patchRound(round.id, { notes: e.target.value })}
                  />

                  <div className="row-acts">
                    <button type="button" className="bar-btn" onClick={() => onEnterRoom(round.id)}>
                      Activity
                    </button>

                    {/* `httpUrl` rather than the raw value: a paste with no
                        scheme is a *relative* URL, and in an href that
                        navigates the app to /zoom.us/j/123. */}
                    {httpUrl(round.zoomUrl) && (
                      <a
                        className="bar-btn"
                        href={httpUrl(round.zoomUrl) ?? undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Video />
                        Join
                      </a>
                    )}

                    {httpUrl(round.recordingUrl) && (
                      <a
                        className="bar-btn"
                        href={httpUrl(round.recordingUrl) ?? undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Play />
                        Recording
                      </a>
                    )}

                    {round.lineCount > 0 && (
                      <button
                        type="button"
                        className="bar-btn"
                        onClick={() => onReadTranscript(round.id)}
                      >
                        Transcript · {round.lineCount} line{round.lineCount === 1 ? '' : 's'}
                      </button>
                    )}

                    <div className="spacer" />
                    <span style={{ fontSize: 12, color: 'var(--prism-text-tertiary)' }}>
                      {when(round.scheduledAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          )}

          <div className="block">
            <h3>Activity · {trail.length}</h3>
            <ActivityLog events={trail} rounds={ordered} onPickRound={onEnterRoom} />
          </div>

          <div className="block">
            <h3>Notes on the candidate</h3>
            <textarea
              className="field"
              placeholder="Anything that is about the person rather than about one round."
              defaultValue={candidate.notes}
              onBlur={(e) => void patchCandidate(candidate.id, { notes: e.target.value })}
            />
          </div>

          <div className="block">
            <h3>Remove</h3>
            {confirmDelete ? (
              <div className="row-acts">
                <span style={{ fontSize: 13, color: 'var(--color-fail)' }}>
                  This takes {ordered.length} rounds, their transcripts and their audio with it.
                </span>
                <div className="spacer" />
                <button type="button" className="btn-quiet" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
                <button
                  type="button"
                  className="btn-quiet danger"
                  onClick={() => {
                    void removeCandidate(candidate.id);
                    onClose();
                  }}
                >
                  <Trash />
                  Delete for good
                </button>
              </div>
            ) : (
              <div className="row-acts">
                <button
                  type="button"
                  className="btn-quiet danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash />
                  Remove this candidate
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CandidatePanel;
