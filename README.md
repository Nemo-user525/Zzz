# X-Ray｜查门店、看证据、理解消费风险

现场输入任意门店、品牌或公司，真实联网寻找经营主体，确认研究对象后，通过 **LangGraph + 开源 Qwen 推理模型 + 数据库训练的主题参考** 调查预付消费风险。首页先展示风险初判，向下查看全部证据。数据库样本不充当 demo 查询结果，查询失败不会换成虚构材料。

## 当前功能

- 24 个公司检索方向，另有品牌/门店补查：新闻、官网、工商关联、政府公示、法院、退款、服务持续、经营收支、用户口碑、回应、微博、知乎、豆瓣、贴吧、黑猫投诉、点评、哔哩哔哩、抖音、小红书等公开网页索引。
- 360 翻页、Bing RSS 与搜狗公开网页交叉检索；可叠加 Tavily、博查授权搜索 API。按 URL 去重、按网站分散保留，调查最多保留 160 条材料、基础读取最多 16 份正文。条数是预算，不保证搜满，也不代表全网覆盖。
- 模型最多两轮自主补查，分批阅读全部保留的资料，再结合训练主题和本次证据形成低/中/高/暂不评级的初判，并给出低/中/较高确信度及依据。品牌资料归属不明时用于解释不确定性，不冒充所选公司的不利事实。
- 逐条审阅全部收集的评价材料，区分正面、负面、混合、非评价内容与近似转载；审阅覆盖不足不会称完整评估。统计是本次材料数量，不是全平台评论数或满意率。
- 六个月收支情景纳入最终判断。有同期间、可核对的经营现金收付款总额时按历史月均值推演；否则展示“基准月收款=100”的条件压力测试。假设比例、逐月计算、单位与出处全部公开，不虚构企业流水或预测亏损。
- 每项解释与评级依据带来源 ID 和逐字引文；不匹配则不接受。搜索摘要、读取正文和授权接口有不同标记，均不自动升级为已核实事实。
- 首页突出“预付消费决策风险”和确信度，再列企业证据评级。企业材料不足时，决策等级采用公开的“中等风险、先核实再预付”规则并标注低确信度；这不等于公司发生不良经营事件。只显示有材料的指标和来源分类，真实失败状态仍保留。
- 异步调查进度、取消、过期清理和旧响应隔离。原历史库和交易现金流功能保留。

## 快速启动（Windows）

需要 Python 3.12+、Node.js、pnpm。首次安装依赖和模型需要网络。

```powershell
Copy-Item .env.example .env  # 仅在没有 .env 时执行，已有配置不要覆盖
pwsh -File .\start.ps1
```

开发页面：`http://127.0.0.1:5173/`；API：`http://127.0.0.1:8000/docs`。脚本创建虚拟环境、安装依赖、导入数据、训练主题参考并读取 `.env`。已经安装依赖时可 `start.ps1 -SkipInstall`。Linux/macOS 使用 `bash ./start.sh`，本地推理运行时按 [Ollama 官方说明](https://ollama.com/download)安装。

### 免费本地模型（默认实施路线）

```powershell
pwsh -File .\setup-local-model.ps1
```

脚本在项目目录安装便携 Ollama、拉取 `qwen3.5:9b`（约 6.6GB）、启动只监听本机的模型服务，并保留其他 `.env` 配置。模型与运行时不提交 Git。8GB 显存 + 16GB 内存机器需实际检查延迟；上下文限定 16K，本地每批 6 条材料，云端每批 12 条。规划与逐字提取采用直接结构化输出，最终风险综合开启 `think=true`；每次最多生成 8192 token、超时 420 秒。首次加载比后续调用慢。本地接口不是云端 API，不需要模型密钥。

若 Ollama 原生下载出现 TLS 超时，Windows 可运行 `pwsh -File .\fetch-local-model.ps1`，使用系统网络客户端从同一官方仓库分段续传，并逐层验证官方 SHA256。然后重新运行设置脚本。已有其他 Ollama 服务时，需确保其模型目录与 `data/models/ollama` 一致。

### 免费云端切换（可选）

2026-10-02 已通过 OpenRouter 模型目录核实 `qwen/qwen3.8-27b:free` 的输入/输出价格均为零，并支持推理。注册账号后只在服务端 `.env` 填写：

```dotenv
CONSUMER_MODEL_PROVIDER=auto
OPENROUTER_API_KEY=你的合法密钥
CONSUMER_CLOUD_MODEL=qwen/qwen3.8-27b:free
```

重启后端生效。`auto` 有该密钥时使用免费云端，没有时使用本地 Ollama。每次云端调用先核验目录中的零价格；免费模型下线、限流、无额度时不会切到付费模型。需要改用本地时设置 `CONSUMER_MODEL_PROVIDER=ollama`。免费额度与可用性见 [官方限制说明](https://openrouter.ai/docs/api-reference/limits)。本项目未取得云端账号密钥，因此免费云端调用不能算已验收。

模型家族来自 [Qwen 官方 GitHub](https://github.com/QwenLM/Qwen3.8)。本地 9B 是针对当前硬件、中文理解与推理能力的适配选择，不宣称它是所有任务上的最强模型。LangGraph 是流程框架，Qwen 才是实际推理模型。

### 搜索与企查查

公开网页检索无需密钥。设置 `TAVILY_API_KEY`、`BOCHA_API_KEY` 后可同时使用授权搜索服务；这些服务的额度和费用由各自账号决定。

**企查查默认通过 WorkBuddy 自动查询**（`QCC_PROVIDER=workbuddy`）。本机网页点击 **配置 WorkBuddy**：打开官方开放平台创建应用、登记页面给出的 OAuth 回调地址，并申请 `user.localassistant.readable` 和 `user.localassistant.invokable` 两项权限。将 Client ID / Secret 填入配置页保存，应用审核启用后点击“授权连接 WorkBuddy”。这是平台要求的应用授权；WorkBuddy 内已连接企查查不能替代这一步。详见 [配置与验收说明](docs/WORKBUDDY_QCC.md)。

保持 WorkBuddy 本地助理在线，并在其中授权“企查查（工商信息）”连接器。以后在网页确认公司，后端自动发送查询、读取本次回复，校验公司名和采集时间后，把工商、财务、变更、年报字段与公开检索、用户评价及数据库参考一起交给模型。无需手工启动桥接任务或复制提示词。默认等待 150 秒，可设置 `WORKBUDDY_QCC_TIMEOUT`（10–300 秒）；权限不足、离线、限流或超时会保留真实状态。

配置页将应用凭据与 OAuth 令牌分别保存到忽略的 `data/runtime/workbuddy-app.json`、`workbuddy-oauth.json`，也支持服务端环境变量配置。网页保存的完整应用配置优先于环境变量；不读取 WorkBuddy 桌面端的内部登录令牌。换电脑需配置应用并重新授权。返回材料标注“WorkBuddy 回传、未独立在线复验”：消息回传本身不能证明企查查工具确实执行，本机尚待应用审核授权后的真实联调，不能把测试响应称为真实工商数据。

旧 API 736、直连 MCP、Cookie 和 HAR 适配器仅在明确设置 `QCC_PROVIDER=direct` 后启用，见 [旧路线说明](docs/QCC_INTEGRATION.md)。历史研究入口的 API 736 设置独立保留。

小红书及其他社区目前使用公开搜索索引，并非官方平台全量 API；登录内容、删除内容和未收录页面不在覆盖范围。企查查不使用破解密钥或绕过鉴权。

## 数据库与评级边界

历史公告库用于训练主题路由，再通过复核准则指导补查。本机现有 **5 条原文支持的训练样本、0 条具名人工复核**，未做消费风险预测的独立验证。主题匹配不是风险概率，也不是当前门店事实。新克隆可按 [数据重建说明](docs/INGEST_RUNBOOK.md)恢复原始研究库；缺少样本时继续真实搜索并注明参考不足。

风险初判需要模型与当前证据共同支持。单一网站的摘要不能定为高风险；较低风险须有多网站、多渠道的具体正向资料和正文/接口支持，不能由“没有负面搜索结果”推出。用户规模宣传或单次诉讼胜诉不能推出经营稳定和未来履约能力；未通过直接引文校验的理由会被删除。企业证据不足时，摘要同步说明无法确定企业当前风险高低，仍提供有依据的预付决策等级。用户确认公司不等于证明具体门店归属。金额只展示本次拟消费投入，不改变企业评级。系统不输出跑路概率或安全保证。

确信度表示证据对当前判断的支持程度，不是经过统计校准的正确率。它由模型给出建议，再按来源独立性、正文支持、时间、评价覆盖和实际收支基线限制上限。收支压力测试只检验条件，不能凭假设的亏损提高公司风险。详见 [评价、收支与确信度方法](docs/CONSUMER_RISK_METHOD.md)。

## 检查与真实验收

```powershell
pwsh -File .\test.ps1
$env:PYTHONPATH='backend'
.\.venv\Scripts\python.exe -m app.consumer_smoke --query 乐刻
# 核对候选后再指定研究主体，--require-model 要求实际模型评估完成
.\.venv\Scripts\python.exe -m app.consumer_smoke --query 乐刻 --company 杭州乐刻网络技术有限公司 --require-model
```

自动测试只在测试文件中使用受控响应，不能替代实际联网验收。严格验收在模型失败、引文不合格或未完成风险评估时非零退出。响应保存在忽略的 `data/raw/`，不进入训练库。最终推理输出若截断或不符合结构，会用同一批证据再请求一次简洁结构化评级；仍失败时明确标注，保留已经完成的评价审阅与收支情景，不假装模型已成功。

构建并提供与当前浏览器相同的单端口页面：

```powershell
cd frontend
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
cd ..
$env:PYTHONPATH='backend'
.\.venv\Scripts\python.exe -m uvicorn app.public_demo:app --env-file .env --host 127.0.0.1 --port 8086
```

## 入口与维护文档

| 入口/文件 | 用途 |
|---|---|
| `/` | 真实消费者调查 |
| `/?view=history` | 企业检索、公告、财报与历史回放 |
| `/?view=trade` | 保留的交易现金流情景演示，订单输入明确为虚构情景 |
| [消费者智能体实现](docs/CONSUMER_AGENT.md) | 模型、预算、评级、异步接口 |
| [评价、收支与确信度方法](docs/CONSUMER_RISK_METHOD.md) | 全部评价覆盖、真实现金基线、情景公式与评级边界 |
| [企查查授权接入](docs/QCC_INTEGRATION.md) | API / MCP 配置与边界 |
| [WorkBuddy 自动接入](docs/WORKBUDDY_QCC.md) | 配置入口、应用授权、自动查询与真实验收 |
| [本轮验收](docs/CONSUMER_ACCEPTANCE.md) | 实测结果、未完成的账号联调 |
| [数据说明](docs/DATASET_CARD.md) | 历史研究样本与质量局限 |
| [当前 OpenAPI](docs/openapi-consumer.json) | 从运行时代码导出的契约 |
| [旧版说明存档](docs/LEGACY_README.md) | 早期交易演示与历史研究说明，非当前主页状态 |
