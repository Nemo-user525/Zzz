# X-Ray｜这一单，扛得住吗？

给下游客户发货并提供账期的中小制造企业，在签约前核对客户公开风险，随后测试这笔订单对本方现金底线的影响。原始单企业交易演示保持可用；本轮新增 **20 家研究主体、235 份官方文档、22 条原文支持断言** 的历史资料库。历史证据、后续结果与虚构订单分开，不输出付款预测或违约概率。


## 历史数据库增量（2026-10-02）

启动后点击“企业检索与历史回放”：可以输入企业名称联网查公告候选、查本地原文、按历史日期回放、展开后续结果、查看对照排除原因，再进入现有现金推演。未覆盖企业会说明缺口，不生成假档案。

新克隆第一次恢复研究样本：`pwsh -File .\rebuild-research.ps1`（先安装项目依赖；首次下载需要外网）。已有原文缓存后可离线运行。GitHub 不包含新增公告全文或本机数据库。

当前：233 份可解析文档、22 条支持断言、11 个事件、5 家企业的 6 条结果、0 具名人工复核、0 合格对照。200 条支持断言目标尚未达到；候选公司不等于无风险负样本。

- [运行与重建](docs/INGEST_RUNBOOK.md)
- [实际数据与边界](docs/DATASET_CARD.md)
- [本轮审计和修复](docs/AUDIT_AND_FIXES.md)
- [测试及质量报告](docs/DATA_QUALITY_REPORT.md)
- [一站式修改导航](docs/MODIFICATION_GUIDE.md)
- [实际运行 OpenAPI（兼容 v1 与新增 v2）](docs/openapi-v2.json)

## 运行

需要 Python 3.12、Node.js 20+、pnpm 11+。首次安装需要网络；安装完成并缓存了两份官方 PDF 后，演示运行不依赖网络。默认 `LLM_PROVIDER=offline`，无需 API 密钥。

Windows PowerShell，从项目根目录运行：

```powershell
pwsh -File .\start.ps1
```

再次启动可跳过安装：

```powershell
pwsh -File .\start.ps1 -SkipInstall
```

若使用 Windows PowerShell 5.1，改用 `powershell -File .\start.ps1`。Unix：

```bash
bash ./start.sh
```

浏览器打开 `http://127.0.0.1:5173/`。后端位于 `http://127.0.0.1:8000`，健康检查 `http://127.0.0.1:8000/api/health`。启动脚本会自动建 SQLite、幂等导入、启动后端和 Vite；Ctrl+C 退出。第一次由 pnpm 安装依赖时可能要求批准官方 `esbuild` 的构建脚本，仓库的 `frontend/pnpm-workspace.yaml` 已列入允许项。

测试：

```powershell
pwsh -File .\test.ps1
```

```bash
bash ./test.sh
```

手动 API 请求：

```powershell
$body = Get-Content .\data\demo_scenarios.json -Raw
Invoke-RestMethod http://127.0.0.1:8000/api/simulations -Method Post -ContentType 'application/json' -Body $body
```

### 配置

复制 `.env.example` 为 `.env` 可记录配置，启动前将变量载入环境。后端直接读取环境变量：`XRAY_DB_PATH`、`LLM_PROVIDER`（`offline|openai|openai_compatible`）、`LLM_MODEL`、`LLM_BASE_URL`、`LLM_API_KEY`。在线解释只有明确配置且服务正常时调用；失败退回离线模板。模型不计算金额、不更改已核验状态。`GET /api/risk-events/{event_id}/explanation` 可单独验证适配器；主页始终读取已核验事实与确定性现金引擎。

用户角色、决策目标及输出模板在 `data/use_cases.json`，经 `GET /api/use-cases` 读取。新增同类靶向用户只需追加配置或切换默认 ID；不改企业、事实、来源、事件表，也不改通用证据校验服务。已有两个可切换的角色配置作为示例。若新目标需要不同计算方法，可独立增加算法服务。

## 已核验真实范围

- 企业：希荻微电子集团股份有限公司，688173，集成电路设计。
- 官方来源：2 份，分别为 [2026 半年度报告摘要](https://static.cninfo.com.cn/finalpage/2026-08-29/1225532542.PDF) 与 [2026-089 控股子公司风险提示公告](https://static.cninfo.com.cn/finalpage/2026-09-03/1225545002.PDF)。
- 结构化事实 4 条，其中 3 项财务指标；风险事件 1 个，主体明确为控股子公司 Zinitix。财务期末 2026-06-30；风险公告日 2026-09-03；数据核验范围截至后者。详见 `docs/DATA_PROVENANCE.md`。
- 供应商与该客户的历史付款资料、后续事件状态和统一社会信用代码没有核实。页面显示未知，不把未检索到记录说成无风险。

### 订单情景与计算

以下数字来自 `data/demo_scenarios.json`，均为**虚构交易输入**：100 万元订单，毛利率 18%，直接成本 82 万元于第 10 天支出；本方期初现金 300 万元，第 75 天其他业务预计净流出 215 万元，安全底线 20 万元。发货第 10 天，账期 90 天，延付压力情景 30 天，所以余款第 130 天才到；图表只展示第 0–90 天，并明确提示视窗外回款。

0% 预付款：`300 - 82 - 215 = 3 万元`，第 75 天低于底线 17 万元。30% 预付款：`300 + 30 - 82 - 215 = 33 万元`，未跌破底线。引擎使用 Decimal，以分为边界做确定性运算。用户可以改预付款、账期、延付、订单额、直接成本、期初现金、底线、其他现金流日期与金额、分批发货比例；改变发货批次会调整对应成本与回款日期。

## 交付与商业假设

可交互页面、FastAPI、SQLite 幂等导入、OpenAPI、离线 PDF、可追溯来源抽屉、核对卡、计算说明、模型离线回退均已实现。后端 API 金额单位为元；页面换算为万元。当前只有一个行业中的一家公司，尚不能做同业可信度对比。

潜在付费方式：按次交易核对报告、企业订阅。**这只是待验证假设**，尚未做定价或付费意愿验证。目标用户访谈可问：

1. 上次给新客户账期时，你实际查了哪些公开资料？
2. 预付款和账期通常由谁决定？现金底线是多少、如何设定？
3. 若报告能提供可追溯证据和条款情景，你愿意在哪个决策环节使用？

反馈记录模板：`访谈日期 / 角色 / 公司规模 / 最近一笔账期决策 / 现用工具 / 最关键未知项 / 对演示的质疑 / 下次验证动作`。

## 文档

- [修改导航：想改什么、改哪个文件和字段](docs/MODIFICATION_GUIDE.md)：角色、UI、情景、数据、算法、接口、启动与验证的一站式维护指南。
- `docs/openapi.yaml`：接口契约。
- `docs/DATA_PROVENANCE.md`：来源、哈希、事实定位与局限。
- `docs/DEMO_SCRIPT.md`：30 秒与 3 分钟话术、备份操作。
- `docs/TEAM_HANDOFF.md`：两人文件边界及配置扩展。
- `docs/REFERENCES.md`：论文和代码阅读范围。

截图：运行演示后可用浏览器截图；本轮 1920×1080 操作验收图见 `docs/demo_1920x1080.png`。
