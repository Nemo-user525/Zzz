import { useRef } from 'react';
import { useJianweiVectorFrame } from './useJianweiVectorFrame';
import vectorManifest from '../public/images/vectors/manifest.json';
import './jianwei-action-sprite.css';

const performanceVersion = vectorManifest.assets.find(asset => asset.file === '/images/vectors/observer-performance.svg')!.sha256.slice(0, 12);
// Follow the original movement, pause to observe, then return through adjacent poses.
// The endpoints never jump from the last source drawing back to the first one.
const observerSequence = [
  ...Array<number>(5).fill(0),
  ...Array.from({ length: 60 }, (_, frame) => frame),
  ...Array<number>(5).fill(59),
  ...Array.from({ length: 58 }, (_, frame) => 58 - frame),
];

/** The original sixty vector drawings, played as a seamless observation gesture. */
export function JianweiObserverVideo() {
  const ref = useRef<HTMLSpanElement>(null);
  const { frame: step, playing } = useJianweiVectorFrame(ref, observerSequence.length, observerSequence.length * 1000 / 12);
  const frame = observerSequence[step];
  return <span ref={ref} className="jw-observer-performance" aria-hidden="true" data-vector-frame={frame} data-action-playing={playing ? 'true' : 'false'}>
    <svg className="jw-observer-vector" viewBox="0 0 720 720" width="720" height="720" focusable="false" aria-hidden="true">
      <use href={`/images/vectors/observer-performance.svg?v=${performanceVersion}#frame-${frame}`}/>
    </svg>
  </span>;
}
