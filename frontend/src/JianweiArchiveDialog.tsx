import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import './jianwei-archive-dialog.css';

export type ArchiveKind = 'company' | 'relations' | 'clues';

const archiveTabs: { kind: ArchiveKind; title: string; english: string; description: string }[] = [
  { kind: 'company', title: '企业档案', english: 'COMPANY PROFILE', description: '先认清招牌背后，真正与你交易的那家公司。' },
  { kind: 'relations', title: '关联关系', english: 'CONNECTED ENTITIES', description: '沿着名字和材料，厘清谁经营、谁收款、谁履约。' },
  { kind: 'clues', title: '公开线索', english: 'PUBLIC EVIDENCE', description: '把看见的信息，放回有出处、有时间的上下文。' },
];

function CompanyArchive() {
  return <>
    <div className="jw-dossier-identity">
      <span className="jw-dossier-building" aria-hidden="true"><svg viewBox="0 0 56 56" fill="none"><path d="M10 47V18h24v29M34 27h12v20M6 47h44M16 12h12v6M19 47V36h7v11M17 25h3m5 0h3m-11 5h3m5 0h3m13 4h3m-3 6h3" /></svg></span>
      <div><span className="jw-dossier-micro">档案对象 / 示例</span><h3>未命名门店</h3><p>从一个门店名，开始确认经营主体。</p></div>
      <span className="jw-dossier-status">待核对</span>
    </div>
    <dl className="jw-dossier-fields">
      <div><dt>企业全称</dt><dd>查看营业执照上的登记名称，核对合同落款。</dd></div>
      <div><dt>统一社会信用代码</dt><dd>用唯一的身份标识，区分相似名称的企业。</dd></div>
      <div><dt>登记与经营信息</dt><dd>记录登记状态、成立时间与地址，并保留来源。</dd></div>
      <div><dt>实际交易主体</dt><dd>对照合同主体、收款名称与发票抬头是否一致。</dd></div>
    </dl>
    <p className="jw-dossier-note"><span aria-hidden="true">↳</span> 招牌是线索，企业全称才是查证的起点。</p>
  </>;
}

function RelationsArchive() {
  return <>
    <div className="jw-dossier-map" aria-label="关系核对示意：门店品牌、经营主体和收款主体之间的关系均待核实">
      <div className="jw-dossier-map-node"><span>01 / 看见的名字</span><strong>门店品牌</strong><small>招牌 · 宣传材料</small></div>
      <span className="jw-dossier-map-link" aria-hidden="true">···<i>?</i>···</span>
      <div className="jw-dossier-map-node is-central"><span>02 / 查证的中心</span><strong>经营主体</strong><small>执照 · 合同落款</small></div>
      <span className="jw-dossier-map-link" aria-hidden="true">···<i>?</i>···</span>
      <div className="jw-dossier-map-node"><span>03 / 交易的去向</span><strong>收款主体</strong><small>账单 · 发票抬头</small></div>
    </div>
    <dl className="jw-dossier-fields">
      <div><dt>主体之间的关系</dt><dd>名称是否对应？若不一致，需要什么材料解释？</dd></div>
      <div><dt>关联企业与人员</dt><dd>按公开登记资料核对股东、任职与分支机构。</dd></div>
      <div><dt>关系的时间范围</dt><dd>区分历史关系与当前关系，记录材料的日期。</dd></div>
    </dl>
    <p className="jw-dossier-note"><span aria-hidden="true">↳</span> 同一个品牌，不一定由同一家企业经营。</p>
  </>;
}

function CluesArchive() {
  const entries = [
    { title: '登记资料', subtitle: '先确认是谁', body: '核对登记名称、经营状态与变更记录，记下查询日期。' },
    { title: '公开公告', subtitle: '再看发生了什么', body: '回到公告原文，分清事件时间、发布主体与具体对象。' },
    { title: '交易材料', subtitle: '最后对照自己的问题', body: '把合同、账单与发票放在一起，列出需要进一步核对之处。' },
  ];
  return <>
    <ol className="jw-dossier-clues">
      {entries.map((entry, index) => <li key={entry.title}>
        <span className="jw-dossier-clue-index">0{index + 1}</span>
        <div><div className="jw-dossier-clue-heading"><h3>{entry.title}</h3><span>{entry.subtitle}</span></div><p>{entry.body}</p></div>
      </li>)}
    </ol>
    <div className="jw-dossier-source"><span className="jw-dossier-micro">一条可回看的线索</span><p>原始出处 <span>＋</span> 发布时间 <span>＋</span> 核对记录</p></div>
    <p className="jw-dossier-note"><span aria-hidden="true">↳</span> 一条线索需要核验，也需要它的上下文。</p>
  </>;
}

function ArchiveDocument({ kind, onClose }: { kind: ArchiveKind; onClose: () => void }) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const backdropPointerDown = useRef(false);
  const [activeKind, setActiveKind] = useState(kind);
  const activeIndex = archiveTabs.findIndex(tab => tab.kind === activeKind);
  const activeTab = archiveTabs[activeIndex];

  useEffect(() => setActiveKind(kind), [kind]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    headingRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const switchTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % archiveTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index + archiveTabs.length - 1) % archiveTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = archiveTabs.length - 1;
    else return;
    event.preventDefault();
    setActiveKind(archiveTabs[nextIndex].kind);
    tabRefs.current[nextIndex]?.focus();
  };

  return <dialog
    ref={dialogRef}
    className="jw-archive-dialog"
    aria-labelledby={`${id}-heading`}
    aria-describedby={`${id}-disclaimer`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { backdropPointerDown.current = event.target === event.currentTarget; }}
    onClick={event => {
      if (event.target !== event.currentTarget || !backdropPointerDown.current) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
  >
    <div className="jw-dossier-paper">
      <div className="jw-dossier-topline"><span>见微 / RESEARCH ARCHIVE</span><button type="button" className="jw-dossier-close" onClick={onClose} aria-label="关闭档案"><span aria-hidden="true">×</span></button></div>
      <div className="jw-dossier-tabs" role="tablist" aria-label="档案分类">
        {archiveTabs.map((tab, index) => <button
          key={tab.kind}
          ref={element => { tabRefs.current[index] = element; }}
          type="button"
          role="tab"
          id={`${id}-tab-${tab.kind}`}
          aria-controls={`${id}-panel-${tab.kind}`}
          aria-selected={activeKind === tab.kind}
          tabIndex={activeKind === tab.kind ? 0 : -1}
          onClick={() => setActiveKind(tab.kind)}
          onKeyDown={event => switchTab(event, index)}
        ><span aria-hidden="true">0{index + 1}</span>{tab.title}</button>)}
      </div>
      <div className="jw-dossier-content" id={`${id}-panel-${activeKind}`} role="tabpanel" aria-labelledby={`${id}-tab-${activeKind}`} tabIndex={0}>
        <header className="jw-dossier-heading">
          <span className="jw-dossier-micro">0{activeIndex + 1} / {activeTab.english}</span>
          <h2 id={`${id}-heading`} ref={headingRef} tabIndex={-1}>{activeTab.title}<span aria-hidden="true">↗</span></h2>
          <p>{activeTab.description}</p>
        </header>
        {activeKind === 'company' ? <CompanyArchive /> : activeKind === 'relations' ? <RelationsArchive /> : <CluesArchive />}
      </div>
      <footer className="jw-dossier-footer">
        <div><span id={`${id}-disclaimer`}>交互示意 · 非真实企业数据</span><small>带着自己的问题，建立第一份档案。</small></div>
        <a href="/#investigate" onClick={onClose}>开始观察查 <span aria-hidden="true">↗</span></a>
      </footer>
      <div className="jw-dossier-folio" aria-hidden="true"><span>LOOK CLOSER. UNDERSTAND MORE.</span><span>0{activeIndex + 1} / 03</span></div>
    </div>
  </dialog>;
}

/** Mount the native modal only while an archive is selected, preserving its opener's focus. */
export function JianweiArchiveDialog({ kind, onClose }: { kind: ArchiveKind | null; onClose: () => void }) {
  return kind ? <ArchiveDocument kind={kind} onClose={onClose} /> : null;
}
