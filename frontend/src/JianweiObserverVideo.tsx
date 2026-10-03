import { useRef } from 'react';
import { useJianweiVectorFrame } from './useJianweiVectorFrame';
import './jianwei-action-sprite.css';

/** The supplied five-second performance, traced to sixty real SVG path frames. */
export function JianweiObserverVideo() {
  const ref = useRef<HTMLSpanElement>(null);
  const { frame, playing } = useJianweiVectorFrame(ref, 60, 5000);
  return <span ref={ref} className="jw-observer-performance" aria-hidden="true" data-vector-frame={frame} data-action-playing={playing ? 'true' : 'false'}>
    <svg className="jw-observer-vector" viewBox="0 0 720 720" width="720" height="720" focusable="false" aria-hidden="true">
      <use href={`/images/vectors/observer-performance.svg#frame-${frame}`}/>
    </svg>
  </span>;
}
