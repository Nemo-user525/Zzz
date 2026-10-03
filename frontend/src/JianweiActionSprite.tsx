import { useId, useRef } from 'react';
import { useJianweiMotion, useJianweiVectorFrame } from './useJianweiVectorFrame';
import vectorManifest from '../public/images/vectors/manifest.json';
import './jianwei-action-sprite.css';

const vectorVersions = new Map(vectorManifest.assets.map(asset => [asset.file, asset.sha256.slice(0, 12)]));

export type JianweiActionKind = 'observer' | 'researcher' | 'analyst' | 'binoculars' | 'connector' | 'guardian';

type FieldworkKind = Exclude<JianweiActionKind, 'observer'>;
type SpriteProps = { kind: JianweiActionKind; className?: string; paused?: boolean };
type Joint = { name: 'head' | 'hand'; path: string; pivot: [number, number] };

// The original first pose stays anchored; only isolated joints move.
// Hands touching the newspaper or board stay fixed to avoid moving their props.
const fieldworkJoints: Record<FieldworkKind, Joint[]> = {
  analyst: [
    { name: 'head', path: 'M238 12 H398 V141 L343 141 L321 149 L279 130 L240 136 Z', pivot: [301, 137] },
  ],
  binoculars: [
    { name: 'head', path: 'M269 8 H438 V139 L376 143 L354 163 L308 142 L280 136 Z', pivot: [331, 148] },
    { name: 'hand', path: 'M387 252 L407 239 L407 218 L443 214 L459 226 L459 305 L409 306 L400 291 L389 292 Z', pivot: [389, 275] },
  ],
  researcher: [
    { name: 'head', path: 'M176 27 H361 V190 L254 190 L235 179 L207 149 L176 146 Z', pivot: [222, 165] },
    { name: 'hand', path: 'M319 277 L338 268 L367 272 L390 282 L394 298 L386 309 L378 311 L372 303 L348 303 L323 309 Z', pivot: [328, 291] },
  ],
  connector: [
    { name: 'head', path: 'M142 20 H323 V149 L279 150 L261 166 L235 152 L203 171 L155 180 Z', pivot: [249, 154] },
  ],
  guardian: [
    { name: 'hand', path: 'M388 106 L418 94 L438 83 L558 33 L584 35 L589 82 L470 123 L462 153 L443 158 L420 142 L418 124 L399 129 Z', pivot: [399, 117] },
  ],
};
const poses = [0, 0, 1, 2, 3, 3, 2, 1];

export function JianweiActionSprite(props: SpriteProps) {
  return props.kind === 'observer'
    ? <ObserverActionSprite {...props}/>
    : <FieldworkActionSprite {...props} kind={props.kind}/>;
}

function FieldworkActionSprite({ kind, className = '', paused = false }: SpriteProps & { kind: FieldworkKind }) {
  const stageRef = useRef<HTMLSpanElement>(null);
  const playing = useJianweiMotion(stageRef, paused);
  const id = `jw-fieldwork-${useId().replace(/:/g, '')}`;
  const file = `/images/vectors/${kind}-actions.svg`;
  const source = `${file}?v=${vectorVersions.get(file)}#frame-0`;
  const parts = fieldworkJoints[kind];
  return <span ref={stageRef} className={`jw-action-sprite jw-action-sprite--${kind} ${className}`.trim()}
    data-action-playing={playing ? 'true' : 'false'} data-vector-frame="0" aria-hidden="true">
    <svg viewBox="0 0 627 627" width="627" height="627" focusable="false" aria-hidden="true">
      <defs>
        <mask id={`${id}-body`} maskUnits="userSpaceOnUse" x="0" y="0" width="627" height="627">
          <rect width="627" height="627" fill="white"/>
          {parts.map(part => <path key={part.name} d={part.path} fill="black"/>)}
        </mask>
        {parts.map(part => <clipPath key={part.name} id={`${id}-${part.name}`} clipPathUnits="userSpaceOnUse"><path d={part.path}/></clipPath>)}
      </defs>
      <use href={source} mask={`url(#${id}-body)`}/>
      {parts.map(part => <g key={part.name} transform={`translate(${part.pivot[0]} ${part.pivot[1]})`}>
        <g className={`jw-action-joint jw-action-joint--${part.name}`}>
          <g transform={`translate(${-part.pivot[0]} ${-part.pivot[1]})`}>
            <use href={source} clipPath={`url(#${id}-${part.name})`}/>
          </g>
        </g>
      </g>)}
    </svg>
  </span>;
}

function ObserverActionSprite({ kind, className = '', paused = false }: SpriteProps) {
  const stageRef = useRef<HTMLSpanElement>(null);
  const { frame, playing } = useJianweiVectorFrame(stageRef, poses.length, 4800, paused);
  const pose = poses[frame];
  const source = `/images/vectors/${kind}-actions.svg`;

  return <span
    ref={stageRef}
    className={`jw-action-sprite jw-action-sprite--${kind} ${className}`.trim()}
    data-action-playing={playing ? 'true' : 'false'}
    data-vector-frame={pose}
    aria-hidden="true"
  ><svg viewBox="0 0 627 627" width="627" height="627" focusable="false" aria-hidden="true">
    <use href={`${source}?v=${vectorVersions.get(source)}#frame-${pose}`}/>
  </svg></span>;
}
