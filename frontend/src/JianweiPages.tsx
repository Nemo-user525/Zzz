import { JianweiPerson } from './JianweiPeople';
import { JianweiAbout, JianweiFooter } from './JianweiLanding';

export function JianweiMethodPage({ returnTo = '/' }: { returnTo?: string }) {
  return <><main className="jw-document-page" id="method">
    <div className="jw-document-location"><a className="jw-text-link" data-jw-return href={returnTo}>{returnTo.startsWith('/investigations/') ? '← 返回刚才的查证' : '← 返回首页'}</a><span>方法与边界</span></div><p className="jw-overline">OUR METHOD</p>
    <h1 tabIndex={-1}>知道什么，<br/><em>也说清不知道什么。</em></h1>
    <p className="jw-document-lead">从招牌到经营主体，从一条线索到原始出处。见微整理资料与付款前的问题，帮助你把下一步问得更具体。</p>
    <ol className="jw-method-detail">
      <li><b>01</b><div><h2>先核对，是不是同一家。</h2><p>品牌、总部、加盟商、分店和收款公司可能不同。候选默认不勾选；你可以选择“我无法确认”。用户选择只是研究对象，不能替代对营业执照、合同和收款方的独立核对。</p></div></li>
      <li><b>02</b><div><h2>每条信息，都回到出处。</h2><p>搜索摘要标为未核实线索。读到了网页正文，只能说明原文已读取；接口返回也不等于核对过原始公示。发生时间与披露时间分开看，日期未知就标注未知。</p><dl><dt>搜索线索</dt><dd>来自网页摘要，尚未独立核验。</dd><dt>已读取原文</dt><dd>还需核对相关主体、日期及上下文。</dd><dt>接口记录</dt><dd>保留接口取得时间与说明，不自动升级为事实。</dd><dt>已核实事实</dt><dd>需要原文、主体和日期的联合核验。当前自动查询尚未提供这一等级，核对卡不会虚增数量。</dd></dl></div></li>
      <li><b>03</b><div><h2>带走问题，不替你作保证。</h2><p>金额、期限和办卡意图用于生成核对清单，不被解释成风险概率。未确认主体时，不把某家公司的负面信息直接归到门店名下。来源失败、没有结果和资料不足都会分别说明。</p></div></li>
    </ol>
    <section className="jw-boundary"><h2>来源与能力边界</h2><p>实际接入状态以查询页及本次查证记录为准。公开网页检索与已配置的企业信息接口可能受网络、授权和覆盖范围影响；未接入的渠道不会标成成功。</p><p>没有查到，不等于没有发生。出现更新、澄清或不同解释时应一并核对；保存记录超过 24 小时会建议重新查询，这不是法律规定的有效期。</p><p>查询草稿与结果只在当前浏览器标签页的会话中保存。导出的核对卡保留原查询时间，不会自动更新。你可以在查证页清除本次记录。</p><p>见微不提供安全评级、倒闭预测、个案法律结论或付款保证。</p></section>
    <div className="jw-document-actions"><a className="jw-flow-back" data-jw-return href={returnTo}>← 返回刚才的位置</a><a className="consumer-primary" href="/investigations/new">带着问题，观察查 →</a></div>
  </main><JianweiAbout/><JianweiFooter pageTop="/method"/></>;
}

export function JianweiStoryPage({ returnTo = '/' }: { returnTo?: string }) {
  return <main className="jw-document-page jw-story-page">
    <div className="jw-document-location"><a className="jw-text-link" data-jw-return href={returnTo}>{returnTo.startsWith('/investigations/') ? '← 返回，保留刚才填写的内容' : '← 返回首页'}</a><span>一次查证</span></div><p className="jw-demo-label">虚构故事 · 门店、金额与材料均为演示情景</p>
    <h1 tabIndex={-1}>签字之前，<br/><em>多问一层。</em></h1>
    <section className="jw-story-act"><span>第一幕 · 招牌</span><h2>准备付 3999 元，<br/>买一张 12 个月年卡。</h2><p>“这家店就在楼下，看起来不错。”可是，招牌上的名字，就是合同里负责履约的公司吗？</p><div className="jw-story-sign">某健身门店<small>虚构门店 · 仅演示核对过程</small></div><JianweiPerson role="detective"/></section>
    <section className="jw-story-act"><span>第二幕 · 主体</span><h2>钱，究竟付给谁？</h2><p>点击展开三张纸，看看同一个消费场景里，哪些名字还没有对上。</p><div className="jw-story-papers"><details><summary>营业执照 ↗</summary><p>示例经营主体：甲方健身服务有限公司（虚构）。门店地址仍需与执照核对。</p></details><details><summary>合同抬头 ↗</summary><p>示例合同写着“乙方体育管理有限公司”（虚构），与执照名称不同，需要解释和书面依据。</p></details><details><summary>收款信息 ↗</summary><p>实际收款方尚未提供。不能因为招牌相同，就默认三者是同一家公司。</p></details></div></section>
    <section className="jw-story-act"><span>第三幕 · 下一步</span><h2>把未知，<br/>变成能问出口的问题。</h2><ul><li>已知：你打算预付的金额与服务期限。</li><li>未知：营业执照、合同与收款方的对应关系。</li><li>要问：谁负责履约？未使用服务如何处理？能否写入合同？</li></ul><p>故事没有给这家虚构门店打分。它只说明：付款前，可以把问题问得更清楚。</p></section>
    <div className="jw-document-actions"><a className="jw-flow-back" data-jw-return href={returnTo}>← 返回刚才的位置</a><a className="consumer-primary" href="/investigations/new">查我准备办卡的店 →</a></div>
  </main>;
}

export function JianweiExample({ compact = false, returnTo = '/' }: { compact?: boolean; returnTo?: string }) {
  const card = <><p className="jw-demo-label">虚构示范 · 不对应任何真实门店 · 不是实时查询结果</p><h2>一张核对卡，<br/>留下已知与未知。</h2><dl className="jw-example-list"><dt>我准备做什么</dt><dd>首次办卡 · 3999 元 · 12 个月。均为演示设定。</dd><dt>经营主体</dt><dd>未确认。营业执照、合同与收款方还没有核对一致。</dd><dt>已核实事实</dt><dd>0 条。示范没有接入真实企业材料。</dd><dt>其他线索</dt><dd>两张虚构材料的公司名称不一致，只能提出问题，不能得出不良经营结论。</dd><dt>付款前要问</dt><dd>谁收钱、谁履约、未使用服务如何处理？请门店提供可核对的书面依据。</dd></dl><a className="jw-text-link" href="/investigations/new">开始自己的观察查 ↗</a></>;
  return compact ? <section className="jw-example-preview"><details><summary>看一次完整查证 · 虚构示范 <span>＋</span></summary>{card}<a href="/examples/gym-card" className="jw-text-link">单独打开示范卡 ↗</a></details></section> : <main className="jw-document-page"><div className="jw-document-location"><a className="jw-text-link" data-jw-return href={returnTo}>← 返回刚才的位置</a><span>示范核对卡</span></div><h1 tabIndex={-1}>一次查证，会带走什么。</h1>{card}<p className="jw-example-boundary">该示范只解释产品步骤，不是来源已核验的真实案例。实时查询失败时不会自动展示此示范。</p></main>;
}
