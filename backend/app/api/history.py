from datetime import date
import hashlib
import json
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response, HTMLResponse
from pydantic import BaseModel, Field
from app.db.models import ROOT, SessionLocal
from app.db.history import MatchRun
from app.services import history
from app.services.acquisition import Cninfo
from app.services.company_keywords import matches as matches_keywords
from app.schemas.history import EntityPage, SnapshotResponse, OutcomeResponse, ComparisonResponse, SourceResponse, QualityResponse, DiscoveryResponse, SearchResponse

router = APIRouter(prefix='/api/v2', tags=['history'])


def checked(call, *args, **kwargs):
    try: return call(*args, **kwargs)
    except KeyError: raise HTTPException(404, detail={'code': 'not_found', 'message': '本地资料未覆盖此记录', 'details': []})


@router.get('/companies', response_model=EntityPage)
def companies(query: str = Query('', max_length=100), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    return history.entities(query, page, page_size)


@router.get('/companies/{company_id}/snapshot', response_model=SnapshotResponse)
def snapshot(company_id: str, as_of: date):
    return checked(history.snapshot, company_id, as_of.isoformat())


@router.get('/companies/{company_id}/timeline')
def timeline(company_id: str, as_of: date):
    data = checked(history.snapshot, company_id, as_of.isoformat())
    return {k: data[k] for k in ('as_of', 'dataset_version', 'timeline', 'facts', 'coverage', 'limitations')}


@router.get('/companies/{company_id}/coverage')
def coverage(company_id: str):
    return checked(history.coverage, company_id)


@router.get('/companies/{company_id}/outcomes', response_model=OutcomeResponse)
def outcomes(company_id: str, as_of: date, window_days: int = Query(180, ge=1, le=730)):
    return checked(history.outcomes, company_id, as_of.isoformat(), window_days)


@router.get('/sources/{document_id}', response_model=SourceResponse)
def source(document_id: str):
    return checked(history.document_info, document_id)


@router.get('/sources/{document_id}/document')
def document(document_id: str):
    data = checked(history.document_info, document_id)
    path = (ROOT / data['local_file']).resolve()
    allowed = (ROOT / 'data/raw/documents').resolve()
    if not path.is_relative_to(allowed) or not path.is_file():
        raise HTTPException(404, detail={'code': 'local_document_missing', 'message': '本地原文未缓存，请运行 fetch --resume', 'details': []})
    if hashlib.sha256(path.read_bytes()).hexdigest() != data['sha256']:
        raise HTTPException(409, detail={'code': 'integrity_mismatch', 'message': '原文哈希不符，已拒绝打开', 'details': []})
    return FileResponse(path, media_type='application/pdf', headers={'Content-Disposition': 'inline', 'ETag': data['sha256'], 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff'})


def verified_pdf_path(document_id):
    data = checked(history.document_info, document_id)
    path = (ROOT / data['local_file']).resolve()
    if not path.is_relative_to((ROOT / 'data/raw/documents').resolve()) or not path.is_file():
        raise HTTPException(404, '本地原文未缓存')
    if hashlib.sha256(path.read_bytes()).hexdigest() != data['sha256']:
        raise HTTPException(409, '本地原文哈希不符')
    return data, path


@router.get('/sources/{document_id}/pages/{page}', response_class=Response, responses={200: {'content': {'image/png': {}}}})
def page_image(document_id: str, page: int):
    import pymupdf
    data, path = verified_pdf_path(document_id)
    with pymupdf.open(path) as pdf:
        if not 1 <= page <= len(pdf): raise HTTPException(404, '原文页码不存在')
        p = pdf[page - 1]
        scale = min(1.5, 2048 / max(p.rect.width, p.rect.height))
        png = p.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False).tobytes('png')
    return Response(png, media_type='image/png', headers={'ETag': data['sha256'] + ':' + str(page), 'Cache-Control': 'private, no-cache'})


@router.get('/sources/{document_id}/viewer', response_class=HTMLResponse)
def viewer(document_id: str, page: int = Query(1, ge=1)):
    import html
    import pymupdf
    data, path = verified_pdf_path(document_id)
    with pymupdf.open(path) as pdf: pages = len(pdf)
    if page > pages: raise HTTPException(404, '原文页码不存在')
    root = '/api/v2/sources/' + quote(document_id, safe='')
    title = html.escape(data['title'])
    nav = (f'<a href="?page={page-1}">上一页</a>' if page > 1 else '') + (f'<a href="?page={page+1}">下一页</a>' if page < pages else '')
    return HTMLResponse(f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title} · 本地原文</title><style>body{{margin:0;background:#172733;color:#eee;font:16px system-ui}}header{{padding:16px;position:sticky;top:0;background:#172733}}h1{{font-size:18px;margin:0 0 8px}}a{{color:#9aeadb;margin-right:20px}}img{{display:block;width:min(100%,960px);height:auto;margin:auto}}small{{display:block;overflow-wrap:anywhere;margin-top:8px}}</style><header><h1>{title}</h1><span>原文第 {page} / {pages} 页 · 本地 PDF 按页呈现 </span>{nav}<a href="{root}/document" download>下载原始 PDF</a><small>SHA-256 {data['sha256']} · 图像直接来自原文件，不是模型重写</small></header><img src="{root}/pages/{page}" alt="公告原文第 {page} 页"></html>''', headers={'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", 'Cache-Control': 'no-cache'})


class ComparisonRequest(BaseModel):
    company_id: str
    as_of: date
    window_days: int = Field(180, ge=1, le=730)


@router.post('/comparisons', response_model=ComparisonResponse)
def compare(inp: ComparisonRequest):
    return checked(history.compare_entities, inp.company_id, inp.as_of.isoformat(), inp.window_days)


@router.get('/comparisons/{comparison_id}')
def comparison(comparison_id: str):
    with SessionLocal() as db:
        row = db.get(MatchRun, comparison_id)
        if not row: raise HTTPException(404, '对照运行不存在')
        return json.loads(row.result_json)


@router.get('/dataset/quality', response_model=QualityResponse)
def quality(): return history.quality()


@router.get('/search', response_model=SearchResponse)
def search(query: str = Query(min_length=2, max_length=80), as_of: date = Query(...), company_id: str | None = None):
    return history.search_pages(query, as_of.isoformat(), company_id)


@router.get('/discovery', response_model=DiscoveryResponse)
def discovery(query: str = Query(min_length=2, max_length=80)):
    """Network discovery is opt-in; no request writes verified company evidence."""
    adapter = Cninfo()
    links = [{'title': '联网检索该企业的官方资料', 'url': 'https://www.bing.com/search?q=' + quote(query + ' 企业 官方 公告')},
             {'title': '国家企业信用信息公示系统（可能需要人工验证）', 'url': 'https://www.gsxt.gov.cn/'}]
    try:
        catalog = adapter.catalog()
        matches = [s for s in catalog if matches_keywords(query, s.get('code'), s.get('zwjc'), s.get('pinyin'))][:10]
        stock = matches[0]['code'] + ',' + matches[0]['orgId'] if len(matches) == 1 else ''
        rows, more = adapter.announcements(stock=stock, keyword='' if stock else query, size=10)
        return {'status': 'success' if rows or matches else 'empty', 'query': query, 'companies': matches, 'announcements': rows,
                'has_more': more, 'verification_status': 'candidate', 'external_search_links': links,
                'limitations': ['联网查询巨潮公开目录与公告索引；未下载或验证正文', '目录可能含退市企业和历史简称，不代表当前上市状态', '无结果可能源于覆盖范围或名称歧义，不能认定无风险', '非上市企业可继续在官方公示系统核对，不自动建立事实或订单身份']}
    except Exception as exc:
        return {'status': 'blocked' if isinstance(exc, PermissionError) else 'failed', 'query': query, 'companies': [], 'announcements': [],
                'verification_status': 'insufficient', 'external_search_links': links, 'limitations': ['在线来源暂不可用；本地历史样本仍可使用', type(exc).__name__]}
