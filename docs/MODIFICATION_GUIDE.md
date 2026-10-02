# 消费者真实调查修改入口（2026-10-02）

最新功能说明见 [CONSUMER_AGENT.md](CONSUMER_AGENT.md)。消费者页面不是旧核对卡换标题：

| 修改项 | 入口 |
|---|---|
| 默认角色、主文案 | `data/use_cases.json` |
| 消费者交互与来源抽屉 | `frontend/src/ConsumerWorkspace.tsx`、`consumer.css` |
| 前后端消费者契约 | `frontend/src/api/consumer.ts`、`backend/app/schemas/consumer.py` |
| 真实搜索和名称消歧 | `services/consumer_search.py`、`consumer.py` |
| LangGraph 工具循环与引用校验 | `services/consumer_agent.py` |
| 数据库主题训练与复核准则 | `services/consumer_criteria.py` |
| 六项指标和材料筛选 | `services/consumer_indicators.py` |
| 在线模型、企查查接入 | `services/consumer_model.py`、`consumer_registry.py` |
| 启动准备、现场真实验收 | `app/prepare.py`、`app/consumer_smoke.py` |

下文保留旧模块导航。

# 当前修改导航：历史证据库增量（2026-10-02）

这是“想改哪块，去哪一个文件”的统一入口。下半部分保留原交易页面的详细字段说明；本节覆盖新增能力。修改事实前先看 DATASET_CARD、SOURCE_POLICY 和 POINT_IN_TIME_POLICY，不能改前端文字来补不存在的数据。

| 想修改什么 | 主要文件 | 改哪一项／联动验证 |
|---|---|---|
| 用户角色、主标题、按钮、核对卡章节 | `data/use_cases.json` | profiles 中 target_user / decision_goal / headline / primary_action / output_template；支持已有字段的新角色不改企业模型 |
| 原交易 UI、颜色、布局 | `frontend/src/App.tsx`、`style.css` | 三栏、图表与卡片；现金数值仍来自 API |
| 历史回放 UI、企业日期选择、联网入口 | `frontend/src/HistoryWorkspace.tsx`、`history.css` | 企业+日期状态、后续结果、候选搜索、来源抽屉；不要删旧响应防护 |
| 真实研究企业范围、行业抽样、日期、关键词、预算 | `configs/universe.json` | companies / cohort / queries / start / end / limit / max_pages；discover 后只增加候选 |
| 新核对事实、财务数值、事件和阶段 | `data/curated/assertions.json` | 公告 ID、hash、页码、主体、短摘录、agent 时间；财务含 raw_value/raw_unit、table_locator；运行 validate |
| 原演示数据与支持规则 | `data/verified/*.json`、`data/source_manifest.json`、`data/legacy_evidence_rules.json` | 保持旧 ID、来源关系与具体事件证据；运行 seed，别在 JSX 硬编码 |
| 数据表、索引与加法迁移 | `backend/app/db/history.py`、`models.py` | 改模型要考虑已有 SQLite；禁止删库代替迁移 |
| 线上来源、限速、下载校验 | `backend/app/services/acquisition.py` | CNINFO 适配器、HTTPS/域名/体积/类型/重试；新增来源先核许可 |
| CLI、原文导入、核验与标签管线 | `backend/app/data_pipeline.py` | doctor/discover/fetch/extract/validate/import-pdf/build-labels；修改后复跑独立数据库 |
| 历史日期过滤、结果查询、全文检索、对照 | `backend/app/services/history.py` | snapshot/outcomes/search_pages/compare_entities/version；必须在后端隔离未来 |
| 结果标签类型与阶段条件 | `data_pipeline.py:check_event_claim`、`docs/LABEL_POLICY.md` | 必须同时有原始证据和语义规则，不能把“拟议”变为“已发生” |
| API 路径、字段、错误结构 | `backend/app/api/history.py`、`schemas/history.py`、`frontend/src/api/history.ts` | 同步运行时 `docs/openapi-v2.json`，旧接口兼容说明在 openapi.yaml |
| 离线原文页呈现 | `backend/app/api/history.py` | /sources/.../document、/pages/{page}、/viewer；路径/hash 必须检查 |
| 虚构订单金额、现金与默认条款 | `data/demo_scenarios.json` | 单位人民币元，不是真实公司财报；不要与 curated 混用 |
| 现金算法、成本规则、方案参数 | `backend/app/services/cashflow.py`、`schemas/api.py` | Decimal、cash_ledger、warnings、cost_payment_rule；回归 3万→33万及分批尾差 |
| 模型解释的限制与回退 | `backend/app/services/llm.py` | 当前保守只接受已有解释/原文；无密钥仍运行，不生成信用分 |
| 启动与恢复 | `start.ps1` / `start.sh`、`rebuild-research.ps1` / `.sh` | 首次下载需要网络；研究原文不在 GitHub 中 |
| 回归测试 | `backend/tests/test_history.py`、`test_import.py`、`frontend/tests/` | 事实/时间/金额/状态/竞态；不要让测试依赖线上采集 |
| 交接和实际数量 | `docs/TEAM_HANDOFF.md`、`DATA_QUALITY_REPORT.md`、`DATASET_CARD.md` | 以数据库质量 API/导出为准，别手改数字冒充采集 |

本轮运行：后端 58 项、前端 8 项、生产构建通过。更新操作详见 [INGEST_RUNBOOK](INGEST_RUNBOOK.md)。没有已核验资料的用户场景要显示缺口；需要新算法时加独立服务，不塞进企业事实模型。

以下为原交易演示的详细导航（历史版本中的提交/覆盖数量不代表新增研究库）：

---

# X-Ray 修改导航：想改什么，就从这里找

更新日期：2026-10-02。对应 `feat/db-frontend` 分支、API 契约 `docs/openapi.yaml` v1.0.0。本文根据当前实现整理；表格中的完整路径均从**项目根目录**算起，即包含 `README.md`、`backend/`、`frontend/`、`data/` 的目录。正文中的 `App.tsx` 等简称沿用表格已列出的文件路径。搜索给出的函数名、字段名或 CSS 选择器即可定位，不依赖容易变化的行号。

本文集中说明“改哪个文件、改哪一项、怎样生效、怎样确认”。历史交付和实测记录见 `docs/TEAM_HANDOFF.md`；数据来源结论见 `docs/DATA_PROVENANCE.md`。后续移动文件或修改字段时，请同步更新本文。

## 1. 先用这张表找入口

| 想修改什么 | 首先打开哪个文件 | 搜索或修改哪一项 | 还要检查什么 |
|---|---|---|---|
| 用户角色、默认角色 | `data/use_cases.json` | `use_cases[]`、`default_use_case_id` | 详见第 2 节；刷新页面生效 |
| 主标题、副标题、决策目标、首次主按钮 | `data/use_cases.json` | `headline`、`subtitle`、`decision_goal`、`primary_action` | 不是在 JSX 内复制每个角色的文案 |
| 核对卡标题、章节顺序、已有字段组合 | `data/use_cases.json` | `output_template.title`、`sections[]`、`fields[]` | 支持的字段见第 2 节 |
| 核对卡增加一种全新的展示字段 | `frontend/src/App.tsx` | `cardField`、`fieldCategory` | 若缺数据，先补 API 契约，不能编造展示值 |
| 品牌、固定页面提示、三栏结构 | `frontend/src/App.tsx` | `brand`、`hero`、`evidence-panel`、`simulation-panel`、`control-panel` | 角色文案仍放配置；企业事实仍来自 API |
| 配色、字体、间距、按钮、卡片 | `frontend/src/style.css` | `:root`、`.panel`、`.primary`、`.fact-row` 等 | 图表配色还在 `App.tsx` 的 `chart` 内 |
| 笔记本、手机布局 | `frontend/src/style.css` | `@media`、`.workspace`、`.mobile-nav`、`.chart-wrap` | 同一选择器可能有后置覆盖，见第 3 节 |
| 浏览器标签页标题、页面入口 | `frontend/index.html`、`frontend/src/main.tsx` | HTML 的 `title`；React 挂载入口 | 通常不需要改业务逻辑 |
| 图表、底线、最低点、提示框 | `frontend/src/App.tsx` | `const chart = useMemo`、`cash_curve`、`markLine` | 余额必须来自 API，不能用静态折线替换 |
| 时间轴、批次与回款日展示 | `frontend/src/App.tsx` | `className="timeline"` | 与后端 `simulate` 的日期规则同步 |
| 默认订单、现金、预付款、账期 | `data/demo_scenarios.json` | 各输入字段，见第 4 节 | 改完运行 seed，再刷新；不是实时读 JSON |
| 详细参数表单、发货批次、其他现金流 | `frontend/src/ScenarioEditor.tsx` | `ScenarioEditor`、`setInput`、`shipments`、`other_net_cashflows` | 单位转换、范围、后端校验保持一致 |
| 预付款滑块、延付快捷档位、账期滑块 | `frontend/src/App.tsx` | `prepayment_rate`、`[0, 30, 60]`、`payment_term_days` | “设为 30%”快捷键与后端比较方案是两处设置 |
| 空值、小数、负数、无效输入提示 | `frontend/src/NumberInput.tsx` | `NumberInput`、`InputValidity` | 每个字段的 `min/max/step` 在调用处定义 |
| 拖动重算、加载状态、旧响应、重试 | `frontend/src/useSimulation.ts` | `useSimulation`、`setTimeout`、`settled`、`valid` | `App.tsx` 的 `running/invalid/retry` 决定是否计算 |
| 重置演示 | `frontend/src/App.tsx` | `reset`、`original`、`defaultProfile` | 恢复本次页面加载时的情景和配置默认角色 |
| 抽屉宽度、关闭、键盘与焦点 | `frontend/src/Drawer.tsx`、`frontend/src/style.css` | `Drawer`、`.drawer`、`.drawer-close` | 抽屉内容在 `App.tsx` 的 `source/math/card` 分支 |
| 来源抽屉、缓存、官方链接 | `frontend/src/App.tsx` | `showSource`、`sourceCache`、`xray-source-v1:` | 缓存只是来源信息；没有本地 PDF 下载接口 |
| 公司身份、财务事实、事件内容 | `data/verified/halo-688173.json` 或新的 `data/verified/*.json` | `company`、`facts[]`、`risk_events[]` | 由数据负责人核验，配合来源清单和 seed |
| 官方 URL、PDF、页码、哈希 | `data/source_manifest.json`、`data/source_docs/` | `id/url/local_file/page/sha256/excerpt` | 不要为了通过导入而伪造哈希或人工复核标记 |
| 导入规则、重复、失败回滚 | `backend/app/db/validation.py`、`backend/app/db/seed.py` | `load_inputs`、`_seed`、`seed`、`verify_excerpt` | 第 6 节说明约束和旧库处理 |
| 表结构、主键、外键、数据库路径 | `backend/app/db/models.py` | 六个模型、`DB_PATH`、`enable_foreign_keys` | 现有库新增约束还需迁移处理，不能只改模型 |
| 现金计算、成本时点、四方案内容 | `backend/app/services/cashflow.py` | `simulate`、`compare`、`money` | 核心负责人范围；同步公式、测试、时间轴 |
| API 地址、超时、错误提示、类型 | `frontend/src/api/client.ts`、`types.ts`、`frontend/vite.config.ts` | `request`、`ApiError`、`api`、`server.proxy` | 契约→后端→TS→调用处，详见第 7 节 |
| 可选 LLM 解释、离线模板 | `backend/app/services/llm.py`、`.env.example` | `effective_mode`、`explain`、`offline_explanation` | 主页面不依赖模型计算；密钥只进本机环境 |
| 安装、启动、端口、测试命令 | `start.ps1`、`test.ps1`、`frontend/package.json` | `SkipInstall`、uvicorn 参数、`scripts` | 第 8、9 节；`test.ps1` 不含前端单测 |

## 2. 修改角色与核对卡：通常只改一个 JSON

入口是 `data/use_cases.json`。后端 `backend/app/api/routes.py` 的 `use_cases()` 每次请求读取它；前端在页面启动时调用 `GET /api/use-cases`。**保存 JSON 后刷新页面即可，不需要 seed。** 点击“重置演示”不会重新读取磁盘配置。

| 配置项 | 页面用途 | 修改要求 |
|---|---|---|
| `default_use_case_id` | 首次打开及重置时选中的角色 | 必须对应 `use_cases[].id`；不要依赖找不到时的首项兜底 |
| `use_cases[].id` | 角色的稳定标识 | 新角色使用唯一 ID；不是企业 ID |
| `target_user` | 角色下拉选项、核对卡受众 | 写角色描述，不写虚构客户验证结论 |
| `decision_goal` | 页面决策目标、核对卡说明 | 描述用户想做的决策 |
| `headline`、`subtitle` | 页面主标题、副标题 | 按角色配置，不必修改 React |
| `primary_action` | 尚未开始计算时的主按钮 | “正在计算”“重新计算”等状态文案在 `App.tsx` |
| `output_template.title` | 核对卡按钮及抽屉标题 | 不影响计算结果 |
| `output_template.sections[]` | 卡片章节，按数组顺序显示 | 章节 `id` 在本角色内保持唯一，`title` 可改 |
| `sections[].fields[]` | 每章按顺序展示的数据字段 | 使用下表键名；未知键显示“尚未配置展示规则” |

当前 `App.tsx` 的 `cardField` 支持以下全部字段：

| 字段键 | 展示内容 | 内容来源 |
|---|---|---|
| `legal_name` | 公司名称及证券代码 | 企业 API |
| `ticker` | 证券代码 | 企业 API |
| `coverage` | 核验覆盖范围 | 企业 API |
| `risk_events` | 主体、日期、阶段、状态、解释及来源 | 风险事件 API |
| `financials` | 财务数值、期间、口径、审计状态及来源 | 企业 API |
| `source_links` | 本企业事实和事件引用的来源按钮 | 已加载事实、事件中的来源 ID |
| `unknowns` | 尚未核实事项 | 企业 API |
| `scenario_inputs` | 当前订单及本方现金输入 | 当前表单状态，明确标为虚构输入 |
| `assumptions` | 计算假设 | 推演 API |
| `formula_breakdown` | 计算说明 | 推演 API |
| `shortfall_yuan` | 最低现金及底线缺口 | 推演 API |
| `comparison` | 对比结果、说明及放弃订单的机会成本 | 对比 API |

例如，追加下列对象到现有 `use_cases` 数组，可复用已有数据字段；这是**配置写法示例**，不是已经投放或验证的第三角色：

```json
{
  "id": "supplier-internal-review",
  "target_user": "供货企业内部复核人员",
  "decision_goal": "核对公开依据与订单假设，复核现金底线",
  "headline": "把签约依据逐项核对清楚",
  "subtitle": "公开事实、待核实事项和现金推演分开展示。",
  "primary_action": "复核这笔订单",
  "output_template": {
    "title": "签约复核卡",
    "sections": [
      {"id": "evidence", "title": "依据与缺口", "fields": ["legal_name", "risk_events", "financials", "unknowns"]},
      {"id": "scenario", "title": "输入与结果", "fields": ["scenario_inputs", "formula_breakdown", "shortfall_yuan", "comparison"]}
    ]
  }
}
```

要把它设为默认，再将根字段 `default_use_case_id` 改为 `supplier-internal-review`。保持 JSON 合法，不要写注释或尾逗号。刷新后切换角色、推演、打开核对卡、重置，分别检查文案、章节和默认选择。

新增**已有字段的组合**不用改表结构或证据服务。新增**展示字段**需扩展 `cardField`，并在 `fieldCategory` 分清公开资料、未知项、情景假设和计算结果；缺少的数据要先由核心负责人扩展接口。新增**算法**应独立设计服务及契约，不能藏在角色 JSON 或 JSX 中。

## 3. 修改 UI：样式、结构、交互分别在哪

### 3.1 配色与排版

主要入口是 `frontend/src/style.css`。当前颜色多为直接色值，尚未统一成主题变量；不要假设改一个 `:root` 色值就会改变全站。

| 页面部位 | 在 `style.css` 中搜索 |
|---|---|
| 全局字体、背景、正文颜色 | `:root`、`body` |
| 页头、品牌、标题区 | `.topbar`、`.brand`、`.hero` |
| 三栏宽度与间距 | `.workspace`、`.panel`、`.evidence-panel`、`.simulation-panel`、`.control-panel` |
| 风险卡、财务行、未知项 | `.event-card`、`.fact-row`、`.unknown-box` |
| 结果数字、图表尺寸、时间轴 | `.result-strip`、`.chart-wrap`、`.timeline` |
| 主按钮、辅助按钮、控件 | `.primary`、`.secondary`、`.ghost`、`.segmented`、`.control-group` |
| 详细表单、分批与现金流 | `.advanced-grid`、`.cashflows`、`.cashflow-row` |
| 来源、算法、核对卡抽屉 | `.drawer`、`.quote`、`.formula`、`.card-section` |
| 事实／假设／结果标签 | `.field-category.public`、`.field-category.assumed`、`.field-category.calculated` |
| 错误、键盘焦点、手机导航 | `.error-banner`、`.input-error`、`:focus-visible`、`.mobile-nav` |

文件后部有为笔记本与手机补充的覆盖规则。同一选择器可能出现多次；搜索全部匹配，并确认当前窗口命中的 `@media`。重点包括 `max-width: 800px`、801–1399px、1100–1399px、`min-width: 1400px`，以及前部的 1330px 规则。不要只改首次出现的位置就认定生效。

### 3.2 页面结构、图表与交互

- `frontend/src/App.tsx`：页面结构、数据装配、三种抽屉内容、角色选择、默认流程。搜索 `id="evidence"`、`id="simulation"`、`id="terms"` 定位三块业务区域。移动端导航也引用这三个 ID，改 ID 时要同步导航。
- 图表配置在 `App.tsx` 的 `chart`：`grid` 调绘图区，`xAxis/yAxis` 调坐标轴，`tooltip` 调提示，`series` 调线和最低点，`markLine` 调底线。图表颜色不完全由 CSS 控制。保留阶梯线、文字替代、观察视窗和“视窗外回款”提示。
- `frontend/src/ScenarioEditor.tsx`：详细参数。`yuan()` 只做万元转元和分精度转换；现金余额计算仍在后端。标签、输入顺序、添加／删除批次与现金流都在此文件。
- `frontend/src/NumberInput.tsx`：未完成输入和合法性。不要把用户暂时清空输入强制改为 0；无效输入通过 `InputValidity` 暂停计算。
- `frontend/src/useSimulation.ts`：150ms 防抖、同时请求推演和对比、忽略过期响应。调整速度时保留 `settled.input === inputs`、重试批次和卸载失效机制，避免新参数显示旧数字。
- `frontend/src/Drawer.tsx`：Escape、焦点圈定、切换内容时滚动复位和关闭后焦点返回。抽屉正文仍在 `App.tsx`，不要在这个通用容器里写企业资料。
- `App.tsx` 的 `reset()`：恢复本次加载的 `original` 输入和 `defaultProfile`，退出推演并收起详情。它不清除数据库，也不重新获取已修改的配置。

前端源码保存后，开发中的 Vite 通常会热更新。最终仍须构建并查看 1920×1080、1366×768 和 390×844；检查结果数字、按钮、抽屉、键盘焦点和横向溢出。

## 4. 修改默认订单与输入范围

`data/demo_scenarios.json` 保存**一个默认虚构情景对象**，不是情景数组。seed 将其写入 `demo_scenarios` 表中 ID 为 `default` 的记录；`GET /api/demo-scenario` 从数据库读取。修改文件后运行 seed，再刷新页面。若要多个可选择的默认情景，当前 API/UI 没有该功能，需先扩展契约。

| 字段 | 含义／单位 | 当前校验或行为 |
|---|---|---|
| `company_id` | 关联已导入企业 ID | 首页按它加载公司与事件；不在 JSX 固定企业 ID |
| `opening_cash_yuan` | 本方期初现金，人民币元 | 非负 |
| `safety_floor_yuan` | 本方现金底线，人民币元 | 非负；0 是有效值 |
| `order_amount_yuan` | 订单额，人民币元 | 大于 0 |
| `gross_margin_rate` | 毛利率，0–1 | 18% 写 `0.18`，不是 `18` |
| `direct_cost_yuan` | 直接成本，人民币元或 `null` | 非空时优先于毛利率；为空时必须提供毛利率 |
| `prepayment_rate` | 预付款比例，0–1 | 30% 写 `0.3`；预付款第 0 天到账 |
| `payment_term_days` | 发货后账期，整数天 | 0–365 |
| `delay_days` | 用户主动设置的延付压力，整数天 | 0–365，不是企业付款预测 |
| `cost_day` | 成本最早支付日，整数天 | 0–730；每批实际成本日在 `max(cost_day, shipment.day)` |
| `horizon_days` | 观察视窗，整数天 | 90–730；默认 90 |
| `shipments[].day` | 该批发货日，整数天 | 0–730；日期相对于情景第 0 天 |
| `shipments[].fraction` | 该批占订单比例，0–1 | 后端要求所有批次合计恰为 1；非空数组至少一批 |
| `other_net_cashflows[].day` | 其他业务现金流日，整数天 | 0–730 |
| `other_net_cashflows[].amount_yuan` | 现金流金额，人民币元 | 收入为正、支出为负、0 有效 |
| `other_net_cashflows[].label` | 本条现金流说明 | 显示在时间轴；保持情景假设语义 |

`shipments` 为 `null` 或省略时，当前后端按第 0 天一次发货；仓库默认情景则明确写第 10 天发货。表单每批比例的最小输入为 0.01%，新增的 0% 占位需填写后才能继续。JSON/API 的人民币单位是**元**，表单和多数页面显示**万元**，不要把页面上的 100 万元直接存成 `100` 元。

输入范围的最终校验在 `backend/app/schemas/api.py` 的 `SimulationInput`、`Shipment`、`Cashflow` 和 `valid_scenario()`。若改范围，需同步 OpenAPI、前端 `min/max/step`、默认值规范化及相关测试。

## 5. 修改计算、方案对比与解释

计算权威入口是 `backend/app/services/cashflow.py`，属于核心负责人维护范围：

- `money()`：人民币分精度和 Decimal 舍入。
- `simulate()`：预付款、各批成本、余款、其他现金流、观察视窗、最低现金、首次跌破日、缺口和公式说明。某批回款日是发货日＋账期＋延付；分摊舍入余数由最后一批承接。
- `compare()`：当前四方案为当前条款、30% 预付款、两批发货、放弃订单。30% 是这里的 `Decimal("0.30")`；两批预置为第 10／45 天、各 50%。它不会自动沿用用户自定义的两批日期。

若把推荐预付款改成 40%，不能只改页面按钮文字：要同步 `compare()` 的参数／方案名、`App.tsx` 的快捷键和说明、测试与演示文档。若改变成本或回款时点，还要同步 `App.tsx` 时间轴。金额曲线与最低点始终消费 API；不要在 React 里另写一套现金算法。

“这怎么算的”主要展示 API 的 `formula_breakdown` 和 `assumptions`；其措辞在 `simulate()`，抽屉排版在 `App.tsx`。当前接口没有逐笔现金台账，不能把汇总说明宣传成完整逐笔流水。

默认情景的回归锚点：0% 预付款最低 30,000 元／第 75 天、缺口 170,000 元；30% 最低 330,000 元且未跌破 200,000 元底线；延付 30／60 天的余款分别在第 130／160 天。输入变化后应由 API 重新计算，不能固定显示这些数字。

## 6. 修改真实数据、核验与数据库

### 6.1 先区分三个位置

| 文件／目录 | 保存什么 | 重点字段 |
|---|---|---|
| `data/source_manifest.json` | 官方来源清单 | `id`、`url`、`local_file`、`sha256`、`published_at`、`fetched_at`、`notice_number`、`page`、`excerpt` |
| `data/source_docs/` | 清单对应的本地 PDF | 文件名与 `local_file` 完全一致；内容须与哈希一致 |
| `data/verified/*.json` | 每个文件的一家企业、事实与事件 | `company`、`facts[]`、`risk_events[]` |

当前核验文件为 `data/verified/halo-688173.json`。企业名称／行业／覆盖说明在 `company`；财务金额、期间、口径、审计状态在 `facts[]`；事件主体、阶段、状态及解释在 `risk_events[]`。公司 ID 来自所属 `company`，事实用 `source_id` 关联清单，事件用 `company_id` 和 `source_ids[]` 关联。

新增企业需由数据负责人提供已经核验的文件与 PDF，导入器会扫描所有 `data/verified/*.json`。ID 必须稳定且全局不冲突；当前每家企业放一个文件。若要让首页显示新企业，导入成功后修改默认情景的 `company_id` 并再次 seed。当前页面没有企业搜索／选择器，虽然后端有企业列表接口。

**新增企业还不能仅以导入成功作为产品验收。** 当前 `routes.py` 的 `company()` 仍返回固定 `unknowns`，并按字段名 `控股子公司管理股风险` 排除事件支持事实。核心负责人需同步完善新企业的未知项和事实分类；不要把原企业的未知项照搬给新企业。具体接口提案见交接文档。

### 6.2 导入代码的分工

| 文件 | 函数／模型 | 负责什么 |
|---|---|---|
| `backend/app/db/validation.py` | `read_json`、`required`、`amount`、`load_inputs` | 输入结构、ID／URL／哈希重复、引用、日期、单位、金额和主体一致性；错误定位到文件或记录 |
| `backend/app/db/seed.py` | `verify_excerpt` | 本地 PDF 指定页的数字字符定位；不能自动核验整段中文 |
| `backend/app/db/seed.py` | `_seed` | 校验后事务导入、重新核对来源、事实与事件状态、兼容索引及默认情景 |
| `backend/app/db/seed.py` | `seed` | 成功返回实体计数；失败回滚后另写失败日志 |
| `backend/app/services/evidence.py` | `effective_status`、`mark_conflicts` | 核验状态与冲突规则；核心负责人维护 |
| `backend/app/db/models.py` | `Company/Source/Fact/RiskEvent/DemoScenario/ImportLog` | 对应六张表及稳定主键 |

事实金额 `value_yuan` 使用人民币元，`unit` 为 `CNY`；未知值显式填 `null`。保留 `period`、`scope`、`audited`、`page`、`excerpt`、`reviewed_by_human`、`review_note`。只有实际人工复核后才能填写复核标记。财报中负现金流不是非法值；非法的是非有限数、超出存储精度等不满足校验的金额。

不要直接改 SQLite 里的数值绕过核验。seed 会重算有效状态，不能只把 JSON 的 `verification_status` 改成 `verified` 就声称已核验。新增公告须使用新来源 ID；现有来源 ID 不允许改绑另一个 URL／哈希。seed 采用合并导入，**删掉 JSON 记录不会自动删除库内旧记录**，数据撤回需另行设计审查过的迁移。

### 6.3 旧数据库与来源缓存

数据库路径由 `models.py` 的 `XRAY_DB_PATH` 环境变量控制，默认 `data/xray.sqlite3`。外键在连接时启用；SHA 唯一索引、事件身份唯一索引、查询索引在 seed 中兼容添加。`create_all` 不等于完整迁移工具，未来新增／修改列必须考虑旧库迁移。

碰到旧库重复哈希、重复事件或悬空引用时，保留数据库并按错误中的 ID 排查；不要删库使测试“通过”。`import_logs` 是每次运行的结果记录，日志条数不能当作新增来源数。

浏览器来源缓存由 `App.tsx` 管理，键前缀 `xray-source-v1:`。在线成功时更新，来源请求失败时明确告知显示旧缓存。缓存不包含完整企业启动数据、PDF 或计算服务；停止本地 API 后不能重新推演，也不能保证重新打开页面可完整工作。完全重载前应恢复 API。

当前真实覆盖是 **1 家希荻微、2 份官方 PDF、4 条结构化事实（其中 3 项财务）、1 个控股子公司 Zinitix 事件**。修改 UI 或角色配置不会增加覆盖；该事件不能改写为母公司退市或客户必然延付。

## 7. 修改 API：先找对应入口，再同步契约

所有路由在 `backend/app/api/routes.py`。统一校验错误与 HTTP 错误包装在 `backend/app/main.py`。接口契约在 `docs/openapi.yaml`，当前版本 v1.0.0。

| HTTP 接口 | 路由函数 | 实际数据或服务 |
|---|---|---|
| `GET /api/health` | `health` | 数据库实际计数、资料截止和 LLM 模式 |
| `GET /api/use-cases` | `use_cases` | 直接读取角色 JSON |
| `GET /api/demo-scenario` | `demo_scenario` | 数据库的 `default` 情景 |
| `GET /api/companies?query=...` | `companies` | 已导入公司列表；当前前端未做搜索入口 |
| `GET /api/companies/{company_id}` | `company` | 公司、财务事实和当前固定未知项 |
| `GET /api/companies/{company_id}/risk-events` | `risk_events` | 该企业风险事件 |
| `GET /api/sources/{source_id}` | `source` | 来源元数据及摘录，不返回 PDF 文件 |
| `POST /api/simulations` | `simulations` | `cashflow.simulate` |
| `POST /api/compare-scenarios` | `compare_scenarios` | `cashflow.compare` |
| `GET /api/risk-events/{event_id}/explanation` | `event_explanation` | 可选 LLM／离线解释适配器 |
| `GET /api/sources/{source_id}/candidates` | `source_candidates` | 可选候选抽取；候选不是已核实事实 |

增加字段时先写清名称、类型、人民币元／日期单位、是否可空和使用场景，由核心负责人更新 OpenAPI 与后端，再同步 `frontend/src/api/types.ts`、`client.ts`、组件和测试。当前后端输入模型在 `schemas/api.py`，许多输出直接由路由／服务组装字典，不能只改 Pydantic 就认为所有响应都更新了。

`client.ts` 的 `request()` 负责 `/api` 前缀、15 秒超时、JSON 与结构化 `code/message/details` 错误；`api.demo()` 将可省略输入规范化。前端 `SimulationInputWire` 表示允许省略字段的接口输入，`SimulationInput` 表示可编辑的完整草稿，二者不要混用。

`frontend/src/api/mock.ts` 和 `frontend/src/api/fixtures/baseline.json` 是测试／明确标记的开发夹具，**当前没有运行时 mock 开关**。真实接口失败不会自动切换；不要靠修改夹具来“修复”页面结果。契约变化后，夹具应根据实际 API 响应更新，并保留原始元单位和空值。

## 8. 修改运行环境、端口与可选模型

| 配置入口 | 修改点 | 生效方式 |
|---|---|---|
| `start.ps1` | Windows 安装、seed、uvicorn 主机／端口、启动 Vite | 停止旧进程后重新运行；当前后端没有开启 `--reload` |
| `start.sh` | Unix 启动流程 | Unix 环境使用；修改共同端口时一并检查 |
| `frontend/package.json` | `scripts.dev/build/preview/test`、依赖 | 修改依赖后 `pnpm --dir frontend install` |
| `frontend/vite.config.ts` | `server.proxy['/api']`，当前 `http://127.0.0.1:8000` | 重启 Vite；后端改端口必须同步 |
| `.env.example` | 环境变量名称与示例 | 仅模板；真实值在本机，不提交密钥 |
| `backend/app/db/models.py` | 读取 `XRAY_DB_PATH` | 修改环境变量后重启后端；seed 与服务使用同一路径 |
| `backend/app/services/llm.py` | 模型模式、请求、离线模板、超时与失败回退 | 修改代码或环境后重启后端 |

后端直接读取进程环境，**当前启动代码不会自动加载 `.env`**。仅复制或编辑 `.env` 不会生效，应在启动前设置环境变量。比如从项目根目录运行离线演示：

```powershell
$env:LLM_PROVIDER = 'offline'
pwsh -File .\start.ps1 -SkipInstall
```

可选模型读取 `LLM_PROVIDER`、`LLM_MODEL`、`LLM_BASE_URL`、`LLM_API_KEY`。缺少必要配置时 `effective_mode()` 为离线；模型只辅助解释／候选抽取，不决定企业事实状态、不计算现金、不输出违约概率。当前主页读取事件已有解释，并没有调用可选解释接口替换整页内容。

后端端口、Vite 代理、启动打印提示和使用文档应一起改。普通 `vite preview` 命令不等于完整部署方案；对外部署还需明确 FastAPI 的访问方式及 `/api` 代理。

## 9. 改完如何生效与验证

所有命令从项目根目录执行；首次使用需已安装 Python、Node.js 与 pnpm。Windows PowerShell 5.1 可将 `pwsh` 换成 `powershell`。

| 改动类别 | 必须做的刷新／重启 | 推荐检查 |
|---|---|---|
| 角色 JSON | 保存后刷新页面，无需 seed | 切角色→推演→核对卡→重置，确认默认角色 |
| 默认情景、来源清单、核验 JSON／PDF | 运行 seed 后刷新页面 | 两次导入计数、health、事实与来源、默认计算 |
| React／CSS | Vite 热更新；最终刷新实看 | 前端单测、build、三档屏幕与键盘操作 |
| Python API／服务／模型代码 | 重启后端；有导入／结构变更时运行 seed | 后端测试、实际 API 与页面联调 |
| `.env`／环境变量、端口、代理 | 先将配置放入进程环境，再重启对应服务 | health、浏览器 Network 中 `/api` 是否正确 |

首次安装并启动：

```powershell
pwsh -File .\start.ps1
```

已安装依赖后启动：

```powershell
pwsh -File .\start.ps1 -SkipInstall
```

只重新导入数据（需要已有 `.venv`）：

```powershell
$env:PYTHONPATH = 'backend'
.\.venv\Scripts\python.exe -m app.db.seed
```

后端测试加前端构建，以及单独的前端测试：

```powershell
pwsh -File .\test.ps1
pnpm --dir frontend test
```

只构建前端：

```powershell
pnpm --dir frontend build
```

健康与默认情景检查（服务已启动）：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod http://127.0.0.1:8000/api/demo-scenario | ConvertTo-Json -Depth 6
```

测试定位：`backend/tests/test_demo.py` 覆盖现金、证据与模型候选；`backend/tests/test_import.py` 覆盖幂等、坏输入、损坏 PDF、回滚与多文件；`backend/tests/test_offline_path.py` 覆盖无外网／无模型密钥的核心 API；`frontend/tests/demo.test.tsx` 覆盖旧响应、重置、角色扩展、输入、缓存、失败重试；`frontend/vitest.config.ts` 是前端测试环境。

2026-10-02 功能交付时实际通过后端 18 项、前端 6 项和构建，这是该版本的记录，不保证未来改动仍通过。当前 `test.ps1` **只执行后端 pytest 和前端 build**，必须另跑 `pnpm --dir frontend test` 才包括前端单测。已有浏览器截图在 `frontend/qa/`，它们不能代替修改后的新验收。

30 秒主流程回归：点来源看公告编号／页码／摘录→推演默认情景看 3 万与 17 万缺口→预付 30% 看 33 万且未跌破→打开公式和核对卡。再测延付 60 天的第 160 天回款、角色切换、重置，以及接口失败后的重试。真实浏览器页面为 `http://127.0.0.1:5173/`。

## 10. 常见“改了却没变化”排查

| 现象 | 先检查 |
|---|---|
| 改角色配置后标题仍旧 | JSON 是否合法；刷新整页；`default_use_case_id` 是否存在；不要只点重置 |
| 改默认订单后数值仍旧 | 是否运行 seed；seed 与后端的 `XRAY_DB_PATH` 是否一致；页面是否重新加载 |
| 改 CSS 没效果 | 是否被文件后部或当前 `@media` 覆盖；是否其实是 ECharts 内部配置颜色 |
| 新核对字段出现“尚未配置展示规则” | 拼写是否在 `cardField` 字典中；新字段是否已有 API 数据与分类 |
| 新企业出现旧的未知项 | `routes.py` 当前固定 `unknowns` 的限制；交核心负责人处理，不能只改前端遮盖 |
| “来源未核验”或导入失败 | 按报错 ID 核对文件哈希、页码、摘录、人工复核、悬空引用与主体；不要手改状态绕过 |
| 删除 JSON 后旧事实仍在 | seed 是合并导入，不是全量删除同步；需要明确的数据撤回／迁移方案 |
| 页面提示本地 API 无法连接 | 后端是否启动、8000 端口和 Vite 代理是否一致；查看 `backend.err.log`（不要提交日志） |
| 详细参数清空后无结果 | 输入未完成时暂停计算是预期行为；填有效值、确认批次比例合计 100% |
| 改 Python 后 API 还是旧结果 | 当前 uvicorn 没有自动重载，需重启该项目后端 |
| `.env` 已填却仍离线 | 环境没有自动载入；确认启动进程继承相应变量，不要把密钥写进源码 |
| API 停止后只有旧来源可看 | 来源缓存只提供明确标记的旧摘录；恢复 API 后重试，不能用 mock 冒充成功 |

## 11. 协作边界与提交前最后检查

| 维护范围 | 文件 |
|---|---|
| 产品／核心负责人 | `docs/openapi.yaml`、`data/source_manifest.json`、`data/verified/`、`data/use_cases.json`、`backend/app/api/`、`backend/app/schemas/`、`backend/app/services/` |
| 数据库／前端负责人 | `backend/app/db/`、`frontend/`、相关新增测试，以及对应交接内容 |
| 本文 | 提供跨模块定位；不改变以上协作归属。默认情景与演示说明改动也应同步给演示负责人 |

修改前先 `git status` 看他人未提交内容，使用功能分支；修改接口先沟通字段和兼容方式。提交前看 `git diff --check` 和文件列表，确认没有 `.env`、密钥、数据库、日志、虚拟环境、`node_modules/` 或 `dist/`。不要直接覆盖 `main`。

本导航仅描述当前实现。以下仍是接口提案，不能写成已实现：逐事实 `id/page/review_note/verification_method`、`Source.local_pdf_url` 与受控 PDF 路由、事件日期语义、`cash_ledger[]`、对比方案实际 `input`、新企业未知项与事实分类配置。字段、单位及兼容方案在 `docs/TEAM_HANDOFF.md` 的“待核心负责人评审的最小接口提案”。

仓库地址：[hongrui-ye/zzz](https://gitee.com/hongrui-ye/zzz)。本次交付分支：[feat/db-frontend](https://gitee.com/hongrui-ye/zzz/tree/feat/db-frontend)。
