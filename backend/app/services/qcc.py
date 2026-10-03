"""Official Qichacha OpenAPI adapters for fuzzy search (886) and risk scan (736)."""

import hashlib
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx


BASE = "https://api.qichacha.com"


class QccUnavailable(Exception):
    pass


def configured() -> bool:
    return bool(os.getenv("QCC_APP_KEY", "").strip() and os.getenv("QCC_SECRET_KEY", "").strip())


def _get(path: str, parameters: dict[str, str]) -> dict[str, Any]:
    app_key = os.getenv("QCC_APP_KEY", "").strip()
    secret = os.getenv("QCC_SECRET_KEY", "").strip()
    if not app_key or not secret:
        raise QccUnavailable("尚未配置企查查 AppKey 和 SecretKey")
    timespan = str(int(time.time()))
    token = hashlib.md5(f"{app_key}{timespan}{secret}".encode("utf-8")).hexdigest().upper()
    try:
        response = httpx.get(
            BASE + path,
            params={"key": app_key, **parameters},
            headers={"Token": token, "Timespan": timespan},
            timeout=18,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise QccUnavailable("企查查服务暂时不可用") from exc
    if not isinstance(data, dict):
        raise QccUnavailable("企查查返回格式异常")
    if str(data.get("Status")) != "200":
        # The provider's error text is helpful for access review but never includes credentials.
        message = str(data.get("Message") or "接口未完成查询")[:120]
        raise QccUnavailable(f"企查查接口未成功：{message}")
    return data


def search(keyword: str) -> list[dict[str, str]]:
    data = _get("/FuzzySearch/GetList", {"searchKey": keyword, "pageIndex": "1"})
    result = data.get("Result")
    if isinstance(result, dict):
        result = result.get("Data") or result.get("Items") or []
    if not isinstance(result, list):
        return []
    return [
        {
            "key_no": str(item.get("KeyNo") or ""),
            "name": str(item.get("Name") or ""),
            "credit_code": str(item.get("CreditCode") or ""),
            "address": str(item.get("Address") or ""),
            "status": str(item.get("Status") or ""),
            "start_date": str(item.get("StartDate") or ""),
            "provider": "企查查",
        }
        for item in result
        if isinstance(item, dict) and item.get("Name")
    ]


def risk_scan(company_keyword: str) -> dict[str, Any]:
    data = _get("/ECIInfoOverview/GetInfo", {"searchKey": company_keyword})
    result = data.get("Result")
    if not isinstance(result, dict) or not result.get("Name"):
        raise QccUnavailable("企查查没有返回可用的企业风险扫描数据")
    return {
        "provider": "企查查企业风险扫描（ApiCode 736）",
        "queried_at": datetime.now(timezone.utc).isoformat(),
        "order_number": str(data.get("OrderNumber") or ""),
        "company_name": str(result.get("Name") or ""),
        "credit_code": str(result.get("CreditCode") or ""),
        "data": result,
        "coverage_note": "展示本次企查查接口实际返回的全部字段；部分列表由接口限制为前 100 条，空列表不代表现实中不存在相关记录。",
    }
