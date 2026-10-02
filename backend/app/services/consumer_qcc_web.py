"""Import authorized browser response bodies; never replay credentials or private APIs."""
import base64
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from app.schemas.consumer import Evidence

STORE = Path(__file__).resolve().parents[3] / 'data' / 'raw' / 'qcc-web-evidence.json'
NAMES = {'name', 'companyname', 'enterprisename', '企业名称', '公司名称'}
FIELDS = {'status':'登记状态', 'companystatus':'登记状态', '登记状态':'登记状态',
    'startdate':'成立日期', 'establishdate':'成立日期', '成立日期':'成立日期',
    'registcapi':'注册资本', 'registeredcapital':'注册资本', '注册资本':'注册资本',
    'belongorg':'登记机关', '登记机关':'登记机关', 'opername':'法定代表人',
    '法定代表人':'法定代表人', 'scope':'经营范围', '经营范围':'经营范围'}


def objects(value, depth=0):
    if depth > 16:return
    if isinstance(value, dict):
        yield value
        for item in value.values():yield from objects(item, depth+1)
    elif isinstance(value, list):
        for item in value[:1000]:yield from objects(item, depth+1)


def extract_har(data, name):
    """Allowlist business fields only. HAR requests, cookies and headers are discarded."""
    rows = []
    for entry in data.get('log',{}).get('entries',[])[:2000]:
        if not isinstance(entry,dict):continue
        response = entry.get('response',{})
        url = urlsplit(entry.get('request',{}).get('url',''))
        host = (url.hostname or '').lower()
        if url.scheme!='https' or not (host=='qcc.com' or host.endswith('.qcc.com')) or url.username or url.password:
            continue
        content = response.get('content',{})
        if response.get('status')!=200 or 'json' not in content.get('mimeType','').lower():continue
        raw = content.get('text','')
        if not isinstance(raw,str) or len(raw)>2_000_000:continue
        try:
            if content.get('encoding')=='base64':raw=base64.b64decode(raw,validate=True).decode('utf-8')
            parsed = json.loads(raw)
            captured = datetime.fromisoformat(entry['startedDateTime'].replace('Z','+00:00'))
            if captured.tzinfo is None or (datetime.now(timezone.utc)-captured).total_seconds() < -300:continue
        except (ValueError, KeyError, UnicodeError):continue
        for obj in objects(parsed):
            if not any(k.lower() in NAMES and v==name for k,v in obj.items()):continue
            fields = {FIELDS[k.lower()]:str(v).strip()[:180] for k,v in obj.items()
                      if k.lower() in FIELDS and isinstance(v,(str,int,float)) and not isinstance(v,bool) and str(v).strip()}
            if not fields:continue
            text = name+'；'+'；'.join(k+'：'+v for k,v in fields.items())
            # Retain the site as provenance, not session-bearing paths/query strings.
            safe_url = urlunsplit(('https',host,'/','',''))
            ident = hashlib.sha256((safe_url+text+captured.isoformat()).encode()).hexdigest()[:20]
            rows.append(Evidence(id=ident,title=name+' · 企查查网页响应导入',url=safe_url,
                publisher='企查查网页（用户导入）',excerpt=text[:480],fetched_at=captured.isoformat(),
                verification_status='search_excerpt',purpose='企查查网页导入',
                page_status='来自用户有权查看的网页响应；未在线复验，非官方 API 核验。仅保存企业字段，不保存请求头、Cookie、密钥或原始 HAR。'))
    return list({r.id:r for r in rows}.values())[:40]


def save(rows):
    STORE.parent.mkdir(parents=True,exist_ok=True)
    existing = json.loads(STORE.read_text(encoding='utf-8')) if STORE.exists() else []
    combined = {item['id']:item for item in existing}
    combined.update({row.id:row.model_dump() for row in rows})
    STORE.write_text(json.dumps(list(combined.values())[-400:],ensure_ascii=False,indent=2),encoding='utf-8')


def lookup(query, exact=False):
    try:
        items = json.loads(STORE.read_text(encoding='utf-8'))
        rows = [Evidence.model_validate(item) for item in items]
    except (OSError,ValueError):return [], None
    rows = [r for r in rows if (r.excerpt.split('；')[0]==query if exact else query in r.excerpt.split('；')[0])]
    for row in rows:row.cached=True
    names = {r.excerpt.split('；')[0] for r in rows}
    return rows, next(iter(names)) if len(names)==1 else None
