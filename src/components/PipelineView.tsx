import { useMemo } from 'react';
import { LADDERS, SIGNAL_LABELS, TRACKS, TRACK_LABELS, rung } from '../lib/ladder';
import { go } from '../lib/route';
import { useStore } from '../lib/store';
import type { TRound, TTrack } from '../types';

/**
 * The process, drawn as the two pipelines it is.
 *
 * Vertical and numbered, on a rail: a hiring loop is a sequence, and the one
 * thing a reader needs to take from this screen is its shape and order. A grid
 * of cards showed the same rounds and made them look like a set of options.
 *
 * Deliberately no live numbers and no scripts. It carried both and they were
 * the wrong things here — counts belong on the boards, where you can act on
 * the row they describe, and a script is forty lines of prompt that buried the
 * shape this screen exists to show. The scripts live where they are used, on
 * the round itself.
 *
 * Nothing here is editable either. The way to change the process is to change
 * `lib/ladder.ts`; a pipeline you can edit in place is one that stops matching
 * the rounds anybody already ran.
 */

const hours = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const PipelineView = () => {
  const rounds = useStore((s) => s.rounds);

  /** Total candidate time per track — a fact about the process, not a metric
   *  about the funnel. "The product loop is four and a half hours of their
   *  day" is the sort of thing worth knowing before adding a sixth round. */
  const totals = useMemo(() => {
    const m = new Map<TTrack, number>();
    for (const t of TRACKS) {
      m.set(
        t,
        LADDERS[t].reduce((sum, r) => sum + r.durationMin, 0),
      );
    }
    return m;
  }, []);

  /** Rounds still sitting on rungs no ladder has, so a retired round is not
   *  silently invisible on the one screen that claims to show the process. */
  const retired = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rounds) {
      if (!rung(r.kind).retired) continue;
      m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    }
    return [...m];
  }, [rounds]);

  return (
    <div className="sheet-wrap wrap">
      <div className="sheet pipeline">
        <div className="pipes">
          {TRACKS.map((track) => (
            <section className="pipe" key={track}>
              <header className="track-head">
                <h2>{TRACK_LABELS[track]}</h2>
                <span className="track-count">
                  {LADDERS[track].length} rounds · {hours(totals.get(track) ?? 0)} of their time
                </span>
              </header>

              <ol className="flow">
                {LADDERS[track].map((r) => (
                  <li className="step" key={r.kind}>
                    <span className="node u-circle">{r.no}</span>
                    <div className="step-body">
                      <div className="step-head">
                        <h3>{r.label}</h3>
                        <span className="mins">{r.durationMin}m</span>
                      </div>

                      <p className="who-runs">
                        {r.owners.length > 0 ? (
                          r.owners.map((o, i) => (
                            <span key={o}>
                              {i > 0 && <span className="or"> / </span>}
                              <span className="owner">{o}</span>
                            </span>
                          ))
                        ) : (
                          <span className="unassigned">Nobody assigned</span>
                        )}
                      </p>

                      <p className="purpose">{r.purpose}</p>

                      <div className="signals">
                        {r.signals.map((sig) => (
                          <span className="sig-tag" key={sig}>
                            {SIGNAL_LABELS[sig]}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        {retired.length > 0 && (
          <section className="pipe pipe--retired">
            <header className="track-head">
              <h2>Off the ladder</h2>
              <span className="track-count">
                Run on rungs the process no longer has. Kept because they happened.
              </span>
            </header>
            <ol className="flow">
              {retired.map(([kind, n]) => (
                <li className="step step--retired" key={kind}>
                  <span className="node u-circle">—</span>
                  <div className="step-body">
                    <div className="step-head">
                      <h3>{rung(kind as TRound['kind']).label}</h3>
                    </div>
                    <p className="purpose">
                      {n} round{n === 1 ? '' : 's'} on record. Nothing new is scheduled on it.
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="pipeline-foot">
          This is what the tool runs on, not a description of it — the rounds, their owners and
          their scripts all come from <code>src/lib/ladder.ts</code>. Changing that file is how the
          process changes, and every shortlisted candidate is reconciled against it on load.{' '}
          <button type="button" className="trail-link" onClick={() => go({ view: 'rounds' })}>
            See the rounds themselves
          </button>
        </p>
      </div>
    </div>
  );
};

export default PipelineView;
