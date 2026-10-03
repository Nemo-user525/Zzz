"""Evidence coverage and actionable leads, never an invented company score."""
import re
from app.schemas.consumer import Indicator
from app.services.consumer_search import signal_matches, publisher_key

SIGNALS = {
    'continuity': ('服务能否持续', r'停业|闭店|歇业|交接|搬迁|恢复营业|营业安排|承接', ['当前门店实际营业情况', '未来服务承接安排']),
    'refund': ('退款与履约线索', r'退款|退费|课包|会员权益|预付|储值|履约', ['具体订单与剩余服务是否涉及', '当前退款或服务履行进度']),
    'changes': ('经营主体有何变化', r'注销|吊销|变更|更名|处罚|执行|诉讼|经营异常', ['准确事件主体、发生日及后续处理', '与所选门店是否有关']),
}


def build(identity, sources, trace, findings):
    sources = [s for s in sources if s.scope == 'selected_entity']
    ids = [s.id for s in sources]
    rows = [Indicator(id='identity', label='门店与公司是否对应', status='needs_verification',
        value='已选研究对象 · 门店归属待核实', explanation='网页提及和企业登记只能帮助识别公司；选择公司不等于确认它运营这家门店。',
        source_ids=[i for i in identity.source_ids if i in ids], missing=['具体门店营业执照', '品牌、加盟商、运营方的关联依据'])]
    for key, (label, pattern, missing) in SIGNALS.items():
        matches = [s for s in sources if signal_matches(s, pattern)]
        rows.append(Indicator(id=key, label=label, status='leads_found' if matches else 'unknown',
            value=f'{len(matches)} 条待核实材料' if matches else '资料不足',
            explanation='这些材料提到了相关事项，含正反两种可能；关键词命中不是异常认定，也不能证明会影响这家门店。' if matches else '本次资料不足以判断；未找到记录不能解释为没有问题。',
            source_ids=[s.id for s in matches], missing=missing))
    counter = [s for s in sources if signal_matches(s, r'恢复营业|复业|撤销处罚|移出异常|已退款|完成退款|承接方案|澄清|情况说明')]
    searched = any(t.action == '回应反证' and t.status == 'completed' for t in trace)
    rows.append(Indicator(id='counter', label='回应与后续处理', status='leads_found' if counter else 'searched' if searched else 'unknown',
        value=f'{len(counter)} 条回应线索' if counter else '已检索，未找到可用回应' if searched else '补查未完成',
        explanation='回应或恢复信息需与同一主体、同一事件对应；不能自动抵消其他担忧。',
        source_ids=[s.id for s in counter], missing=['回应是否针对同一事件', '处理是否已经落实']))
    pages = sum(s.verification_status == 'page_text' for s in sources)
    registry = sum(s.verification_status == 'provider_response' for s in sources)
    publishers = len({publisher_key(s.url) for s in sources})
    rows.append(Indicator(id='coverage', label='判断依据够不够', status='partial' if sources else 'unknown',
        value=f'{len(sources)} 条来源 · {publishers} 个站点',
        explanation=f'取得 {pages} 份网页正文、{registry} 条工商接口材料；其余为搜索摘要。站点可能转载同一消息，数量不等于独立事实数或可信度。',
        source_ids=ids, missing=['完整的事件时间与历史基线', '来源真实性及门店适用范围']))
    for row in rows:
        row.agent_findings = [f for f in findings if f.indicator_id == row.id]
    return rows
