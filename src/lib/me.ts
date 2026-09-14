/**
 * Who is using this browser.
 *
 * The activity log is worth much less if every line says "Someone", and there
 * is no authproxy in front of this the way there is in front of Inspect — so
 * the person identifies themselves once, on first run, and it is kept in
 * `localStorage`.
 *
 * The email is not decoration. A name is what a log line reads as, but names
 * collide and change; the email is the stable key that will map onto a real
 * account when this gets a backend and actual auth. Recording it now means the
 * log written today is still attributable then.
 *
 * This is the seam identity arrives through. One module to replace, and the log
 * stops being able to lie about who did something. Until then it is an honest
 * convenience rather than a claim, which is why the dialog says so.
 */

const NAME = 'design-interviews.me';
const EMAIL = 'design-interviews.me.email';

export type TMe = {
  name: string;
  email: string;
};

export const me = (): TMe => ({
  name: localStorage.getItem(NAME) ?? '',
  email: localStorage.getItem(EMAIL) ?? '',
});

/** Whether anyone has said who they are. Gates the first-run dialog. */
export const known = (): boolean => me().name.trim() !== '';

export const setMe = ({ name, email }: TMe) => {
  const n = name.trim();
  const e = email.trim();
  if (n) localStorage.setItem(NAME, n);
  else localStorage.removeItem(NAME);
  if (e) localStorage.setItem(EMAIL, e);
  else localStorage.removeItem(EMAIL);
};

/** For the log, where a blank name has to read as something. */
export const actor = (): string => me().name || 'Someone';

export const actorEmail = (): string => me().email;

/**
 * Good enough to catch a typo, and no stricter.
 *
 * Validating email properly is famously not worth attempting — the RFC permits
 * quoted strings and comments — and the cost of a false negative here is
 * telling somebody their own address is wrong. One `@`, something either side,
 * and a dot in the domain.
 */
export const looksLikeEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
