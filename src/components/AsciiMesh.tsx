import { useEffect, useRef } from 'react';

/**
 * A field of characters, drifting. Carried over from the Sentinel UI.
 *
 * Most cells are blank, the ramp tops out at `+`, and the palette is three
 * pastels — it should read as the page breathing, not as an animation you are
 * being shown.
 *
 * Three text nodes, one per colour, rewritten per frame — not a span per cell.
 * A 130×20 grid is 2,600 cells; as elements that is a React reconciliation
 * twenty times a second, as strings it is three assignments.
 */

const LAYERS = [
  { colour: '#e2ebe5', chars: ' ··' },
  { colour: '#d4e3da', chars: '  :' },
  { colour: '#c6dacd', chars: '   +' },
] as const;

/** Total ramp length across every layer — the scale the field maps onto. */
const STOPS = 6;

/** Up in the corner: the only empty ground is right of the title. */
const MASK = 'radial-gradient(66% 165% at 86% 20%, #000 0%, rgba(0,0,0,0.7) 48%, transparent 84%)';

const AsciiMesh = () => {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const layers = Array.from(el.querySelectorAll('pre'));
    if (layers.length === 0) return;

    let cols = 0;
    let rows = 0;
    let raf = 0;
    let last = 0;
    const start = performance.now();

    /** Cell size, measured rather than assumed — it changes with the font, and a
     *  guess shows up as a grid that does not fill the box. */
    const measure = () => {
      const first = layers[0];
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      const cs = getComputedStyle(first);
      probe.style.font = cs.font;
      probe.style.letterSpacing = cs.letterSpacing;
      probe.textContent = '0'.repeat(50);
      first.appendChild(probe);
      const cw = probe.getBoundingClientRect().width / 50;
      probe.remove();
      const lh = Number.parseFloat(cs.lineHeight) || 14;
      cols = Math.max(1, Math.ceil(first.clientWidth / (cw || 7)) + 2);
      rows = Math.max(1, Math.ceil(first.clientHeight / lh) + 1);
    };

    /**
     * Two waves crossing, plus a slow diagonal drift. The product of a
     * horizontal and a vertical wave is what makes it a mesh rather than
     * stripes; the third term keeps the lattice from being perfectly periodic,
     * which is the difference between a texture and a wallpaper.
     */
    const draw = (t: number) => {
      const out = LAYERS.map(() => '');
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v =
            Math.sin(x * 0.19 + t * 0.55) * Math.cos(y * 0.34 - t * 0.4) +
            Math.sin(x * 0.09 + y * 0.15 + t * 0.28);
          // -2..2 onto the ramp, squared so the sparse end does most of the
          // work — a linear map puts half the grid on the heaviest glyph.
          const step = Math.min(STOPS - 1, Math.floor(((v + 2) / 4) ** 2 * STOPS));
          let cursor = 0;
          for (let l = 0; l < LAYERS.length; l++) {
            const chars = LAYERS[l].chars;
            const local = step - cursor;
            out[l] += local >= 0 && local < chars.length ? chars[local] : ' ';
            cursor += chars.length;
          }
        }
        for (let l = 0; l < out.length; l++) out[l] += '\n';
      }
      layers.forEach((node, i) => {
        node.textContent = out[i];
      });
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    const frame = (now: number) => {
      // ~20fps. The field is slow enough that sixty would spend three times the
      // work redrawing frames nobody can tell apart.
      if (now - last > 50) {
        last = now;
        draw((now - start) / 1000);
      }
      raf = requestAnimationFrame(frame);
    };

    const begin = () => {
      cancelAnimationFrame(raf);
      measure();
      if (reduce.matches) {
        // One frame, held. Someone who has asked their machine to stop moving
        // things still gets the texture.
        draw(0);
      } else {
        raf = requestAnimationFrame(frame);
      }
    };

    begin();
    const ro = new ResizeObserver(begin);
    ro.observe(el);
    reduce.addEventListener('change', begin);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      reduce.removeEventListener('change', begin);
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden="true"
      className="mesh"
      style={{ WebkitMaskImage: MASK, maskImage: MASK }}
    >
      {LAYERS.map(({ colour }) => (
        <pre key={colour} style={{ color: colour }} />
      ))}
    </div>
  );
};

export default AsciiMesh;
