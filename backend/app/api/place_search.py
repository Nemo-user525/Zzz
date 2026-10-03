"""Optional licensed AMap POI search; a map listing never establishes ownership.

Protocol: https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch
"""
import os
import re
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Query, Response
from app.services import evidence_chat

router = APIRouter(prefix='/api/place-search', tags=['门店地点核对'])
URL = 'https://restapi.amap.com/v5/place/text'
DOCS = 'https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch'


def api_key():
    return (os.getenv('AMAP_WEB_SERVICE_KEY') or os.getenv('AMAP_KEY') or '').strip()


def fail(code, message, status=502):
    raise HTTPException(status, detail={'code': code, 'message': message})


@router.get('/capabilities')
def capabilities(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    ready = bool(api_key())
    return {'configured': ready, 'provider': '高德地图', 'documentation': DOCS,
            'message': '可按名称和城市查询门店地点。' if ready else '地图地点查询尚未启用；仍可直接填写门店名称和地址。'}


@router.post('/evidence-question')
async def evidence_question(body: evidence_chat.EvidenceQuestion, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return await evidence_chat.answer(body)


def text(value, limit=200):
    return value.strip()[:limit] if isinstance(value, str) else ''


def normalized_place(item):
    if not isinstance(item, dict) or not text(item.get('id')) or not text(item.get('name')):
        return None
    coordinates = text(item.get('location'))
    marker_url = ''
    if re.fullmatch(r'-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?', coordinates):
        lon, lat = map(float, coordinates.split(','))
        if -180 <= lon <= 180 and -90 <= lat <= 90:
            marker_url = 'https://uri.amap.com/marker?' + urlencode({
                'position': coordinates, 'name': text(item['name']),
                'coordinate': 'gaode', 'callnative': '0', 'src': 'jianwei'})
    parts = [text(item.get(key)) for key in ('pname', 'cityname', 'adname', 'address')]
    address = ' '.join(dict.fromkeys(part for part in parts if part))
    return {'id': text(item['id']), 'name': text(item['name'], 80),
            'address': address, 'city': text(item.get('cityname')),
            'district': text(item.get('adname')), 'marker_url': marker_url,
            'provider': '高德地图', 'relationship_status': '仅确认地图地点；经营主体仍需核对'}


@router.get('/places')
async def places(response: Response,
                 keyword: str = Query(min_length=2, max_length=80, pattern=r'^[^\x00-\x1f\x7f|]+$'),
                 city: str = Query(default='', max_length=40, pattern=r'^[^\x00-\x1f\x7f|]*$')):
    response.headers['Cache-Control'] = 'no-store'
    keyword, city = keyword.strip(), city.strip()
    if len(keyword) < 2:
        fail('invalid_keyword', '请输入至少两个字的门店或品牌名称。', 422)
    key = api_key()
    if not key:
        fail('amap_not_configured', '地图地点查询尚未启用，请直接填写门店名称和地址。', 503)
    params = {'key': key, 'keywords': keyword, 'page_size': '12', 'page_num': '1', 'output': 'json'}
    if city:
        params.update(region=city, city_limit='true')
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False, trust_env=False) as client:
            vendor = await client.get(URL, params=params)
            vendor.raise_for_status()
            payload = vendor.json()
    except httpx.TimeoutException:
        fail('amap_timeout', '地图查询超时，请稍后重试或直接填写地址。', 504)
    except (httpx.HTTPError, ValueError):
        fail('amap_unavailable', '地图服务暂时不可用，请稍后重试或直接填写地址。')
    if not isinstance(payload, dict) or str(payload.get('status')) != '1':
        fail('amap_rejected', '地图服务未完成本次查询，请检查服务权限和额度后重试。')
    if not isinstance(payload.get('pois'), list):
        fail('amap_invalid_response', '地图返回格式异常，未生成地点结果。')
    rows = [result for item in payload['pois'][:12] if (result := normalized_place(item))]
    return {'places': rows, 'provider': '高德地图', 'keyword': keyword, 'city': city,
            'retrieved_at': datetime.now(timezone.utc).isoformat(),
            'limitation': '地点名称和地址仅用于定位；请继续核对营业执照、合同和收款方，不能据此确认企业归属。'}
