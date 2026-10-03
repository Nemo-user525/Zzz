"""Location selection followed by licensed company search and report retrieval."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import amap, qcc


router = APIRouter(prefix="/api")


class SelectedPlace(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=500)


class CompanyReportInput(BaseModel):
    company_keyword: str = Field(min_length=2, max_length=100)
    place: SelectedPlace


def _unavailable(message: str):
    raise HTTPException(status_code=503, detail={"code": "provider_unavailable", "message": message, "details": []})


@router.get("/integrations")
def integrations():
    return {
        "amap": {"configured": amap.configured(), "provider": "高德地图 Web 服务"},
        "qcc": {"configured": qcc.configured(), "provider": "企查查开放平台（886 + 736）"},
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


@router.get("/legal-entities")
def legal_entities(keyword: str = Query(min_length=2, max_length=100)):
    try:
        items = qcc.search(keyword.strip())
    except qcc.QccUnavailable as exc:
        _unavailable(str(exc))
    return {
        "provider": "企查查企业模糊搜索（ApiCode 886）",
        "companies": items,
        "identity_note": "候选企业尚未证明与所选门店存在经营关系；请结合营业执照、合同抬头或收款主体核对。",
    }


@router.post("/company-report")
def company_report(inp: CompanyReportInput):
    try:
        report = qcc.risk_scan(inp.company_keyword.strip())
    except qcc.QccUnavailable as exc:
        _unavailable(str(exc))
    return {
        **report,
        "selected_place": inp.place.model_dump(),
        "identity_status": "user_selected_unverified",
        "identity_note": "你选择了这家门店和这家企业；地图 POI 与企查查企业记录之间的经营关系尚未经独立核验。",
    }
