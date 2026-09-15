/**
 * Populating the board from whatever the database gave you.
 *
 * One row per candidate, and the ladder is generated from their level rather
 * than spelled out in the file — four rungs, or five above IC4. That is the
 * whole reason this is an importer and not a paste: the export has people in
 * it, and what the tool needs is people *and* the rounds they are going to
 * walk, scheduled or not.
 *
 * Column names are matched loosely, because no two exports agree on them. A
 * header of `Candidate Name`, `candidate_name` or `name` all land on `name`;
 * anything unrecognised is reported back rather than dropped silently, so a
 * column you meant to bring across does not just fail to appear.
 */

import { inProcess } from './candidateStatus';
import { newId } from './id';
import { ladderFor } from './ladder';
import { parseCsv } from './csv';
import type { TCandidate, TCandidateStatus, TRound, TTrack } from '../types';

/** field -> the header spellings that mean it, normalised. */
const FIELDS: Record<string, string[]> = {
  name: ['name', 'candidate', 'candidatename', 'fullname'],
  /** The opening, not the candidate's own title — those are different columns
   *  now, and an export that says "Job Title" almost always means theirs. */
  role: [
    'role',
    'applyingfor',
    'appliedfor',
    'req',
    'requisition',
    'opening',
    'vacancy',
    'position',
  ],
  location: ['location', 'city', 'market', 'base'],
  email: ['email', 'mail', 'emailaddress'],
  phone: ['phone', 'mobile', 'tel', 'telephone', 'phonenumber', 'contactnumber', 'number'],
  previousCompany: [
    'company',
    'currentcompany',
    'previouscompany',
    'employer',
    'currentemployer',
    'organisation',
    'organization',
    'org',
  ],
  /** Which ladder they walk. A column, because an export from a hiring pipeline
   *  knows whether it is filling a product or a visual opening. */
  track: ['track', 'discipline', 'ladder', 'pipeline', 'team', 'craft'],
  previousPosition: [
    'theirtitle',
    'currenttitle',
    'currentrole',
    'currentposition',
    'previoustitle',
    'previousrole',
    'previousposition',
    'jobtitle',
    'title',
    'designation',
  ],
  portfolio: ['portfolio', 'website', 'site', 'url', 'link'],
  linkedin: ['linkedin', 'linkedinurl', 'linkedinprofile', 'li', 'profile'],
  source: ['source', 'channel', 'via', 'referrer', 'referral'],
  status: ['status', 'stage', 'state'],
  ref: ['ref', 'id', 'candidateid', 'applicationid', 'no'],
  /** Optional: when the first round is. The rest are left unscheduled. */
  scheduledAt: ['scheduledat', 'date', 'firstround', 'interviewdate', 'when', 'starts'],
  interviewer: ['interviewer', 'interviewers', 'panel', 'owner', 'assignedto'],
  notes: ['notes', 'note', 'comment', 'comments'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * An ATS stage, read as one of ours.
 *
 * Longest patterns first: "offer declined" has to be tested before "offer", or
 * a dropped offer imports as one that is still open. The default is `pending`
 * rather than `shortlisted` — an import is a pile of CVs, and assuming somebody
 * has already decided to interview all of them would create the four hundred
 * rounds this state exists to prevent.
 */
const STATUS_PATTERNS: [RegExp, TCandidateStatus][] = [
  [/offerdrop|offerdeclin|offerreject|offerlost|declinedoffer/, 'offer_dropped'],
  [/hired|joined|accepted|offeraccept/, 'hired'],
  [/offer|rollout/, 'offer_out'],
  [/reject|nohire|declin|passed|unsuccessful/, 'rejected'],
  [/shortlist|active|inprocess|interview|onsite|screen/, 'shortlisted'],
  [/withdrew|withdrawn|dropped/, 'offer_dropped'],
  [/pending|new|applied|tosource|sourced|yettobe/, 'pending'],
];

const readStatus = (raw: string): TCandidateStatus => {
  const v = norm(raw);
  if (!v) return 'pending';
  for (const [pattern, status] of STATUS_PATTERNS) {
    if (pattern.test(v)) return status;
  }
  return 'pending';
};

export type TImportResult = {
  candidates: TCandidate[];
  rounds: TRound[];
  /** Headers we could not place. Shown, not swallowed. */
  ignored: string[];
  /** Rows we could not use, with the reason. */
  skipped: { row: number; why: string }[];
};

export const importRows = (text: string, startRef: number): TImportResult => {
  const rows = parseCsv(text);
  const result: TImportResult = { candidates: [], rounds: [], ignored: [], skipped: [] };
  if (rows.length < 2) {
    result.skipped.push({ row: 0, why: 'No data rows — a header and at least one row are needed.' });
    return result;
  }

  const header = rows[0].map(norm);
  /** field -> column index. */
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const field = Object.keys(FIELDS).find((f) => FIELDS[f].includes(h));
    if (field && map[field] === undefined) map[field] = i;
    else if (!field) result.ignored.push(rows[0][i]);
  });

  if (map.name === undefined) {
    result.skipped.push({ row: 0, why: 'No name column. One of: name, candidate, full name.' });
    return result;
  }

  const now = Date.now();
  let ref = startRef;

  rows.slice(1).forEach((r, i) => {
    const at = (field: string) => (map[field] === undefined ? '' : (r[map[field]] ?? '').trim());
    const name = at('name');
    if (!name) {
      result.skipped.push({ row: i + 2, why: 'Blank name.' });
      return;
    }

    const id = newId('cand');
    const refRaw = Number.parseInt(at('ref'), 10);
    const status = readStatus(at('status'));
    // Product unless the file says otherwise. Read from the track column if
    // there is one, and otherwise guessed from the opening — "Motion Designer"
    // and "Visual Designer" are not walking the product ladder.
    const track: TTrack = /visual|motion|brand|graphic|illustrat/i.test(
      `${at('track')} ${at('role')} ${at('previousPosition')}`,
    )
      ? 'visual'
      : 'product';

    result.candidates.push({
      id,
      ref: Number.isFinite(refRaw) && refRaw > 0 ? refRaw : ref++,
      name,
      role: at('role'),
      location: at('location'),
      portfolio: at('portfolio'),
      linkedin: at('linkedin'),
      email: at('email'),
      phone: at('phone'),
      previousCompany: at('previousCompany'),
      previousPosition: at('previousPosition'),
      source: at('source'),
      status,
      track,
      notes: at('notes'),
      createdAt: now,
      updatedAt: now,
    });

    // `Date.parse` on a spreadsheet date is lenient and sometimes wrong; a value
    // it cannot read leaves the round unscheduled rather than landing it on an
    // invented day.
    const parsed = at('scheduledAt') ? Date.parse(at('scheduledAt')) : Number.NaN;
    const first = Number.isFinite(parsed) ? parsed : 0;
    const panel = at('interviewer')
      ? at('interviewer')
          .split(/[;,/]|\band\b/)
          .map((p) => p.trim())
          .filter(Boolean)
      : [];

    // Rounds only for someone the export says is already in the process. A
    // pile of CVs imports as `pending` and gets no rounds until somebody
    // shortlists them — but an export that carries a stage and an interview
    // date is describing a funnel already under way, and dropping the date
    // would lose something the file told us.
    if (inProcess(status)) {
      ladderFor(track).forEach((rung, j) => {
        result.rounds.push({
          id: newId('round'),
          candidateId: id,
          kind: rung.kind,
          // The file's panel on round one if it named anyone, otherwise the
          // rung's own owner — first name only where the rung is a choice.
          interviewers:
            j === 0 && panel.length > 0
              ? panel
              : rung.either
                ? rung.owners.slice(0, 1)
                : [...rung.owners],
          scheduledAt: j === 0 ? first : 0,
          durationMin: rung.durationMin,
          status: 'scheduled',
          decision: 'pending',
          scores: {},
          notes: '',
          zoomUrl: '',
          recordingUrl: '',
          lineCount: 0,
          createdAt: now,
          updatedAt: now,
        });
      });
    }
  });

  return result;
};

/** The header the importer is happiest with, for the dialog to show. */
export const SAMPLE_CSV = `name,applying for,email,phone,linkedin,company,their title,source,status,scheduled_at,interviewer
Noor Al-Hashimi,"Product Designer, noonFood",Senior,noor@example.com,+971 50 412 8837,Careem,Staff Product Designer,Referral,active,2026-09-16 14:30,Rahul Jaiswal
Tanvi Rao,"Design Systems, Platform",IC4,tanvi@example.com,+91 98455 22106,Razorpay,Design Systems Lead,Inbound,active,2026-09-17 11:00,Soumya Nair`;
