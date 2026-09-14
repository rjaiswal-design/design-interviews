import { useMemo, useState } from 'react';
import { SAMPLE_CSV, importRows, type TImportResult } from '../lib/importer';
import { useStore } from '../lib/store';
import { Close, Upload } from './Icons';

/**
 * Populating the board from the database.
 *
 * Drop a file or paste the rows; the parse is previewed before anything is
 * written, because an import that silently half-worked is worse than one that
 * refused. Unrecognised columns and skipped rows are both shown — a column you
 * meant to bring across should not just fail to appear.
 *
 * One row per candidate. The rounds are generated from their level rather than
 * spelled out in the file: four rungs, or five above IC4.
 */

type TProps = {
  onClose: () => void;
};

const ImportDialog = ({ onClose }: TProps) => {
  const importDoc = useStore((s) => s.importDoc);
  const candidates = useStore((s) => s.candidates);
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const nextRef = useMemo(() => Math.max(100, ...candidates.map((c) => c.ref)) + 1, [candidates]);

  /** Parsed on every keystroke. It is a few hundred rows of string splitting —
   *  cheap enough that a debounce would only add a lag to the preview. */
  const parsed: TImportResult | null = useMemo(
    () => (text.trim() ? importRows(text, nextRef) : null),
    [text, nextRef],
  );

  const read = async (file: File) => {
    setBusy(true);
    setText(await file.text());
    setBusy(false);
  };

  const commit = async () => {
    if (!parsed || parsed.candidates.length === 0) return;
    setBusy(true);
    await importDoc(parsed.candidates, parsed.rounds);
    setBusy(false);
    onClose();
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Import candidates">
        <header>
          <div>
            <p className="eyebrow">From the database</p>
            <h2>Import candidates</h2>
          </div>
          <button type="button" className="side-sheet-close" onClick={onClose} title="Close">
            <Close />
          </button>
        </header>

        <div className="body">
          <p>
            One row per candidate. Column names are matched loosely — <code>name</code>,{' '}
            <code>Candidate Name</code> and <code>candidate_name</code> all land in the same place.
            The four rounds are generated for every candidate imported.
          </p>

          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the drop zone is a
              convenience over the paste box below it, which is the keyboard path. */}
          <div
            className={`drop${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void read(file);
            }}
          >
            <Upload />
            <div style={{ marginTop: 8 }}>Drop a CSV here, or paste the rows below</div>
          </div>

          <textarea
            className="paste"
            placeholder={SAMPLE_CSV}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          {parsed && (
            <>
              <p style={{ color: 'var(--color-ink)', fontWeight: 500 }}>
                {parsed.candidates.length} candidate{parsed.candidates.length === 1 ? '' : 's'},{' '}
                {parsed.rounds.length} rounds
              </p>

              {parsed.ignored.length > 0 && (
                <p className="notice calm" style={{ margin: 0 }}>
                  Not imported, because nothing maps to them: {parsed.ignored.join(', ')}
                </p>
              )}

              {parsed.skipped.length > 0 && (
                <p className="notice" style={{ margin: 0 }}>
                  {parsed.skipped.map((s) => `Row ${s.row}: ${s.why}`).join(' ')}
                </p>
              )}

              {parsed.candidates.length > 0 && (
                <pre className="sample">
                  {parsed.candidates
                    .slice(0, 8)
                    .map(
                      (c) =>
                        `#${c.ref}  ${c.name}  ·  ${c.level}  ·  ${c.role || 'no role'}  ·  ${
                          parsed.rounds.filter((r) => r.candidateId === c.id).length
                        } rounds`,
                    )
                    .join('\n')}
                  {parsed.candidates.length > 8 ? `\n… and ${parsed.candidates.length - 8} more` : ''}
                </pre>
              )}
            </>
          )}

          {!parsed && <pre className="sample">{SAMPLE_CSV}</pre>}
        </div>

        <div className="foot">
          <span className="note">
            Imports add to the board; nothing already on it is touched or replaced.
          </span>
          <button type="button" className="btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !parsed || parsed.candidates.length === 0}
            onClick={() => void commit()}
          >
            {busy
              ? 'Working…'
              : `Import ${parsed?.candidates.length ?? 0} candidate${
                  parsed?.candidates.length === 1 ? '' : 's'
                }`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportDialog;
