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

/** What a move to this state reads as in the activity log. */
export const CANDIDATE_STATUS_SENTENCE: Record<TCandidateStatus, string> = {
  pending: 'Put back on the shortlist pile',
  shortlisted: 'Shortlisted',
  offer_out: 'Offer rolled out',
  hired: 'Hired',
  offer_dropped: 'Offer dropped',
  rejected: 'Rejected',
};
