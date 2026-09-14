import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActivityLog from './ActivityLog';
import PasteTranscript from './PasteTranscript';
import Pill from './Pill';
import { Back, Play, Star, Tick, Video } from './Icons';
import { db } from '../lib/db';
import { clock } from '../lib/format';
import { newId } from '../lib/id';
import { DECISION_LABELS, SCORE_LABELS, SIGNAL_LABELS, rung } from '../lib/ladder';
import { useStore } from '../lib/store';
import { httpUrl } from '../lib/url';
import type { TCandidate, TDecision, TEvent, TRound, TScore, TSegment } from '../types';

/**
 * One round: everything about one conversation, on one screen.
 *
 * The left column is what you use *during* the interview — the meeting link,
 * the script, the scorecard, your write-up. The right is the record of it: the
 * transcript, and the log of what has happened to this round.
 *
 * It used to record the call and transcribe it live, and it no longer does.
 * Zoom, Meet and Teams already produce a transcript from the meeting's own
 * audio, with real diarisation and no browser microphone permission — so the
 * honest design is a link out to the meeting and a box to paste the transcript
 * into afterwards. That deleted a media recorder, a speech recogniser that
 * needed restarting every time the room went quiet, a clock that had to
 * discount paused time, and a store full of multi-megabyte blobs.
 */

type TProps = {
  round: TRound;
  candidate: TCandidate;
  trail: TEvent[];
  onClose: () => void;
};

const RoundPage = ({ round, candidate, trail, onClose }: TProps) => {
  const patchRound = useStore((s) => s.patchRound);
  const note = useStore((s) => s.note);

  const r = rung(round.kind);

  const [segments, setSegments] = useState<TSegment[]>([]);
  const [asked, setAsked] = useState<Set<number>>(new Set());
  const [pasting, setPasting] = useState(false);
  const [typed, setTyped] = useState('');
  const stream = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const rows = await db.segments.byRound(round.id);
    setSegments(rows);
    // The transcript is the truth and `lineCount` is a cache of it, so opening
    // a round is also the moment to repair the cache.
    if (round.lineCount !== rows.length) {
      void patchRound(round.id, { lineCount: rows.length });
    }
  }, [round.id, round.lineCount, patchRound]);

  useEffect(() => {
    let live = true;
    void db.segments.byRound(round.id).then((rows) => {
      if (live) setSegments(rows);
    });
    return () => {
      live = false;
    };
    // Keyed on the round alone: re-running whenever `lineCount` changes would
    // refetch the transcript on every line this page itself writes.
  }, [round.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setScore = (signal: string, v: TScore) =>
    patchRound(round.id, {
      // Clicking the score already set clears it — a mis-click should not be
      // permanent, and "I have not judged this" is a real answer.
      scores: { ...round.scores, [signal]: round.scores[signal as never] === v ? 0 : v },
    });

  const starred = useMemo(() => segments.filter((s) => s.starred), [segments]);

  const toggleStar = (s: TSegment) => {
    const next = { ...s, starred: !s.starred };
    void db.segments.put(next);
    setSegments((prev) => prev.map((p) => (p.id === s.id ? next : p)));
  };

  const addTyped = async () => {
    const text = typed.trim();
    if (!text) return;
    const row: TSegment = {
      id: newId('seg'),
      roundId: round.id,
      // Typed lines land after everything the transcript carried, which is what
      // "I am adding a note to the end of this" means.
      t: segments.length > 0 ? Math.max(...segments.map((s) => s.t)) + 1 : 0,
      speaker: 'interviewer',
      speakerName: '',
      text,
      starred: false,
      manual: true,
    };
    await db.segments.put(row);
    setTyped('');
    await reload();
  };

  // Parsed, not trimmed: a paste with no scheme is a relative URL, and in an
  // href that navigates the app to /zoom.us/j/123 instead of to Zoom.
  const join = httpUrl(round.zoomUrl);
  const recording = httpUrl(round.recordingUrl);

  return (
    <div className="room" role="dialog" aria-modal="true" aria-label={`${r.label} — ${candidate.name}`}>
      <div className="room-bar">
        <button type="button" className="side-sheet-close" onClick={onClose} title="Back">
          <Back />
        </button>

        <div className="who-line">
          <span className="nm">{candidate.name || 'Unnamed candidate'}</span>
          <span className="sub">
            {r.retired ? '—' : r.no}. {r.label}
            {candidate.role ? ` · ${candidate.role}` : ''}
          </span>
        </div>

        <div className="spacer" />

        <Pill<TDecision>
          value={round.decision}
          options={['pending', 'strong_no', 'no', 'yes', 'strong_yes']}
          labels={DECISION_LABELS}
          onChange={(v) => void patchRound(round.id, { decision: v })}
          title="The call on this round"
        />

        <div className="rule-v" />

        {/* Both links out, deliberately — the interview happens in Zoom and so
            does the playback. Pretending otherwise is what the recorder did. */}
        {recording && (
          <a className="bar-btn" href={recording} target="_blank" rel="noreferrer noopener">
            <Play />
            Recording
          </a>
        )}

        {join ? (
          <a className="bar-btn on" href={join} target="_blank" rel="noreferrer noopener">
            <Video />
            Join
          </a>
        ) : (
          !recording && <span className="bar-note">No meeting link yet</span>
        )}
      </div>

      <div className="room-panes">
        <div className="room-pane room-pane--script">
          <div className="block">
            <h3>What this round is for</h3>
            <p className="purpose">{r.purpose}</p>
          </div>

          <div className="block">
            <h3>Links</h3>
            <div className="round-grid">
              <label className="lbl">
                Meeting
                <input
                  className="field"
                  placeholder="https://zoom.us/j/…"
                  defaultValue={round.zoomUrl}
                  onBlur={(e) => void patchRound(round.id, { zoomUrl: e.target.value.trim() })}
                />
              </label>
              <label className="lbl">
                Recording
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
            {round.recordingUrl.trim() && !recording && (
              <p className="notice" style={{ margin: 0 }}>
                That recording link is not a web address, so there is nothing to open. Paste the
                full URL, including https://
              </p>
            )}
          </div>

          {!r.retired && (
            <div className="block">
              <h3>
                The script · {asked.size}/{r.prompts.length} asked
              </h3>
              <ul className="prompts">
                {r.prompts.map((p, i) => (
                  <li key={p} className={asked.has(i) ? 'asked' : ''}>
                    <button
                      type="button"
                      onClick={() =>
                        setAsked((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    >
                      <span className="box">
                        <Tick size={10} />
                      </span>
                      <span>{p}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* No signals means nothing to score — a retired rung, or the offer
              call, whose outcome is the candidate's status and not a mark out
              of four. The heading says what the block actually is rather than
              promising a scorecard and showing one row. */}
          <div className="block">
            <h3>{r.signals.length === 0 ? 'The call' : 'Scorecard — what this round can judge'}</h3>
            <div className="card-rows">
              {r.signals.length === 0 && (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--prism-text-tertiary)' }}>
                  {r.purpose}
                </p>
              )}
              {r.signals.map((sig) => (
                <div className="card-row" key={sig}>
                  <span className="sig">{SIGNAL_LABELS[sig]}</span>
                  <span className="scale">
                    {([1, 2, 3, 4] as TScore[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={round.scores[sig] === v}
                        title={SCORE_LABELS[v]}
                        onClick={() => void setScore(sig, v)}
                      >
                        {v}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="block">
            <h3>Your write-up</h3>
            <textarea
              className="field"
              placeholder="What you saw, in your own words. This is the part the transcript cannot replace."
              defaultValue={round.notes}
              onBlur={(e) => void patchRound(round.id, { notes: e.target.value })}
            />
          </div>

          <div className="block">
            <h3>Activity · {trail.length}</h3>
            <ActivityLog events={trail} rounds={[round]} />
          </div>
        </div>

        <div className="room-pane room-pane--live">
          <div className="live-head">
            <span className="ttl">
              Transcript{segments.length > 0 ? ` · ${segments.length} lines` : ''}
              {starred.length > 0 ? ` · ${starred.length} starred` : ''}
            </span>
            <div className="spacer" />
            <button type="button" className="bar-btn" onClick={() => setPasting(true)}>
              {segments.length > 0 ? 'Paste again' : 'Paste transcript'}
            </button>
          </div>

          <div className="stream" ref={stream}>
            {segments.length === 0 && (
              <p className="stream-empty">
                Nothing here yet. Run the interview in Zoom, then paste its transcript in — Zoom,
                Meet and Teams all export one, and their diarisation is better than anything this
                page could do from the browser. You can also just type the lines that mattered.
              </p>
            )}

            {segments.map((s) => (
              <div key={s.id} className={`line ${s.speaker}${s.starred ? ' starred' : ''}`}>
                <span className="t" title={s.speakerName || undefined}>
                  {s.t > 0 ? clock(s.t) : '·'}
                </span>
                <span className="row">
                  <span className="tx">
                    {s.text}
                    {s.manual && (
                      <span className="typed" title="Typed here, not from the meeting transcript">
                        typed
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="star"
                    title={s.starred ? 'Unstar' : 'Star this moment'}
                    onClick={() => toggleStar(s)}
                  >
                    <Star filled={s.starred} />
                  </button>
                </span>
              </div>
            ))}
          </div>

          <div className="live-head" style={{ borderBlock: '1px solid var(--prism-line)' }}>
            <input
              className="field"
              placeholder="Add a line by hand"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addTyped();
              }}
            />
            <button type="button" className="bar-btn" onClick={() => void addTyped()} disabled={!typed.trim()}>
              Add
            </button>
          </div>
        </div>
      </div>

      {pasting && (
        <PasteTranscript
          round={round}
          candidate={candidate}
          existing={segments.length}
          onDone={async (n) => {
            setPasting(false);
            await reload();
            if (n > 0) await note(candidate.id, round.id, `Transcript added — ${n} lines`);
          }}
          onCancel={() => setPasting(false)}
        />
      )}
    </div>
  );
};

export default RoundPage;
