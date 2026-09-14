/**
 * Turning a pasted meeting transcript into lines.
 *
 * This replaces recording and transcribing the call ourselves, and it is better
 * on every axis that matters: Zoom, Meet and Teams all produce a transcript
 * with real diarisation, from the meeting's own audio, with no microphone
 * permission, no browser speech recogniser that stops after a silence, and no
 * multi-megabyte blob to store. The interviewer pastes it in afterwards.
 *
 * Four shapes are understood, because the four tools disagree:
 *
 *   WEBVTT              Zoom's .vtt and Teams' export
 *     00:00:12.340 --> 00:00:15.010
 *     Omar Fahmy: The funnel had four steps…
 *
 *   Timestamped lines   Zoom's .txt, Meet's doc
 *     00:12:34 Omar Fahmy: The funnel had four steps…
 *     12:34 Omar Fahmy: …
 *
 *   Named lines         most copy-pastes out of a doc
 *     Omar Fahmy: The funnel had four steps…
 *
 *   Prose               someone's own notes, pasted
 *     The funnel had four steps…
 *
 * Nothing is rejected. A paste we cannot read the structure of still becomes
 * lines, because a transcript with no speakers is worth much more than an
 * error message — and the alternative is someone deciding not to bother.
 */

import { newId } from './id';
import type { TSegment, TSpeaker } from '../types';

export type TParsed = {
  /** Ready to write, minus the ids that depend on the round. */
  lines: { t: number; speaker: TSpeaker; speakerName: string; text: string }[];
  /** Distinct names the transcript used, in the order they first spoke. Shown
   *  so the interviewer can say which of them is the candidate. */
  speakers: string[];
  /** Which shape it matched, for the preview to say out loud. */
  format: 'vtt' | 'timestamped' | 'named' | 'prose';
  /** True when at least one line carried a real timestamp. */
  timed: boolean;
};

/** `00:12:34.560`, `00:12:34`, `12:34` → ms. */
const toMs = (stamp: string): number => {
  const [clock, frac = '0'] = stamp.split(/[.,]/);
  const parts = clock.split(':').map((n) => Number.parseInt(n, 10));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  // Two parts is mm:ss, three is hh:mm:ss. A transcript's first stamp is
  // usually 00:00, so guessing wrong shifts the whole thing by an hour.
  const [h, m, sec] = parts.length === 3 ? parts : [0, parts[0] ?? 0, parts[1] ?? 0];
  return ((h * 60 + m) * 60 + sec) * 1000 + Math.round(Number(`0.${frac}`) * 1000);
};

const CUE = /^(\d{1,2}:\d{2}(?::\d{2})?[.,]?\d*)\s*-->\s*\d/;
const LEADING_STAMP = /^\[?(\d{1,2}:\d{2}(?::\d{2})?[.,]?\d*)\]?\s+(.*)$/;
/** `Name: text`. Bounded so a sentence containing a colon is not read as a
 *  speaker — "The problem: nobody owned it" is one line, not a person. */
const NAMED = /^([^:]{1,48}?):\s+(.+)$/;

const cleanName = (raw: string): string =>
  raw
    .replace(/\s*\(.*?\)\s*$/, '') // "Omar Fahmy (Guest)"
    .replace(/\s*\[.*?\]\s*$/, '')
    .trim();

export const parseTranscript = (text: string): TParsed => {
  const raw = text.replace(/\r\n?/g, '\n').trim();
  const isVtt = /^WEBVTT/i.test(raw) || CUE.test(raw.split('\n')[1] ?? '');

  const lines: TParsed['lines'] = [];
  const seen: string[] = [];
  let timed = false;

  /** The stamp carried forward from a VTT cue header onto the text under it. */
  let pending = 0;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^WEBVTT/i.test(line)) continue;
    // A bare integer between cues is VTT's cue number, not a line of speech.
    if (isVtt && /^\d+$/.test(line)) continue;

    const cue = line.match(CUE);
    if (cue) {
      pending = toMs(cue[1]);
      timed = true;
      continue;
    }

    let t = pending;
    pending = 0;

    let body = line;
    const stamped = body.match(LEADING_STAMP);
    if (stamped) {
      t = toMs(stamped[1]);
      body = stamped[2];
      timed = true;
    }

    let speakerName = '';
    const named = body.match(NAMED);
    if (named) {
      const candidate = cleanName(named[1]);
      // A "name" with sentence punctuation in it is a sentence.
      if (candidate && !/[.!?]$/.test(candidate) && candidate.split(/\s+/).length <= 5) {
        speakerName = candidate;
        body = named[2].trim();
      }
    }

    if (!body) continue;
    if (speakerName && !seen.includes(speakerName)) seen.push(speakerName);

    lines.push({ t, speaker: 'unknown', speakerName, text: body });
  }

  const format: TParsed['format'] = isVtt
    ? 'vtt'
    : timed
      ? 'timestamped'
      : seen.length > 0
        ? 'named'
        : 'prose';

  return { lines, speakers: seen, format, timed };
};

/**
 * Attach the parsed lines to a round, resolving names to sides.
 *
 * `candidateNames` is the subset of `speakers` the interviewer marked as the
 * candidate. Everyone else is an interviewer — which is the right default on a
 * hiring call, where a name we do not recognise is far more likely to be a
 * second interviewer than a second candidate.
 */
export const toSegments = (
  parsed: TParsed,
  roundId: string,
  candidateNames: string[],
): TSegment[] => {
  const isCandidate = new Set(candidateNames.map((n) => n.toLowerCase()));
  return parsed.lines.map((l) => {
    const speaker: TSpeaker = !l.speakerName
      ? 'unknown'
      : isCandidate.has(l.speakerName.toLowerCase())
        ? 'candidate'
        : 'interviewer';
    return {
      id: newId('seg'),
      roundId,
      t: l.t,
      speaker,
      speakerName: l.speakerName,
      text: l.text,
      starred: false,
      manual: false,
    };
  });
};

/**
 * Which of the named speakers is most likely the candidate.
 *
 * Whoever talked most. In a good interview the candidate speaks for the
 * majority of it, which makes this a better guess than name matching — the
 * transcript spells people however their meeting account is set up, and the
 * candidate's row here was typed by a recruiter.
 */
export const guessCandidate = (parsed: TParsed): string | undefined => {
  const words = new Map<string, number>();
  for (const l of parsed.lines) {
    if (!l.speakerName) continue;
    words.set(l.speakerName, (words.get(l.speakerName) ?? 0) + l.text.split(/\s+/).length);
  }
  let best: string | undefined;
  let most = 0;
  for (const [name, n] of words) {
    if (n > most) {
      most = n;
      best = name;
    }
  }
  return best;
};
