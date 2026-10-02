import { NumberInput } from "./NumberInput";
import type { SimulationInput } from "./api/types";

type Props = {
  inputs: SimulationInput;
  setInput: <K extends keyof SimulationInput>(
    key: K,
    value: SimulationInput[K],
  ) => void;
};
// Display conversion only. Cash balances, costs and scenario comparisons remain server-calculated.
const yuan = (value: string) => Math.round(Number(value) * 1000000) / 100;
export function ScenarioEditor({ inputs, setInput }: Props) {
  const shipments = inputs.shipments ?? [{ day: 0, fraction: 1 }];
  return (
    <div className="advanced-grid">
      <label>成本支付规则<select value={inputs.cost_payment_rule || 'per_shipment_not_before_cost_day'} onChange={e => setInput('cost_payment_rule', e.target.value as SimulationInput['cost_payment_rule'])}><option value="per_shipment_not_before_cost_day">按批次支出，不早于设定成本日（兼容原演示）</option><option value="fixed_day">全部成本于设定成本日支付</option></select></label>
      <label>
        订单额（万元）
        <NumberInput
          type="number"
          step="0.000001"
          min="0.000001"
          value={inputs.order_amount_yuan / 10000}
          onChange={(e) => setInput("order_amount_yuan", yuan(e.target.value))}
        />
      </label>
      <label>
        成本设定方式
        <select
          value={inputs.direct_cost_yuan === null ? "margin" : "direct"}
          onChange={(e) =>
            setInput("direct_cost_yuan", e.target.value === "margin" ? null : 0)
          }
        >
          <option value="margin">按毛利率推导成本</option>
          <option value="direct">直接填写成本</option>
        </select>
      </label>
      {inputs.direct_cost_yuan === null ? (
        <label>
          毛利率（%）
          <NumberInput
            type="number"
            step="any"
            min="0"
            max="100"
            value={(inputs.gross_margin_rate ?? 0) * 100}
            onChange={(e) =>
              setInput("gross_margin_rate", Number(e.target.value) / 100)
            }
          />
        </label>
      ) : (
        <label>
          直接成本（万元）
          <NumberInput
            type="number"
            step="0.000001"
            min="0"
            value={inputs.direct_cost_yuan / 10000}
            onChange={(e) => setInput("direct_cost_yuan", yuan(e.target.value))}
          />
        </label>
      )}
      <label>
        期初现金（万元）
        <NumberInput
          type="number"
          step="0.000001"
          min="0"
          value={inputs.opening_cash_yuan / 10000}
          onChange={(e) => setInput("opening_cash_yuan", yuan(e.target.value))}
        />
      </label>
      <label>
        安全底线（万元）
        <NumberInput
          type="number"
          step="0.000001"
          min="0"
          value={inputs.safety_floor_yuan / 10000}
          onChange={(e) => setInput("safety_floor_yuan", yuan(e.target.value))}
        />
      </label>
      <label>
        成本支付日
        <NumberInput
          type="number"
          step={1}
          min="0"
          max="730"
          value={inputs.cost_day}
          onChange={(e) => setInput("cost_day", Number(e.target.value))}
        />
      </label>
      <label>
        预付款（精确 %）
        <NumberInput
          type="number"
          step="any"
          min="0"
          max="100"
          value={inputs.prepayment_rate * 100}
          onChange={(e) =>
            setInput("prepayment_rate", Number(e.target.value) / 100)
          }
        />
      </label>
      <label>
        账期（精确天数）
        <NumberInput
          type="number"
          step={1}
          min="0"
          max="365"
          value={inputs.payment_term_days}
          onChange={(e) =>
            setInput("payment_term_days", Number(e.target.value))
          }
        />
      </label>
      <label>
        延付（精确天数）
        <NumberInput
          type="number"
          step={1}
          min="0"
          max="365"
          value={inputs.delay_days}
          onChange={(e) => setInput("delay_days", Number(e.target.value))}
        />
      </label>
      <label>
        观察视窗（天）
        <NumberInput
          type="number"
          step={1}
          min="90"
          max="730"
          value={inputs.horizon_days}
          onChange={(e) => setInput("horizon_days", Number(e.target.value))}
        />
      </label>
      <div className="cashflows">
        <b>发货计划（比例合计须为 100%）</b>
        {shipments.map((shipment, index) => (
          <div className="cashflow-row" key={index}>
            <label>
              第 {index + 1} 批发货日
              <NumberInput
                type="number"
                step={1}
                min="0"
                max="730"
                value={shipment.day}
                onChange={(e) =>
                  setInput(
                    "shipments",
                    shipments.map((s, i) =>
                      i === index ? { ...s, day: Number(e.target.value) } : s,
                    ),
                  )
                }
              />
            </label>
            <label>
              第 {index + 1} 批比例（%）
              <NumberInput
                type="number"
                step="any"
                min="0.01"
                max="100"
                value={shipment.fraction * 100}
                onChange={(e) =>
                  setInput(
                    "shipments",
                    shipments.map((s, i) =>
                      i === index
                        ? { ...s, fraction: Number(e.target.value) / 100 }
                        : s,
                    ),
                  )
                }
              />
            </label>
            <button
              disabled={shipments.length === 1}
              aria-label={`移除第 ${index + 1} 批发货`}
              onClick={() =>
                setInput(
                  "shipments",
                  shipments.filter((_, i) => i !== index),
                )
              }
            >
              移除
            </button>
          </div>
        ))}
        <button
          className="add-flow"
          onClick={() =>
            setInput("shipments", [
              ...shipments,
              { day: shipments[shipments.length - 1].day, fraction: 0 },
            ])
          }
        >
          + 添加发货批次并填写比例
        </button>
      </div>
      <div className="cashflows">
        <b>其他业务现金流（虚构，支出填负数）</b>
        {inputs.other_net_cashflows.map((flow, index) => (
          <div className="cashflow-row" key={index}>
            <label>
              第几天
              <NumberInput
                type="number"
                step={1}
                min="0"
                max="730"
                value={flow.day}
                onChange={(e) =>
                  setInput(
                    "other_net_cashflows",
                    inputs.other_net_cashflows.map((f, i) =>
                      i === index ? { ...f, day: Number(e.target.value) } : f,
                    ),
                  )
                }
              />
            </label>
            <label>
              金额（万元）
              <NumberInput
                type="number"
                step="0.000001"
                value={flow.amount_yuan / 10000}
                onChange={(e) =>
                  setInput(
                    "other_net_cashflows",
                    inputs.other_net_cashflows.map((f, i) =>
                      i === index
                        ? { ...f, amount_yuan: yuan(e.target.value) }
                        : f,
                    ),
                  )
                }
              />
            </label>
            <button
              aria-label={`移除第 ${index + 1} 条现金流`}
              onClick={() =>
                setInput(
                  "other_net_cashflows",
                  inputs.other_net_cashflows.filter((_, i) => i !== index),
                )
              }
            >
              移除
            </button>
          </div>
        ))}
        <button
          className="add-flow"
          onClick={() =>
            setInput("other_net_cashflows", [
              ...inputs.other_net_cashflows,
              { day: 0, amount_yuan: 0, label: "用户新增现金流（虚构）" },
            ])
          }
        >
          + 添加支出或回款
        </button>
      </div>
    </div>
  );
}
