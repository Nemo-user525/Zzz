"""Amap Web Service adapters. The server holds the Web Service key."""

import os
from typing import Any

import httpx


BASE = "https://restapi.amap.com/v3"


class AmapUnavailable(Exception):
    pass


def configured() -> bool:
    return bool(os.getenv("AMAP_WEB_SERVICE_KEY", "").strip())


def _get(path: str, params: dict[str, str | int]) -> dict[str, Any]:
    key = os.getenv("AMAP_WEB_SERVICE_KEY", "").strip()
    if not key:
        raise AmapUnavailable("尚未配置高德 Web 服务 Key")
    try:
        response = httpx.get(
            BASE + path,
            params={**params, "key": key, "output": "JSON"},
            timeout=12,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise AmapUnavailable("高德地图服务暂时不可用") from exc
    if not isinstance(data, dict) or str(data.get("status")) != "1":
        # Do not echo the provider response: it may include request details.
        raise AmapUnavailable("高德地图未完成本次查询，请检查 Key 权限或稍后重试")
    return data


def regions(parent: str = "100000") -> list[dict[str, str]]:
    data = _get(
        "/config/district",
        {"keywords": parent, "subdistrict": 1, "showbiz": "false", "extensions": "base"},
    )
    roots = data.get("districts") or []
    children = roots[0].get("districts") or [] if roots else []
    return [
        {"name": item.get("name", ""), "adcode": item.get("adcode", ""), "level": item.get("level", "")}
        for item in children
        if isinstance(item, dict) and item.get("name")
    ]


def places(keyword: str, region_code: str = "", street: str = "") -> list[dict[str, Any]]:
    params: dict[str, str | int] = {"keywords": keyword, "offset": 20, "page": 1, "extensions": "base"}
    if region_code:
        params.update({"city": region_code, "citylimit": "true"})
    data = _get("/place/text", params)
    output: list[dict[str, Any]] = []
    for item in data.get("pois") or []:
        if not isinstance(item, dict):
            continue
        address = item.get("address") if isinstance(item.get("address"), str) else ""
        location = item.get("location") if isinstance(item.get("location"), str) else ""
        if street and street not in address and street not in str(item.get("name") or ""):
            continue
        output.append({
            "id": str(item.get("id") or ""),
            "name": str(item.get("name") or ""),
            "address": address,
            "province": str(item.get("pname") or ""),
            "city": item.get("cityname") if isinstance(item.get("cityname"), str) else "",
            "district": str(item.get("adname") or ""),
            "adcode": str(item.get("adcode") or ""),
            "location": location,
            "type": str(item.get("type") or ""),
            "provider": "高德地图",
        })
    return output
