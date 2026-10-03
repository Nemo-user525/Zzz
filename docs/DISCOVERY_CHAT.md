# 门店查证与对话

默认页面 `/` 把“找地点 → 核对企业 → 阅读接口返回 → 继续提问”放在同一条路径上。消费者模型调查、历史证据和交易现金流分别在 `/?view=consumer`、`/?view=history`、`/?view=trade`。这些入口共享 FastAPI 服务，但数据来源与结论口径不同。

## 数据流与边界

1. `GET /api/regions`、`GET /api/places` 使用高德 Web 服务查行政区与地点。省、市、区县可选；区县以 `adcode` 限定搜索。街道没有独立 `adcode`，会检查最多 3 页地点候选，并按名称、地址筛选，最多展示 20 条。选中后 `GET /api/place-map` 通过服务端获取静态地图预览，并提供高德 URI 链接打开交互地图；地点仅是门店线索，筛选无结果不能证明当地没有门店。
2. `GET /api/legal-entities` 使用企查查开放平台模糊搜索（886）返回企业候选。用户需自行核对营业执照、合同抬头和收款方。
3. `POST /api/company-report` 对选定企业调用风险扫描（736），展示本次返回的字段、查询时间和供应商列表上限。空列表不证明不存在风险。
4. `POST /api/chat` 接收最多 500 字的问题及本次会话的企业名称。FastAPI 将 Node 服务的 SSE 事件转发给浏览器；`context` 标识本轮企业，`delta` 是回答片段，`done` 结束。浏览器传入企业上下文，服务端不跨访客共享“上家公司”。
5. Node 对话服务优先查询企查查官方 MCP，再调用 OpenAI 兼容模型。缺少凭据或上游失败时可能使用有限的内置兜底资料；回答与报告均需结合原始公示核对，不能据此作投资保证。

`POST /api/investigations` 是独立的公开网页线索预览：返回候选、覆盖情况和失败状态，主体默认未确认。它不替代消费者调查页的模型分析。

## 文件与配置

| 部分 | 位置 |
|---|---|
| 首页与对话界面 | `frontend/src/ProductApp.tsx`、`DiscoveryFlow.tsx`、`ChatSection.tsx` |
| 地点与企业页面请求 | `frontend/src/api/discovery.ts` |
| 地点、开放平台接口 | `backend/app/api/discovery.py`、`backend/app/services/amap.py`、`qcc_openapi.py` |
| 对话代理 | `backend/app/api/chat.py` |
| 对话逻辑与官方 MCP | `chat/server/index.mjs`、`llm.js`、`qcc-mcp.js`、`company-data.js`、`prompt.js` |

根目录 `.env.example` 列出 `AMAP_WEB_SERVICE_KEY`、`QCC_APP_KEY`、`QCC_SECRET_KEY` 和 `CHAT_*` 覆盖项。交付包的演示凭据已按账号所有者授权提交在 `chat/server/.env`；公开仓库访问者可读取和使用，额度由同一账号承担。`start.ps1 -Demo` 启动单端口页面与本机对话进程；开发模式使用 `start.ps1` 或 `start.sh`。`GET /api/chat-health` 可查看对话进程和配置状态，但不返回凭据。

## 已知限制

- 高德地点与企查查企业记录没有自动证实的经营关系。
- 项目已配置企查查智能体 MCP Key，供查证对话和消费者调查使用；同一 Key 可连接官方企业数据和风控 MCP 服务，但风控扫描主要返回风险因子命中数量，不能当作开放平台 736 明细。首页 886/736 路线另需 AppKey 与 SecretKey。
- 2026-10-03 已用所有者授权公开的高德 Web 服务 Key 真实调用行政区和地点关键词接口，均返回成功；新克隆从 `.env.example` 获得共享演示配置，已有 `.env` 需自行补入。企查查 886/736 的独立凭据仍未配置，该路线通过模拟接口测试，真实账号联调仍待完成。
- 企查查 886/736、官方 MCP 是不同接口与额度；一条路线成功不代表另一条可用。
- 内置兜底只含少数主体且有固定资料日期，不等同于实时查询；公司同名、简称和境外主体需要格外核对。
- GitHub 提供代码与公开演示配置，不承载在线服务。公网访问须另行部署并确认上游额度、流式代理与并发能力。
