"""Deterministic yuan arithmetic, rounded to cents only at transaction edges."""
from decimal import Decimal, ROUND_HALF_UP
from app.schemas.api import SimulationInput, Shipment

CENT = Decimal("0.01")


def money(x: Decimal) -> Decimal:
    return x.quantize(CENT, rounding=ROUND_HALF_UP)


def simulate(inp: SimulationInput, decline: bool = False, evidence_event_ids: list[str] | None = None) -> dict:
    schedule: dict[int, Decimal] = {}
    def add(day: int, value: Decimal):
        schedule[day] = schedule.get(day, Decimal(0)) + money(value)

    direct_cost = money(inp.direct_cost_yuan if inp.direct_cost_yuan is not None else inp.order_amount_yuan * (1 - inp.gross_margin_rate))
    shipments = inp.shipments or [Shipment(day=0, fraction=Decimal(1))]
    advance = money(inp.order_amount_yuan * inp.prepayment_rate)
    final_payment_day = 0 if decline else max(s.day + inp.payment_term_days + inp.delay_days for s in shipments)
    if not decline:
        add(0, advance)
        cost_left = direct_cost
        remainder = inp.order_amount_yuan - advance
        payment_left = remainder
        for index, shipment in enumerate(shipments):
            last = index == len(shipments) - 1
            cost = cost_left if last else money(direct_cost * shipment.fraction)
            payment = payment_left if last else money(remainder * shipment.fraction)
            add(max(inp.cost_day, shipment.day), -cost)
            add(shipment.day + inp.payment_term_days + inp.delay_days, payment)
            cost_left -= cost
            payment_left -= payment
    for flow in inp.other_net_cashflows:
        add(flow.day, flow.amount_yuan)
    balance = money(inp.opening_cash_yuan)
    curve = []
    minimum = None
    minimum_day = 0
    first_breach = None
    last_day = max(inp.horizon_days, final_payment_day, max(schedule, default=0))
    for day in range(last_day + 1):
        balance += schedule.get(day, Decimal(0))
        if day <= inp.horizon_days:
            curve.append({"day": day, "balance_yuan": float(balance)})
            if minimum is None or balance < minimum:
                minimum, minimum_day = balance, day
            if first_breach is None and balance < inp.safety_floor_yuan:
                first_breach = day
    shortfall = max(Decimal(0), inp.safety_floor_yuan - minimum)
    flow_total = sum((f.amount_yuan for f in inp.other_net_cashflows if f.day <= minimum_day), Decimal(0))
    return {
        "cash_curve": curve, "minimum_balance_yuan": float(minimum), "minimum_day": minimum_day,
        "first_breach_day": first_breach, "shortfall_yuan": float(shortfall),
        "final_payment_day": final_payment_day, "outside_view_payment": final_payment_day > inp.horizon_days,
        "assumptions": ["目标企业的公开资料不代表付款记录", f"客户延付 {inp.delay_days} 天是用户设定情景", "其他业务现金流与本方期初现金均为演示输入"],
        "formula_breakdown": [
            f"期初现金 {money(inp.opening_cash_yuan)} 元",
            f"订单价款 {money(inp.order_amount_yuan)} 元；预付款 {advance if not decline else 0} 元；直接成本 {direct_cost if not decline else 0} 元",
            f"第 {minimum_day} 天前其他业务现金流合计 {money(flow_total)} 元",
            f"最低现金 {money(minimum)} 元；安全底线 {money(inp.safety_floor_yuan)} 元；缺口 {money(shortfall)} 元",
            (f"余款 {money(inp.order_amount_yuan - advance)} 元，最晚第 {final_payment_day} 天到账（情景假设）" if not decline else "放弃订单：无订单回款，失去预期利润")
        ],
        "evidence_event_ids": evidence_event_ids or [],
        "data_labels": ["公开事实", "情景假设", "计算结果"]
    }


def compare(inp: SimulationInput, evidence_event_ids: list[str] | None = None) -> dict:
    baseline = simulate(inp, evidence_event_ids=evidence_event_ids)
    advance = simulate(inp.model_copy(update={"prepayment_rate": Decimal("0.30")}), evidence_event_ids=evidence_event_ids)
    staged = simulate(inp.model_copy(update={"shipments": [Shipment(day=10, fraction=Decimal("0.5")), Shipment(day=45, fraction=Decimal("0.5"))]}), evidence_event_ids=evidence_event_ids)
    declined = simulate(inp, decline=True, evidence_event_ids=evidence_event_ids)
    cost = money(inp.order_amount_yuan - (inp.direct_cost_yuan if inp.direct_cost_yuan is not None else inp.order_amount_yuan * (1 - inp.gross_margin_rate)))
    return {"variants": [{"name": n, "result": r} for n, r in [("当前条款", baseline), ("30%预付款", advance), ("两批发货", staged), ("放弃订单", declined)]], "opportunity_cost_yuan": float(cost), "explanation": "比较基于相同的用户现金假设。可考虑协商预付款或分批发货；放弃订单将失去预期毛利。公开风险事件不能推出具体延付概率。"}
