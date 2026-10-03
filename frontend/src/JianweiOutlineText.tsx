import { useId, type CSSProperties } from 'react';
import glyphs from './jianwei-claim-glyphs.json';
import './jianwei-outline-text.css';

const lines = ['看见微小，', '才能看得更远。'];

/** Outline the filled glyph silhouette, so intersecting Chinese strokes have no seams. */
export function JianweiOutlineText() {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  let index = 0;
  return <span className="jw-silhouette-reading" data-jw-reveal style={{ '--count': lines.join('').length } as CSSProperties}>
    <span className="jw-sr-only">{lines.join('')}</span>
    {lines.map((line, lineIndex) => <span className="jw-silhouette-line" key={line} aria-hidden="true">
      {Array.from(line).map(character => {
        const letterIndex = index++;
        const id = `jw-claim-glyph-${instanceId}-${letterIndex}`;
        const path = glyphs[character as keyof typeof glyphs];
        return <svg className="jw-silhouette-letter" viewBox="0 0 1000 1100" key={letterIndex} focusable="false" style={{ '--i': letterIndex, '--line': lineIndex } as CSSProperties}>
          <defs>
            <mask id={id} maskUnits="userSpaceOnUse" x="-40" y="-40" width="1080" height="1180" style={{ maskType: 'luminance' }}>
              <rect x="-40" y="-40" width="1080" height="1180" fill="white"/>
              <path d={path} fill="black"/>
            </mask>
          </defs>
          <path className="jw-silhouette-edge" d={path} mask={`url(#${id})`} vectorEffect="non-scaling-stroke"/>
          <path className="jw-silhouette-fill" d={path}/>
        </svg>;
      })}
    </span>)}
  </span>;
}
