import { isRetired, rung, rungClass } from '../lib/ladder';
import type { TRound } from '../types';

/**
 * One candidate's ladder, as a row of segments.
 *
 * The fill is the call, not the status: a complete round with a no on it is
 * amber and a cancelled one is grey, because what the eye is looking for when
 * it scans this is "how is this going", and status alone cannot answer that —
 * four green "complete" bars would look identical whether they were four yeses
 * or four nos.
 */

type TProps = {
  /** In ladder order, one per rung the candidate walks. */
  rounds: TRound[];
  onPick?: (roundId: string) => void;
};

/**
 * The track is the *current* ladder, so rounds run on a retired rung are left
 * out of it. They are still shown — as their own cards below, marked retired —
 * but a fifth segment on a four-rung track makes the shape of the process
 * unreadable, which is the only thing the track is for.
 */
const onLadder = (rounds: TRound[]) => rounds.filter((r) => !isRetired(r.kind));

const LadderTrack = ({ rounds, onPick }: TProps) => (
  <div className="track">
    {onLadder(rounds).map((r) => (
      <button
        key={r.id}
        type="button"
        className={`rung ${rungClass(r)}`}
        onClick={onPick ? () => onPick(r.id) : undefined}
        // Not a button when there is nothing to press: a control that does
        // nothing on click still takes a tab stop.
        tabIndex={onPick ? 0 : -1}
        title={rung(r.kind).label}
      >
        <span className="bar" />
        <span className="lb">{rung(r.kind).label}</span>
      </button>
    ))}
  </div>
);

/**
 * The same thing at row height.
 *
 * Interactive, unlike the decoration it replaced: each segment is a button that
 * opens its round. On the rounds board that is what makes it worth the column —
 * the row you are looking at is one round of four, and the ladder both says
 * where that round sits and gets you to any of the others. `activeId` marks the
 * round the row is about, so the graphic is oriented rather than just present.
 *
 * Labelled per segment rather than `aria-hidden`: it is the only control in the
 * cell now, and a screen reader that skips it cannot navigate the board.
 */
export const LadderMini = ({
  rounds,
  activeId,
  onPick,
}: {
  rounds: TRound[];
  activeId?: string;
  onPick?: (roundId: string) => void;
}) => (
  <span className="track-mini">
    {onLadder(rounds).map((r) => {
      const label = `${rung(r.kind).no}. ${rung(r.kind).label}`;
      if (!onPick) return <i key={r.id} className={rungClass(r)} title={label} />;
      return (
        <button
          key={r.id}
          type="button"
          className={`${rungClass(r)}${r.id === activeId ? ' here' : ''}`}
          title={label}
          aria-label={label}
          aria-current={r.id === activeId ? 'true' : undefined}
          onClick={() => onPick(r.id)}
        />
      );
    })}
  </span>
);

export default LadderTrack;
