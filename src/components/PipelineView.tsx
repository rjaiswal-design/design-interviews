import { useMemo } from 'react';
import { LADDERS, SIGNAL_LABELS, TRACKS, TRACK_LABELS, rung } from '../lib/ladder';
import { go } from '../lib/route';
import { useStore } from '../lib/store';
import { inProcess } from '../lib/candidateStatus';
import type { TRound, TTrack } from '../types';

/**
 * The process itself, with the funnel sitting on it.
 *
 * Two jobs, and it needs both to earn a tab. On its own, the ladder is
 * documentation — the rounds, who runs them, what each is allowed to judge —
 * and documentation of a process belongs where the process is defined, which is
 * `lib/ladder.ts`. What makes this a *pipeline* is the numbers: how many people
 * are sitting at each round right now, and how the calls at that round have
 * gone. That is the question a hiring manager opens a tool to ask, and neither
 * the rounds board nor the candidates list answers it — one is a list of
 * conversations and the other a list of people.
 *
 * Everything here is derived. There is nothing to edit on this screen, which is
 * deliberate: the way to change the process is to change `lib/ladder.ts`, and a
 * pipeline you can edit in place is one that stops matching the rounds anybody
 * already ran.
 */

type TRungStats = {
  waiting: number;
  live: number;
  done: number;
  yes: number;
  no: number;
};

const PipelineView = () => {
  const candidates = useStore((s) => s.candidates);
  const rounds = useStore((s) => s.rounds);

  /** Rounds belonging to somebody actually in the process, indexed by rung.
   *  A scheduled round on a rejected candidate is not pipeline. */
  const stats = useMemo(() => {
    const live = new Set(candidates.filter((c) => inProcess(c.status)).map((c) => c.id));
    const m = new Map<string, TRungStats>();
    const bump = (r: TRound) => {
      if (!live.has(r.candidateId)) return;
      const s = m.get(r.kind) ?? { waiting: 0, live: 0, done: 0, yes: 0, no: 0 };
      if (r.status === 'scheduled') s.waiting += 1;
      if (r.status === 'in_progress') s.live += 1;
      if (r.status === 'complete') {
        s.done += 1;
        if (r.decision === 'yes' || r.decision === 'strong_yes') s.yes += 1;
        if (r.decision === 'no' || r.decision === 'strong_no') s.no += 1;
      }
      m.set(r.kind, s);
    };
    for (const r of rounds) bump(r);
    return m;
  }, [candidates, rounds]);

  const perTrack = useMemo(() => {
    const m = new Map<TTrack, number>();
    for (const c of candidates) {
      if (!inProcess(c.status)) continue;
      m.set(c.track, (m.get(c.track) ?? 0) + 1);
    }
    return m;
  }, [candidates]);

  /** Rounds still off any ladder, so a retired round is not silently invisible
   *  on the one screen that claims to show the whole process. */
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
        {TRACKS.map((track) => (
          <section className="track-block" key={track}>
            <header className="track-head">
              <h2>{TRACK_LABELS[track]}</h2>
              <span className="track-count">
                {LADDERS[track].length} rounds · {perTrack.get(track) ?? 0} in the pipeline
              </span>
            </header>

            <div className="rungs">
              {LADDERS[track].map((r) => {
                const s = stats.get(r.kind);
                return (
                  <article className="rung-card" key={r.kind}>
                    <div className="rung-card-head">
                      <span className="no">{r.no}</span>
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

                    {/* The numbers that make this a pipeline rather than a
                        description of one. Zeroes are drawn quiet rather than
                        hidden: "nobody is waiting on the AI round" is a fact,
                        and a missing row reads as a broken query. */}
                    <dl className="rung-stats">
                      <div className={s?.waiting ? '' : 'nil'}>
                        <dt>Waiting</dt>
                        <dd>{s?.waiting ?? 0}</dd>
                      </div>
                      <div className={s?.live ? 'now' : 'nil'}>
                        <dt>Now</dt>
                        <dd>{s?.live ?? 0}</dd>
                      </div>
                      <div className={s?.done ? '' : 'nil'}>
                        <dt>Done</dt>
                        <dd>{s?.done ?? 0}</dd>
                      </div>
                      <div className={s?.done ? '' : 'nil'}>
                        <dt>Yes / no</dt>
                        <dd>
                          {s?.yes ?? 0} / {s?.no ?? 0}
                        </dd>
                      </div>
                    </dl>

                    <details className="script">
                      <summary>The script · {r.prompts.length}</summary>
                      <ul>
                        {r.prompts.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        {retired.length > 0 && (
          <section className="track-block">
            <header className="track-head">
              <h2>Off the ladder</h2>
              <span className="track-count">
                Rounds run on a rung the process no longer has. Kept because they happened.
              </span>
            </header>
            <div className="rungs">
              {retired.map(([kind, n]) => (
                <article className="rung-card rung-card--retired" key={kind}>
                  <div className="rung-card-head">
                    <span className="no">—</span>
                    <h3>{rung(kind as TRound['kind']).label}</h3>
                  </div>
                  <p className="purpose">
                    {n} round{n === 1 ? '' : 's'} on record. Nothing new is scheduled on it.
                  </p>
                </article>
              ))}
            </div>
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
