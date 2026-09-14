/**
 * The sentences the activity log is made of.
 *
 * Every one of them is derived from the difference between the stored row and
 * the patch, which is the whole design: `patchRound` calls `roundEvents(before,
 * patch)` and writes whatever comes back, so a new edit surface — a cell, a
 * dialog, a keyboard shortcut, the room — records itself for free and cannot
 * forget to log.
 *
 * **Free text is deliberately not logged.** Notes and write-ups change on
 * nearly every keystroke-and-blur, and logging them would produce a diary in
 * which the handful of moments that matter — a call, a reschedule, a panel
 * change — are buried under two hundred "edited the write-up" lines. That the
 * text changed is visible in the text.
 *
 * Sentences are past tense and name the thing, not the field: "Called it: yes",
 * not "decision changed from pending to yes". The log is read by people
 * deciding whether to trust a hire, not by whoever wrote the schema.
 */

import { CANDIDATE_STATUS_SENTENCE } from './candidateStatus';
import { when } from './format';
import { DECISION_LABELS, SCORE_LABELS, SIGNAL_LABELS, STATUS_LABELS, rung } from './ladder';
import type { TCandidate, TRound, TSignal } from '../types';

/** What changed about one round, as sentences. Empty when nothing worth
 *  recording did. */
export const roundEvents = (before: TRound, patch: Partial<TRound>): string[] => {
  const out: string[] = [];
  const name = rung(before.kind).label;

  if (patch.status !== undefined && patch.status !== before.status) {
    // "Marked complete" rather than "status: complete" — and cancelled is the
    // one that reads better as a thing done to the round than to its field.
    out.push(
      patch.status === 'cancelled'
        ? `${name} cancelled`
        : patch.status === 'in_progress'
          ? `${name} started`
          : `${name} marked ${STATUS_LABELS[patch.status].toLowerCase()}`,
    );
  }

  if (patch.decision !== undefined && patch.decision !== before.decision) {
    out.push(
      patch.decision === 'pending'
        ? `Took the call back on ${name.toLowerCase()}`
        : `Called it on ${name.toLowerCase()}: ${DECISION_LABELS[patch.decision].toLowerCase()}`,
    );
  }

  if (patch.scheduledAt !== undefined && patch.scheduledAt !== before.scheduledAt) {
    out.push(
      !patch.scheduledAt
        ? `${name} unscheduled`
        : !before.scheduledAt
          ? `${name} scheduled for ${when(patch.scheduledAt)}`
          : `${name} moved to ${when(patch.scheduledAt)}`,
    );
  }

  if (patch.interviewers !== undefined) {
    const was = before.interviewers;
    const now = patch.interviewers;
    const added = now.filter((p) => !was.includes(p));
    const gone = was.filter((p) => !now.includes(p));
    // One sentence per direction, not per person: swapping two interviewers is
    // one decision and should read as one line.
    if (added.length > 0) out.push(`${added.join(' and ')} on the ${name.toLowerCase()} panel`);
    if (gone.length > 0) out.push(`${gone.join(' and ')} off the ${name.toLowerCase()} panel`);
  }

  if (patch.scores !== undefined) {
    for (const [sig, score] of Object.entries(patch.scores) as [TSignal, number][]) {
      const had = before.scores[sig] ?? 0;
      if ((score ?? 0) === had) continue;
      out.push(
        !score
          ? `${SIGNAL_LABELS[sig]} unscored on ${name.toLowerCase()}`
          : `${SIGNAL_LABELS[sig]}: ${SCORE_LABELS[score as 1 | 2 | 3 | 4].toLowerCase()}`,
      );
    }
  }

  if (patch.zoomUrl !== undefined && patch.zoomUrl.trim() !== before.zoomUrl.trim()) {
    out.push(
      patch.zoomUrl.trim() ? `Meeting link set for ${name.toLowerCase()}` : 'Meeting link cleared',
    );
  }

  if (
    patch.recordingUrl !== undefined &&
    patch.recordingUrl.trim() !== before.recordingUrl.trim()
  ) {
    out.push(
      patch.recordingUrl.trim()
        ? `Recording linked for ${name.toLowerCase()}`
        : 'Recording link cleared',
    );
  }

  // Deliberately silent: notes, and lineCount. The write-up is free text — see
  // the note at the top of this file. The line count is written by the paste
  // flow, which records its own sentence through `note()` because "transcript
  // added — 412 lines" is one event and not four hundred.
  return out;
};

/** What changed about the candidate. */
export const candidateEvents = (
  before: TCandidate,
  patch: Partial<TCandidate>,
): string[] => {
  const out: string[] = [];

  if (patch.status !== undefined && patch.status !== before.status) {
    out.push(CANDIDATE_STATUS_SENTENCE[patch.status]);
  }

  if (patch.level !== undefined && patch.level.trim() !== before.level.trim()) {
    out.push(`Level ${before.level || 'unset'} → ${patch.level || 'unset'}`);
  }

  if (patch.role !== undefined && patch.role.trim() !== before.role.trim() && before.role.trim()) {
    out.push(`Role changed to ${patch.role || 'unset'}`);
  }

  // Name, email, portfolio, location, source, notes: not logged. They are
  // corrections to a record rather than things that happened in a process.
  return out;
};
