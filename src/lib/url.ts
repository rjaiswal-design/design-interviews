/**
 * A hand-typed link, made safe to put in an `href`.
 *
 * Both links on a round are pasted by a person, and a paste that is missing its
 * scheme — `zoom.us/j/123`, which is what the browser address bar shows and so
 * what people copy — is a *relative* URL. In an `href` that navigates the app
 * to `/zoom.us/j/123` and the board disappears, which looks like the tool
 * breaking rather than like a typo.
 *
 * So: parse it, and only hand back something that is really an absolute http(s)
 * URL. A bare host gets `https://` put in front of it, because that is what the
 * person meant. Anything else returns null and the caller shows no link rather
 * than a broken one — and `javascript:` and `data:` never come back at all.
 */
export const httpUrl = (raw: string): string | null => {
  const text = raw.trim();
  if (!text) return null;

  const attempt = (candidate: string): string | null => {
    try {
      const u = new URL(candidate);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch {
      return null;
    }
  };

  const asIs = attempt(text);
  if (asIs) return asIs;

  // No scheme. Only worth a second try if it looks like a host — `hello world`
  // is not a URL somebody forgot to finish.
  if (/^[\w-]+(\.[\w-]+)+(\/|$|\?|#|:)/.test(text)) return attempt(`https://${text}`);
  return null;
};
