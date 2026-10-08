"""Location selection followed by licensed company search and report retrieval."""

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.services import amap, qcc_discovery_mcp as qcc_mcp, qcc_openapi as qcc_openapi
from app.services import consumer


router = APIRouter(prefix="/api")


class SelectedPlace(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=500)
    city: str = Field(default="", max_length=100)
    district: str = Field(default="", max_length=100)


class CompanyReportInput(BaseModel):
    company_keyword: str = Field(min_length=2, max_length=100)
    place: SelectedPlace


def _unavailable(message: str):
    raise HTTPException(status_code=503, detail={"code": "provider_unavailable", "message": message, "details": []})


@router.get("/integrations")
def integrations():
    return {
        "amap": {"configured": amap.configured(), "provider": "高德地图 Web 服务"},
        "qcc": {"configured": qcc_mcp.configured() or qcc_openapi.configured(),
                "provider": "企查查智能体 MCP" if qcc_mcp.configured() else "企查查开放平台（886 + 736）"},
    }


@router.get("/regions")
def regions(parent: str = Query(default="100000", pattern=r"^\d{6}$")):
    try:
        return {"provider": "高德地图", "parent": parent, "regions": amap.regions(parent)}
    except amap.AmapUnavailable as exc:
        _unavailable(str(exc))


@router.get("/places")
def places(
    keyword: str = Query(min_length=2, max_length=100),
    region_code: str = Query(default="", pattern=r"^(\d{6})?$"),
    street: str = Query(default="", max_length=50),
):
    try:
        items = amap.places(keyword.strip(), region_code, street.strip())
    except amap.AmapUnavailable as exc:
        _unavailable(str(exc))
    return {
        "provider": "高德地图",
        "places": items,
        "street_filter_note": "街道没有独立区划码，街道筛选依据高德返回的名称和地址；无匹配时可清空街道重试。" if street else "",
        "identity_note": "地图地点是门店线索，不自动证明其经营主体。",
    }


@router.get("/place-map", response_class=Response, responses={200: {"content": {"image/png": {}}}})
def place_map(location: str = Query(pattern=r"^\d{1,3}(?:\.\d+)?,\d{1,2}(?:\.\d+)?$", max_length=50)):
    try:
        image = amap.static_map(location)
    except amap.AmapUnavailable as exc:
        _unavailable(str(exc))
    return Response(image, media_type="image/png", headers={"Cache-Control": "public, max-age=300"})


@router.get("/legal-entities")
async def legal_entities(keyword: str = Query(min_length=2, max_length=100)):
    try:
        if qcc_mcp.configured():
            found = await qcc_mcp.search(keyword.strip())
            provider = "企查查智能体 MCP 企业识别"
        else:
            found = {"companies": qcc_openapi.search(keyword.strip()), "search_note": ""}
            provider = "企查查企业模糊搜索（ApiCode 886）"
    except (qcc_mcp.QccUnavailable, qcc_openapi.QccUnavailable) as exc:
        _unavailable(str(exc))
    return {
        "provider": provider,
        **found,
        "identity_note": "选择企业时，请以营业执照、合同抬头和收款方名称为准。",
    }


@router.post("/company-report")
async def company_report(inp: CompanyReportInput):
    try:
        report = (await qcc_mcp.report(inp.company_keyword.strip()) if qcc_mcp.configured()
                  else qcc_openapi.risk_scan(inp.company_keyword.strip()))
    except (qcc_mcp.QccUnavailable, qcc_openapi.QccUnavailable) as exc:
        _unavailable(str(exc))
    return {
        **report,
        "selected_place": inp.place.model_dump(),
        "identity_status": "user_selected_unverified",
        "identity_note": "报告对应你选定的企业。付款前，请确认合同和收款方使用同一企业名称。",
    }


@router.post('/store-review-discovery')
def store_review_discovery(place: SelectedPlace):
    return consumer.store_review_discovery(place.model_dump())
