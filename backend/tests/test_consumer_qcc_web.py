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


@pytest.fixture(autouse=True)
def isolated_session(monkeypatch, tmp_path):
    monkeypatch.setenv('QCC_PROVIDER','direct')
    monkeypatch.setattr(session,'BUNDLED_SESSION',tmp_path/'qcc-web-session.json')
    monkeypatch.setattr(session,'session_cookie',None)
    monkeypatch.setattr(session,'last_status','not_configured')
    monkeypatch.setattr(session,'last_http_status',None)
    monkeypatch.setattr(session,'last_error_code',None)
    monkeypatch.delenv('QCC_WEB_COOKIE',raising=False)


def test_bundled_session_loads_without_env_and_outside_project_cwd(monkeypatch, tmp_path):
    session.BUNDLED_SESSION.write_text(json.dumps({'cookie':'session=bundled-test'}),encoding='utf-8')
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv('QCC_WEB_COOKIE','')
    assert session.cookie()=='session=bundled-test'
    assert session.status()['configured'] is True
    assert 'bundled-test' not in json.dumps(session.status())


def test_env_and_operator_session_override_bundled_cookie(monkeypatch):
    session.BUNDLED_SESSION.write_text(json.dumps({'cookie':'session=bundled-test'}),encoding='utf-8')
    monkeypatch.setenv('QCC_WEB_COOKIE','session=env-test')
    assert session.cookie()=='session=env-test'
    session.configure('session=operator-test')
    assert session.cookie()=='session=operator-test'
    session.configure('')
    assert not session.cookie() and not session.status()['configured']


def test_missing_or_invalid_bundled_session_does_not_break_startup():
    assert session.cookie()==''
    for raw in ('invalid json','[]','{}','{"cookie":null}','{"cookie":42}',
                json.dumps({'cookie':'session=x\r\nX-Header: x'}),json.dumps({'cookie':'x='+'a'*16384})):
        session.BUNDLED_SESSION.write_text(raw,encoding='utf-8')
        assert session.cookie()==''


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


def test_search_disclosed_legacy_company_url_uses_session_validation(monkeypatch):
    seen=[]
    async def read(source):
        seen.append(source.url)
        return 'company detail'
    monkeypatch.setattr(session,'read',read)
    legacy=URL.replace('/firm/','/firm_')
    assert session.company_page(legacy)
    assert asyncio.run(web.read_page(web.make_source(NAME,legacy,NAME,'测试')))=='company detail'
    assert seen==[legacy]
    for other in ('https://www.qcc.com/',legacy+'?tracking=1','https://m.qcc.com/firm/unknown.html'):
        source=web.make_source(NAME,legacy,NAME,'测试').model_copy(update={'url':other})
        assert asyncio.run(web.read_page(source))==''
        assert '不是受支持' in source.page_status
    assert seen==[legacy]


def test_login_and_rate_limit_are_distinct(monkeypatch):
    original=httpx.AsyncClient
    async def addresses(*args):pass
    monkeypatch.setattr(web,'public_addresses',addresses)
    for code,expected in [(401,'login_required'),(403,'access_denied'),(405,'rate_limited'),(429,'rate_limited')]:
        monkeypatch.setattr(session.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(lambda r:httpx.Response(code))))
        source=web.make_source(NAME,URL,NAME+'公开基本信息','测试')
        assert asyncio.run(session.read(source))==''
        assert session.status()['status']==expected


@pytest.mark.parametrize('body,expected,error',[
    ('<html><body>{"l1":"var arg1=\'challenge\';"}'+('encoded-payload '*40)+'</body></html>', 'verification_required','browser_verification'),
    ('<html><body>请完成安全验证'+('说明 '*80)+'</body></html>', 'verification_required','browser_verification'),
    ('<html><body>另一家科技有限公司 法定代表人 注册资本'+('介绍 '*80)+'</body></html>', 'unavailable','company_mismatch'),
    ('<html><body>'+NAME+('导航 '*80)+'</body></html>', 'unavailable','no_company_details'),
    ('<html><script>const label="验证码"</script><body>'+NAME+' 工商信息 注册资本 法定代表人 '+('公司介绍 '*40)+'</body></html>', 'accessible',None),
])
def test_only_matching_company_details_count_as_page_text(monkeypatch,body,expected,error):
    original=httpx.AsyncClient
    async def addresses(*args):pass
    monkeypatch.setattr(web,'public_addresses',addresses)
    monkeypatch.setattr(session.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(
        lambda request:httpx.Response(200,headers={'content-type':'text/html; charset=utf-8'},text=body))))
    source=web.make_source(NAME,URL,NAME+'公开基本信息','测试')
    result=asyncio.run(session.read(source))
    assert bool(result)==(expected=='accessible')
    assert session.status()['status']==expected
    assert session.status()['error_code']==error
    assert bool(source.sha256)==(expected=='accessible')


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
