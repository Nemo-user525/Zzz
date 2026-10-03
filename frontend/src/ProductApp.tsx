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
      <nav aria-label="主导航"><a href="#top">Intro</a><a href="#investigate">The search</a><a href="#chat">Ask X-Ray</a><a href="#how">Our method</a></nav>
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
      <section className="xr-investigate" id="investigate"><div className="xr-investigate-heading"><span className="xr-section-label">X-RAY / 01</span><h2>先找到门店，<br/>再核对企业。</h2><p>输入门店关键词，按省、市、区、街道筛选地点。选中实际门店后，查询企查查企业候选并获取其风险扫描报告。</p><div className="xr-hero-notes"><span><b>01</b> 高德地点</span><span><b>02</b> 企业候选</span><span><b>03</b> 企查查报告</span></div></div></section>
      <DiscoveryFlow onCompanySelected={setChatCompany}/>
      <ChatSection company={chatCompany}/>
      <section className="xr-method" id="how"><div className="xr-section-heading"><span className="xr-section-label">HOW X-RAY WORKS / 01—03</span><h2>让每一步判断，<br/><em>都有迹可循。</em></h2><p>地图地点和工商企业是两类记录。先选实际门店，再核对经营主体，最后阅读企业报告。</p></div><div className="xr-method-grid"><article><span>01 / PLACE</span><div className="xr-method-symbol">◎</div><h3>定位实际门店</h3><p>通过关键词和地区筛选高德地点，确认名称与地址。</p></article><article><span>02 / IDENTITY</span><div className="xr-method-symbol">⌁</div><h3>查找经营企业</h3><p>企查查返回企业候选；请核对营业执照、合同和收款方。</p></article><article><span>03 / REPORT</span><div className="xr-method-symbol">✳</div><h3>阅读完整返回字段</h3><p>展示企业风险扫描接口本次返回的字段和时间；供应商的条数上限也会说明。</p></article></div></section>
      <section className="xr-principles" id="boundaries"><div><span className="xr-section-label">DESIGNED FOR REAL DECISIONS</span><h2>把门店、企业和资料放在同一条查证路径上。</h2><p>地图选中地点不等于确认经营关系。报告始终标明选中的企业、来源和仍需核对的环节。</p></div><ul><li><b>地点</b><span>高德返回的实际位置和地址</span></li><li><b>企业</b><span>企查查的公司候选与工商记录</span></li><li><b>报告</b><span>本次风险扫描接口返回的数据和边界</span></li></ul></section>
    </main>
    <footer className="xr-footer"><div className="xr-brand"><strong>见微</strong><small>See The Change</small></div><p>启用授权接口后可查询企业资料。请结合门店营业执照、合同抬头和收款主体核对经营关系。</p><span>© 2026 X-Ray</span></footer>
  </div>;
}

export default ProductApp;
