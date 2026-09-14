import { useEffect, useRef, useState } from 'react';
import { Caret, Tick } from './Icons';

/**
 * One filter. Closed it states its own value, so the bar reads as a sentence
 * about what is on screen rather than as a row of dropdowns.
 *
 * `--` is the everything case and is drawn as the key alone: "Rung" with no
 * value means every rung, which is shorter to read than "Rung: All".
 */

type TProps = {
  label: string;
  value: string;
  options: { value: string; label: string; n?: number }[];
  onChange: (v: string) => void;
};

const FilterChip = ({ label, value, options, onChange }: TProps) => {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const active = value !== '';
  const current = options.find((o) => o.value === value);

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        type="button"
        className="chip"
        data-open={open}
        data-active={active}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="k">{label}</span>
        {active && <span className="v">{current?.label ?? value}</span>}
        <span className="caret">
          <Caret />
        </span>
      </button>

      {open && (
        <div className="popover" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!active}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            <span className="tick">{!active && <Tick />}</span>
            Any
          </button>
          <div className="sep" />
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="tick">{value === o.value && <Tick />}</span>
              {o.label}
              {o.n !== undefined && <span className="n">{o.n}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FilterChip;
