import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import './jianwei-xray.css';

const floorLevels = Array.from({ length: 8 }, (_, index) => index);
const windowColumns = Array.from({ length: 5 }, (_, index) => index);

function OfficeExterior({ hatchId }: { hatchId: string }) {
  return <g className="jw-office-exterior" strokeLinejoin="round">
    <path d="M210 527 406 630 610 512 415 410Z" fill="var(--jw-sketch-shadow)" opacity=".46" stroke="none" />
    <path d="M231 507 407 598 584 497 408 406Z" fill="var(--jw-sketch-shadow)" stroke="var(--jw-sketch-line)" />
    <path d="M231 507v12l176 91 177-101v-12L407 598Z" fill="var(--jw-sketch-shade)" stroke="var(--jw-sketch-line)" />
    <path d="M253 135 407 214V580L253 501Z" fill="var(--jw-sketch-shadow)" stroke="var(--jw-sketch-ink)" strokeWidth="1.3" />
    <path d="M407 214 562 126V492L407 580Z" fill="var(--jw-sketch-shade)" stroke="var(--jw-sketch-ink)" strokeWidth="1.3" />
    <path d="M253 135 408 48 562 126 407 214Z" fill="var(--jw-sketch-paper)" stroke="var(--jw-sketch-ink)" strokeWidth="1.3" />
    <path d="M269 135 408 59 546 126 407 202Z" fill="var(--jw-sketch-shadow)" stroke="var(--jw-sketch-line)" />
    <path d="M298 128 406 69 514 125 405 184Z" fill="var(--jw-sketch-paper)" stroke="var(--jw-sketch-line)" />
    <path d="M357 126v-24l47-26 48 24v24l-46 26Z" fill="var(--jw-sketch-shade)" stroke="var(--jw-sketch-line)" />
    <path d="M357 102 406 126 452 100M406 126v24" fill="none" stroke="var(--jw-sketch-line)" />
    <path d="M366 106v12m8-8v12m8-8v12m8-8v12" stroke="var(--jw-sketch-line)" />
    <path d="M253 135 407 214V580L253 501Z" fill={`url(#${hatchId})`} opacity=".15" stroke="none" />
    {floorLevels.map(row => <g key={row}>
      <path d={`M253 ${169 + row * 42} 407 ${248 + row * 42} 562 ${160 + row * 42}`} stroke="var(--jw-sketch-line)" strokeWidth=".8" fill="none" />
      {windowColumns.map(column => {
        const lx = 264 + column * 28;
        const ly = 165 + row * 42 + column * 14.35;
        const rx = 420 + column * 28;
        const ry = 233 + row * 42 - column * 15.9;
        return <g key={column} stroke="var(--jw-sketch-line)" strokeWidth=".8">
          <path d={`M${lx} ${ly}l18 9.2v25l-18-9.2Z`} fill={(row + column) % 4 === 0 ? 'var(--jw-sketch-window)' : 'var(--jw-sketch-shade)'} />
          <path d={`M${lx + 9} ${ly + 4.6}v25M${lx} ${ly + 12}l18 9.2`} fill="none" opacity=".7" />
          <path d={`M${rx} ${ry}l18-10.2v25l-18 10.2Z`} fill={(row + column) % 3 === 0 ? 'var(--jw-sketch-window)' : 'var(--jw-sketch-window)'} />
          <path d={`M${rx + 9} ${ry - 5.1}v25M${rx} ${ry + 12}l18-10.2`} fill="none" opacity=".7" />
        </g>;
      })}
    </g>)}
    <path d="M380 539v27l27 14 30-17v-28l-30 18Z" fill="var(--jw-sketch-ink)" stroke="var(--jw-sketch-ink)" />
    <path d="M407 553v27m-14-34v27m29-29v27" stroke="var(--jw-sketch-shadow)" strokeWidth="1" />
    <path d="M372 535 407 553 444 532 407 514Z" fill="var(--jw-sketch-paper)" stroke="var(--jw-sketch-ink)" />
    <path d="M249 495 407 576 565 486M249 491 407 572 565 482" stroke="var(--jw-sketch-line)" fill="none" />
    <path d="M407 215v360" stroke="var(--jw-sketch-paper)" opacity=".7" />
  </g>;
}

function OfficeInterior() {
  return <g className="jw-office-interior" fill="none" stroke="var(--jw-xray-light)" strokeLinejoin="round">
    <path d="M253 135 408 48 562 126V492L407 580 253 501Z" fill="var(--jw-xray-deep)" strokeWidth="1.2" />
    <path d="M253 135 407 214 562 126M407 214V580M408 48v366M253 501 408 414 562 492" stroke="var(--jw-xray-light)" strokeWidth="1" />
    {[0, 1, 2, 3, 4, 5].map(floor => {
      const y = 188 + floor * 54;
      return <g key={floor}>
        <path d={`M254 ${y} 408 ${y - 87} 561 ${y - 9} 407 ${y + 79}Z`} fill="var(--jw-xray-floor)" fillOpacity={floor % 2 ? '.32' : '.55'} stroke="var(--jw-xray-light)" strokeOpacity=".62" />
        <path d={`M301 ${y + 24} 454 ${y - 64}M354 ${y + 52} 508 ${y - 36}M300 ${y - 26} 454 ${y + 52}M353 ${y - 56} 508 ${y + 23}`} stroke="var(--jw-xray-light)" strokeOpacity=".24" />
      </g>;
    })}
    <path d="M318 210v259m159-286v261" stroke="var(--jw-xray-light)" strokeDasharray="4 7" opacity=".6" />
    <g className="jw-xray-traces" stroke="var(--jw-xray-light)" strokeWidth="2">
      <path d="M317 210 408 260 478 221V333L353 402 450 453" />
      <path d="M317 210v142l92 48v109M478 333 317 424" />
    </g>
    {[[317, 210], [408, 260], [478, 221], [478, 333], [353, 402], [450, 453], [317, 352], [409, 509], [317, 424]].map(([x, y], index) => <g key={index}>
      <circle className="jw-xray-node-halo" cx={x} cy={y} r="11" fill="var(--jw-xray-light)" fillOpacity=".14" stroke="none" style={{ animationDelay: `${index * -.35}s` }} />
      <circle cx={x} cy={y} r="4" fill="var(--jw-xray-light)" stroke="var(--jw-xray-deep)" />
    </g>)}
    <g fill="var(--jw-xray-light)" stroke="none" fontSize="10" letterSpacing="1.8">
      <text x="330" y="203">经营主体</text><text x="465" y="316" textAnchor="end">关联企业</text><text x="365" y="430">公开线索</text>
    </g>
  </g>;
}

/** A pointer-sized lens with a persistent, keyboard/touch-accessible full-view toggle. */
export function JianweiXray() {
  const id = useId().replace(/:/g, '');
  const [hovering, setHovering] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const lens = useRef<SVGCircleElement>(null);
  const reticle = useRef<SVGGElement>(null);
  const active = hovering || revealed;

  const moveLens = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch') return;
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    lens.current?.setAttribute('cx', `${local.x}`);
    lens.current?.setAttribute('cy', `${local.y}`);
    reticle.current?.setAttribute('transform', `translate(${local.x} ${local.y})`);
    setHovering(true);
  };

  return <figure className={`jw-xray ${active ? 'is-scanning' : ''} ${revealed ? 'is-revealed' : ''}`}>
    <div className="jw-xray-heading"><span>一眼之外。</span><span className="jw-xray-edition">FIELD NOTES — 01</span></div>
    <div className="jw-xray-canvas">
      <svg className="jw-office" viewBox="0 0 820 655" role="img" aria-labelledby={`${id}-title ${id}-desc`} onPointerMove={moveLens} onPointerLeave={() => setHovering(false)}>
        <title id={`${id}-title`}>透过一栋写字楼，看见背后的企业关系</title>
        <desc id={`${id}-desc`}>鼠标移入显示局部 X 光透视，或使用下方按钮展开整栋楼。节点与连线为企业分析的交互示意。</desc>
        <defs>
          <pattern id={`${id}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><path d="M0 0v5" stroke="var(--jw-sketch-ink)" strokeWidth=".7" /></pattern>
          <pattern id={`${id}-dots`} width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="var(--jw-sketch-muted)" opacity=".22" /></pattern>
          <radialGradient id={`${id}-fade`}><stop offset="0" stopColor="white" /><stop offset="1" stopColor="black" /></radialGradient>
          <mask id={`${id}-dot-fade`}><ellipse cx="410" cy="342" rx="380" ry="320" fill={`url(#${id}-fade)`} /></mask>
          <clipPath id={`${id}-lens`}><circle ref={lens} cx="408" cy="340" r={revealed ? 1000 : 120} /></clipPath>
        </defs>
        <rect width="820" height="655" fill={`url(#${id}-dots)`} mask={`url(#${id}-dot-fade)`} />
        <g className="jw-office-guides" fill="none" stroke="var(--jw-sketch-ink)" strokeWidth=".7" opacity=".4">
          <path d="M110 565 658 253M177 334 662 582M407 28V624" strokeDasharray="2 7" />
          <path d="M188 180v334m-5-334h10m-10 334h10M598 141v343m-5-343h10m-10 343h10" />
          <path d="M163 228h-48v-50m509 257h74v52" />
        </g>
        <OfficeExterior hatchId={`${id}-hatch`} />
        <g className="jw-xray-reveal" clipPath={`url(#${id}-lens)`}><OfficeInterior /></g>
        <g className="jw-office-annotations" fill="var(--jw-sketch-ink)">
          <text x="72" y="167" transform="rotate(-7 72 167)">招牌背后，还有什么？</text>
          <text x="607" y="511" transform="rotate(6 607 511)">让关系浮现。</text>
          <g fontSize="10" letterSpacing="2" className="jw-office-technical"><text x="179" y="356" transform="rotate(-90 179 356)">FOLLOW THE EVIDENCE</text><text x="610" y="280" transform="rotate(90 610 280)">LOOK BENEATH THE SURFACE</text></g>
        </g>
        <g ref={reticle} className="jw-xray-reticle" transform="translate(408 340)" fill="none" stroke="var(--jw-blue)" pointerEvents="none">
          <circle r="122" strokeWidth="1" /><circle r="130" strokeWidth=".65" strokeDasharray="1 10" />
          <path d="M-139 0h15m124-139v15M124 0h15M0 124v15" strokeWidth="1" />
          <path d="M-7 0H7M0-7V7" stroke="var(--jw-xray-light)" opacity=".8" />
          <rect x="-49" y="137" width="98" height="23" rx="11.5" fill="var(--jw-blue)" stroke="none" /><text y="152" textAnchor="middle" fill="#fff" stroke="none" fontSize="10" letterSpacing="1.2">正在看见 · X-RAY</text>
        </g>
        <text x="58" y="615" fontSize="10" letterSpacing="1.5" fill="var(--jw-sketch-muted)">FIG. 01 — BEYOND THE FACADE</text>
      </svg>
    </div>
    <figcaption className="jw-xray-caption"><div><p>看见表面。<em>也看清关联。</em></p><span>移动鼠标，透视楼宇里的企业线索。</span></div><button type="button" className="jw-xray-toggle" aria-pressed={revealed} onClick={() => setRevealed(value => !value)}><span aria-hidden="true">{revealed ? '−' : '＋'}</span>{revealed ? '收起透视' : '展开透视'}</button></figcaption>
    <small className="jw-visual-disclaimer">交互示意 · 非真实企业数据</small>
  </figure>;
}

const evidenceNodes = [
  { x: 274, y: 244, label: '经营主体', main: true },
  { x: 112, y: 159, label: '公开公告' },
  { x: 405, y: 131, label: '关联关系' },
  { x: 466, y: 295, label: '经营变化' },
  { x: 366, y: 389, label: '待核问题' },
  { x: 154, y: 362, label: '多源核验' },
];

/** Illustrative evidence network; no business-specific assertions or invented metrics. */
export function JianweiEvidenceVisual() {
  const id = useId().replace(/:/g, '');
  return <figure className="jw-evidence-visual">
    <div className="jw-evidence-heading"><span>把线索，连成视角。</span><i aria-hidden="true">↘</i></div>
    <svg viewBox="0 0 580 550" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>企业分析的动态证据图谱</title><desc id={`${id}-description`}>公开公告、关联关系与经营变化逐一连接到经营主体，经过多源核验，形成下一步需要验证的问题。此图仅示意分析过程。</desc>
      <defs><pattern id={`${id}-grid`} width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="var(--jw-sketch-muted)" opacity=".23" /></pattern><marker id={`${id}-arrow`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="m1 1 5 3-5 3" fill="none" stroke="var(--jw-blue)" /></marker></defs>
      <rect x="18" y="45" width="544" height="405" fill={`url(#${id}-grid)`} />
      <g className="jw-evidence-orbits" fill="none" stroke="var(--jw-sketch-muted)" opacity=".24"><ellipse cx="284" cy="266" rx="215" ry="153" transform="rotate(-23 284 266)" /><circle cx="274" cy="244" r="120" strokeDasharray="2 9" /></g>
      <g fill="none" stroke="var(--jw-sketch-muted)" strokeWidth="1.1">
        <path d="M122 164Q216 146 274 244M405 131Q381 208 274 244M466 295Q397 254 274 244M366 389Q277 365 274 244M154 362Q193 276 274 244" />
        <path d="M112 159Q231 52 405 131M154 362Q220 432 366 389M405 131Q492 171 466 295" strokeDasharray="3 6" opacity=".4" />
      </g>
      <g className="jw-evidence-flow" fill="none" stroke="var(--jw-blue)" strokeWidth="2.5" strokeDasharray="6 220"><path d="M122 164Q216 146 274 244" /><path d="M405 131Q381 208 274 244" /><path d="M466 295Q397 254 274 244" /><path d="M366 389Q277 365 274 244" /><path d="M154 362Q193 276 274 244" /></g>
      <g className="jw-evidence-slip jw-evidence-slip-one" transform="translate(31 59) rotate(-10 39 48)"><path d="M0 0h65l15 15v79H0Z" fill="var(--jw-sketch-paper)" stroke="var(--jw-sketch-line)" /><path d="M65 0v15h15M12 24h35M12 36h54M12 44h45M12 52h54M12 68h27M12 75h39" fill="none" stroke="var(--jw-sketch-line)" strokeWidth="1" /><text x="12" y="17" fill="var(--jw-sketch-ink)" fontSize="8" letterSpacing="1">SOURCE 01</text></g>
      <g className="jw-evidence-slip jw-evidence-slip-two" transform="translate(409 361) rotate(9 48 39)"><path d="M0 0h103v83H0Z" fill="var(--jw-sketch-paper)" stroke="var(--jw-sketch-line)" /><path d="M12 18h40M12 32h79M12 41h69M12 50h74" stroke="var(--jw-sketch-line)" /><path d="m15 64 4 4 7-10M33 64h49" fill="none" stroke="var(--jw-blue)" /><text x="72" y="19" fill="var(--jw-blue)" fontSize="8">02</text></g>
      {evidenceNodes.map((node, index) => <g key={node.label} className={`jw-evidence-node ${node.main ? 'is-main' : ''}`}>
        <circle cx={node.x} cy={node.y} r={node.main ? 57 : 33} fill={node.main ? 'var(--jw-blue)' : 'var(--jw-sketch-paper)'} stroke={node.main ? 'var(--jw-blue)' : 'var(--jw-sketch-line)'} strokeWidth="1" />
        {node.main && <><circle className="jw-evidence-center-ring" cx={node.x} cy={node.y} r="65" fill="none" stroke="var(--jw-blue)" strokeWidth=".7" strokeDasharray="2 7" /><path d="M259 229v-17h30v17m-37 0h44v23h-44Z" fill="none" stroke="var(--jw-xray-light)" /><path d="M268 220v5m12-5v5m-20 11v5m14-5v5m13-5v5M270 252v-10h8v10" stroke="var(--jw-xray-light)" /></>}
        {!node.main && <><text x={node.x} y={node.y - 3} textAnchor="middle" fontSize="9" fontFamily="Georgia, serif" fontStyle="italic" fill="var(--jw-sketch-ink)">0{index}</text><circle className="jw-evidence-pulse" cx={node.x + 25} cy={node.y - 21} r="3" fill="var(--jw-blue)" style={{ animationDelay: `${index * -.8}s` }} /></>}
        <text x={node.x} y={node.y + (node.main ? 20 : 13)} textAnchor="middle" fontSize={node.main ? 15 : 11} fill={node.main ? 'var(--jw-sketch-paper)' : 'var(--jw-sketch-ink)'} letterSpacing={node.main ? 2 : 0}>{node.label}</text>
      </g>)}
      <g className="jw-evidence-timeline" fill="var(--jw-sketch-ink)" fontSize="10"><path d="M52 485H523" stroke="var(--jw-sketch-line)" fill="none" markerEnd={`url(#${id}-arrow)`} />{['发现', '连接', '核验', '理解'].map((label, index) => <g key={label}><circle cx={72 + index * 140} cy="485" r="3" fill="var(--jw-blue)" /><text x={72 + index * 140} y="510" textAnchor="middle">{label}</text></g>)}</g>
      <text x="38" y="33" fontSize="9" fill="var(--jw-sketch-muted)" letterSpacing="2.5">A WORKING MAP OF EVIDENCE</text>
    </svg>
    <figcaption>每一条连线，都回到它的出处。<small>分析过程示意 · 非真实企业数据</small></figcaption>
  </figure>;
}
