import json
import socket
from fastapi.testclient import TestClient
from app.main import app
from app.db.models import ROOT
from app.db.seed import seed


def test_core_path_needs_neither_external_network_nor_llm_key(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'offline')
    monkeypatch.delenv('LLM_API_KEY', raising=False)
    def denied(*args, **kwargs):
        raise AssertionError('core demo attempted an external network connection')
    monkeypatch.setattr(socket, 'create_connection', denied)
    original = socket.socket.connect
    def local_only(sock, address):
        if isinstance(address, tuple) and address[0] not in ('127.0.0.1', '::1', 'localhost'):
            denied()
        return original(sock, address)
    monkeypatch.setattr(socket.socket, 'connect', local_only)
    assert seed()['verified_sources'] == 2
    client = TestClient(app)
    inp = json.loads((ROOT / 'data/demo_scenarios.json').read_text(encoding='utf-8'))
    health = client.get('/api/health').json()
    assert health['llm_mode'] == 'offline'
    company = client.get('/api/companies/'+inp['company_id']).json()
    for source_id in {fact['source_id'] for fact in company['financials']}:
        assert client.get('/api/sources/'+source_id).json()['accessible']
    assert client.post('/api/simulations', json=inp).json()['minimum_balance_yuan'] == 30000
    inp['prepayment_rate'] = .3
    assert client.post('/api/simulations', json=inp).json()['minimum_balance_yuan'] == 330000
    assert len(client.post('/api/compare-scenarios', json=inp).json()['variants']) == 4
