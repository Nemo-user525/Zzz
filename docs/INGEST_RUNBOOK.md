# 导入、更新与复现

从项目根目录执行。先 `pwsh -File .\start.ps1` 安装依赖并启动原演示；已安装用 `-SkipInstall`。前端 5173，API 8000，服务绑定本机。

## 新克隆恢复研究库

```powershell
pwsh -File .\rebuild-research.ps1
```

Unix 等价：`bash ./rebuild-research.sh`（命令已提供，本轮未在 Unix 上实跑）。它依次恢复元数据、下载缺失原文、提取、逐条校验、生成标签/对照、导出。Windows 本轮实际运行成功。首次需外网取回 235 份 PDF；已有缓存后 hash 相符跳过。仅克隆代码不能凭 manifest 获得离线原文，勿这样宣传。

## 分阶段更新

```powershell
$env:PYTHONPATH='backend'
.\.venv\Scripts\python.exe -m app.data_pipeline doctor
.\.venv\Scripts\python.exe -m app.data_pipeline discover --config configs/universe.json
.\.venv\Scripts\python.exe -m app.data_pipeline fetch --resume --max-documents 300
.\.venv\Scripts\python.exe -m app.data_pipeline extract --resume
.\.venv\Scripts\python.exe -m app.data_pipeline validate
.\.venv\Scripts\python.exe -m app.data_pipeline build-labels
.\.venv\Scripts\python.exe -m app.data_pipeline build-comparisons
.\.venv\Scripts\python.exe -m app.data_pipeline quality-report
.\.venv\Scripts\python.exe -m app.data_pipeline export-demo
```

Unix：`export PYTHONPATH=backend`，将 Python 路径替换为 `.venv/bin/python`。命令返回码 0 成功、1 硬失败、2 部分失败。success/empty/blocked/failed 按查询保存；空搜索不能生成负标签。事务失败不保留一半断言；重校验失败的断言降级。

公司/日期/查询关键词/分页上限在 `configs/universe.json`；`discover/fetch --company 000333` 限制证券索引范围（实体主键仍是独立 ID）。`--max-documents` 是单次下载尝试上限。默认串行 `INGEST_MAX_CONCURRENCY=1`，其他值明确拒绝；间隔 `INGEST_REQUEST_INTERVAL=0.35`，默认上限 `INGEST_MAX_DOCUMENTS=220`。`LLM_PROVIDER=offline` 无密钥；`OCR_PROVIDER=disabled` 时扫描页保留待复核，不伪造识别。环境变量需在 shell 导出，CLI 不自动读取 `.env`。

重复执行全量 discover 本轮 30 查询、0 新公告；重复 fetch 235 次 hash 命中、0 下载、0 失败。运行明细位于忽略的 `data/manifests/runs/` 和 pipeline_runs；可提交的汇总位于 discovery_checks/fetch_failures/quality。新增事实要把逐页核对记录加入 curated，再 validate；联网搜索结果不会自动加为事实。

## 手工原文入口

为已确认主体准备元数据 JSON，字段：`company_id, announcement_id, title, url（HTTPS 原出处）, published_at（YYYY-MM-DD）, institution, usage_note`。不要在这些字段放凭据。

```powershell
$env:PYTHONPATH='backend'; .\.venv\Scripts\python.exe -m app.data_pipeline import-pdf --file C:\你的资料\公告.pdf --metadata C:\你的资料\公告.json
```

该命令不访问给定 URL，只复制有权使用的 PDF，检查类型/体积/hash/主体，重复不增量。状态 candidate、历史可用性 uncertain；需实际核对公开时间及版本后再进入严格回放。本轮通过临时样本测试，不谎称已接通法院/工商 API。

## 故障处理与离线条件

- 原文缺失或 hash 变动：停止授予支持状态；来源接口拒绝损坏文件。新 URL 内容版本保留，不覆盖旧文件。
- 403/验证码/收费：记录受限；换已获授权资料或手工导入，不绕过。
- OCR 待复核：见质量报告两份扫描件；当前不参与断言。
- 不删数据库修迁移；首次扩展前自动备份。其他变更前可用 SQLite backup API 自行保留快照。
- 先完整重建、启动本地服务后，历史回放/原文页/现金推演无需外网与 LLM。线上发现和官方链接需要网络。自动测试阻断外连 socket；未声称物理拔网线验收。

验收：`pwsh -File .\test.ps1`；`pnpm --dir frontend test`。导出 OpenAPI：从 `app.main.app.openapi()` 写入 `docs/openapi-v2.json`，该文件包含兼容 v1 和新增 v2 的实际运行 schema。
