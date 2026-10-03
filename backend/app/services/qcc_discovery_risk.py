"""Explainable consumer-facing risk tier for one selected company's QCC response.

The tier describes public company records, not the selected map POI or a
prediction of future solvency. A case count alone never triggers a high tier.
"""

from datetime import date, timedelta
from typing import Any


ACTIVE_STATES = {"存续", "在业", "开业", "正常"}
STOPPED_STATES = {"吊销", "注销", "撤销", "停业", "歇业", "清算"}
SEVERE_FACTORS = {"失信信息", "限制高消费", "破产重整", "严重违法"}
CAUTION_FACTORS = {"被执行人", "终本案件", "行政处罚", "经营异常", "税务非正常户", "欠税公告", "税收违法", "股权冻结"}
SERVICE_CAUSES = ("服务合同", "健康权", "安全保障义务", "预付", "退费", "退款", "健身", "消费者权益")
DEFENDANT_ROLES = ("被告", "被上诉人", "被申请人")


def _list_records(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [row for value in data.values() if isinstance(value, list)
            for row in value if isinstance(row, dict)]


def _recent_service_defendant_cases(sections: list[dict[str, Any]], name: str, today: date) -> list[dict[str, str]]:
    section = next((s for s in sections if s.get("tool") == "get_judicial_documents" and s.get("status") == "returned"), None)
    if not section:
        return []
    cases: list[dict[str, str]] = []
    seen = set()
    for row in _list_records(section.get("data") or {}):
        cause = str(row.get("案由") or "")
        parties = row.get("当事人")
        if not any(word in cause for word in SERVICE_CAUSES) or not isinstance(parties, dict):
            continue
        is_defendant = any(name in str(party) for role, people in parties.items()
                           if any(word in role for word in DEFENDANT_ROLES)
                           for party in (people if isinstance(people, list) else [people]))
        if not is_defendant:
            continue
        event_day = str(row.get("裁判日期") or row.get("发布日期") or "")[:10]
        try:
            when = date.fromisoformat(event_day)
        except ValueError:
            continue
        if not today - timedelta(days=3 * 365) <= when <= today:
            continue
        reference = str(row.get("案号") or "")
        key = reference or (cause, event_day)
        if key in seen:
            continue
        seen.add(key)
        cases.append({"cause": cause, "date": event_day, "reference": reference})
    return cases


def assess(report: dict[str, Any], today: date | None = None) -> dict[str, Any]:
    """Grade the selected company's returned records with explicit triggers."""
    today = today or date.today()
    basic = report.get("data") or {}
    scan = report.get("risk_scan") or {}
    sections = report.get("sections") or []
    name = str(report.get("company_name") or basic.get("企业名称") or "")
    status = str(basic.get("登记状态") or basic.get("Status") or "").strip()
    scanned = scan.get("风险因子扫描")
    factors = {str(row.get("风险因子")): row for row in scanned if isinstance(row, dict)} if isinstance(scanned, list) else {}
    scan_broad = len(factors) >= 30
    details = {str(s.get("title")): s for s in sections if isinstance(s, dict)}
    reasons: list[dict[str, str]] = []

    if any(state in status for state in STOPPED_STATES):
        level = "high"
        reasons.append({"text": f"工商登记状态为“{status}”。", "tool": "get_company_registration_info"})
    else:
        severe_hits = [(title, int(row.get("条目数") or 0)) for title, row in factors.items()
                       if title in SEVERE_FACTORS and isinstance(row.get("条目数"), int) and row["条目数"] > 0]
        severe = [(title, count) for title, count in severe_hits
                  if details.get(title, {}).get("status") == "returned"
                  and _list_records(details[title].get("data") or {})]
        if severe:
            level = "high"
            titles = "、".join(f"{title} {count} 条" for title, count in severe)
            reasons.append({"text": f"企查查风险扫描命中{titles}，并返回了对应明细。", "tool": str(details[severe[0][0]].get("tool") or "get_company_risk_scan")})
        else:
            caution = [(title, int(row.get("条目数") or 0)) for title, row in factors.items()
                       if title in CAUTION_FACTORS and isinstance(row.get("条目数"), int) and row["条目数"] > 0]
            cases = _recent_service_defendant_cases(sections, name, today)
            if severe_hits or caution or cases or status not in ACTIVE_STATES or not scan_broad or report.get("failed_sections"):
                level = "medium"
            else:
                level = "low"
            if severe_hits:
                titles = "、".join(f"{title} {count} 条" for title, count in severe_hits)
                reasons.append({"text": f"企查查风险扫描命中{titles}；本次明细不足以判断当前状态，建议先核对处理结果。", "tool": "get_company_risk_scan"})
            if caution:
                titles = "、".join(f"{title} {count} 条" for title, count in caution)
                reasons.append({"text": f"企查查风险扫描命中{titles}，建议查看对应记录的时间与处理结果。", "tool": "get_company_risk_scan"})
            if cases:
                first = cases[0]
                suffix = f"例如 {first['date']} 的{first['cause']}" + (f"，案号{first['reference']}" if first["reference"] else "")
                reasons.append({"text": f"近三年有 {len(cases)} 份与服务相关、该企业列为被告的裁判文书；{suffix}。", "tool": "get_judicial_documents"})

    if status in ACTIVE_STATES:
        reasons.insert(0, {"text": f"工商登记状态为“{status}”。", "tool": "get_company_registration_info"})
    if level == "low":
        reasons.append({"text": "本次风险扫描未命中失信、限高、经营异常等重点类别，也未见近三年与服务相关的被告裁判文书。", "tool": "get_company_risk_scan"})
    if not scan_broad:
        reasons.append({"text": "本次风险扫描覆盖项目较少，评级按预付消费的谨慎档给出。", "tool": "get_company_risk_scan"})
    elif report.get("failed_sections"):
        reasons.append({"text": "部分明细本次未返回，评级没有把这些项目当作零记录。", "tool": "get_company_risk_scan"})

    labels = {"low": "较低风险", "medium": "中等风险", "high": "较高风险"}
    actions = {
        "low": "可考虑短期、小额购买；付款前看清合同和退费方式。",
        "medium": "建议按月或按次支付，控制一次性预付金额，并先问清退款办法。",
        "high": "建议暂缓大额预付，先了解重点记录的处理结果和合同保障。",
    }
    return {
        "level": level,
        "label": labels[level],
        "title": "预付消费风险 · 企业资料维度",
        "recommendation": actions[level],
        "reasons": reasons,
        "scope": "评级依据本次企查查返回的所选企业资料；签约和收款主体请与该企业名称核对。",
        "rule_version": "qcc-company-records-v1",
    }
