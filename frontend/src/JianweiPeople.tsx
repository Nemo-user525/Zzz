import { JianweiFinanceNotes } from './JianweiFinanceNotes';
import { useId, useRef } from 'react';
import { JianweiActionSprite, type JianweiActionKind } from './JianweiActionSprite';
import { useJianweiMotion } from './useJianweiVectorFrame';
import vectorManifest from '../public/images/vectors/manifest.json';
import './jianwei-people.css';

// External SVG use references otherwise keep the previous drawing in browser cache.
const peopleVectorVersion = vectorManifest.assets.find(asset => asset.file === '/images/vectors/people.svg')!.sha256.slice(0, 12);

export type JianweiPersonRole = 'detective' | 'analyst' | 'researcher' | 'connector' | 'checker' | 'translator' | 'guardian';

const people: Record<JianweiPersonRole, { crop: [number, number, number, number]; name: string; description: string }> = {
  detective: { crop: [67, 246, 179, 266], name: '调查员', description: '从一个名字，追踪每条线索。' },
  analyst: { crop: [303, 253, 150, 261], name: '分析师', description: '把复杂信息，整理成清楚的事实。' },
  researcher: { crop: [487, 248, 149, 267], name: '信息检索员', description: '在信息角落，寻找被忽略的证据。' },
  connector: { crop: [697, 223, 188, 292], name: '关系梳理师', description: '连起看不见的关系。' },
  checker: { crop: [879, 260, 245, 255], name: '反证验证师', description: '多找一种可能，再下结论。' },
  translator: { crop: [1145, 247, 104, 268], name: '翻译官', description: '把专业术语，讲成明白的话。' },
  guardian: { crop: [1303, 288, 191, 228], name: '守护者', description: '让每个重要决定，多一份安心。' },
};

const roles = Object.keys(people) as JianweiPersonRole[];

const fieldworkSprites: Partial<Record<JianweiPersonRole, JianweiActionKind>> = {
  detective: 'analyst',
  analyst: 'binoculars',
  researcher: 'researcher',
  connector: 'connector',
  guardian: 'guardian',
};

// These fieldwork poses deliberately differ from the seven formal team portraits.
// Coordinates retain the original reference stage so the traced joints remain aligned.
const fieldwork: Record<JianweiPersonRole, { crop: [number, number, number, number]; pose: string }> = {
  detective: { crop: [84, 440, 220, 191], pose: 'inspect' },
  analyst: { crop: [576, 153, 165, 207], pose: 'binoculars' },
  researcher: { crop: [977, 192, 264, 169], pose: 'desk' },
  connector: { crop: [363, 425, 247, 197], pose: 'connect' },
  checker: { crop: [645, 677, 184, 211], pose: 'check' },
  translator: { crop: [769, 141, 176, 214], pose: 'read' },
  guardian: { crop: [972, 431, 205, 188], pose: 'lookout' },
};

type ActionPart = { name: 'head' | 'hand' | 'papers'; path: string; pivot: [number, number] };

// Separate articulated regions rather than translating or rocking the entire illustration.
// Every pivot is a joint in the reference image's original 1536 × 1024 coordinates.
const teamActions: Record<JianweiPersonRole, ActionPart[]> = {
  detective: [
    { name: 'head', path: 'M141 281 L155 255 L177 250 L201 279 L191 304 L178 314 L159 300 Z', pivot: [171, 307] },
    { name: 'hand', path: 'M164 334 L189 326 L205 311 L208 289 Q220 275 228 286 L227 305 L214 320 L215 333 L186 354 L166 350 Z', pivot: [166, 340] },
  ],
  analyst: [
    { name: 'head', path: 'M331 286 Q335 267 354 267 Q376 269 375 290 L368 306 L357 320 L340 312 L330 303 Z', pivot: [348, 315] },
    { name: 'hand', path: 'M348 337 L380 330 L382 359 L365 369 L347 357 Z', pivot: [349, 347] },
    { name: 'papers', path: 'M406 276 H452 V335 H406 Z M393 363 H446 V424 H393 Z', pivot: [424, 350] },
  ],
  researcher: [
    { name: 'head', path: 'M544 289 L552 267 L584 260 L602 279 L608 300 L590 321 L566 315 L549 304 Z', pivot: [570, 317] },
    { name: 'hand', path: 'M552 348 L572 349 L581 350 L594 360 L582 370 L566 371 L551 363 Z', pivot: [552, 356] },
  ],
  connector: [
    { name: 'head', path: 'M719 281 L729 259 L751 252 L775 267 L784 283 L769 305 L756 315 L736 310 L722 299 Z', pivot: [744, 310] },
    { name: 'hand', path: 'M766 327 L783 326 L796 309 L800 290 L809 286 L813 293 L807 315 L788 342 L774 342 Z', pivot: [768, 332] },
  ],
  checker: [
    { name: 'head', path: 'M963 294 L972 276 L994 278 L1013 294 L1023 315 L1006 331 L980 320 L970 307 Z', pivot: [985, 320] },
    { name: 'hand', path: 'M1002 349 L1020 347 L1036 342 L1058 338 L1069 344 L1068 356 L1044 359 L1026 365 L1007 367 Z', pivot: [1005, 357] },
  ],
  translator: [
    { name: 'head', path: 'M1165 265 L1196 253 L1211 264 L1214 282 L1200 305 L1184 313 L1166 301 L1160 286 Z', pivot: [1182, 309] },
  ],
  guardian: [
    { name: 'head', path: 'M1369 327 L1378 305 L1403 299 L1428 311 L1440 331 L1423 350 L1399 354 L1382 343 Z', pivot: [1393, 350] },
    { name: 'hand', path: 'M1389 372 L1412 370 L1427 367 L1450 357 L1458 366 L1444 378 L1421 384 L1398 388 Z', pivot: [1392, 379] },
  ],
};

const fieldActions: Partial<Record<JianweiPersonRole, ActionPart[]>> = {
  analyst: [
    { name: 'head', path: 'M614 199 L622 170 L647 157 L674 165 L688 184 L678 201 L648 214 L624 219 Z', pivot: [635, 218] },
    { name: 'hand', path: 'M651 225 L663 205 L680 184 L703 180 L711 195 L685 207 L677 229 L665 245 Z', pivot: [659, 234] },
  ],
  connector: [
    { name: 'head', path: 'M389 469 L392 448 L413 434 L440 440 L451 458 L440 481 L416 491 L394 484 Z', pivot: [414, 489] },
    { name: 'hand', path: 'M430 510 L451 513 L473 506 L489 497 L499 504 L486 518 L464 529 L444 532 Z', pivot: [434, 520] },
  ],
  checker: [
    { name: 'head', path: 'M684 718 L692 695 L714 685 L737 696 L749 717 L735 737 L715 743 L693 735 Z', pivot: [708, 739] },
    { name: 'hand', path: 'M712 775 L738 773 L765 750 L780 750 L790 760 L773 775 L750 790 L721 791 Z', pivot: [718, 783] },
  ],
  translator: [
    { name: 'head', path: 'M790 183 L797 156 L816 145 L839 148 L853 168 L846 187 L824 201 L800 200 Z', pivot: [813, 201] },
    { name: 'hand', path: 'M818 219 L844 217 L869 206 L885 210 L887 222 L865 231 L843 234 L823 238 Z', pivot: [823, 228] },
  ],
  guardian: [
    { name: 'head', path: 'M991 476 L1000 453 L1019 444 L1045 450 L1058 469 L1046 490 L1027 503 L1006 497 Z', pivot: [1024, 500] },
    { name: 'hand', path: 'M1054 513 L1073 491 L1097 473 L1120 465 L1140 461 L1146 469 L1124 479 L1092 493 L1074 520 Z', pivot: [1058, 515] },
  ],
};

/** Select a fieldwork pose by default; the team row explicitly selects its portraits. */
export function JianweiPerson({ role, className = '', variant = 'fieldwork' }: {
  role: JianweiPersonRole;
  className?: string;
  variant?: 'fieldwork' | 'team';
}) {
  const clipId = `jw-person-crop-${useId().replace(/:/g, '')}`;
  const stageRef = useRef<HTMLSpanElement>(null);
  const playing = useJianweiMotion(stageRef);
  const sprite = variant === 'fieldwork' ? fieldworkSprites[role] : undefined;
  if (sprite) {
    return <span className={`jw-person jw-person--${role} jw-person--fieldwork ${className}`.trim()} aria-hidden="true">
      <JianweiActionSprite kind={sprite}/>
    </span>;
  }
  const [x, y, width, height] = variant === 'team' ? people[role].crop : fieldwork[role].crop;
  const source = `/images/vectors/people.svg?v=${peopleVectorVersion}#${variant === 'team' ? 'team' : 'field'}-${role}`;
  const parts = (variant === 'team' ? teamActions : fieldActions)[role] || [];
  return <span ref={stageRef} className={`jw-person jw-person--${role} jw-person--${variant} jw-person-pose--${fieldwork[role].pose} ${className}`.trim()} aria-hidden="true" data-action-playing={playing ? 'true' : 'false'} style={{ aspectRatio: `${width} / ${height}` }}>
    <svg viewBox={`${x} ${y} ${width} ${height}`} width={width} height={height} preserveAspectRatio="xMidYMax meet" focusable="false" aria-hidden="true">
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={x} y={y} width={width} height={height}/></clipPath>
        <mask id={`${clipId}-body`} maskUnits="userSpaceOnUse" x={x} y={y} width={width} height={height}>
          <rect x={x} y={y} width={width} height={height} fill="white"/>
          {parts.map(part => <path key={part.name} d={part.path} fill="black"/>)}
        </mask>
        {parts.map(part => <clipPath key={part.name} id={`${clipId}-${part.name}`} clipPathUnits="userSpaceOnUse"><path d={part.path}/></clipPath>)}
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <use href={source} mask={`url(#${clipId}-body)`}/>
        {parts.map(part => <g key={part.name} transform={`translate(${part.pivot[0]} ${part.pivot[1]})`}>
          <g className={`jw-person-joint jw-person-joint--${part.name}`}>
            <g transform={`translate(${-part.pivot[0]} ${-part.pivot[1]})`}>
              <use href={source} clipPath={`url(#${clipId}-${part.name})`}/>
            </g>
          </g>
        </g>)}
      </g>
    </svg>
  </span>;
}

export function JianweiTeam() {
  return <section className="jw-team" aria-labelledby="jw-team-heading">
    <JianweiFinanceNotes variant="entry" className="jw-finance-notes--team"/>
    <div className="jw-team-heading">
      <span className="jw-team-kicker">见微的观察小队</span>
      <h2 id="jw-team-heading">不同的眼睛，<br className="jw-team-mobile-break"/>看见更完整的真相。</h2>
      <p>各自多看一眼，把线索放在一起。</p>
    </div>
    <ul className="jw-team-members">
      {roles.map(role => <li key={role}>
        <div className="jw-team-portrait"><JianweiPerson role={role} variant="team"/></div>
        <h3>{people[role].name}</h3>
        <p>{people[role].description}</p>
      </li>)}
    </ul>
  </section>;
}
