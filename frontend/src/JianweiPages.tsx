import { JianweiPerson } from './JianweiPeople';
import { JianweiAbout, JianweiFooter } from './JianweiLanding';

export function JianweiMethodPage({ returnTo = '/' }: { returnTo?: string }) {
  return <><main className="jw-document-page" id="method">
    <div className="jw-document-location"><a className="jw-text-link" data-jw-return href={returnTo}>{returnTo.startsWith('/investigations/') ? '← 返回刚才的查证' : '← 返回首页'}</a><span>方法与边界</span></div><p className="jw-overline">OUR METHOD</p>
    <h1 tabIndex={-1}>知道什么，<br/><em>据此给出判断。</em></h1>
    <p className="jw-document-lead">从招牌到经营主体，从公开资料到风险结论。见微综合本次检索的信息，给出低、中、高风险初判，以及判断依据和付款建议。</p>
    <ol className="jw-method-detail">
      <li><b>01</b><div><h2>先核对，是不是同一家。</h2><p>品牌、总部、加盟商、分店和收款公司可能不同。候选默认不勾选；你可以选择“我无法确认”。用户选择只是研究对象，不能替代对营业执照、合同和收款方的独立核对。</p></div></li>
      <li><b>02</b><div><h2>综合资料，形成判断。</h2><p>搜索摘要、网页正文与企业接口资料都可参与初步判断，无须等待每条信息独立核验完成。结合主体相关性、时间与正反面信息评估；持续稳定的经营和履约材料可以支持低风险，明确的不利材料会提高风险等级。</p><dl><dt>搜索摘要</dt><dd>保留摘要内容及原始链接，结合其他来源阅读。</dd><dt>网页正文</dt><dd>保留原文引用，并区分发生时间与披露时间。</dd><dt>接口记录</dt><dd>保留取得时间、来源类型与返回说明。</dd><dt>判断依据</dt><dd>同时呈现支持结论和相反的信息；资料范围与来源状态可在详情中查看。</dd></dl></div></li>
      <li><b>03</b><div><h2>给出结论，也给出行动。</h2><p>风险判断卡先展示风险等级、主要理由和付款建议，再提供出处与补充问题。金额、期限和消费意图用于细化行动建议。主体不明确或没有可用资料时，按中风险采取保守的付款策略，这不表示企业已经出现经营问题。</p></div></li>
    </ol>
    <section className="jw-boundary"><h2>来源与判断范围</h2><p>公开网页检索与企业信息接口可能受网络、授权和覆盖范围影响；实际查询动作与来源状态保留在查证记录中。</p><p>结论基于本次取得的资料。新公告、回应和相反信息都可能改变判断；保存记录超过 24 小时会建议重新查询。</p><p>查询草稿与结果只在当前浏览器标签页的会话中保存。导出的风险判断卡保留原查询时间，不会自动更新。你可以在查证页清除本次记录。</p><p>风险等级是基于公开资料的初步判断，不是付款保证。</p></section>
    <div className="jw-document-actions"><a className="jw-flow-back" data-jw-return href={returnTo}>← 返回刚才的位置</a><a className="consumer-primary" href="/investigations/new">带着问题，观察查 →</a></div>
  </main><JianweiAbout/><JianweiFooter pageTop="/method"/></>;
}

export function JianweiStoryPage({ returnTo = '/' }: { returnTo?: string }) {
  return <main className="jw-document-page jw-story-page">
    <div className="jw-document-location"><a className="jw-text-link" data-jw-return href={returnTo}>{returnTo.startsWith('/investigations/') ? '← 返回，保留刚才填写的内容' : '← 返回首页'}</a><span>一次查证</span></div><p className="jw-demo-label">虚构故事 · 门店、金额与材料均为演示情景</p>
    <h1 tabIndex={-1}>签字之前，<br/><em>多问一层。</em></h1>
    <section className="jw-story-act"><span>第一幕 · 招牌</span><h2>准备付 3999 元，<br/>买一张 12 个月年卡。</h2><p>“这家店就在楼下，看起来不错。”可是，招牌上的名字，就是合同里负责履约的公司吗？</p><div className="jw-story-sign">某健身门店<small>虚构门店 · 仅演示核对过程</small></div><JianweiPerson role="detective"/></section>
    <section className="jw-story-act"><span>第二幕 · 主体</span><h2>钱，究竟付给谁？</h2><p>点击展开三张纸，看看同一个消费场景里，哪些名字还没有对上。</p><div className="jw-story-papers"><details><summary>营业执照 ↗</summary><p>示例经营主体：甲方健身服务有限公司（虚构）。门店地址仍需与执照核对。</p></details><details><summary>合同抬头 ↗</summary><p>示例合同写着“乙方体育管理有限公司”（虚构），与执照名称不同，需要解释和书面依据。</p></details><details><summary>收款信息 ↗</summary><p>实际收款方尚未提供。不能因为招牌相同，就默认三者是同一家公司。</p></details></div></section>
    <section className="jw-story-act"><span>第三幕 · 下一步</span><h2>有了判断，<br/>下一步就更具体。</h2><ul><li>初步建议：按中风险控制预付，优先按次或短期付款。</li><li>判断依据：营业执照、合同与收款方的对应关系尚不明确。</li><li>下一步：问清谁负责履约、未使用服务如何处理，并写入合同。</li></ul><p>这是针对虚构场景的付款策略，不表示门店已经出现经营问题。真实查询会综合取得的企业资料给出判断。</p></section>
    <div className="jw-document-actions"><a className="jw-flow-back" data-jw-return href={returnTo}>← 返回刚才的位置</a><a className="consumer-primary" href="/investigations/new">查我准备办卡的店 →</a></div>
  </main>;
}

export function JianweiExample({ compact = false, returnTo = '/' }: { compact?: boolean; returnTo?: string }) {
  const card = <><p className="jw-demo-label">虚构示范 · 不对应任何真实门店 · 不是实时查询结果</p><h2>一张风险判断卡，<br/>带走结论与行动。</h2><dl className="jw-example-list"><dt>我准备做什么</dt><dd>首次办卡 · 3999 元 · 12 个月。均为演示设定。</dd><dt>经营主体</dt><dd>未确认。营业执照、合同与收款方还没有核对一致。</dd><dt>付款建议</dt><dd>中风险：控制预付金额，优先按次或短期支付。</dd><dt>判断依据</dt><dd>两张虚构材料的公司名称不一致，付款策略因此偏保守，不表示企业已发生经营问题。</dd><dt>付款前要问</dt><dd>谁收钱、谁履约、未使用服务如何处理？请门店提供可核对的书面依据。</dd></dl><a className="jw-text-link" href="/investigations/new">开始自己的观察查 ↗</a></>;
  return compact ? <section className="jw-example-preview"><details><summary>看一次完整查证 · 虚构示范 <span>＋</span></summary>{card}<a href="/examples/gym-card" className="jw-text-link">单独打开示范卡 ↗</a></details></section> : <main className="jw-document-page"><div className="jw-document-location"><a className="jw-text-link" data-jw-return href={returnTo}>← 返回刚才的位置</a><span>示范核对卡</span></div><h1 tabIndex={-1}>一次查证，会带走什么。</h1>{card}<p className="jw-example-boundary">该示范只解释产品步骤，不是来源已核验的真实案例。实时查询失败时不会自动展示此示范。</p></main>;
}
