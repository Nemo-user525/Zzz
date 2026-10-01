"""Shared evidence rules; independent of the configured target user or decision goal."""
from collections import defaultdict
from decimal import Decimal

VALID_STATUSES = {"verified", "conflicted", "unverified", "missing"}


def effective_status(requested: str, source_ok: bool, excerpt_ok: bool, reviewed: bool) -> str:
    if requested not in VALID_STATUSES:
        raise ValueError(f"Unknown verification status: {requested}")
    if requested in {"missing", "conflicted"}:
        return requested
    return "verified" if requested == "verified" and source_ok and excerpt_ok and reviewed else "unverified"


def mark_conflicts(facts: list[dict]) -> list[dict]:
    groups: dict[tuple, set[Decimal]] = defaultdict(set)
    for f in facts:
        if f["verification_status"] == "verified" and f["value_yuan"] is not None:
            groups[(f["company_id"], f["field"], f["period"], f["scope"])].add(Decimal(str(f["value_yuan"])))
    for f in facts:
        key = (f["company_id"], f["field"], f["period"], f["scope"])
        if len(groups[key]) > 1:
            f["verification_status"] = "conflicted"
            f["review_note"] += "；同口径来源数值冲突，待人工复核"
    return facts
