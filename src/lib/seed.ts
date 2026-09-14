/**
 * What the tool looks like with something in it.
 *
 * Seeded once, on an empty database, and never again — `hasSeeded` is the flag
 * rather than "are there rows", so clearing the board stays cleared. Real data
 * arrives through the importer; this exists so the first run is a working
 * funnel instead of an empty table with no way to judge whether the filters do
 * anything.
 */

import { newId } from './id';
import { inProcess } from './candidateStatus';
import { DECISION_LABELS, ladderFor } from './ladder';
import type { TCandidate, TDecision, TEvent, TRound, TRoundStatus } from '../types';

const HOUR = 3_600_000;
const DAY = 86_400_000;

type TSketch = {
  name: string;
  role: string;
  level: string;
  location: string;
  source: string;
  phone: string;
  company: string;
  position: string;
  /** How far up the ladder they are, and how each rung went. */
  progress: Array<{ status: TRoundStatus; decision: TDecision; offsetDays: number }>;
  status: TCandidate['status'];
};

const PEOPLE = ['Rahul Jaiswal', 'Ayaneshu Singh', 'Soumya Nair', 'Vaibhav Birla', 'Sitara Menon'];

/** The log records who did something as a name and as an address — see
 *  `TEvent.actorEmail`. Derived rather than listed, so the two cannot drift. */
const mail = (person: string) =>
  `${person.split(' ')[0].toLowerCase()}@noon.com`;

const SKETCHES: TSketch[] = [
  {
    name: 'Noor Al-Hashimi',
    role: 'Product Designer, noonFood',
    level: 'Senior',
    location: 'Dubai',
    source: 'Referral — Ayaneshu',
    phone: '+971 50 412 8837',
    company: 'Careem',
    position: 'Staff Product Designer',
    status: 'shortlisted',
    progress: [
      { status: 'complete', decision: 'strong_yes', offsetDays: -9 },
      { status: 'complete', decision: 'yes', offsetDays: -4 },
      { status: 'complete', decision: 'yes', offsetDays: -1 },
      { status: 'scheduled', decision: 'pending', offsetDays: 1 },
    ],
  },
  {
    name: 'Tanvi Rao',
    role: 'Design Systems, Platform',
    level: 'IC4',
    location: 'Bengaluru',
    source: 'Inbound',
    phone: '+91 98455 22106',
    company: 'Razorpay',
    position: 'Design Systems Lead',
    status: 'shortlisted',
    progress: [
      { status: 'complete', decision: 'yes', offsetDays: -6 },
      { status: 'complete', decision: 'yes', offsetDays: -2 },
      { status: 'scheduled', decision: 'pending', offsetDays: 0.2 },
      { status: 'scheduled', decision: 'pending', offsetDays: 2 },
    ],
  },
  {
    name: 'Omar Fahmy',
    role: 'Product Designer, Marketplace',
    level: 'IC3',
    location: 'Cairo',
    source: 'Sourced — LinkedIn',
    phone: '+20 100 774 5512',
    company: 'Instabug',
    position: 'Product Designer',
    status: 'shortlisted',
    progress: [
      { status: 'complete', decision: 'yes', offsetDays: -3 },
      { status: 'in_progress', decision: 'pending', offsetDays: 0 },
      { status: 'scheduled', decision: 'pending', offsetDays: 4 },
      { status: 'scheduled', decision: 'pending', offsetDays: 6 },
    ],
  },
  {
    name: 'Lina Haddad',
    role: 'Motion & Brand',
    level: 'Senior',
    location: 'Riyadh',
    source: 'Agency — Aquent',
    phone: '+966 55 903 1274',
    company: 'Jahez',
    position: 'Senior Motion Designer',
    status: 'offer_out',
    progress: [
      { status: 'complete', decision: 'strong_yes', offsetDays: -21 },
      { status: 'complete', decision: 'strong_yes', offsetDays: -17 },
      { status: 'complete', decision: 'yes', offsetDays: -14 },
      { status: 'complete', decision: 'strong_yes', offsetDays: -12 },
    ],
  },
  {
    name: 'Karan Desai',
    role: 'Product Designer, Minutes',
    level: 'IC3',
    location: 'Dubai',
    source: 'Inbound',
    phone: '+971 52 661 0490',
    company: 'Talabat',
    position: 'Product Designer',
    status: 'rejected',
    progress: [
      { status: 'complete', decision: 'yes', offsetDays: -15 },
      { status: 'complete', decision: 'no', offsetDays: -11 },
      { status: 'cancelled', decision: 'pending', offsetDays: -8 },
      { status: 'cancelled', decision: 'pending', offsetDays: -6 },
    ],
  },
  {
    name: 'Aisha Rahman',
    role: 'Product Designer, Growth',
    level: 'IC4',
    location: 'Dubai',
    source: 'Referral — Soumya',
    phone: '+971 56 338 7741',
    company: 'Property Finder',
    position: 'Senior Product Designer',
    status: 'shortlisted',
    progress: [{ status: 'scheduled', decision: 'pending', offsetDays: 0.5 }],
  },
  // Not shortlisted, so no rounds — the state the board exists to keep off the
  // rounds sheet, and worth being visible on a first run.
  {
    name: 'Dana Khalil',
    role: 'Product Designer, Growth',
    level: 'IC3',
    location: 'Amman',
    source: 'Inbound',
    phone: '+962 79 551 2208',
    company: 'Tamatem',
    position: 'Product Designer',
    status: 'pending',
    progress: [],
  },
  {
    name: 'Ravi Shankar',
    role: 'Design Systems, Platform',
    level: 'IC4',
    location: 'Bengaluru',
    source: 'Sourced — LinkedIn',
    phone: '+91 99012 44871',
    company: 'Zepto',
    position: 'Senior Product Designer',
    status: 'pending',
    progress: [],
  },
];

/** A plausible spread of scores for a decision, so the scorecards are not all
 *  4s. Only the rung's own signals get filled — see `ladder.ts`. */
const scoresFor = (decision: TDecision, signals: string[]): Record<string, number> => {
  const base =
    decision === 'strong_yes' ? 4 : decision === 'yes' ? 3 : decision === 'no' ? 2 : decision === 'strong_no' ? 1 : 0;
  if (base === 0) return {};
  const out: Record<string, number> = {};
  signals.forEach((s, i) => {
    // Nudge one signal off the base so a card reads as judgement rather than
    // as a slider that moved together.
    out[s] = Math.min(4, Math.max(1, base + (i === 1 ? -1 : 0)));
  });
  return out;
};

export const buildSeed = (): {
  candidates: TCandidate[];
  rounds: TRound[];
  events: TEvent[];
} => {
  const now = Date.now();
  const candidates: TCandidate[] = [];
  const rounds: TRound[] = [];
  /** A trail, so the activity column is not empty on first run — an empty log
   *  makes it impossible to tell a working feature from a broken one. */
  const events: TEvent[] = [];

  SKETCHES.forEach((sk, i) => {
    const id = newId('cand');
    candidates.push({
      id,
      ref: 101 + i,
      name: sk.name,
      role: sk.role,
      level: sk.level,
      location: sk.location,
      portfolio: `https://${sk.name.split(' ')[0].toLowerCase()}.design`,
      email: `${sk.name.split(' ')[0].toLowerCase()}@example.com`,
      phone: sk.phone,
      previousCompany: sk.company,
      previousPosition: sk.position,
      source: sk.source,
      status: sk.status,
      notes: '',
      createdAt: now - (30 - i) * DAY,
      updatedAt: now,
    });

    // No rounds for someone nobody has shortlisted. For everyone else: the
    // whole ladder, not just the rungs that have happened — a candidate one
    // round in still owes the other three, and a track that draws only what is
    // booked cannot show what is outstanding.
    if (!inProcess(sk.status)) return;

    ladderFor().forEach((r, j) => {
      const step = sk.progress[j];
      const roundId = newId('round');
      rounds.push({
        id: roundId,
        candidateId: id,
        kind: r.kind,
        interviewers: step ? [PEOPLE[(i + j) % PEOPLE.length]] : [],
        scheduledAt: step ? now + step.offsetDays * DAY + (j % 3) * HOUR : 0,
        durationMin: r.durationMin,
        status: step?.status ?? 'scheduled',
        decision: step?.decision ?? 'pending',
        scores: step ? scoresFor(step.decision, r.signals) : {},
        notes: '',
        // A link on the rounds that are booked, so the Join button is testable
        // without setting one by hand. A fake meeting id, deliberately.
        zoomUrl: step ? `https://zoom.us/j/${9200000000 + i * 1000 + j}` : '',
        recordingUrl: '',
        lineCount: 0,
        createdAt: now - 30 * DAY,
        updatedAt: now,
      });

      if (!step) return;

      const at = now + step.offsetDays * DAY;
      const who = PEOPLE[(i + j) % PEOPLE.length];

      // An event records something that *happened*, so its `t` is always in the
      // past — booking a round two days before it runs is a past act even when
      // the round itself is next week. Deriving this from `at` alone stamped
      // every upcoming round's "scheduled" line in the future, which sorted
      // them above things that had actually occurred.
      events.push({
        id: newId('ev'),
        candidateId: id,
        roundId,
        t: Math.min(at - 2 * DAY, now - (6 * HOUR + i * HOUR + j * 17 * 60_000)),
        actor: PEOPLE[i % PEOPLE.length],
        actorEmail: mail(PEOPLE[i % PEOPLE.length]),
        what: `${r.label} scheduled`,
      });
      if (step.status === 'complete') {
        events.push({
          id: newId('ev'),
          candidateId: id,
          roundId,
          t: at + r.durationMin * 60_000,
          actor: who,
          actorEmail: mail(who),
          what: `Called it on ${r.label.toLowerCase()}: ${DECISION_LABELS[
            step.decision
          ].toLowerCase()}`,
        });
      }
      if (step.status === 'cancelled') {
        events.push({
          id: newId('ev'),
          candidateId: id,
          roundId,
          t: at,
          actor: who,
          actorEmail: mail(who),
          what: `${r.label} cancelled`,
        });
      }
    });

    events.push({
      id: newId('ev'),
      candidateId: id,
      roundId: '',
      t: now - (30 - i) * DAY,
      actor: PEOPLE[i % PEOPLE.length],
      actorEmail: mail(PEOPLE[i % PEOPLE.length]),
      what: 'Added to the funnel',
    });

    if (sk.status === 'offer_out') {
      events.push({
        id: newId('ev'),
        candidateId: id,
        roundId: '',
        t: now - 6 * DAY,
        actor: PEOPLE[0],
        actorEmail: mail(PEOPLE[0]),
        what: 'Offer rolled out',
      });
    }
    if (sk.status === 'rejected') {
      events.push({
        id: newId('ev'),
        candidateId: id,
        roundId: '',
        t: now - 9 * DAY,
        actor: PEOPLE[0],
        actorEmail: mail(PEOPLE[0]),
        what: 'Rejected',
      });
    }
  });

  return { candidates, rounds, events };
};
