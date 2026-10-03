import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { JianweiArchiveDialog, type ArchiveKind } from './JianweiArchiveDialog';
import './jianwei-archive-cabinet.css';

type MagnetKind = 'brand' | 'network' | 'stamp' | 'ticket';
type Position = { x: number; y: number };
const storageKey = 'jianwei-archive-magnets-v1';
const magnets: { kind: MagnetKind; label: string; position: Position; angle: number }[] = [
  { kind: 'brand', label: '见微字标', position: { x: 16, y: 7 }, angle: -6 },
  { kind: 'network', label: '小 X 侦探', position: { x: 13, y: 40 }, angle: -9 },
  { kind: 'stamp', label: '有据可查印章', position: { x: 49, y: 64 }, angle: 12 },
  { kind: 'ticket', label: '公开资料票签', position: { x: 9, y: 78 }, angle: -6 },
];
const defaults = () => Object.fromEntries(magnets.map(item => [item.kind, { ...item.position }])) as Record<MagnetKind, Position>;
function readPositions() {
  const positions = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    for (const { kind } of magnets) {
      if (Number.isFinite(saved?.[kind]?.x) && Number.isFinite(saved?.[kind]?.y)) {
        positions[kind] = { x: Math.max(4, Math.min(55, saved[kind].x)), y: Math.max(4, Math.min(82, saved[kind].y)) };
      }
    }
  } catch { /* Storage is optional; the cabinet remains interactive without it. */ }
  return positions;
}

function ArchiveIcon({ kind }: { kind: ArchiveKind }) {
  return <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {kind === 'company' ? <><path d="M15 42V8h31v34M8 42h45M27 42V31h8v11M21 15h4m10 0h4M21 23h4m10 0h4"/><path d="M45 21h9v21"/></> : kind === 'relations' ? <><path d="m31 13-17 19m17-19 18 19M14 32h35"/><circle cx="31" cy="10" r="7"/><circle cx="12" cy="36" r="7"/><circle cx="51" cy="36" r="7"/></> : <><path d="M15 8h25l9 9v26H15ZM40 8v10h9M22 25h19M22 31h15M22 37h19"/><path d="M10 4h26M9 4v33"/><path d="m30 18-4-3"/></>}
  </svg>;
}

function MagnetArt({ kind }: { kind: MagnetKind }) {
  if (kind === 'brand') return <><strong>见微</strong><small>SEE THE CHANGE</small></>;
  if (kind === 'network') return <img src="/images/xiaox-magnet-enamel.png" alt="" draggable={false}/>;
  if (kind === 'stamp') return <><small>VERIFIED</small><strong>有据<br/>可查</strong><span>✦ ✦ ✦</span></>;
  return <><span className="jw-ticket-code">SOURCE / 01</span><strong>公开资料</strong><span className="jw-ticket-rule"/><small>每条线索，都有出处 ↗</small></>;
}

function Vents() { return <span className="jw-cabinet-vents" aria-hidden="true"><i/><i/><i/><i/></span>; }

const files: { kind: ArchiveKind; number: string; label: string; caption: string; english: string }[] = [
  { kind: 'company', number: '01', label: '企业档案', caption: '从名字，找到经营主体', english: 'COMPANY PROFILE' },
  { kind: 'relations', number: '02', label: '关联关系', caption: '把零散线索，连起来', english: 'CONNECTION MAP' },
  { kind: 'clues', number: '03', label: '公开线索', caption: '每一份记录，都有出处', english: 'PUBLIC RECORDS' },
];

export function JianweiArchiveCabinet() {
  const id = useId();
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<ArchiveKind | null>(null);
  const [positions, setPositions] = useState(readPositions);
  const [dragging, setDragging] = useState<MagnetKind | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const positionsRef = useRef(positions);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: MagnetKind; pointerId: number; startX: number; startY: number; origin: Position; maxX: number; maxY: number; width: number; height: number } | null>(null);

  const updatePosition = (kind: MagnetKind, position: Position) => {
    const next = { ...positionsRef.current, [kind]: position };
    positionsRef.current = next;
    setPositions(next);
  };
  const savePositions = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(positionsRef.current)); } catch { /* Private browsing may disable persistence. */ }
  };
  const getBounds = (target: HTMLButtonElement) => {
    const surface = board.current!;
    return { width: surface.clientWidth, height: surface.clientHeight,
      maxX: 96 - target.offsetWidth / surface.clientWidth * 100,
      maxY: 96 - target.offsetHeight / surface.clientHeight * 100 };
  };
  const beginDrag = (event: PointerEvent<HTMLButtonElement>, kind: MagnetKind) => {
    if (!event.isPrimary || event.button !== 0 || !board.current || drag.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: positionsRef.current[kind], ...getBounds(event.currentTarget) };
    setDragging(kind);
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    updatePosition(active.kind, {
      x: Math.max(4, Math.min(active.maxX, active.origin.x + (event.clientX - active.startX) / active.width * 100)),
      y: Math.max(4, Math.min(active.maxY, active.origin.y + (event.clientY - active.startY) / active.height * 100)),
    });
  };
  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(null);
    savePositions();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, kind: MagnetKind) => {
    const step = event.shiftKey ? 5 : 2;
    const delta: Record<string, Position> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    if (!delta[event.key]) return;
    event.preventDefault();
    const bounds = getBounds(event.currentTarget);
    const current = positionsRef.current[kind];
    const next = { x: Math.max(4, Math.min(bounds.maxX, current.x + delta[event.key].x)), y: Math.max(4, Math.min(bounds.maxY, current.y + delta[event.key].y)) };
    updatePosition(kind, next);
    savePositions();
    setAnnouncement(`${magnets.find(item => item.kind === kind)?.label}已移动，横向 ${Math.round(next.x)}%，纵向 ${Math.round(next.y)}%。`);
  };

  return <figure className="jw-cabinet" aria-label="见微互动档案柜">
    <div className="jw-cabinet-heading"><span>线索收藏室。</span><small>FIELD ARCHIVE — 01</small></div>
    <div className={`jw-cabinet-art ${open ? 'is-open' : ''}`}>
      <span className="jw-cabinet-note jw-cabinet-note-top">打开一份档案，<br/>多看见一点。<svg viewBox="0 0 60 36" aria-hidden="true"><path d="M3 3q10 28 49 22m-9-7 10 7-8 8"/></svg></span>
      <span className="jw-cabinet-ground" aria-hidden="true"/>
      <div className="jw-cabinet-case">
        <span className="jw-cabinet-top" aria-hidden="true"/><span className="jw-cabinet-side" aria-hidden="true"/>
        <div className="jw-cabinet-interior" id={`${id}-files`} inert={!open}>
          {files.map(file => <div className={`jw-cabinet-shelf jw-cabinet-shelf-${file.kind}`} key={file.kind}>
            <button type="button" className={`jw-cabinet-file jw-cabinet-file-${file.kind}`} onClick={() => setSelected(file.kind)} aria-label={`打开${file.label}`} aria-haspopup="dialog" disabled={!open}>
              <span className="jw-file-paper" aria-hidden="true"/><span className="jw-file-tab" aria-hidden="true">{file.number} / ARCHIVE</span>
              <span className="jw-file-cover"><span className="jw-file-topline">{file.english}<span>↗</span></span><span className="jw-file-title">{file.label}</span><span className="jw-file-bottom"><ArchiveIcon kind={file.kind}/><small>{file.caption}</small></span></span>
            </button>
            <span className="jw-shelf-edge" aria-hidden="true"/>
          </div>)}
        </div>
        <button className="jw-cabinet-left-door" type="button" tabIndex={open ? -1 : 0} aria-hidden={open} onClick={() => setOpen(true)} aria-label="打开档案柜">
          <Vents/><span className="jw-cabinet-door-label">线索档案<br/><small>OPEN TO DISCOVER</small></span><span className="jw-cabinet-handle"/><span className="jw-cabinet-door-bottom"><Vents/></span>
        </button>
        <div className="jw-cabinet-magnet-board" ref={board} aria-label="可移动的主题贴纸">
          <span className="jw-cabinet-board-vents"><Vents/></span>
          <span className="jw-cabinet-handle" aria-hidden="true"/>
          {magnets.map(magnet => <button type="button" key={magnet.kind} className={`jw-cabinet-magnet jw-magnet-${magnet.kind} ${dragging === magnet.kind ? 'is-dragging' : ''}`} style={{ left: `${positions[magnet.kind].x}%`, top: `${positions[magnet.kind].y}%`, '--magnet-angle': `${magnet.angle}deg` } as CSSProperties}
            aria-label={`移动${magnet.label}贴纸`} aria-describedby={`${id}-drag-help`} onPointerDown={event => beginDrag(event, magnet.kind)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag} onKeyDown={event => moveWithKeyboard(event, magnet.kind)}>
            <MagnetArt kind={magnet.kind}/>
          </button>)}
          <span className="jw-cabinet-rivet jw-rivet-one" aria-hidden="true"/><span className="jw-cabinet-rivet jw-rivet-two" aria-hidden="true"/>
        </div>
        <span className="jw-cabinet-plinth" aria-hidden="true"/><span className="jw-cabinet-foot jw-cabinet-foot-left" aria-hidden="true"/><span className="jw-cabinet-foot jw-cabinet-foot-right" aria-hidden="true"/>
      </div>
      <span className="jw-cabinet-note jw-cabinet-note-bottom">小线索，随手挪一挪 ↖</span>
      <span className="jw-cabinet-figure-number">FIG. 01 / A CABINET OF CURIOSITY</span>
    </div>
    <figcaption className="jw-cabinet-caption"><div><p>拉开档案。<em>看见关联。</em></p><span>点选柜内资料，翻阅招牌背后的故事。</span></div><button className="jw-cabinet-toggle" type="button" aria-expanded={open} aria-controls={`${id}-files`} onClick={() => setOpen(value => !value)}><span aria-hidden="true">{open ? '−' : '＋'}</span>{open ? '合上柜门' : '打开柜门'}</button></figcaption>
    <div className="jw-cabinet-footnote"><span id={`${id}-drag-help`}>拖动主题贴纸，自由摆放。也可聚焦后用方向键移动。</span><button type="button" onClick={() => { const next = defaults(); positionsRef.current = next; setPositions(next); savePositions(); setAnnouncement('所有贴纸已回到原位。'); }}>贴纸归位 ↺</button></div>
    <small className="jw-cabinet-disclaimer">交互示意 · 非真实企业数据</small><span className="jw-sr-only" aria-live="polite">{announcement}</span>
    <JianweiArchiveDialog kind={selected} onClose={() => setSelected(null)}/>
  </figure>;
}
