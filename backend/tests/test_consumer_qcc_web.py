import asyncio
import json
from datetime import datetime, timezone
import httpx
import pytest
from starlette.requests import Request
from app.api.consumer import local_operator
from app.services import consumer_qcc_session as session, consumer_qcc_web as imported, consumer_search as web

URL='https://www.qcc.com/firm/c75e42376577558cd17cbb2d5b3dbc16.html'
NAME='测试服务有限公司'


def test_cookie_only_goes_to_company_page_and_redirect_is_not_followed(monkeypatch):
    monkeypatch.setattr(session,'session_cookie','session=test-secret')
    async def addresses(*args):pass
    monkeypatch.setattr(web,'public_addresses',addresses)
    original=httpx.AsyncClient;calls=[]
    def serve(request):
        calls.append(request)
        assert request.url.host=='www.qcc.com' and request.headers['cookie']=='session=test-secret'
        return httpx.Response(302,headers={'location':'https://outside.example/collect'})
    monkeypatch.setattr(session.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(serve),follow_redirects=False))
    source=web.make_source(NAME,URL,NAME+'公开基本信息','测试')
    assert asyncio.run(session.read(source))=='' and len(calls)==1
    assert 'test-secret' not in source.model_dump_json()
    for url in ('https://qcc.com.evil.example/firm/a.html',URL+'?cookie=x',URL.replace('www.qcc.com','127.0.0.1'),URL.replace('https:','http:'),URL.replace('/firm/','/login/')):
        assert not session.company_page(url)


def test_login_and_rate_limit_are_distinct(monkeypatch):
    original=httpx.AsyncClient
    async def addresses(*args):pass
    monkeypatch.setattr(web,'public_addresses',addresses)
    for code,expected in [(401,'login_required'),(403,'access_denied'),(405,'rate_limited'),(429,'rate_limited')]:
        monkeypatch.setattr(session.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(lambda r:httpx.Response(code))))
        source=web.make_source(NAME,URL,NAME+'公开基本信息','测试')
        assert asyncio.run(session.read(source))==''
        assert session.status()['status']==expected


def test_session_input_and_local_configuration_reject_credential_leaks(monkeypatch):
    monkeypatch.setattr(session,'session_cookie',None)
    monkeypatch.setattr(session,'last_status','not_configured')
    with pytest.raises(ValueError):session.configure('session=x\r\nX-Header: x')
    session.configure('session=secret')
    assert 'secret' not in json.dumps(session.status())
    session.configure('');assert not session.status()['configured']
    def req(host='127.0.0.1:8086',client='127.0.0.1',extra=[]):
        return Request({'type':'http','scheme':'http','server':('127.0.0.1',8086),'path':'/','query_string':b'',
            'client':(client,1234),'headers':[(b'host',host.encode()),*extra]})
    assert local_operator(req())
    assert not local_operator(req(host='public.example'))
    assert not local_operator(req(extra=[(b'origin',b'https://evil.example')]))
    assert not local_operator(req(extra=[(b'cf-connecting-ip',b'8.8.8.8')]))
    assert not local_operator(req(client='8.8.8.8'))


def test_har_import_only_keeps_matching_business_fields():
    payload={'Name':NAME,'Status':'存续','Cookie':'secret','accessToken':'secret','phone':'private','child':{'Name':'其他公司','Status':'注销'}}
    entry={'startedDateTime':datetime.now(timezone.utc).isoformat(),'request':{'url':URL+'?token=secret','headers':[{'name':'Cookie','value':'secret'}]},
        'response':{'status':200,'headers':[{'name':'Set-Cookie','value':'secret'}],'content':{'mimeType':'application/json','text':json.dumps(payload)}}}
    rows=imported.extract_har({'log':{'entries':[entry]}},NAME)
    assert len(rows)==1 and rows[0].verification_status=='search_excerpt'
    result=rows[0].model_dump_json()
    assert '存续' in result and 'secret' not in result and 'private' not in result and '注销' not in result
    assert not imported.extract_har({'log':{'entries':[entry]}},'不匹配公司')
    entry['request']['url']='https://qcc.com.evil.example/data'
    assert not imported.extract_har({'log':{'entries':[entry]}},NAME)
