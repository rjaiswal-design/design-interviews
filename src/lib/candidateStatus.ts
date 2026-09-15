import type { TCandidateStatus } from '../types';

/**
 * The funnel, in order, with its words in one place.
 *
 * The labels used to be declared twice — once in `Board.tsx` and once in
 * `CandidatePanel.tsx` — which is two copies of the same enum's vocabulary and
 * exactly the sort of thing that drifts the moment a state is renamed.
 */
export const CANDIDATE_STATUSES: TCandidateStatus[] = [
  'pending',
  'shortlisted',
  'offer_out',
  'hired',
  'offer_dropped',
  'rejected',
];

export const CANDIDATE_STATUS_LABELS: Record<TCandidateStatus, string> = {
  pending: 'Yet to be shortlisted',
  shortlisted: 'Shortlisted',
  offer_out: 'Offer rollout',
  hired: 'Hired',
  offer_dropped: 'Offer dropped',
  rejected: 'Rejected',
};

/**
 * Whether this state means the candidate is in the interview process — which
 * is the question that decides whether they have rounds at all.
 *
 * Everything past `shortlisted` counts, including the closed states: somebody
 * who was rejected in round three was in the process, and their rounds are the
 * record of why. Only `pending` is outside it.
 */
export const inProcess = (status: TCandidateStatus): boolean => status !== 'pending';

/**
 * Whether they are still being interviewed — which is a narrower question than
 * `inProcess`, and the one the rounds board asks.
 *
 * `inProcess` decides whether somebody *has* rounds, and it has to stay wide:
 * a candidate rejected in round three was in the process, and their rounds are
 * the record of why. But the rounds board answers "who are we interviewing and
 * where have they got to", and a rejected candidate is not being interviewed.
 * Nor is somebody hired, or somebody whose offer fell through. Their rounds are
 * still on their record and still reachable from the panel; they just are not
 * work anybody owes.
 *
 * `offer_out` counts. Their rounds are finished, so the board reads "All rounds
 * done, waiting on a decision" — which is the one row on it that is asking
 * somebody to act.
 */
export const isLive = (status: TCandidateStatus): boolean =>
  status === 'shortlisted' || status === 'offer_out';

/** What a move to this state reads as in the activity log. */
export const CANDIDATE_STATUS_SENTENCE: Record<TCandidateStatus, string> = {
  pending: 'Put back on the shortlist pile',
  shortlisted: 'Shortlisted',
  offer_out: 'Offer rolled out',
  hired: 'Hired',
  offer_dropped: 'Offer dropped',
  rejected: 'Rejected',
};
