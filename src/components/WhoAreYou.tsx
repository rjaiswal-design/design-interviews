import { useEffect, useRef, useState } from 'react';
import { looksLikeEmail, me, setMe } from '../lib/me';
import { Close } from './Icons';

/**
 * Who is using this browser — asked once, on first run.
 *
 * It exists because of the activity log. Every line of that log names the
 * person who made the change, and a log full of "Someone shortlisted this
 * candidate" is a log nobody can act on: the whole value of "Soumya called it
 * yes, three weeks ago" is the name on the front.
 *
 * The email is asked for alongside the name and is not decoration. A name is
 * what a line reads as, but names collide and change; the address is the stable
 * key that will map onto a real account when this gets a backend with auth. A
 * log written today stays attributable then.
 *
 * It is honest about what it is: there is nothing verifying any of this, and
 * saying so is better than implying an identity check that does not exist.
 */

type TProps = {
  /** First run has no cancel — the log has nothing to attribute to until this
   *  is answered. Editing later does. */
  firstRun: boolean;
  onDone: () => void;
  onCancel?: () => void;
};

const WhoAreYou = ({ firstRun, onDone, onCancel }: TProps) => {
  const current = me();
  const [name, setName] = useState(current.name);
  const [email, setEmail] = useState(current.email);
  const [tried, setTried] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  const nameOk = name.trim().length > 1;
  const emailOk = looksLikeEmail(email);
  const ok = nameOk && emailOk;

  const save = () => {
    setTried(true);
    if (!ok) return;
    setMe({ name, email });
    onDone();
  };

  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        // Click-away only once they are known. On first run there is nowhere to
        // click away to that would not leave the log unattributable.
        if (!firstRun && onCancel && e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Who are you"
        style={{ width: 'min(460px, 100%)' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape' && !firstRun) onCancel?.();
        }}
      >
        <header>
          <div>
            <p className="eyebrow">Before you start</p>
            <h2>{firstRun ? 'Who are you?' : 'Your details'}</h2>
          </div>
          {!firstRun && onCancel && (
            <button type="button" className="side-sheet-close" onClick={onCancel} title="Close">
              <Close />
            </button>
          )}
        </header>

        <div className="body">
          <p>
            Every change here is recorded with the name of whoever made it — who scheduled a
            round, who made the call, who linked the recording. That log is most of why this tool
            exists, so it needs to know who you are.
          </p>

          <label className="lbl">
            Your name
            <input
              ref={first}
              className="field"
              placeholder="Rahul Jaiswal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>

          <label className="lbl">
            Your email
            <input
              className="field"
              type="email"
              placeholder="you@noon.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          {tried && !nameOk && <p className="notice" style={{ margin: 0 }}>A name, please.</p>}
          {tried && nameOk && !emailOk && (
            <p className="notice" style={{ margin: 0 }}>
              That does not look like an email address.
            </p>
          )}
        </div>

        <div className="foot">
          <span className="note">
            Kept in this browser and never sent anywhere. Nothing verifies it — it is how the log
            attributes changes, not a sign-in.
          </span>
          <button type="button" className="btn" onClick={save} disabled={tried && !ok}>
            {firstRun ? 'Start' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhoAreYou;
