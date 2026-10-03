# 工程修改导航

本文件按当前 `main` 的四个页面入口定位实现。功能与运行方式先看根目录 [README](../README.md)，数据来源和边界按对应专题文档核对。修改接口时同步类型、前端调用与测试。

| 功能 | 主要文件 | 关联说明 |
|---|---|---|
| 默认门店查证首页 | `frontend/src/ProductApp.tsx`、`DiscoveryFlow.tsx`、`api/discovery.ts` | [门店查证与对话](DISCOVERY_CHAT.md) |
| 高德地点与企查查 886/736 | `backend/app/api/discovery.py`、`services/amap.py`、`services/qcc_openapi.py` | 地点和企业关系仍需人工核对 |
| 对话页面与 SSE | `frontend/src/ChatSection.tsx`、`backend/app/api/chat.py`、`chat/server/` | 企业上下文随每次请求传入 |
| 消费者调查、来源与评级 | `frontend/src/ConsumerWorkspace.tsx`、`backend/app/api/consumer.py`、`services/consumer_*.py` | [智能体实现](CONSUMER_AGENT.md)、[评级方法](CONSUMER_RISK_METHOD.md) |
| 消费者搜索与主体确认 | `frontend/src/CompanySearch.tsx`、`backend/app/services/consumer_search.py` | 搜索线索不自动成为已核实事实 |
| 历史证据与时点回放 | `frontend/src/HistoryWorkspace.tsx`、`backend/app/api/history.py`、`services/history.py` | [数据集](DATASET_CARD.md)、[时点政策](POINT_IN_TIME_POLICY.md) |
| 证据采集与校验 | `backend/app/data_pipeline.py`、`services/acquisition.py`、`db/history.py` | [重建说明](INGEST_RUNBOOK.md)、[来源政策](SOURCE_POLICY.md) |
| 交易现金流与方案对比 | `frontend/src/App.tsx`、`ScenarioEditor.tsx`、`backend/app/services/cashflow.py` | 用户订单输入为虚构情景 |
| 官方企查查 MCP 消费者线路 | `backend/app/services/consumer_qcc_mcp.py`、`configs/qcc-mcp.json` | [企查查接入](QCC_INTEGRATION.md) |
| 免费云端与本地模型 | `backend/app/services/consumer_model.py`、`configs/openrouter.json`、`setup-local-model.ps1` | 模型可用性取决于服务和额度 |
| 页面入口与静态托管 | `frontend/src/main.tsx`、`backend/app/public_demo.py`、`start.ps1` | `/`、`?view=consumer`、`?view=history`、`?view=trade` |

## 修改后核对

1. 运行 `pwsh -File .\test.ps1`，再运行 `pnpm --dir frontend test`。前者覆盖后端测试和前端构建，后者覆盖组件测试。
2. 用 `pwsh -File .\start.ps1 -Demo` 打开 `http://127.0.0.1:8086/`，检查四个入口。对话状态可读 `/api/chat-health`。
3. 涉及公司事实、历史日期或现金金额时，核对来源 ID、原文页、单位和计算规则；历史样本不自动代表本次查询结果。
4. 更新 README 与功能专题文档，不把旧测试数量、临时隧道地址或仍待验证的结果写成当前保证。

共享演示凭据已经按账号所有者授权公开在仓库；更改配置时明确区分默认演示配置、本机覆盖和前端可见信息。不要把登录凭据写入前端打包文件。
