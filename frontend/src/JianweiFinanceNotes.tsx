import type { CSSProperties } from 'react';
import './jianwei-finance-notes.css';

type FinanceNote = {
  label: string;
  x: number;
  y: number;
  turn: number;
  scale?: number;
  mobile?: [x: number, y: number];
};

const notes = {
  hero: [
    { label: 'ROE', x: 15, y: 9, turn: -9, mobile: [12, 5] },
    { label: 'D/E', x: 77, y: 13, turn: 6, mobile: [86, 15] },
    { label: 'EPS', x: 92, y: 31, turn: -7, mobile: [10, 31] },
    { label: 'FCF', x: 27, y: 31, turn: 8, mobile: [86, 40] },
    { label: 'IRR', x: 18, y: 69, turn: -10, mobile: [13, 67] },
    { label: 'NPV', x: 78, y: 74, turn: 7, mobile: [86, 79] },
    { label: 'WACC', x: 31, y: 94, turn: -7, scale: 0.9, mobile: [21, 95] },
  ],
  intro: [
    { label: 'ROA', x: 8, y: 14, turn: -9, mobile: [12, 5] },
    { label: 'P/E', x: 91, y: 49, turn: 7, mobile: [85, 46] },
    { label: 'P/B', x: 9, y: 85, turn: -6, mobile: [12, 92] },
  ],
  archive: [
    { label: 'NAV', x: 12, y: 10, turn: -8, mobile: [83, 6] },
    { label: 'CAPEX', x: 15, y: 88, turn: 7, scale: 0.9, mobile: [14, 93] },
    { label: 'CFO', x: 95, y: 40, turn: -7, mobile: [93, 37] },
  ],
  entry: [
    { label: 'EBIT', x: 73, y: 16, turn: -8, mobile: [86, 5] },
    { label: 'EBITDA', x: 80, y: 92, turn: 7, scale: 0.85, mobile: [81, 96] },
    { label: 'DSCR', x: 17, y: 94, turn: -7, scale: 0.9, mobile: [15, 96] },
  ],
  closing: [
    { label: 'LTV', x: 13, y: 19, turn: -8, mobile: [14, 10] },
    { label: 'OPEX', x: 84, y: 77, turn: 7, scale: 0.92, mobile: [85, 19] },
  ],
} satisfies Record<string, FinanceNote[]>;

export type JianweiFinanceNotesVariant = keyof typeof notes;

/** Quiet pencil annotations. Place directly inside a positioned section. */
export function JianweiFinanceNotes({
  variant = 'hero',
  className = '',
}: {
  variant?: JianweiFinanceNotesVariant;
  className?: string;
}) {
  const composition: FinanceNote[] = notes[variant];

  return <div className={`jw-finance-notes jw-finance-notes--${variant} ${className}`} aria-hidden="true">
    {composition.map(note => <span
      className={`jw-finance-note${note.mobile ? ' jw-finance-note--mobile' : ''}`}
      key={note.label}
      style={{
        '--note-x': `${note.x}%`,
        '--note-y': `${note.y}%`,
        '--note-turn': `${note.turn}deg`,
        '--note-scale': note.scale ?? 1,
        '--note-mobile-x': `${note.mobile?.[0] ?? note.x}%`,
        '--note-mobile-y': `${note.mobile?.[1] ?? note.y}%`,
      } as CSSProperties}
    >{note.label}</span>)}
  </div>;
}
