import { useEffect, useMemo, useState } from 'react';
import { initials } from './lib/format';
import { known, me } from './lib/me';
import { go, useRoute } from './lib/route';
import { useStore } from './lib/store';
import AsciiMesh from './components/AsciiMesh';
import Board from './components/Board';
import CandidatePanel from './components/CandidatePanel';
import ImportDialog from './components/ImportDialog';
import RoundPage from './components/RoundPage';
import TranscriptReader from './components/TranscriptReader';
import WhoAreYou from './components/WhoAreYou';
import { Plus, Upload } from './components/Icons';

/**
 * The shell: the bar, the masthead, the board, and whichever of the three
 * full-surface views the URL is asking for.
 *
 * The room and the transcript are rendered *instead of* the board rather than
 * over it. They are not overlays — an interview is not a detail of a table.
 */

const App = () => {
  const ready = useStore((s) => s.ready);
  const load = useStore((s) => s.load);
  const candidates = useStore((s) => s.candidates);
  const rounds = useStore((s) => s.rounds);
  const events = useStore((s) => s.events);
  const addCandidate = useStore((s) => s.addCandidate);

  const route = useRoute();
  const [importing, setImporting] = useState(false);
  /** Who the log will name. `known()` is false on a first run, which is what
   *  puts the dialog up before anything can be edited unattributed. */
  const [identifying, setIdentifying] = useState(!known());
  const [who, setWho] = useState(me);

  useEffect(() => {
    void load();
  }, [load]);

  /** The four counts above the board. Live rather than snapshot, because the
   *  one that matters — how many conversations are still owed — changes every
   *  time somebody marks a round complete. */
  const facts = useMemo(() => {
    const toShortlist = candidates.filter((c) => c.status === 'pending').length;
    const inRounds = candidates.filter((c) => c.status === 'shortlisted');
    const inRoundsIds = new Set(inRounds.map((c) => c.id));
    const done = rounds.filter((r) => r.status === 'complete').length;
    // Owed only counts rounds belonging to someone still being interviewed.
    // A scheduled round on a rejected candidate is not work anyone owes.
    const owed = rounds.filter(
      (r) => r.status === 'scheduled' && inRoundsIds.has(r.candidateId),
    ).length;
    const transcribed = rounds.filter((r) => r.lineCount > 0).length;
    return [
      { n: toShortlist, k: 'To shortlist' },
      { n: inRounds.length, k: 'In rounds' },
      { n: owed, k: 'Rounds still owed' },
      { n: done, k: 'Rounds done' },
      { n: transcribed, k: 'Transcribed' },
    ];
  }, [candidates, rounds]);

  const mode = route.view === 'people' ? 'people' : 'rounds';

  const roundById = (id: string) => rounds.find((r) => r.id === id);

  if (!ready) {
    return (
      <div className="app">
        <div className="wrap" style={{ paddingTop: 40, color: 'var(--color-muted)' }}>
          Opening the record…
        </div>
      </div>
    );
  }

  // Asked before anything else, on any route. A deep link straight to a round
  // is a perfectly normal first visit — someone was sent one — and an edit made
  // from it would go into the log attributed to nobody.
  if (identifying && !known()) {
    return (
      <WhoAreYou
        firstRun
        onDone={() => {
          setWho(me());
          setIdentifying(false);
        }}
      />
    );
  }

  // The room. Full surface, and it owns the window while it is up.
  if (route.view === 'room') {
    const round = roundById(route.id);
    const candidate = round && candidates.find((c) => c.id === round.candidateId);
    if (round && candidate) {
      return (
        <RoundPage
          round={round}
          candidate={candidate}
          trail={events.filter((e) => e.candidateId === candidate.id)}
          onClose={() => go({ view: 'candidate', id: candidate.id })}
        />
      );
    }
  }

  if (route.view === 'transcript') {
    const round = roundById(route.id);
    const candidate = round && candidates.find((c) => c.id === round.candidateId);
    if (round && candidate) {
      return (
        <TranscriptReader
          round={round}
          candidate={candidate}
          onClose={() => go({ view: 'candidate', id: candidate.id })}
        />
      );
    }
  }

  const panelFor = route.view === 'candidate' ? candidates.find((c) => c.id === route.id) : undefined;

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-in">
          <button type="button" className="brand" onClick={() => go({ view: 'rounds' })}>
            <span className="mark">IV</span>
            Interviews
            <span className="tag">design</span>
          </button>

          <div className="rule-v" />

          <button
            type="button"
            className={`nav-tab${mode === 'rounds' ? ' on' : ''}`}
            onClick={() => go({ view: 'rounds' })}
          >
            Rounds
            {mode === 'rounds' && <span className="underline" />}
          </button>
          <button
            type="button"
            className={`nav-tab${mode === 'people' ? ' on' : ''}`}
            onClick={() => go({ view: 'people' })}
          >
            Candidates
            {mode === 'people' && <span className="underline" />}
          </button>

          <div className="spacer" />

          {/* Who the activity log will name. In the bar rather than buried in a
              settings screen, so the name being wrong is visible to the person
              it is wrong about. */}
          <button
            type="button"
            className="bar-btn"
            onClick={() => setIdentifying(true)}
            title={who.email || 'Set your name and email'}
          >
            <span className="av av--bar u-circle">{initials(who.name) || '?'}</span>
            {who.name || 'Who are you?'}
          </button>

          <button type="button" className="bar-btn" onClick={() => setImporting(true)}>
            <Upload />
            Import
          </button>
          <button
            type="button"
            className="bar-btn"
            onClick={() => void addCandidate().then((id) => go({ view: 'candidate', id }))}
          >
            <Plus />
            Add candidate
          </button>
        </div>
      </div>

      <div className="main">
        {/* `pagehead` nested inside `wrap`, not combined with it. Its negative
            inline margin exists to cancel a *parent's* gutter so the character
            field can bleed to the window edge, and its own padding then puts
            the content back on the gutter. On one element there is no parent
            padding to cancel, so the margin simply dragged the title 24px left
            of everything below it. */}
        <div className="wrap">
          <div className="pagehead">
            <AsciiMesh />
            {/* Title and the four counts, and nothing else. The eyebrow said
                "Design hiring" above a page called The interview record, and
                the paragraph explained the tool to people who use it every day
                — both were read once and then permanently in the way. What the
                masthead is for is the counts. */}
            <div className="pagehead-grid">
              <h1>The interview record</h1>
              <div className="band">
                {facts.map((f) => (
                  <div className="fact" key={f.k}>
                    <div className="n">{f.n}</div>
                    <div className="k">{f.k}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Board mode={mode} />
      </div>

      {panelFor && (
        <CandidatePanel
          candidate={panelFor}
          rounds={rounds.filter((r) => r.candidateId === panelFor.id)}
          onClose={() => go({ view: mode })}
          onEnterRoom={(id) => go({ view: 'room', id })}
          onReadTranscript={(id) => go({ view: 'transcript', id })}
        />
      )}

      {importing && <ImportDialog onClose={() => setImporting(false)} />}

      {identifying && (
        <WhoAreYou
          firstRun={false}
          onDone={() => {
            setWho(me());
            setIdentifying(false);
          }}
          onCancel={() => setIdentifying(false)}
        />
      )}
    </div>
  );
};

export default App;
