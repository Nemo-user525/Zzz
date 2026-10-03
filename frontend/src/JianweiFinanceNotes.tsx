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
    { label: 'ROE', x: 11, y: 5, turn: -10, mobile: [12, 4] },
    { label: 'ROA', x: 29, y: 12, turn: 7 },
    { label: 'D/E', x: 77, y: 6, turn: -9, mobile: [83, 10] },
    { label: 'EPS', x: 92, y: 23, turn: 9 },
    { label: 'P/E', x: 5.5, y: 31, turn: -13, mobile: [8, 27] },
    { label: 'P/B', x: 36, y: 30, turn: -8 },
    { label: 'FCF', x: 72, y: 31, turn: 10 },
    { label: 'EBIT', x: 81, y: 59, turn: -12, mobile: [89, 40] },
    { label: 'EBITDA', x: 17, y: 25, turn: 8, scale: 0.86 },
    { label: 'NAV', x: 6.5, y: 66, turn: -8 },
    { label: 'IRR', x: 31, y: 65, turn: -14, mobile: [14, 64] },
    { label: 'NPV', x: 74, y: 66, turn: 8 },
    { label: 'LTV', x: 92, y: 73, turn: 11, mobile: [88, 67] },
    { label: 'DSCR', x: 18, y: 83, turn: -9, scale: 0.94 },
    { label: 'WACC', x: 66, y: 83, turn: -8, scale: 0.9, mobile: [75, 83] },
    { label: 'CAPEX', x: 9, y: 95, turn: 11, scale: 0.9 },
    { label: 'OPEX', x: 36, y: 96, turn: -11, scale: 0.92, mobile: [19, 92] },
    { label: 'CFO', x: 87, y: 95, turn: 8, mobile: [86, 96] },
  ],
  intro: [
    { label: 'ROE', x: 8, y: 15, turn: -12, mobile: [9, 12] },
    { label: 'EPS', x: 91, y: 26, turn: 9 },
    { label: 'P/B', x: 12, y: 51, turn: 7 },
    { label: 'FCF', x: 87, y: 64, turn: -11, mobile: [88, 55] },
    { label: 'NPV', x: 7, y: 82, turn: -8, mobile: [10, 89] },
    { label: 'IRR', x: 92, y: 93, turn: 10 },
  ],
  archive: [
    { label: 'NAV', x: 9, y: 9, turn: -10, mobile: [84, 6] },
    { label: 'D/E', x: 87, y: 14, turn: 8 },
    { label: 'EBIT', x: 45, y: 66, turn: -12 },
    { label: 'CAPEX', x: 15, y: 88, turn: 9, scale: 0.9, mobile: [13, 89] },
    { label: 'CFO', x: 91, y: 82, turn: -8, mobile: [88, 77] },
  ],
  entry: [
    { label: 'ROA', x: 10, y: 15, turn: -11, mobile: [11, 14] },
    { label: 'LTV', x: 91, y: 26, turn: 9 },
    { label: 'DSCR', x: 6, y: 62, turn: -8, scale: 0.9 },
    { label: 'EBITDA', x: 86, y: 75, turn: 8, scale: 0.85, mobile: [85, 82] },
    { label: 'P/E', x: 19, y: 92, turn: -12, mobile: [16, 94] },
  ],
  closing: [
    { label: 'WACC', x: 13, y: 14, turn: -10, scale: 0.9, mobile: [14, 10] },
    { label: 'OPEX', x: 85, y: 23, turn: 10, scale: 0.92, mobile: [84, 19] },
    { label: 'FCF', x: 8, y: 73, turn: -9 },
    { label: 'IRR', x: 91, y: 81, turn: 8, mobile: [88, 88] },
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
