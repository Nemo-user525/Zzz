import asyncio
import pytest
from app.services import voice_keywords as keywords


@pytest.mark.parametrize('text,query,location', [
    ('帮我查一下杭州的乐刻健身房', '乐刻健身房', '杭州'),
    ('嗯，帮我查一下杭州的乐刻健身房，看看有没有风险。', '乐刻健身房', '杭州'),
    ('查询杭州乐刻网络技术有限公司', '杭州乐刻网络技术有限公司', '杭州'),
    ('我想了解一下海底捞的企业信息', '海底捞', ''),
    ('蜜雪冰城', '蜜雪冰城', ''),
    ('杭州银行', '杭州银行', '杭州'),
    ('帮我查一下位于上海的海底捞', '海底捞', '上海'),
    ('帮我查海底捞，城市是杭州', '海底捞', '杭州'),
    ('不对，改成蜜雪冰城', '蜜雪冰城', ''),
    ('你好', '', ''),
    ('讲个笑话', '', ''),
    ('帮我查一下', '', ''),
])
def test_local_fields(text, query, location):
    assert keywords.fallback(text).model_dump() == {'query': query, 'location': location}


def test_ambiguous_request_does_not_replace_query(monkeypatch):
    monkeypatch.setattr(keywords.consumer_model, 'effective_mode', lambda: 'offline')
    result = asyncio.run(keywords.extract('帮我查北京和上海的门店'))
    assert result['needs_clarification'] is True
    assert result['query'] == ''


def test_model_cannot_invent_company_or_rewrite_homophones(monkeypatch):
    monkeypatch.setattr(keywords.consumer_model, 'effective_mode', lambda: 'online')
    async def invented(*_args, **_kwargs):
        return keywords.Fields(query='完全不同的公司', location='杭州')
    monkeypatch.setattr(keywords.consumer_model, 'structured', invented)
    result = asyncio.run(keywords.extract('嗯，请帮我查一下杭州的乐刻健身房，看看有没有风险。'))
    assert result['query'] == '乐刻健身房'
    assert result['keyword_source'] == 'local'


def test_busy_model_does_not_delay_local_keyword_fill(monkeypatch):
    monkeypatch.setattr(keywords.consumer_model, 'effective_mode', lambda: 'online')
    async def forbidden(*_args, **_kwargs):
        pytest.fail('Must not wait behind a running enterprise investigation')
    monkeypatch.setattr(keywords.consumer_model, 'structured', forbidden)
    async def check():
        async with keywords.consumer_model.MODEL_GATE:
            return await keywords.extract('嗯，请帮我查一下杭州的乐刻健身房，看看有没有风险。')
    result = asyncio.run(check())
    assert result['query'] == '乐刻健身房'
