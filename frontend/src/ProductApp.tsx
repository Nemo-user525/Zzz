import {useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import DiscoveryFlow from './DiscoveryFlow';
import ChatSection from './ChatSection';
import './investigation.css';
import './discovery.css';

function ProductApp(){
  const [lens,setLens]=useState({x:60,y:57});
  const [chatCompany,setChatCompany]=useState('');
  function moveLens(event:ReactPointerEvent<HTMLDivElement>){
    if(event.pointerType==='touch')return;
    const bounds=event.currentTarget.getBoundingClientRect();
    setLens({x:Math.max(25,Math.min(78,(event.clientX-bounds.left)/bounds.width*100)),y:Math.max(25,Math.min(76,(event.clientY-bounds.top)/bounds.height*100))});
  }
  return <div className="xr-site">
    <header className="xr-nav">
      <a className="xr-brand" href="#top" aria-label="见微首页"><strong>见微</strong><small>See The Change</small></a>
      <nav aria-label="主导航"><a href="#top">Intro</a><a href="#investigate">The search</a><a href="#chat">Ask X-Ray</a><a href="/?view=consumer">消费调查</a><a href="/?view=history">历史证据</a><a href="/?view=trade">现金流演示</a></nav>
      <a className="xr-nav-action" href="#lookup">开始查证 <sup>↗</sup></a>
    </header>
    <main id="top">
      <section className="xr-hero" aria-labelledby="hero-title">
        <div className="xr-hero-intro">从细微处，看见变化</div>
        <div className="xr-editorial-stage">
          <h1 id="hero-title" className="xr-hero-title"><span>SEE THE</span><span>CHANGE</span></h1>
          <span className="xr-scribble xr-scribble-one">01 / 招牌</span><span className="xr-scribble xr-scribble-two">谁在经营？</span>
          <span className="xr-scribble xr-scribble-three">02 / 线索</span><span className="xr-scribble xr-scribble-four">发生了什么？</span><span className="xr-scribble xr-scribble-five">03 / 核对</span>
          <img className="xr-girl" src="/images/girl-investigator.png" alt="拿着放大镜观察线索的小女孩"/>
          <div className="xr-archive" onPointerMove={moveLens} style={{'--lens-x':`${lens.x}%`,'--lens-y':`${lens.y}%`} as React.CSSProperties} aria-label="鼠标移动放大镜，可透视档案盒中的线索">
            <img className="xr-archive-image" src="/images/archive-box-user.png" alt="牛皮纸档案盒"/>
            <div className="xr-magnifier" aria-hidden="true"><div className="xr-magnifier-scan"><span/><span/><span/><span/></div><img className="xr-magnifier-image" src="/images/magnifier-upright-realistic.png" alt=""/></div>
          </div>
        </div>
        <div className="xr-hero-byline"><em>见微</em> · 一次从名字开始的查证</div>
        <a className="xr-mouse-cue" href="#investigate" aria-label="向下滚动，开始查证"><svg viewBox="0 0 32 50" fill="none" aria-hidden="true"><rect x="5" y="2" width="22" height="36" rx="11" stroke="currentColor" strokeWidth="1.3"/><path d="M16 8v8M12 45l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg></a>
      </section>
      <section className="xr-manifesto" aria-label="见微的出发点"><div className="xr-manifesto-meta"><span>见微 · THE POINT OF VIEW</span><span>01 / 03</span></div><p>你看到的是一家店。<br/>值得看清的，是<span>招牌背后的经营主体。</span></p><p className="xr-manifesto-second">办卡、买课、续费之前，<br/>先把公开线索<span>放回时间里。</span></p><img src="/images/girl-investigator.png" alt="" aria-hidden="true"/><div className="xr-manifesto-foot">向下，开始追查 <span>↓</span></div></section>
      <section className="xr-investigate" id="investigate"><div className="xr-investigate-heading"><span className="xr-section-label">X-RAY / 01</span><h2>从名称开始，<br/>查找公开线索。</h2><p>输入门店、品牌或公司名称，查找可能的经营主体及相关资料。具体门店与企业的关系仍需根据营业执照、合同和收款方核对。</p><div className="xr-hero-notes"><span><b>01</b> 名称线索</span><span><b>02</b> 主体核对</span><span><b>03</b> 查证对话</span></div></div></section>
      <DiscoveryFlow onCompanySelected={setChatCompany}/>
      <ChatSection company={chatCompany}/>
      <section className="xr-method" id="how"><div className="xr-section-heading"><span className="xr-section-label">HOW X-RAY WORKS / 01—03</span><h2>让每一步判断，<br/><em>都有迹可循。</em></h2><p>从名称线索查找主体，再核对来源和经营关系，最后阅读调查结果。</p></div><div className="xr-method-grid"><article><span>01 / SEARCH</span><div className="xr-method-symbol">◎</div><h3>查找名称线索</h3><p>检索公开资料，找出可能相关的品牌和公司。</p></article><article><span>02 / IDENTITY</span><div className="xr-method-symbol">⌁</div><h3>核对经营主体</h3><p>结合营业执照、合同和收款方，确认资料属于哪家公司。</p></article><article><span>03 / EVIDENCE</span><div className="xr-method-symbol">✳</div><h3>阅读调查依据</h3><p>查看来源、时间和证据缺口，再判断预付消费风险。</p></article></div></section>
      <section className="xr-principles" id="boundaries"><div><span className="xr-section-label">DESIGNED FOR REAL DECISIONS</span><h2>把名称、企业和资料放在同一条查证路径上。</h2><p>名称相似不等于确认经营关系。调查结果会标明资料来源和仍需核对的环节。</p></div><ul><li><b>线索</b><span>公开网页与授权接口的本次查询结果</span></li><li><b>企业</b><span>可能相关的公司候选与工商记录</span></li><li><b>依据</b><span>资料来源、时间与未解决的问题</span></li></ul></section>
    </main>
    <footer className="xr-footer"><div className="xr-brand"><strong>见微</strong><small>See The Change</small></div><p>启用授权接口后可查询企业资料。请结合门店营业执照、合同抬头和收款主体核对经营关系。</p><span>© 2026 X-Ray</span></footer>
  </div>;
}

export default ProductApp;
