import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { api } from "./api/client";
import { useSimulation } from "./useSimulation";
import { Drawer } from "./Drawer";
import { InputValidity } from "./NumberInput";
import { ScenarioEditor } from "./ScenarioEditor";
import type {
  Company,
  Financial,
  Health,
  RiskEvent,
  SimulationInput,
  Source,
  UseCase,
} from "./api/types";

echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

const money = (n: number | null | undefined) =>
  n == null
    ? "未披露"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(
        n / 10000,
      ) + " 万元";
const numeric = (n: number) => (Number.isFinite(n) ? n : 0);
const statusName = (x: string) =>
  ({
    verified: "已核验",
    unverified: "未核验",
    conflicted: "存在冲突",
    missing: "缺失",
  })[x] || "状态未知";
const fieldCategory = (key: string) =>
  ["scenario_inputs", "assumptions"].includes(key)
    ? "情景假设"
    : ["formula_breakdown", "shortfall_yuan", "comparison"].includes(key)
      ? "计算结果"
      : key === "unknowns"
        ? "尚未核实"
        : "公开资料";

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [profile, setProfile] = useState<UseCase | null>(null);
  const [profiles, setProfiles] = useState<UseCase[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [inputs, setInputs] = useState<SimulationInput | null>(null);
  const [retry, setRetry] = useState(0);
  const [boot, setBoot] = useState(0);
  const original = useRef<SimulationInput | null>(null);
  const defaultProfile = useRef("");
  const sourceSequence = useRef(0);
  const sourceCache = useRef<Record<string, Source>>({});
  const [sourceNote, setSourceNote] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [selectedFact, setSelectedFact] = useState<Financial | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [returnToCard, setReturnToCard] = useState(false);
  const [drawer, setDrawer] = useState<"source" | "math" | "card" | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const reportValidity = useCallback(
    (id: string, bad: boolean) =>
      setInvalid((old) => {
        const next = new Set(old);
        bad ? next.add(id) : next.delete(id);
        return next;
      }),
    [],
  );
  const {
    result,
    comparison,
    pending,
    error: calculationError,
  } = useSimulation(inputs, running && invalid.size === 0, retry);

  useEffect(() => {
    let alive = true;
    setError("");
    Promise.all([api.health(), api.useCases(), api.demo()])
      .then(async ([h, p, i]) => {
        const [c, e] = await Promise.all([
          api.company(i.company_id),
          api.events(i.company_id),
        ]);
        if (!p.use_cases.length)
          throw new Error("暂无用户场景配置，请负责人检查 /api/use-cases");
        if (!alive) return;
        original.current = i;
        defaultProfile.current = p.default_use_case_id;
        setHealth(h);
        setProfiles(p.use_cases);
        setProfile(
          p.use_cases.find((u) => u.id === p.default_use_case_id) ||
            p.use_cases[0],
        );
        setInputs(i);
        setCompany(c);
        setEvents(e);
        const ids = [
          ...new Set([
            ...c.financials.map((f) => f.source_id),
            ...e.flatMap((v) => v.source_ids),
          ]),
        ];
        await Promise.allSettled(
          ids.map(async (id) => {
            const src = await api.source(id);
            sourceCache.current[id] = src;
            try {
              localStorage.setItem("xray-source-v1:" + id, JSON.stringify(src));
            } catch {
              /* Storage unavailable; memory cache remains. */
            }
          }),
        );
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [boot]);

  function setInput<K extends keyof SimulationInput>(
    key: K,
    value: SimulationInput[K],
  ) {
    setInputs((v) => (v ? { ...v, [key]: value } : v));
  }
  async function showSource(id: string, fact: Financial | null = null) {
    setReturnToCard(drawer === "card" || (drawer === "source" && returnToCard));
    setSourceId(id);
    setSelectedFact(fact);
    const seq = ++sourceSequence.current;
    setSource(null);
    setSourceNote("正在读取来源…");
    setDrawer("source");
    try {
      const src = await api.source(id);
      if (seq !== sourceSequence.current) return;
      sourceCache.current[id] = src;
      setSource(src);
      setSourceNote("");
      try {
        localStorage.setItem("xray-source-v1:" + id, JSON.stringify(src));
      } catch {}
    } catch (e) {
      if (seq !== sourceSequence.current) return;
      let cached: Source | undefined = sourceCache.current[id];
      try {
        cached ??= JSON.parse(
          localStorage.getItem("xray-source-v1:" + id) || "null",
        );
      } catch {}
      if (
        cached &&
        (!cached.url?.startsWith("https://") ||
          cached.id !== id ||
          !Number.isInteger(cached.page) ||
          typeof cached.excerpt !== "string")
      )
        cached = undefined;
      setSource(cached || null);
      setSourceNote(
        cached
          ? "当前来源接口不可用，显示此前缓存的证据信息；资料状态未实时刷新。"
          : (e as Error).message,
      );
    }
  }
  function closeDrawer() {
    sourceSequence.current++;
    setDrawer(null);
  }
  function reset() {
    setInputs(original.current ? structuredClone(original.current) : null);
    setRunning(false);
    setInvalid(new Set());
    closeDrawer();
    setAdvanced(false);
    setError("");
    setProfile(
      profiles.find((p) => p.id === defaultProfile.current) ||
        profiles[0] ||
        null,
    );
  }
  const current = useMemo(() => result || null, [result]);
  function cardField(key: string) {
    if (!company || !result) return null;
    const fields: Record<string, () => React.ReactNode> = {
      legal_name: () => (
        <p>
          {company.legal_name}（{company.ticker}）
        </p>
      ),
      ticker: () => <p>证券代码：{company.ticker}</p>,
      coverage: () => <p>覆盖：{company.coverage}</p>,
      risk_events: () => (
        <>
          {events.length ? (
            events.map((e) => (
              <p key={e.id}>
                {e.event_date} · {e.affected_entity} · {e.stage} ·{" "}
                {statusName(e.verification_status)}
                <br />
                {e.explanation}
                <br />
                {e.status}{" "}
                {e.source_ids.map((id) => (
                  <button
                    key={id}
                    className="inline-link"
                    onClick={() => showSource(id)}
                  >
                    来源 {id} ↗
                  </button>
                ))}
              </p>
            ))
          ) : (
            <p>覆盖资料内暂无已核实记录，不能据此认定无风险。</p>
          )}
        </>
      ),
      financials: () => (
        <>
          {company.financials.map((f) => (
            <p key={f.field + f.period + f.source_id}>
              {f.field} {money(f.value_yuan)}（{f.period} · {f.scope}口径 ·{" "}
              {f.audited ? "已审计" : "未经审计"} ·{" "}
              {statusName(f.verification_status)}）{" "}
              <button
                className="inline-link"
                onClick={() => showSource(f.source_id, f)}
              >
                来源 ↗
              </button>
            </p>
          ))}
        </>
      ),
      source_links: () => (
        <>
          {[
            ...new Set([
              ...company.financials.map((f) => f.source_id),
              ...events.flatMap((e) => e.source_ids),
            ]),
          ].map((id) => (
            <p key={id}>
              <button className="inline-link" onClick={() => showSource(id)}>
                {id} ↗
              </button>
            </p>
          ))}
        </>
      ),
      unknowns: () => (
        <>
          {company.unknowns.map((x) => (
            <p key={x}>• {x}</p>
          ))}
        </>
      ),
      scenario_inputs: () =>
        inputs && (
          <>
            <p>以下均为虚构交易输入，非客户财报或付款历史。</p>
            <p>
              订单 {money(inputs.order_amount_yuan)}；期初现金{" "}
              {money(inputs.opening_cash_yuan)}；底线{" "}
              {money(inputs.safety_floor_yuan)}；预付款{" "}
              {inputs.prepayment_rate * 100}%；账期 {inputs.payment_term_days}{" "}
              天；延付压力 {inputs.delay_days} 天；视窗 {inputs.horizon_days}{" "}
              天。
            </p>
            <p>
              {inputs.direct_cost_yuan === null
                ? `毛利率 ${(inputs.gross_margin_rate ?? 0) * 100}%`
                : `直接成本 ${money(inputs.direct_cost_yuan)}`}
              ；成本支付日 {inputs.cost_day}。
            </p>
            {(inputs.shipments || [{ day: 0, fraction: 1 }]).map((s, i) => (
              <p key={i}>
                第 {i + 1} 批：第 {s.day} 天发货，比例 {s.fraction * 100}%
              </p>
            ))}
            {inputs.other_net_cashflows.map((f, i) => (
              <p key={i}>
                {f.label}：第 {f.day} 天，{money(f.amount_yuan)}
              </p>
            ))}
          </>
        ),
      assumptions: () => (
        <>
          {result.assumptions.map((x) => (
            <p key={x}>• {x}</p>
          ))}
        </>
      ),
      formula_breakdown: () => (
        <>
          {result.formula_breakdown.map((x) => (
            <p key={x}>• {x}</p>
          ))}
        </>
      ),
      shortfall_yuan: () => (
        <p>
          最低现金 {money(result.minimum_balance_yuan)}；底线缺口{" "}
          {money(result.shortfall_yuan)}。
        </p>
      ),
      comparison: () => (
        <>
          {comparison?.variants.map((v) => (
            <p key={v.name}>
              {v.name}：最低现金 {money(v.result.minimum_balance_yuan)}，缺口{" "}
              {money(v.result.shortfall_yuan)}
            </p>
          ))}
          <p>{comparison?.explanation}</p>
          <p>
            放弃订单的预期毛利机会成本：
            {money(comparison?.opportunity_cost_yuan)}
          </p>
        </>
      ),
    };
    return fields[key]?.() || <p>字段 {key} 尚未配置展示规则</p>;
  }
  const chart = useMemo(() => {
    const curve = current?.cash_curve || [];
    const floor = inputs?.safety_floor_yuan ?? 0;
    return {
      backgroundColor: "transparent",
      animation: false,
      grid: { left: 65, right: 48, top: 30, bottom: 46 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#132130",
        borderColor: "#3c5764",
        textStyle: { color: "#eef7f7" },
        formatter: (params: any) => {
          const p = params[0];
          return `第 ${p.axisValue} 天<br/>现金余额 ${money(p.data[1])}`;
        },
      },
      xAxis: {
        type: "value",
        min: 0,
        max: inputs?.horizon_days ?? 90,
        interval: 15,
        axisLabel: { color: "#9eb6c1", formatter: (x: number) => `第${x}天` },
        axisLine: { lineStyle: { color: "#304857" } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#9eb6c1",
          formatter: (x: number) => (x / 10000).toFixed(0) + "万",
        },
        splitLine: { lineStyle: { color: "#233a49", type: "dashed" } },
      },
      series: [
        {
          type: "line",
          name: "现金余额",
          data: curve.map((p) => [p.day, p.balance_yuan]),
          smooth: false,
          step: "end",
          showSymbol: false,
          lineStyle: { color: "#59e2d0", width: 4 },
          areaStyle: { color: "rgba(57,206,185,.13)" },
          markLine: {
            symbol: "none",
            silent: true,
            lineStyle: { color: "#f0b975", type: "dashed", width: 2 },
            label: {
              color: "#f0b975",
              formatter: "安全底线",
              position: "insideEndTop",
            },
            data: [{ yAxis: floor }],
          },
        },
        {
          type: "scatter",
          data: current
            ? [[current.minimum_day, current.minimum_balance_yuan]]
            : [],
          symbolSize: 14,
          itemStyle: { color: "#f48e77" },
          z: 5,
        },
      ],
    };
  }, [current, inputs?.safety_floor_yuan, inputs?.horizon_days]);

  if (error && !inputs)
    return (
      <div className="fatal">
        <b>演示数据暂未载入</b>
        <p>{error}</p>
        <p>请先运行 start.ps1 -SkipInstall。</p>
        <button className="ghost" onClick={() => setBoot((v) => v + 1)}>
          重试载入
        </button>
      </div>
    );
  return (
    <InputValidity.Provider value={reportValidity}>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-icon">✦</span>
            <div>
              <strong>X-RAY</strong>
              <small>这一单，扛得住吗？</small>
            </div>
          </div>
          <div className="top-meta">
            <span className="status-dot" /> 本地 API ·{" "}
            {health?.verified_company_count ?? "—"} 家企业 ·{" "}
            {health?.verified_source_count ?? "—"} 份官方来源{" "}
            <span className="divider" /> 资料截至 {health?.as_of || "—"}
          </div>
          <button className="ghost reset" onClick={reset}>
            ↺ 重置演示
          </button>
        </header>
        <main>
          <section className="hero">
            <div className="eyebrow">
              交易前 · 现金底线核对台 <span>虚构交易演示</span>
              {profiles.length > 1 && (
                <select
                  className="profile-select"
                  aria-label="用户场景"
                  value={profile?.id || ""}
                  onChange={(e) =>
                    setProfile(
                      profiles.find((p) => p.id === e.target.value) || null,
                    )
                  }
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.target_user}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <h1>{profile?.headline || "正在读取用户场景…"}</h1>
            <p>{profile?.subtitle || "请等待本地 API 返回配置"}</p>
            <div className="hero-bottom">
              <span>
                <b>目标用户</b> {profile?.target_user || "—"}
              </span>
              <span>
                <b>决策目标</b> {profile?.decision_goal || "—"}
              </span>
            </div>
          </section>
          {invalid.size > 0 && (
            <div role="alert" className="error-banner">
              有未完成或无效的数字输入；已暂停计算，请修正红框字段。
            </div>
          )}
          {(error || calculationError) && (
            <div className="error-banner" role="alert">
              {error || calculationError}{" "}
              <button
                className="ghost"
                onClick={() => {
                  setError("");
                  setRetry((v) => v + 1);
                }}
              >
                重试计算
              </button>
            </div>
          )}
          <div className="workspace">
            <section id="evidence" className="panel evidence-panel">
              <div className="panel-head">
                <div>
                  <span className="section-index">01 / 公开事实</span>
                  <h2>先看客户证据</h2>
                </div>
                <span className="outlined">按条核验</span>
              </div>
              <div className="identity">
                <div className="identity-mark">
                  {company?.short_name?.slice(0, 1) || "企"}
                </div>
                <div>
                  <h3>{company?.short_name || "载入中"}</h3>
                  <p>{company?.legal_name || ""}</p>
                  <div className="identity-tags">
                    <span>
                      {!company
                        ? "身份载入中"
                        : company.listed
                          ? "已上市"
                          : "非上市"}{" "}
                      · {company?.ticker || "代码未披露"}
                    </span>
                    <span>{company?.industry || ""}</span>
                  </div>
                </div>
              </div>
              <p className="coverage">
                {company?.coverage} · 资料更新 {company?.updated_at}
              </p>
              <details className="unknown-box">
                <summary>
                  尚未核实 · {company?.unknowns.length ?? 0} 项（展开核对）
                </summary>
                {company?.unknowns.map((x) => (
                  <p key={x}>{x}</p>
                ))}
                <p>不能据此推算违约概率。</p>
              </details>
              <div className="evidence-divider" />
              <div className="small-label">
                风险线索 <span>公开事实</span>
              </div>
              {events.filter((e) => e.verification_status === "verified")
                .length === 0 && (
                <div className="unknown-box">
                  <b>覆盖资料内暂无已核实记录</b>
                  <p>当前覆盖资料有限，不能据此认定企业无风险。</p>
                </div>
              )}
              {events.map((e) => (
                <div className="event-card" key={e.id}>
                  <div className="event-top">
                    <span className="date">事件日期 {e.event_date}</span>
                    <span className="chip amber">{e.stage}</span>
                  </div>
                  <h4>{e.type}</h4>
                  <p>{e.explanation}</p>
                  <div className="event-entity">
                    涉及主体：{e.affected_entity}
                    <br />
                    {statusName(e.verification_status)} · {e.status}
                  </div>
                  {e.source_ids.map((id) => (
                    <button
                      key={id}
                      className="source-link"
                      onClick={() => showSource(id)}
                    >
                      查看原始公告与引用页 <span>↗</span>
                    </button>
                  ))}
                </div>
              ))}
              {company?.financials.length === 0 && (
                <p className="helper">
                  覆盖资料内暂无已核实财务记录，不能据此认定无风险。
                </p>
              )}
              <div className="small-label finance-label">
                财务事实 <span>人民币 · 元转万元</span>
              </div>
              {company?.financials.map((f) => (
                <button
                  className="fact-row"
                  key={f.field + f.period + f.source_id}
                  onClick={() => showSource(f.source_id, f)}
                >
                  <span>
                    <b>{f.field}</b>
                    <small>
                      {f.period}
                      <br />
                      {f.scope}口径 · {f.audited ? "已审计" : "未经审计"} ·{" "}
                      {statusName(f.verification_status)}
                    </small>
                  </span>
                  <strong>{money(f.value_yuan)}</strong>
                  <i>↗</i>
                </button>
              ))}
            </section>
            <section id="simulation" className="panel simulation-panel">
              <div className="panel-head">
                <div>
                  <span className="section-index">
                    02 / 情景假设 × 计算结果
                  </span>
                  <h2>这一单，现金会怎么走？</h2>
                </div>
                <span className="outlined teal">
                  {inputs?.horizon_days ?? 90} 天视窗
                </span>
              </div>
              <div className="order-strip">
                <div>
                  <small>演示订单</small>
                  <strong>{money(inputs?.order_amount_yuan)}</strong>
                </div>
                <div>
                  <small>账期</small>
                  <strong>发货后 {inputs?.payment_term_days ?? 90} 天</strong>
                </div>
                <div>
                  <small>本方期初现金</small>
                  <strong>{money(inputs?.opening_cash_yuan)}</strong>
                </div>
              </div>
              <div className="result-strip">
                <div>
                  <small>
                    {inputs?.horizon_days ?? 90} 天内现金最低点{" "}
                    <span className="label-calc">计算结果</span>
                  </small>
                  <strong
                    className={
                      current && current.shortfall_yuan > 0 ? "warning" : ""
                    }
                  >
                    {current
                      ? money(current.minimum_balance_yuan)
                      : pending
                        ? "计算中…"
                        : "待推演"}
                  </strong>
                  <p>
                    {current
                      ? `第 ${current.minimum_day} 天`
                      : "数值由后端逐日计算"}
                  </p>
                </div>
                <div>
                  <small>安全底线</small>
                  <strong>{money(inputs?.safety_floor_yuan)}</strong>
                  <p>
                    {current?.first_breach_day != null
                      ? `第 ${current.first_breach_day} 天跌破`
                      : current
                        ? "未跌破"
                        : "由用户设定"}
                  </p>
                </div>
                <div>
                  <small>底线缺口</small>
                  <strong
                    className={
                      current && current.shortfall_yuan > 0 ? "warning" : ""
                    }
                  >
                    {current ? money(current.shortfall_yuan) : "—"}
                  </strong>
                  <p>
                    {inputs?.prepayment_rate === 1
                      ? "全额预付，无余款"
                      : current?.outside_view_payment
                        ? `余款第 ${current.final_payment_day} 天才到账`
                        : " "}
                  </p>
                </div>
              </div>
              <div className="chart-title">
                <span>本方现金余额走势</span>
                <span>单位：万元 · 订单与本方数据均为虚构</span>
              </div>
              <div
                className="chart-wrap"
                role="img"
                aria-label={
                  current
                    ? `现金最低 ${money(current.minimum_balance_yuan)}，第 ${current.minimum_day} 天；底线缺口 ${money(current.shortfall_yuan)}`
                    : pending
                      ? "正在计算"
                      : "尚未计算，不显示曲线"
                }
              >
                {current ? (
                  <ReactECharts
                    echarts={echarts}
                    option={chart}
                    style={{ height: "100%", width: "100%" }}
                    notMerge
                  />
                ) : (
                  <div className="chart-empty" role="status">
                    {pending
                      ? "正在按最新参数计算…"
                      : calculationError
                        ? "计算失败，请修正输入或重试"
                        : "点击推演，生成后端现金曲线"}
                  </div>
                )}
              </div>
              <div
                className="timeline"
                aria-label="情景日程（输入日期，不是付款预测）"
              >
                <span className="t-dot teal-dot">
                  签约 / 预付款
                  <br />第 0 天
                </span>
                {(inputs?.shipments || [{ day: 0, fraction: 1 }]).map(
                  (ship, i) => (
                    <span className="t-dot" key={"ship" + i}>
                      第 {i + 1} 批发货 {Math.round(ship.fraction * 100)}%<br />
                      发货第 {ship.day} 天 · 成本第{" "}
                      {Math.max(inputs?.cost_day ?? 0, ship.day)} 天<br />
                      {inputs?.prepayment_rate === 1
                        ? "全额预付，无余款"
                        : `回款第 ${ship.day + (inputs?.payment_term_days ?? 0) + (inputs?.delay_days ?? 0)} 天${ship.day + (inputs?.payment_term_days ?? 0) + (inputs?.delay_days ?? 0) > (inputs?.horizon_days ?? 90) ? "（视窗外）" : ""}`}
                    </span>
                  ),
                )}
                {inputs?.other_net_cashflows.map((flow, i) => (
                  <span className="t-dot amber-dot" key={"flow" + i}>
                    {flow.label}
                    <br />第 {flow.day} 天 · {money(flow.amount_yuan)}
                  </span>
                ))}
                {current && inputs?.prepayment_rate !== 1 && (
                  <span className="t-dot">
                    最后回款{current.outside_view_payment ? "（视窗外）" : ""}
                    <br />第 {current.final_payment_day} 天
                  </span>
                )}
              </div>
              <p className="helper">
                成本与回款总额可在「这怎么算的」中核对；分批成本日取成本支付日与该批发货日中较晚者。逐笔金额明细暂未提供。
              </p>
            </section>
            <section id="terms" className="panel control-panel">
              <div className="panel-head">
                <div>
                  <span className="section-index">03 / 改交易条件</span>
                  <h2>试一种更稳的签法</h2>
                </div>
              </div>
              <div className="scenario-note">
                所有滑块都是<span>情景假设</span>
                。风险公告不会自动推断客户延付。
              </div>
              <button
                className="primary"
                disabled={!inputs || invalid.size > 0}
                onClick={() => {
                  setRunning(true);
                  setRetry((v) => v + 1);
                }}
              >
                {pending
                  ? "正在计算最新参数…"
                  : running
                    ? "重新计算当前情景"
                    : profile?.primary_action || "推演这笔订单"}{" "}
                <span>→</span>
              </button>
              <div className="action-row">
                <button
                  className="secondary"
                  disabled={!result}
                  onClick={() => setDrawer("math")}
                >
                  这怎么算的 <span>↗</span>
                </button>
                <button
                  className="secondary"
                  disabled={!result}
                  onClick={() => setDrawer("card")}
                >
                  {profile?.output_template.title || "核对卡"} <span>↗</span>
                </button>
              </div>
              <div className="control-group">
                <div className="control-line">
                  <span>客户延付（压力假设）</span>
                  <strong>+{inputs?.delay_days ?? 0} 天</strong>
                </div>
                <div className="segmented">
                  {[0, 30, 60].map((v) => (
                    <button
                      key={v}
                      aria-pressed={inputs?.delay_days === v}
                      className={inputs?.delay_days === v ? "active" : ""}
                      onClick={() => setInput("delay_days", v)}
                    >
                      {v === 0 ? "按期" : `延付 ${v} 天`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="control-group slider-group">
                <div className="control-line">
                  <label htmlFor="advance">预付款比例</label>
                  <strong className="teal-text">
                    {Math.round((inputs?.prepayment_rate || 0) * 100)}%
                  </strong>
                </div>
                <input
                  id="advance"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round((inputs?.prepayment_rate || 0) * 100)}
                  onChange={(e) =>
                    setInput(
                      "prepayment_rate",
                      numeric(Number(e.target.value)) / 100,
                    )
                  }
                />
                <div className="range-label">
                  <span>0%</span>
                  <button
                    className="inline-link"
                    onClick={() => setInput("prepayment_rate", 0.3)}
                  >
                    设为 30%
                  </button>
                  <span>100%</span>
                </div>
                <p className="helper">
                  先到账{" "}
                  {money(
                    (inputs?.order_amount_yuan || 0) *
                      (inputs?.prepayment_rate || 0),
                  )}
                  ；余款与订单总价保持一致。
                </p>
              </div>
              <div className="control-group">
                <div className="control-line">
                  <label htmlFor="term">发货后账期</label>
                  <strong>{inputs?.payment_term_days} 天</strong>
                </div>
                <input
                  id="term"
                  type="range"
                  min="0"
                  max="365"
                  step="1"
                  value={inputs?.payment_term_days ?? 90}
                  onChange={(e) =>
                    setInput("payment_term_days", Number(e.target.value))
                  }
                />
              </div>
              <button
                className="text-button"
                aria-expanded={advanced}
                onClick={() => setAdvanced((v) => !v)}
              >
                {advanced ? "收起详细参数" : "编辑成本、发货、其他现金流"}{" "}
                <span>{advanced ? "−" : "+"}</span>
              </button>
              {advanced && inputs && (
                <ScenarioEditor inputs={inputs} setInput={setInput} />
              )}

              {comparison && (
                <div className="comparison">
                  <div className="small-label">同一组假设 · 方案对比</div>
                  {comparison.variants.map((v) => (
                    <div key={v.name}>
                      <span>{v.name}</span>
                      <strong>{money(v.result.minimum_balance_yuan)}</strong>
                    </div>
                  ))}
                  <small>{comparison.explanation}</small>
                  <small>
                    预置两批发货方案需协商交付；具体条款须确认。30%
                    预付款需客户接受。
                    <br />
                    放弃订单将失去预期毛利{" "}
                    {money(comparison.opportunity_cost_yuan)}。
                  </small>
                </div>
              )}
            </section>
          </div>
          <footer>
            <span>事实有出处，假设可改，结果可重算。</span>
            <span>
              本工具用于交易前核对，不提供违约概率、法律意见或授信结论。
            </span>
          </footer>
        </main>
        <nav className="mobile-nav" aria-label="演示快速导航">
          <a href="#evidence">客户证据</a>
          <a href="#simulation">现金结果</a>
          <a href="#terms">改条款</a>
        </nav>
        {drawer && (
          <Drawer viewKey={drawer} onClose={closeDrawer}>
            {drawer === "source" && (
              <>
                {returnToCard && (
                  <button
                    className="ghost"
                    onClick={() => {
                      sourceSequence.current++;
                      setDrawer("card");
                    }}
                  >
                    ← 返回核对卡
                  </button>
                )}
                {sourceNote && (
                  <p role="status" className="source-notice">
                    {sourceNote}{" "}
                    <button
                      className="ghost"
                      onClick={() => showSource(sourceId, selectedFact)}
                    >
                      重试来源
                    </button>
                  </p>
                )}
              </>
            )}
            {drawer === "source" && source && (
              <>
                <span className="section-index">公开事实 / 来源详情</span>
                <h2>{source.title}</h2>
                <p className="drawer-lead">
                  {source.institution} · {source.published_at}
                </p>
                <div className="info-list">
                  <div>
                    <span>本地文件核验</span>
                    <strong>
                      {source.accessible
                        ? "哈希与引用数字检查通过"
                        : "缺失或核验失败"}
                    </strong>
                  </div>
                  <div>
                    <span>公告编号</span>
                    <strong>{source.notice_number || "未标注"}</strong>
                  </div>
                  <div>
                    <span>来源默认引用页</span>
                    <strong>第 {source.page} 页</strong>
                  </div>
                  <div>
                    <span>采集日期</span>
                    <strong>{source.fetched_at}</strong>
                  </div>
                  <div>
                    <span>文件 SHA-256</span>
                    <code>{source.sha256}</code>
                  </div>
                </div>
                <p className="helper">来源 ID：{source.id}</p>
                <div className="quote">
                  <b>来源摘录</b>
                  <br />“{source.excerpt}”
                </div>
                {selectedFact && (
                  <div className="quote">
                    <b>本条事实：{selectedFact.field}</b>
                    <br />
                    {selectedFact.excerpt}
                    <br />
                    {selectedFact.period} · {selectedFact.scope} ·{" "}
                    {selectedFact.audited ? "已审计" : "未经审计"}
                  </div>
                )}
                <a
                  className="external"
                  href={source.url + "#page=" + source.page}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  打开官方原始 PDF ↗
                </a>
                <p className="drawer-foot">
                  官方链接需要外网；断网时仍可阅读已缓存的来源元数据。PDF
                  本地文件位于仓库 data/source_docs，当前页面没有本地 PDF
                  下载接口。自动检查仅核对哈希、页码及数字字符，中文行项目沿用已记录的人工复核范围。
                </p>
              </>
            )}
            {(drawer === "math" || drawer === "card") && !result && (
              <p role="status">
                {pending
                  ? "正在重新计算，请稍候…"
                  : "暂无当前参数的有效计算结果，请返回重试。"}
              </p>
            )}
            {drawer === "math" && result && (
              <>
                <span className="section-index">情景假设 / 计算结果</span>
                <h2>现金最低点怎么得出？</h2>
                <p className="drawer-lead">
                  逐日现金 = 期初现金 + 截至当日（含当日）所有流入 −
                  截至当日所有流出。最低现金取当前视窗内的最小值。
                </p>
                {result.formula_breakdown.map((v, i) => (
                  <div className="formula" key={i}>
                    <span>0{i + 1}</span>
                    {v}
                  </div>
                ))}
                <div className="quote">
                  {inputs?.prepayment_rate === 1
                    ? "全额预付，无余款；上方说明中的余款 0 元不构成未来现金流。"
                    : result.outside_view_payment
                      ? `第 ${result.final_payment_day} 天才到账，超出 ${inputs?.horizon_days} 天图表视窗；不等于坏账。`
                      : "回款日位于当前视窗内。"}
                </div>
                <h3>边界</h3>
                {result.assumptions.map((a, i) => (
                  <p key={i} className="assumption">
                    • {a}
                  </p>
                ))}
              </>
            )}
            {drawer === "card" && company && result && profile && (
              <>
                <span className="section-index">可追溯输出</span>
                <h2>{profile.output_template.title}</h2>
                <p className="drawer-lead">
                  {profile.target_user} · {profile.decision_goal}
                </p>
                {profile.output_template.sections.map((s) => (
                  <section className="card-section" key={s.id}>
                    <h3>{s.title}</h3>
                    {s.fields.map((f) => (
                      <div key={f}>
                        <span
                          className={
                            "field-category " +
                            (fieldCategory(f) === "计算结果"
                              ? "calculated"
                              : fieldCategory(f) === "情景假设"
                                ? "assumed"
                                : "public")
                          }
                        >
                          {fieldCategory(f)}
                        </span>
                        {cardField(f)}
                      </div>
                    ))}
                  </section>
                ))}
              </>
            )}
          </Drawer>
        )}
      </div>
    </InputValidity.Provider>
  );
}
export default App;
