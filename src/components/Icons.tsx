/**
 * The icon set, inline.
 *
 * Eleven glyphs on one 16-box grid at one stroke weight. A package would be three
 * hundred, drawn by someone else, at a weight that does not match the text —
 * and the only real cost of drawing them is that a new one has to be drawn
 * rather than imported, which is the right friction for an icon.
 *
 * The transport controls that used to live here — record, stop, pause, play,
 * a microphone, a waveform — went with the recorder.
 */

type TProps = {
  size?: number;
};

const box = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none' as const,
  stroke: 'currentColor' as const,
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const Caret = ({ size = 12 }: TProps) => (
  <svg {...box(size)}>
    <path d="M4 6.5 8 10.5l4-4" />
  </svg>
);

export const Tick = ({ size = 12 }: TProps) => (
  <svg {...box(size)}>
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
  </svg>
);

export const Search = ({ size = 14 }: TProps) => (
  <svg {...box(size)}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.2 10.2 13.5 13.5" />
  </svg>
);

export const Close = ({ size = 14 }: TProps) => (
  <svg {...box(size)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const Plus = ({ size = 14 }: TProps) => (
  <svg {...box(size)}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

/** A play triangle, for the link to the recording. It points at somebody
 *  else's player — this app has never had one. */
export const Play = ({ size = 14 }: TProps) => (
  <svg {...box(size)} fill="currentColor" stroke="none">
    <path d="M5 3.8v8.4l7-4.2z" />
  </svg>
);

export const Star = ({ size = 13, filled = false }: TProps & { filled?: boolean }) => (
  <svg {...box(size)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M8 2.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.2l-3.4 1.8.7-3.8L2.5 6.5l3.8-.5z" />
  </svg>
);

/** A camera, for the meeting link. Not a microphone — the app no longer
 *  records anything; it points at Zoom. */
export const Video = ({ size = 14 }: TProps) => (
  <svg {...box(size)}>
    <rect x="1.75" y="4" width="9" height="8" rx="1.75" />
    <path d="M10.75 7.5l3.5-2v5l-3.5-2z" />
  </svg>
);

export const Upload = ({ size = 14 }: TProps) => (
  <svg {...box(size)}>
    <path d="M8 11V3.5M4.75 6.25 8 3l3.25 3.25M2.5 12.5h11" />
  </svg>
);

export const Download = ({ size = 14 }: TProps) => (
  <svg {...box(size)}>
    <path d="M8 3v7.5M4.75 7.25 8 10.5l3.25-3.25M2.5 13h11" />
  </svg>
);

export const Trash = ({ size = 14 }: TProps) => (
  <svg {...box(size)}>
    <path d="M2.75 4.5h10.5M6 4.5V3a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1.5M4.25 4.5l.6 8.2a.8.8 0 0 0 .8.8h4.7a.8.8 0 0 0 .8-.8l.6-8.2" />
  </svg>
);

export const Back = ({ size = 14 }: TProps) => (
  <svg {...box(size)}>
    <path d="M12.5 8h-9M6.75 4.25 3 8l3.75 3.75" />
  </svg>
);
