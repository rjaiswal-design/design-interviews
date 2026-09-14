import type { ReactNode } from 'react';

/**
 * A dot and a word in the state's tint, with the real `select` laid invisibly
 * over it.
 *
 * The native control is what makes this accessible and keyboard-operable for
 * free; drawing a listbox by hand is the version that ends up trapping focus.
 * The pill underneath is purely the face.
 */

type TProps<T extends string> = {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  /** Prefix for the state class — `s-scheduled`, `s-yes`, and so on. */
  onChange?: (v: T) => void;
  title?: string;
};

const Pill = <T extends string>({ value, options, labels, onChange, title }: TProps<T>) => {
  const body: ReactNode = (
    <>
      <span className="dot u-circle" />
      {labels[value]}
    </>
  );

  // Read-only is a span, not a disabled select: a disabled control says "you
  // could change this but not now", which is not what a derived value means.
  if (!onChange) {
    return (
      <span className={`pill s-${value}`} title={title}>
        {body}
      </span>
    );
  }

  return (
    <span className={`pill s-${value}`} title={title}>
      {body}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={title}>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o]}
          </option>
        ))}
      </select>
    </span>
  );
};

export default Pill;
