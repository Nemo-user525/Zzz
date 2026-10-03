from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, model_validator


class Cashflow(BaseModel):
    day: int = Field(ge=0, le=730)
    amount_yuan: Decimal
    label: str


class Shipment(BaseModel):
    day: int = Field(ge=0, le=730)
    fraction: Decimal = Field(ge=0, le=1)


class SimulationInput(BaseModel):
    company_id: str
    opening_cash_yuan: Decimal = Field(ge=0)
    safety_floor_yuan: Decimal = Field(ge=0)
    order_amount_yuan: Decimal = Field(gt=0)
    gross_margin_rate: Decimal | None = Field(default=None, ge=0, le=1)
    direct_cost_yuan: Decimal | None = Field(default=None, ge=0)
    prepayment_rate: Decimal = Field(ge=0, le=1)
    payment_term_days: int = Field(ge=0, le=365)
    delay_days: int = Field(ge=0, le=365)
    other_net_cashflows: list[Cashflow]
    shipments: list[Shipment] | None = None
    cost_day: int = Field(default=10, ge=0, le=730)
    horizon_days: int = Field(default=90, ge=90, le=730)
    cost_payment_rule: Literal['per_shipment_not_before_cost_day', 'fixed_day'] = 'per_shipment_not_before_cost_day'

    @model_validator(mode="after")
    def valid_scenario(self):
        amounts = [self.opening_cash_yuan, self.safety_floor_yuan, self.order_amount_yuan, self.direct_cost_yuan] + [x.amount_yuan for x in self.other_net_cashflows]
        if any(x is not None and (not x.is_finite() or abs(x) >= Decimal('1e15') or x != x.quantize(Decimal('.01'))) for x in amounts):
            raise ValueError('金额必须为有限人民币元，最多两位小数且绝对值小于10^15')
        if len(self.other_net_cashflows) > 200 or self.shipments and len(self.shipments) > 100:
            raise ValueError('现金流或批次数量超过限制')
        if self.direct_cost_yuan is None and self.gross_margin_rate is None:
            raise ValueError("请提供毛利率或直接成本")
        if self.shipments is not None and sum((s.fraction for s in self.shipments), Decimal(0)) != 1:
            raise ValueError("分批发货比例之和必须为 100%")
        if self.shipments is not None and len(self.shipments) == 0:
            raise ValueError("至少需要一批发货")
        return self
