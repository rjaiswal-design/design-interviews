import { relative, when } from '../lib/format';
import { rung } from '../lib/ladder';
import type { TEvent, TRound } from '../types';

/**
 * The trail: what happened to this candidate, newest first.
 *
 * Drawn as a connected list rather than a table because it is a sequence, and
 * the connecting rule is what says so. The rule is drawn by the entry above
 * it, so the last one has no tail hanging off the end of the list.
 *
 * Every line names the person who did it. That is most of the value — "called
 * it: yes" is a fact, and "Soumya called it: yes, three weeks ago" is the thing
 * somebody actually needs when they are deciding whether to trust a hire.
 */

type TProps = {
  events: TEvent[];
  /** For labelling which round a line belongs to. */
  rounds: TRound[];
  /** When set, clicking a line about a round opens it. */
  onPickRound?: (roundId: string) => void;
};

const ActivityLog = ({ events, rounds, onPickRound }: TProps) => {
  if (events.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--prism-text-tertiary)' }}>
        Nothing has happened yet. Scheduling a round, making a call or recording an interview all
        land here.
      </p>
    );
  }

  return (
    <ol className="trail">
      {events.map((e) => {
        const r = e.roundId ? rounds.find((x) => x.id === e.roundId) : undefined;
        return (
          <li key={e.id}>
            <span className="node u-circle" />
            <div className="body">
              <p className="what">
                {r && onPickRound ? (
                  <button type="button" className="trail-link" onClick={() => onPickRound(r.id)}>
                    {e.what}
                  </button>
                ) : (
                  e.what
                )}
              </p>
              <p className="when">
                {e.actor} · {relative(e.t)}
                {r ? ` · R${rung(r.kind).no}` : ''}
                <span className="exact"> · {when(e.t)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default ActivityLog;
