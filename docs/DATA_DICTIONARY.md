# 数据字典

旧表 `companies/sources/facts/risk_events/demo_scenarios/import_logs` 主键及用途保留。新表由 `backend/app/db/history.py` 加法迁移；首次迁移旧 SQLite 前使用 SQLite backup API 备份至 `data/backups/`。不删除用户数据库；同机多连接下也使用数据库备份接口。

| 表 | 主键/关系 | 含义与关键字段 |
|---|---|---|
| research_entities | 稳定 id；org_id 唯一；ticker 为索引属性 | 法定名或目录简称、研究行业分类、cohort、纳入原因、缺口；简称不是主键 |
| document_versions | announcement_id + SHA 唯一；company_id FK；supersedes_id FK | 原始 URL、标题、公开/可用/获取时间、hash、本地路径、分离状态、版本不确定性 |
| document_pages | document_id + page 联合主键/FK | 原始页文本与提取方式；供本地全文子串检索，不等于支持事实 |
| evidence_fragments | id；document_id FK | 1 起算 PDF 物理页、短摘录、去空白后字符位置、财务行/列/单元格坐标、方法 |
| research_assertions | id；company/fragment FK | category、field、value_json、核验状态、reviewer_type、reviewed_at、原始金额/单位/报告期/口径/审计状态 |
| historical_events | id；company/assertion FK；identity_key 唯一 | 类型、阶段、发生/生效时间、受影响主体、是否结果、progress_of |
| outcome_observations | id；company/event FK | 窗口、标签、结果类型、确认时间、规则版本、覆盖说明 |
| comparison_runs | 确定性结果 hash ID | 实际输入、所有候选/排除理由、匹配特征、距离与方法版本 |
| pipeline_runs | UUID | 命令、启动时刻、success/partial/failed、参数、配置 hash、管线版本及实际结果 |

金额以十进制字符串保留原值，标准化金融断言单位 `CNY`（人民币元）；千元乘 1000，缺失为 null。比例、天数由 v1 Pydantic 独立字段校验。UI 只做显示换算。财务表格引用同时保存原始单元格、指标行和“本报告期/本报告期末”表头，不能仅从去空白文本中的数字串确定列。

`source_supported` 表示该断言受指定版本原文和明确规则支持，不表示整份文档已核验。当前没有 `human_reviewed` 新记录。保留 candidate / insufficient / conflicted / retracted 等状态语义，未实现完整人工审核工作流。

数据分层：`raw` 原文 → `extracted` 页文本/坐标 → `curated/assertions.json` 显式核对断言 → SQLite → `exports` 质量与对照。`manifests/collected.json` 是可重建元数据，不能单独认证缺失的原文。

当前限制：历史别名有效期、交易所实体、母子/担保关系及有效期、多发行人文档关联、跨站传播关系没有完整规范化关系表。Zinitix 以明确 `affected_entity` 保持主体隔离，不能宣称已建成完整企业关系图。扩展这些能力需新增证据关联表及迁移，不往财务字段里塞关系推断。
