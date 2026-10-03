# WorkBuddy 自动接入企查查

> 当前默认已改为 `QCC_PROVIDER=mcp`，工程直接使用企查查官方 MCP，详见 [当前接入说明](QCC_INTEGRATION.md)。以下是显式 `QCC_PROVIDER=workbuddy` 时的可选实现，要求账号具备第三方应用创建资格。当前个人账号不能创建所需应用，此线路未完成真实联调，勿继续把它作为个人账号的默认设置步骤。

网页确认公司 → 后端调用 WorkBuddy Local Assistant OpenAPI → 已授权的企查查工商连接器 → 回传企业字段 → X-Ray 校验并纳入模型，结合数据库主题参考、公开资料、全部保留的评价材料和收支情景，输出风险及确信度。无需粘贴提示词、手动运行队列或安装项目自定义 MCP。

## 服务端配置

消费者页面不提供应用凭据、OAuth 或 Cookie 配置入口，`?configure=workbuddy` 也不再打开配置表单。默认 `QCC_PROVIDER=mcp` 由后端直接读取 `configs/qcc-mcp.json`，无需 WorkBuddy 应用授权。以下仅用于部署者显式启用可选 WorkBuddy 通道。

1. 在服务端配置下文的应用参数，保持凭据只在后端读取。
2. 打开 [WorkBuddy 开放平台](https://open.workbuddy.cn/)，注册开发者并创建符合业务的第三方应用。申请本地助理读取 `user.localassistant.readable` 和调用 `user.localassistant.invokable` 权限。应用类型的可申请权限以平台界面为准；没有这两项权限时需要平台开通。
3. 在平台登记 `WORKBUDDY_REDIRECT_URI`，例如 `http://127.0.0.1:8086/api/consumer/workbuddy/callback`。平台需接受所登记的地址；注册要求以平台审核为准。
4. 平台生成 Client ID / Secret 后，由部署者存入服务端配置。**应用审核启用后**，通过保留的本机管理接口发起官方授权，并由账号本人完成。消费者无需参与此流程。
5. 打开 WorkBuddy，确保“本地助理”在线，并连接“企查查（工商信息）”。企业连接器的官方地址是 `https://agent.qcc.com/mcp/company/stream`；法律数据连接器是另一个服务。企查查授权、数据范围、额度和 WorkBuddy 使用额度仍由对应账号决定。
6. 在 X-Ray 搜索并确认企业。程序自动查询工商登记，以及当前权限允许的财务、变更、年报，每个工具最多一次。WorkBuddy 若要求确认操作，需要在其界面处理；程序不自动批准工具权限。

应用注册、审核、权限与授权说明：[官方第三方应用文档](https://open.workbuddy.cn/en/docs/third-party-app)。接口协议：[官方 OpenAPI](https://open.workbuddy.cn/en/docs/openapi)。这里实现的是官方本地助理接口，不使用 WorkBuddy 桌面私有令牌或内部 IPC。

## 本机保存与换设备

也可用服务端配置：

```dotenv
QCC_PROVIDER=workbuddy
WORKBUDDY_CLIENT_ID=
WORKBUDDY_CLIENT_SECRET=
WORKBUDDY_REDIRECT_URI=http://127.0.0.1:8086/api/consumer/workbuddy/callback
WORKBUDDY_QCC_TIMEOUT=150
```

本机管理接口保存到 `data/runtime/workbuddy-app.json` 的完整应用配置优先于环境变量和项目 `.env`，避免新 ID 与旧 Secret、回调混用。要恢复环境变量配置，停服务后移除此私有配置文件。OAuth 令牌保存在 `data/runtime/workbuddy-oauth.json`，按平台返回的有效期自动刷新，且绑定 Client ID；更换应用后需重新授权。两份文件、模型权重和运行时均被 Git 忽略。换电脑安装项目依赖和模型，配置应用并重新授权，保持那台机器的 WorkBuddy 本地助理在线。

高级配置 `WORKBUDDY_ACCESS_TOKEN` 仅接受由自己的第三方应用经官方流程获得、包含这两项权限的 OpenAPI 令牌，优先于 OAuth 文件；手工令牌不自动刷新。不要填入桌面软件内部登录令牌。

配置接口只开放给本机直连、同源页面；公网与转发请求不可保存或发起授权。Secret 不进入前端持久存储、模型输入或状态接口。授权采用一次性 state、浏览器 Cookie 绑定和 10 分钟过期；回调日志去掉 code/state 参数。反向代理另需自行配置日志脱敏。

## 自动取数与证据边界

### 小 X 专用企业查询接口

`GET /api/consumer/enterprise-agent/status` 报告后端当前选择的企业服务，`provider` 与 `active_registry_provider` 准确区分 `qcc_mcp` 和 `workbuddy`。默认复用 `configs/qcc-mcp.json`，`configurable` 固定为 `false`。前端只展示查询功能和面向用户的可用性提示，不展示凭据、内部连接说明或授权表单。

`POST /api/consumer/enterprise-agent/query` 接收 `{ "company_name": "已确认的完整企业名称", "identity_confirmed": true }`，按 `QCC_PROVIDER` 选择官方 MCP 或 WorkBuddy，并要求精确匹配完整企业名称。成功时返回本次 `sources` 与 `step`；失败不切换通道，也不生成替代资料。`direct` 暂不支持这个入口，明确返回不可用。语音识别出的品牌或门店关键词先填入查询栏并完成主体确认，再调用此接口。

默认 MCP 通道已使用仓库现有配置完成一次真实工商登记查询，返回主体匹配资料；这不代表 WorkBuddy OpenAPI 已授权。可选 WorkBuddy 通道仍需要独立的官方应用凭据与授权，只有显式设置 `QCC_PROVIDER=workbuddy` 并重启后端后才会使用。以下 WorkBuddy 协议边界仅适用于该可选通道。

- 选择 `QCC_PROVIDER=workbuddy` 后，查询失败不会回退旧 Cookie、浏览器、HAR 或直连 QCC API。旧实现仅在显式 `direct` 时使用，历史研究入口另有独立设置。
- 先确认完整公司名；品牌和门店关键词仍经公开搜索寻找候选。当前不通过 WorkBuddy 模糊匹配工商主体。
- 工商登记必须精确确认当前公司。接受的工具为 `get_company_registration_info`、`get_financial_data`、`get_change_records`、`get_annual_reports`。工具名称和参数实际可用性仍需账号联调确认。
- 后端自动发送取数协议，回复必须对应本次随机请求编号、公司名和采集时间。只读发送消息之后的增量回复，不把其他对话内容加入证据。结果需包含工具名、查询参数、原始 JSON、带时区的时间。纯文字总结、错误响应、其他企业、过期材料和夹带凭据的内容会拒绝。
- 一次回传最多 4 份、合计 800KB；每工具提取前 240 个标量字段并保留最多 12 段，截断有明确标记。之后仍受全局每站点最多 20 条、总计 160 条材料预算约束。财务接口中的利润或营业收入不能当作经营现金收付款。
- 结果是 **WorkBuddy 助理回传的企业字段**。格式、主体与时间校验不等于独立验证工具真实执行，页面保留“未独立在线复验”。真实验收时需核对 WorkBuddy 中的实际工具调用及原始返回。供应商说明链接不是该企业的原始网页；多个分段不等于多个独立网站。
- 回传字段进入 `consumer_agent.collect` 的来源列表，再经模型分批阅读和最终综合，数据库参考保持独立输入。最终仍受引用、主体、时间、评价覆盖和风险证据门槛约束，缺少企业数据不补造事实。

## 状态与取消

`not_configured`：未填应用；`auth_required`：应用或企查查连接器需授权（看详细信息）；`offline`：本地助理离线；`scope_missing`：应用权限不足；`permission_required`：WorkBuddy 等待确认；`quota_exceeded`：企查查额度不足；`rate_limited`：接口限流；`delivery_unknown`：发送结果不明、未重发；`invalid_response`：回传校验不通过；`timeout`：没有及时取得本次结果。

`authorized` 只说明存在可用或可刷新的应用授权配置，不表示企查查查询成功。只有一次查询取得可用记录后，调查日志才显示 `completed`。空数据源分类不显示，失败原因留在调查日志。

每个进程串行调用一个本地助理查询，另一个并发请求会返回 busy；单次 10–300 秒，默认 150 秒，每两秒检查一次回复。发送结果不明时不重发。页面取消会停止项目轮询并丢弃晚到结果；官方文档未提供本地助理取消端点，WorkBuddy 已接收的任务可能继续执行，需到 WorkBuddy 停止。当前演示使用单 worker。

## 验收

隔离测试覆盖官方 HTTP 请求、OAuth、自动刷新、错误与取消、来源转换，以及企业字段和数据库参考进入最终模型输入。测试响应只在测试目录生成，不成为运行时 demo 数据。

真实验收必须在应用审核启用并授权后进行：确认本地助理在线 → 输入真实公司 → 在 WorkBuddy 核对企查查工具实际执行和字段 → 在 X-Ray 检查来源、评价、收支情景、风险和确信度。至本次更新，尚未取得该应用的 Client ID / Secret，**此线路尚未完成真实账号联调或完整 demo 验收**。以 [验收记录](CONSUMER_ACCEPTANCE.md) 为准，不能以配置成功或受控测试代替真实数据成功。
