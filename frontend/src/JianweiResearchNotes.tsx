import type { CSSProperties } from 'react';
import './jianwei-research-notes.css';

type PencilGlyph = { width: number; strokes: string[] };

// Single-line sketches keep these notes closer to pencil marks than typeset labels.
// Coordinates share a 28-unit cap height; Chinese strokes use a wider square.
const pencilGlyphs: Record<string, PencilGlyph> = {
  C: { width: 16, strokes: ['M14 5Q8 1 4 8Q0 16 4 23Q8 27 13 22'] },
  H: { width: 16, strokes: ['M4 3L2 25', 'M15 3L12 25', 'M3 14L13 13'] },
  E: { width: 14, strokes: ['M13 4L4 4L2 24L12 23', 'M3 14L10 13'] },
  V: { width: 16, strokes: ['M2 4L6 25Q10 14 15 3'] },
  R: { width: 16, strokes: ['M3 25L5 4Q15 1 14 9Q13 15 4 15', 'M7 15L14 25'] },
  L: { width: 13, strokes: ['M5 3L2 24L12 23'] },
  S: { width: 14, strokes: ['M13 5Q7 0 3 7Q0 11 8 15Q16 19 10 24Q6 28 1 23'] },
  F: { width: 14, strokes: ['M3 25L5 4L14 3', 'M4 14L11 13'] },
  I: { width: 10, strokes: ['M2 4L10 3', 'M7 4L4 24', 'M0 25L9 24'] },
  D: { width: 16, strokes: ['M3 25L5 4Q16 2 15 13Q14 25 3 25'] },
  T: { width: 15, strokes: ['M1 5L15 3', 'M9 4L6 25'] },
  '0': { width: 14, strokes: ['M9 3Q3 3 2 15Q1 26 7 25Q13 24 14 11Q14 2 9 3'] },
  '1': { width: 10, strokes: ['M1 9L7 4L5 24', 'M1 25L10 24'] },
  '2': { width: 14, strokes: ['M1 8Q6 0 12 5Q18 12 2 23L13 24'] },
  '3': { width: 14, strokes: ['M2 6Q9 0 13 5Q16 11 7 13Q15 13 13 21Q10 28 1 24'] },
  '4': { width: 15, strokes: ['M10 3L1 18L15 17', 'M12 4L9 26'] },
  '5': { width: 14, strokes: ['M14 4L5 4L3 13Q14 9 13 19Q11 28 1 24'] },
  '6': { width: 14, strokes: ['M13 4Q5 0 2 15Q0 28 9 25Q15 22 12 15Q7 10 2 17'] },
  '7': { width: 14, strokes: ['M1 5L14 4L4 25', 'M5 15L12 14'] },
  '.': { width: 5, strokes: ['M2 24L2.3 24.6'] },
  '-': { width: 10, strokes: ['M1 15L9 14'] },
  '+': { width: 12, strokes: ['M7 8L5 22', 'M1 16L12 15'] },
  '?': { width: 13, strokes: ['M2 8Q3 1 10 4Q17 8 9 13Q5 15 6 19', 'M5 25L5.3 25.5'] },
  '✓': { width: 19, strokes: ['M1 16L6 23Q11 11 18 5'] },
  '→': { width: 27, strokes: ['M1 16Q12 14 25 15', 'M18 9L25 15L17 20'] },
  '↗': { width: 22, strokes: ['M2 23L19 5', 'M10 5L20 4L19 14'] },
  '○': { width: 23, strokes: ['M13 3Q2 0 1 13Q0 27 13 26Q24 24 23 12Q22 3 12 3'] },
  ' ': { width: 7, strokes: [] },
  待: { width: 27, strokes: ['M9 3L3 10', 'M10 10L2 19', 'M6 15L5 27', 'M14 8L25 7', 'M19 2L18 16', 'M11 16L27 15', 'M12 21L26 20', 'M23 16L22 27L18 26', 'M14 23L16 26'] },
  核: { width: 27, strokes: ['M2 10L12 9', 'M8 3L6 27', 'M7 12L1 21', 'M8 15L12 19', 'M20 2L22 5', 'M13 8L27 7', 'M20 9L14 17L20 17', 'M24 11Q19 20 13 22', 'M26 18Q21 25 14 27', 'M21 22L27 27'] },
  变: { width: 28, strokes: ['M14 2L16 5', 'M3 8L27 7', 'M12 8L11 16', 'M18 8L17 16', 'M7 10L3 15', 'M23 10L27 14', 'M6 19L22 18Q17 26 3 28', 'M9 20Q15 26 27 27'] },
  更: { width: 28, strokes: ['M3 4L27 3', 'M6 10L25 9L23 19L5 20L6 10', 'M6 15L24 14', 'M16 4Q15 23 4 28', 'M7 21Q15 26 27 27'] },
  关: { width: 27, strokes: ['M8 2L11 7', 'M21 2L18 8', 'M5 11L25 10', 'M2 18L27 17', 'M16 10Q15 23 3 28', 'M15 18Q19 24 27 28'] },
  联: { width: 30, strokes: ['M2 4L14 3', 'M5 5L4 23', 'M12 4L10 27', 'M5 10L11 10', 'M4 17L11 16', 'M1 25L12 22', 'M18 3L20 8', 'M27 2L24 8', 'M15 11L29 10', 'M14 18L30 17', 'M23 10Q22 22 14 28', 'M22 18L29 27'] },
};

type Annotation = {
  id: string;
  text: string;
  x: number;
  y: number;
  angle: number;
  size?: number;
  anchor?: 'end' | 'center';
  desktopOnly?: boolean;
};

const annotations: Annotation[] = [
  { id: 'change', text: 'CH.03', x: 13, y: 5, angle: -12, size: 22 },
  { id: 'identity', text: 'ID?', x: 62, y: 2, angle: 9, size: 20, desktopOnly: true },
  { id: 'evidence', text: 'EV.07', x: 87, y: 11, angle: -8, size: 22, anchor: 'end' },
  { id: 'relationship', text: 'REL.02', x: 4, y: 35, angle: -16, size: 21 },
  { id: 'source', text: 'SRC.04', x: 95, y: 32, angle: 8, size: 20, anchor: 'end' },
  { id: 'counterfact', text: 'CF.01', x: 20, y: 52, angle: -7, size: 20 },
  { id: 'unresolved', text: 'EV?', x: 49, y: 53, angle: 6, size: 24, anchor: 'center' },
  { id: 'link', text: '关联?', x: 91, y: 51, angle: 12, size: 19, anchor: 'end', desktopOnly: true },
  { id: 'circle', text: '○ ↗', x: 5, y: 58, angle: -14, size: 22, desktopOnly: true },
  { id: 'check', text: '✓', x: 33, y: 91, angle: 11, size: 23 },
  { id: 'pending', text: '待核', x: 58, y: 93, angle: -10, size: 20, desktopOnly: true },
  { id: 'time', text: 'T-06', x: 84, y: 89, angle: 7, size: 21, anchor: 'end' },
];

function PencilNote({ text, seed }: { text: string; seed: number }) {
  let offset = 2;
  const characters = Array.from(text).map((character, index) => {
    const glyph = pencilGlyphs[character];
    if (!glyph) return null;
    const x = offset;
    offset += glyph.width + 2;
    const variation = (seed * 7 + index * 11) % 9;
    const rotation = (variation - 4) * .68;
    const y = ((seed + index * 3) % 5 - 2) * .24;
    const scale = 1 + (variation - 4) * .006;
    return <g key={`${character}-${index}`} transform={`translate(${x} ${y + 3}) rotate(${rotation} ${glyph.width / 2} 14) scale(${scale})`}>
      {glyph.strokes.map((stroke, strokeIndex) => <path key={strokeIndex} d={stroke}/>)}
    </g>;
  });
  return <svg viewBox={`0 0 ${offset + 2} 34`} width={offset + 2} height="34" focusable="false" preserveAspectRatio="xMidYMid meet">
    <g className="jw-pencil-strokes">{characters}</g>
  </svg>;
}

export function JianweiResearchNotes({ resolved = false }: { resolved?: boolean }) {
  return <div className="jw-research-notes" aria-hidden="true">
    {annotations.map((annotation, index) => <span
      key={annotation.id}
      className={`jw-research-note jw-research-note-${annotation.id}${annotation.desktopOnly ? ' jw-research-note-desktop' : ''}${annotation.id === 'unresolved' && resolved ? ' is-resolved' : ''}`}
      style={{
        '--note-x': `${annotation.x}%`,
        '--note-y': `${annotation.y}%`,
        '--note-angle': `${annotation.angle}deg`,
        '--note-size': `${annotation.size ?? 22}px`,
        '--note-anchor': annotation.anchor === 'end' ? '-100%' : annotation.anchor === 'center' ? '-50%' : '0%',
      } as CSSProperties}
    ><PencilNote text={annotation.id === 'unresolved' && resolved ? 'EV.01 ✓' : annotation.text} seed={index + 1}/></span>)}
  </div>;
}
