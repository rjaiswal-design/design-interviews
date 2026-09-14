import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/db';
import { toCsv, download } from '../lib/csv';
import { clock, when } from '../lib/format';
import { rung } from '../lib/ladder';
import { httpUrl } from '../lib/url';
import type { TCandidate, TRound, TSegment } from '../types';
import { Back, Download, Play, Search, Star } from './Icons';

/**
 * The record of one interview, after the fact.
 *
 * Read-only and searchable. There is no player because there is no audio — the
 * transcript is pasted in from the meeting, and the timestamps it carries are a
 * citation ("at 12:04 they said") and an ordering, not a seek position.
 *
 * Starred lines are lifted out beside the transcript, because the reason to
 * keep a transcript is not to re-read forty minutes of it. It is to get back to
 * the ninety seconds that decided the call.
 */

type TProps = {
  round: TRound;
  candidate: TCandidate;
  onClose: () => void;
};

const TranscriptReader = ({ round, candidate, onClose }: TProps) => {
  const [segments, setSegments] = useState<TSegment[]>([]);
  const [q, setQ] = useState('');
  const stream = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void db.segments.byRound(round.id).then((rows) => {
      if (live) setSegments(rows);
    });
    return () => {
      live = false;
    };
  }, [round.id]);

  const r = rung(round.kind);
  const starred = useMemo(() => segments.filter((s) => s.starred), [segments]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return segments;
    return segments.filter((s) => s.text.toLowerCase().includes(needle));
  }, [segments, q]);

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['t', 'time', 'speaker', 'starred', 'text'],
      ...segments.map((s) => [
        s.t,
        clock(s.t),
        s.speaker === 'candidate' ? candidate.name : s.speaker === 'interviewer' ? 'Interviewer' : 'Unknown',
        s.starred ? 'yes' : '',
        s.text,
      ]),
    ];
    const slug = `${candidate.name || 'candidate'}-${r.kind}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    download(`transcript-${slug}.csv`, toCsv(rows));
  };

  return (
    <div className="room" role="dialog" aria-modal="true" aria-label="Transcript">
      <div className="room-bar">
        <button type="button" className="side-sheet-close" onClick={onClose} title="Back">
          <Back />
        </button>
        <div className="who-line">
          <span className="nm">{candidate.name || 'Unnamed candidate'}</span>
          <span className="sub">
            {r.retired ? '—' : r.no}. {r.label} · {when(round.scheduledAt)} ·{' '}
            {round.interviewers.join(', ') || 'No panel recorded'}
          </span>
        </div>
        <div className="spacer" />
        {/* The recording, beside the transcript. This is the page where you
            want it: you are reading a line, you do not believe it, and you want
            to hear it said. */}
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

        <div className="search" style={{ maxWidth: 240 }}>
          <span className="icon">
            <Search />
          </span>
          <input placeholder="Find in transcript" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="button" className="bar-btn" onClick={exportCsv} disabled={segments.length === 0}>
          <Download />
          Export
        </button>
      </div>


      <div className="room-panes" style={{ gridTemplateColumns: starred.length ? undefined : '1fr' }}>
        <div className="room-pane" style={{ padding: 0 }}>
          <div className="stream" ref={stream}>
            {segments.length === 0 && (
              <p className="stream-empty">
                Nothing was transcribed for this round.
              </p>
            )}
            {shown.map((s) => (
              <div
                key={s.id}
                className={`line ${s.speaker}${s.starred ? ' starred' : ''}`}
              >
                <span className="t" title={s.speakerName || undefined}>
                  {s.t > 0 ? clock(s.t) : '·'}
                </span>
                <span className="row">
                  <span className="tx">
                    {s.text}
                    {s.manual && (
                      <span className="typed" title="Typed, not transcribed">
                        typed
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="star"
                    title={s.starred ? 'Unstar' : 'Star this moment'}
                    onClick={() => {
                      const next = { ...s, starred: !s.starred };
                      void db.segments.put(next);
                      setSegments((prev) => prev.map((p) => (p.id === s.id ? next : p)));
                    }}
                  >
                    <Star filled={s.starred} />
                  </button>
                </span>
              </div>
            ))}
            {q && shown.length === 0 && (
              <p className="stream-empty">Nothing in this transcript says “{q}”.</p>
            )}
          </div>
        </div>

        {starred.length > 0 && (
          <div className="room-pane" style={{ borderInlineStart: '1px solid var(--prism-line)' }}>
            <div className="block">
              <h3>Moments · {starred.length}</h3>
              <div className="moments">
                {starred.map((s) => (
                  <div key={s.id} className="moment">
                    <span className="t">{s.t > 0 ? clock(s.t) : '·'}</span>
                    <span className="tx">{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptReader;
