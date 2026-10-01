from decimal import Decimal
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

    @model_validator(mode="after")
    def valid_scenario(self):
        if self.direct_cost_yuan is None and self.gross_margin_rate is None:
            raise ValueError("请提供毛利率或直接成本")
        if self.shipments is not None and sum((s.fraction for s in self.shipments), Decimal(0)) != 1:
            raise ValueError("分批发货比例之和必须为 100%")
        if self.shipments is not None and len(self.shipments) == 0:
            raise ValueError("至少需要一批发货")
        return self
