import { useMemo, useState } from 'react';
import { Close } from './Icons';
import { db } from '../lib/db';
import { clock } from '../lib/format';
import { guessCandidate, parseTranscript, toSegments } from '../lib/transcript';
import type { TCandidate, TRound } from '../types';

/**
 * Paste the meeting's transcript in.
 *
 * Two jobs, and the second is the one that makes the transcript worth having:
 * parse the paste, and find out which of the names in it is the candidate. A
 * transcript where you cannot tell who was answering is a wall of text.
 *
 * The guess is whoever talked most, which is a better heuristic than matching
 * against the candidate's name — the transcript spells people however their
 * meeting account is set up, and the name on the row here was typed by whoever
 * added them. It is offered rather than assumed: the chips below are how you
 * correct it, before anything is written.
 */

type TProps = {
  round: TRound;
  candidate: TCandidate;
  /** How many lines the round already has, so replacing can say what it costs. */
  existing: number;
  onDone: (added: number) => void | Promise<void>;
  onCancel: () => void;
};

const PasteTranscript = ({ round, candidate, existing, onDone, onCancel }: TProps) => {
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Names the user has explicitly marked. `null` means "not touched yet", so
   *  the guess is still in force — an empty set would be indistinguishable from
   *  "the user unticked everything". */
  const [picked, setPicked] = useState<string[] | null>(null);

  const parsed = useMemo(() => (text.trim() ? parseTranscript(text) : null), [text]);
  const guess = useMemo(() => (parsed ? guessCandidate(parsed) : undefined), [parsed]);
  const theirs = picked ?? (guess ? [guess] : []);

  const commit = async () => {
    if (!parsed || parsed.lines.length === 0) return;
    setBusy(true);
    // Replace, not append. A second paste of the same meeting is a correction,
    // and appending would silently double a transcript — which nobody would
    // notice until they read the same answer twice.
    const old = await db.segments.byRound(round.id);
    await Promise.all(old.map((s) => db.segments.del(s.id)));
    const rows = toSegments(parsed, round.id, theirs);
    await db.segments.putMany(rows);
    setBusy(false);
    await onDone(rows.length);
  };

  const FORMAT_LABEL = {
    vtt: 'WebVTT — Zoom or Teams export',
    timestamped: 'Timestamped lines',
    named: 'Named lines',
    prose: 'Plain text, no speakers named',
  } as const;

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Paste the transcript">
        <header>
          <div>
            <p className="eyebrow">From the meeting</p>
            <h2>Paste the transcript</h2>
          </div>
          <button type="button" className="side-sheet-close" onClick={onCancel} title="Close">
            <Close />
          </button>
        </header>

        <div className="body">
          <p>
            Download or copy the transcript from Zoom, Meet or Teams and paste it below. WebVTT
            files, timestamped lines and plain <code>Name: text</code> all work — so does prose,
            which just comes in without speakers.
          </p>

          {/* biome-ignore lint/a11y/useKeyWithClickEvents: a convenience over the
              paste box below it, which is the keyboard path. */}
          <div
            className={`drop${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void file.text().then(setText);
            }}
          >
            Drop a .vtt or .txt here, or paste below
          </div>

          <textarea
            className="paste"
            placeholder={`WEBVTT\n\n00:00:12.340 --> 00:00:15.010\n${candidate.name || 'Candidate'}: The funnel had four steps…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          {parsed && parsed.lines.length > 0 && (
            <>
              <p style={{ color: 'var(--color-ink)', fontWeight: 500 }}>
                {parsed.lines.length} lines · {FORMAT_LABEL[parsed.format]}
                {parsed.timed ? '' : ' · no timestamps'}
              </p>

              {parsed.speakers.length > 0 ? (
                <div className="block">
                  <h3>Which of these is {candidate.name || 'the candidate'}?</h3>
                  <div className="chips" style={{ paddingBottom: 0 }}>
                    {parsed.speakers.map((name) => {
                      const on = theirs.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          className="chip"
                          data-active={on}
                          onClick={() =>
                            setPicked(
                              on ? theirs.filter((n) => n !== name) : [...theirs, name],
                            )
                          }
                        >
                          <span className="v">{name}</span>
                          <span className="k">{on ? 'candidate' : 'interviewer'}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--prism-text-tertiary)' }}>
                    Whoever talked most is picked for you. Everyone else is recorded as an
                    interviewer.
                  </p>
                </div>
              ) : (
                <p className="notice calm" style={{ margin: 0 }}>
                  This paste does not name its speakers, so the lines come in unattributed. The
                  transcript is still searchable and you can still star moments in it.
                </p>
              )}

              <pre className="sample">
                {parsed.lines
                  .slice(0, 6)
                  .map(
                    (l) =>
                      `${l.t > 0 ? clock(l.t).padStart(6) : '     ·'}  ${
                        l.speakerName
                          ? `${theirs.includes(l.speakerName) ? '▸' : ' '} ${l.speakerName}: `
                          : '  '
                      }${l.text.slice(0, 64)}`,
                  )
                  .join('\n')}
                {parsed.lines.length > 6 ? `\n… and ${parsed.lines.length - 6} more` : ''}
              </pre>
            </>
          )}
        </div>

        <div className="foot">
          <span className="note">
            {existing > 0
              ? `Replaces the ${existing} lines already on this round.`
              : 'Nothing is sent anywhere — the transcript is stored in this browser.'}
          </span>
          <button type="button" className="btn-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !parsed || parsed.lines.length === 0}
            onClick={() => void commit()}
          >
            {busy ? 'Working…' : `Add ${parsed?.lines.length ?? 0} lines`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasteTranscript;
