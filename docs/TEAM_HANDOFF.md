# 两人联调交接

交给队友 Codex 的完整执行提示词见 [`TEAMMATE_CODEX_PROMPT.md`](TEAMMATE_CODEX_PROMPT.md)，以当前基线和文件所有权为准。

推荐分支：`feat/data-engine`（产品/核心技术）与 `feat/db-frontend`（数据库/网页）。本轮完整基线已落地，分支是后续协作建议。

| 负责人 | 文件所有权 |
|---|---|
| 产品/核心技术 | `docs/openapi.yaml`、`data/source_manifest.json`、`data/verified/`、`data/use_cases.json`、`backend/app/api/`、`backend/app/schemas/`、`backend/app/services/` |
| 数据库/网页 | `backend/app/db/`、`frontend/src/`、`frontend/src/api/` |

接口冻结点：`docs/openapi.yaml` v1.0.0；前端类型在 `frontend/src/api/types.ts`，离线 mock 在 `frontend/src/api/mock.ts`。新增字段先改 OpenAPI，再同步 Pydantic/TypeScript。页面不硬编码企业事实；数据库不保存用户角色文案。

配置扩展：在 `data/use_cases.json` 追加对象并设 `default_use_case_id`，可改 `target_user`、`decision_goal`、标题、主按钮和 `output_template.sections[].fields`。目前支持的字段键见 `frontend/src/App.tsx` 的 `cardField`。只要使用现有字段，增加财务负责人等新靶向用户不改 `companies/sources/facts/risk_events` 或 `backend/app/services/evidence.py`。若新目标需要新的决策算法，可新增独立服务和 API，不修改证据模型。`GET /api/use-cases` 实时读取配置；页面右上方的场景选择可验证。

PowerShell 联调：从根目录运行 `.\start.ps1 -SkipInstall`；后端 `http://127.0.0.1:8000`，前端 `http://127.0.0.1:5173`，Vite 代理 `/api`。示例：`Invoke-RestMethod http://127.0.0.1:8000/api/health`；`Invoke-RestMethod http://127.0.0.1:8000/api/demo-scenario | ConvertTo-Json -Depth 6`。用该情景 JSON 向 `POST /api/simulations` 请求，0% 预付款最低 30,000 元，30% 最低 330,000 元。

共同验收：两次运行 `python -m app.db.seed`，检查计数不变；执行 `test.ps1`；页面点击公告来源、推演、调到 30%、打开算法和核对卡；检查实际公司覆盖数字与资料日期。

## 数据库／前端第二负责人交付（2026-10-02，第一步范围）

工作目录为独立克隆 `x-ray`，从 `origin/main` 的 `8269a8e` 创建 `feat/db-frontend`。未覆盖原工作目录 `credit-lens`，未修改产品／核心负责人持有的 OpenAPI、来源清单、核验数据、角色配置、API、schemas 或 services。接口仍为 **v1.0.0**。本次没有执行第二阶段的核心服务改写。

### 已落地的改动

- `backend/app/db/validation.py`：导入前扫描 `data/verified/*.json`，定位重复 ID、URL／大小写不敏感 SHA、缺字段、引用页、报告期、CNY 单位、非法金额、金额与摘录不一致、悬空引用和事件主体不一致。核验数据仍由核心负责人维护。没有新增真实企业或事实。
- `seed.py`：事务导入；源文件重新检查哈希和页内数字；事实须具备人工复核标记；事件须有同企业、同主体的已核实支持事实。故障源及其依赖一起降级。处理现有数据库中的保留事实与来源，避免只检查新输入。相同事件键不会因另一个 ID 重复计数。失败回滚实体修改，另写失败日志；成功日志记录当前实体总数及输入文件数，日志条数不是新增来源数。
- `models.py`：开启 SQLite 外键。seed 在原数据库上加 SHA 唯一索引、事件键唯一索引和公司查询索引。遇到旧库重复哈希／重复事件／悬空外键时拒绝继续并报错，**不删除数据库、不自动合并旧记录**；需保留备份并由负责人明确归并身份后重跑 seed。没有破坏性迁移或重建表。
- `frontend/src/App.tsx`、`ScenarioEditor.tsx`：真实 API 驱动身份、全部财务口径、事件主体与状态、未知项、动态角色和卡片章节。金额仅做元／万元显示转换，余额与对比从后端取得。全部现金流与发货批次可编辑；批次日期、成本日期和回款日期随输入更新。日程日期按当前引擎已读规则展示，逐笔金额不自行计算。
- `useSimulation.ts`：150ms 防抖；结果与确切输入／重试批次绑定；计算期间隐藏旧数字、曲线和对比，过期响应及重置后的响应不再显示；失败没有 mock 回退。
- `NumberInput.tsx`：保留未完成输入，空值、负数限制、整数日期、小数金额与零底线按字段处理；无效输入暂停计算。万元输入最细为 0.000001 万元（0.01 元）。
- `Drawer.tsx`：Escape、焦点圈定、关闭后焦点返回；核对卡跳来源可返回卡片，切换详情回到顶部。来源显示来源 ID、默认引用页、公告编号、日期、哈希、来源摘录以及所选财务事实的摘录。预取／缓存来源元数据；接口不可用时明确标记缓存且可重试。
- `client.ts`、`types.ts`、`mock.ts`：结构化错误保留 code/message/details；15 秒超时；规范化契约允许省略的输入默认字段。mock 是从本地 API 捕获的测试夹具，无运行时 mock 模式，主页绝不自动切换。
- `style.css`：1920 大屏与 1366 笔记本均保留关键结果和主操作；结果移到曲线上方，未计算时没有假曲线；390 窄屏有底部快速导航。图表有文字替代、底线与最低点，关闭绘制动画避免短暂只显示部分曲线。ECharts 改为按需引入（本次构建 JS 约 778 kB，gzip 约 256 kB，仍有大包提示）。

### 启动、导入与实际验证

从项目根目录执行（已安装依赖）：

```powershell
pwsh -File .\start.ps1 -SkipInstall
```

导入／兼容索引迁移一行命令：

```powershell
$env:PYTHONPATH = 'backend'; .\.venv\Scripts\python.exe -m app.db.seed
```

本机实际连续执行两次 seed，每次均为：

```text
companies=1, sources=2, facts=4, risk_events=1, verified_sources=2
```

`GET /api/health` 实测为 `status=ok`、`database_ready=true`、`verified_company_count=1`、`verified_source_count=2`、`as_of=2026-09-03`、`llm_mode=offline`。企业接口 3 项财务观察，事件接口 1 项 Zinitix 事件，两份来源 accessible=true。第 4 条事实是事件支持事实，不能把它再次算成第 4 项财务指标。

实际执行的检查命令：

```powershell
pwsh -File .\test.ps1
pnpm --dir frontend test
```

最终结果：**后端 18 passed；前端 6 passed；TypeScript 与 Vite build 成功**。首次新克隆因缺 `.venv` 无法测试；补装依赖后通过。沙箱阻止过 esbuild 子进程，使用正常进程权限后完成构建。保留一项 Starlette/httpx 弃用提示和一项 Vite 大包提示，不影响本次演示；没有将它们描述成零告警。

后端新增测试使用临时数据库／临时核验文件，覆盖重复 seed、兼容索引、损坏 PDF 降级、重复／悬空／金额错配／主体错配、事务中途失败回滚、未人工复核支持事实、多文件导入、同事件不同 ID 去重。网络测试禁用外连 socket 且删除 LLM 密钥后，seed、证据查询、两种预付款计算、四方案对比仍通过。没有物理拔网线或声称官方站点离线可访问。

前端测试覆盖反序晚到响应、重置中的响应、第三种角色配置、空值／负值／小数／零底线、缓存来源及本条摘录、失败后显式重试。第三角色只存在测试夹具中，使用现有字段并附一个未知字段；标题、主按钮、章节随配置变化，未知字段显示安全提示，企业证据只加载一次；重置恢复配置指定的默认角色。真实 `data/use_cases.json` 未改。

### 真实浏览器验收记录

使用 Codex 内置 Chromium 浏览器和本地 `http://127.0.0.1:5173/`，API 为 `127.0.0.1:8000`，不是静态页面截图。已操作：

1. 首页默认企业；打开风险来源，看到 2026-089、第 1 页、短摘录、SHA；财务来源为报告摘要默认第 3 页，显示本条财务摘录；查看未知项。
2. 推演默认情景：90 天内最低 **30,000 元／第 75 天**，缺口 **170,000 元**，余款第 **130** 天。
3. 连续键盘操作预付款滑块到 30%，及快捷“设为 30%”：最低 **330,000 元**、缺口 **0**、未跌破；计算期间旧结果消失。延付 60 天后余款日为 **160**。
4. 切换制造企业财务负责人，打开算法说明及“账期谈判核对卡”，核对章节、事实／假设／结果标签，来源往返和 Escape 关闭。
5. 修改第一批发货日为 20、第二批 45，各 50%，其他现金流日为 70：页面显示成本日 20／45、回款日 140／165、最低现金第 70 天；结果来自 API。新增批次 0% 待填时暂停计算，补齐后恢复。最后重置为仓库原始情景。
6. **真实停止本次 API 子进程**：来源抽屉显示缓存告知及已缓存摘录；重新计算报错，曲线和核对卡禁用。用 `LLM_PROVIDER=offline`、空 `LLM_API_KEY` 恢复 API 后点击重试成功，重置也成功。前端源码与资源仍由本地 Vite 供应；未宣称关闭全部本地服务后仍可重新计算。
7. 1920×1080、1366×768 实测；390×844 窄屏检查。未见横向溢出。笔记本完整证据列表和方案详情需要纵向滚动，关键计算结果、滑块和核对入口保持易找。

截图（本次新增，区别于基线旧截图）：

- `frontend/qa/desktop-0pct-1920x1080.jpg`
- `frontend/qa/desktop-30pct-1920x1080.jpg`
- `frontend/qa/laptop-1366x768.jpg`
- `frontend/qa/source-api-unavailable.jpg`
- `frontend/qa/mobile-390x844.jpg`
- `frontend/qa/financial-source.jpg`

30 秒建议四步：**点公告来源 → 推演看 3 万／17 万缺口 → 设预付 30% 看 33 万／未跌破 → 打开算法或核对卡**。默认订单与本方现金全部是虚构输入；Zinitix 事件不推出母公司退市、延付概率或确定损失。

### 待核心负责人评审的最小接口提案（未越权修改）

| 缺口 | 建议增量字段与单位 | 兼容／使用场景 |
|---|---|---|
| 财务观察没有事实 ID、逐事实页码与人工复核说明 | `FinancialObservation.id:string`、`page:integer`（1 起）、`review_note:string`、`verification_method:string` | v1 响应加可选字段；缺失时本页只标“来源默认引用页”，不猜逐事实页码。当前三项财务事实实际同在第 3 页。 |
| 来源没有本地 PDF 读取能力 | `Source.local_pdf_url:string|null`，对应受控 `GET /api/sources/{id}/pdf`；服务端先按清单核对文件哈希，再返回 PDF | 保留官方 URL；不让浏览器自行猜文件路径。当前离线可看元数据与摘录，PDF 可从仓库 `data/source_docs/` 手动打开，页面没有下载接口。 |
| 日期语义、状态更新日不完整 | `RiskEvent.event_date_kind: occurred/disclosed/effective`、`disclosed_at:date|null`、`status_as_of:date|null` | 新字段可选；前端现在使用中性的“事件日期”，来源抽屉另列披露日期，不伪造状态更新日。 |
| 缺少逐笔成本／回款解释，以及比较方案实际输入 | `SimulationResult.cash_ledger[]:{day:int,kind:string,amount_yuan:number,label:string,shipment_index:int|null,in_view:boolean}`；`Comparison.variants[].input:SimulationInput` | 金额全部人民币元，由 Decimal 引擎产出。前端目前只展示输入日期、响应公式／曲线与最低值；没有复制现金算法。应返回 90 天外现金项。满额预付／零比例批次应只按**非零**回款定义最终回款日；当前 UI 对全额预付明确显示“无余款”。 |
| 新企业的未知项目前由核心 API 固定文案返回，报告事实分类也依赖一个字段名 | 企业核验配置增加 `unknowns` 与明确事实种类，再由 API 原样返回；Source 可增加 issuer/company_ids 供主体归属校验 | 当前前端逐项消费 API，不写死这些未知项。新增企业时核心负责人须同步维护真实缺口与来源主体，不能照搬希荻微情况。 |

真实覆盖未变：**1 家希荻微／2 份官方 PDF／4 条结构化事实／1 个 Zinitix 事件**。来源中文识别仍依赖既有人工复核；自动步骤只检查哈希、页码及数字，不声称自动核实整段中文。没有同业覆盖、用户访谈、付费验证、违约预测或收益保证。图表与核对卡不依赖在线 LLM。

### 推送状态与离线交接（2026-10-02 更新）

实现提交：`202640f157a2926d2fac5bf72daae3368d0ac101`，分支 `feat/db-frontend`。初次 HTTPS／现有 SSH 身份 `lainey-delacriox` 推送均被 Gitee 拒绝。用户随后授权切换到 HongRui Ye；使用仓库路径对应的 `hongrui-ye` 用户名，经本机 Git Credential Manager 完成认证后，**已成功推送至 `https://gitee.com/hongrui-ye/zzz` 的 `feat/db-frontend` 分支**，并设置远端跟踪。没有修改远端 main，没有创建新密钥，也没有将代码推到其他仓库。凭据不进入项目文件或聊天记录；该仓库按 URL 路径区分凭据，避免影响其他仓库的账号。

当前分支另提供完整 Git bundle（仓库外的 `../xray-db-frontend.bundle`），只包含 Git 已提交内容，不包含 `.env`、运行数据库、日志、虚拟环境或构建产物。负责人可在已有仓库中执行：

```powershell
git fetch 'D:\weyang\学军黑客松\xray-db-frontend.bundle' feat/db-frontend
git switch -c review/db-frontend FETCH_HEAD
```

最后补验：100% 预付的 API 最低现金为 103 万元，页面明确“全额预付，无余款”；新开浏览器页面重新完成 0%→30% 流程，控制台错误列表为空。测试没有进行真实用户访谈或计时实验，30 秒为演示设计目标。
