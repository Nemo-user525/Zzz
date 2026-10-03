import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.place_search import router
from app.services import evidence_chat as chat

app = FastAPI()
app.include_router(router)
client = TestClient(app)
BODY = {'company': '测试企业', 'question': '退款的材料说了什么？', 'sources': [
    {'id': 'E-real', 'title': '退款情况', 'excerpt': '门店表示退款申请已经受理，尚未披露完成日期。', 'verification_status': 'page_text'}]}


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(chat, 'configured', lambda: True)


def respond(monkeypatch, answerable=True, citations=None, answer='资料提到申请已受理，但没有完成日期。'):
    async def structured(instruction, payload, schema, **kwargs):
        assert payload['sources'][0]['id'] == 'E-real'
        assert '没有联网检索' in instruction
        return chat.AnswerDraft(answerable=answerable, answer=answer, citations=citations if citations is not None else [
            {'source_id': 'E-real', 'quote': '退款申请已经受理，尚未披露完成日期'}])
    monkeypatch.setattr(chat.consumer_model, 'structured', structured)


def test_without_model_no_call_and_no_invented_answer(monkeypatch):
    monkeypatch.setattr(chat, 'configured', lambda: False)
    async def forbidden(*args, **kwargs): pytest.fail('No configured model')
    monkeypatch.setattr(chat.consumer_model, 'structured', forbidden)
    response = client.post('/api/place-search/evidence-question', json=BODY)
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'answer_model_not_configured'


def test_no_sources_never_calls_model(monkeypatch):
    async def forbidden(*args, **kwargs): pytest.fail('No source evidence')
    monkeypatch.setattr(chat.consumer_model, 'structured', forbidden)
    response = client.post('/api/place-search/evidence-question', json={**BODY, 'sources': []})
    assert response.status_code == 422
    assert 'answer' not in response.json()


@pytest.mark.parametrize('citations', [[], [{'source_id': 'fabricated', 'quote': '退款申请已经受理'}], [{'source_id': 'E-real', 'quote': '已经全部退款'}]])
def test_invalid_citations_reject_entire_answer(monkeypatch, citations):
    respond(monkeypatch, citations=citations)
    response = client.post('/api/place-search/evidence-question', json=BODY)
    assert response.status_code == 502
    assert response.json()['detail']['code'] == 'answer_invalid_citation'
    assert 'answer' not in response.json()


def test_timeout_is_not_a_result(monkeypatch):
    async def timeout(*args, **kwargs): raise httpx.ReadTimeout('SECRET-IN-URL')
    monkeypatch.setattr(chat.consumer_model, 'structured', timeout)
    response = client.post('/api/place-search/evidence-question', json=BODY)
    assert response.status_code == 504
    assert 'SECRET' not in response.text
    assert 'answer' not in response.json()


def test_answer_keeps_provenance_and_exact_citations(monkeypatch):
    respond(monkeypatch)
    response = client.post('/api/place-search/evidence-question', json=BODY)
    assert response.status_code == 200
    result = response.json()
    assert result['answerable'] is True
    assert result['citations'][0]['source_id'] == 'E-real'
    assert result['citations'][0]['quote'] in BODY['sources'][0]['excerpt']
    assert '未执行新的联网查询' in result['scope']
    assert response.headers['cache-control'] == 'no-store'


def test_insufficient_evidence_is_explicit(monkeypatch):
    respond(monkeypatch, answerable=False, citations=[], answer='潜在未经支持的说明')
    response = client.post('/api/place-search/evidence-question', json=BODY)
    assert response.status_code == 200
    assert response.json()['answerable'] is False
    assert '潜在未经支持' not in response.text
    assert '不足以回答' in response.json()['answer']


@pytest.mark.parametrize('bad', [
    {**BODY, 'question': 'x' * 401},
    {**BODY, 'sources': BODY['sources'] * 13},
    {**BODY, 'sources': BODY['sources'] * 2},
    {**BODY, 'sources': [{**BODY['sources'][0], 'excerpt': 'x' * 1601}]},
    {**BODY, 'sources': [{**BODY['sources'][0], 'verification_status': 'verified'}]},
])
def test_request_bounds_reject_before_model(monkeypatch, bad):
    async def forbidden(*args, **kwargs): pytest.fail('Input bounds were not checked')
    monkeypatch.setattr(chat.consumer_model, 'structured', forbidden)
    assert client.post('/api/place-search/evidence-question', json=bad).status_code == 422
