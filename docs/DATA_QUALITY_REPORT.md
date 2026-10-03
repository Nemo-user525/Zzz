# 实际运行与数据质量（2026-10-02）

统计口径见 DATASET_CARD。原始运行明细保留本机 `pipeline_runs` 和忽略的 manifests/runs，公开可复查汇总在 manifests 和 exports。

| 实际执行 | 结果 |
|---|---|
| 基线 `pwsh -File .\test.ps1` | 后端 18 passed，前端生产构建成功 |
| 基线 `pnpm --dir frontend test` | 6 passed |
| `doctor` | SQLite 可用，巨潮目录请求成功，6,259 条目录项，OCR disabled，LLM 可选 |
| `discover` | 20 家配置主体，30 次查询，235 条唯一公告索引；重复运行 0 新增、0 失败 |
| `fetch --resume` 两阶段首采 | 220 + 15 份 PDF，失败 0 |
| `fetch --resume --max-documents 300` 复跑 | 235 份 hash 命中，下载 0，失败 0 |
| `extract --resume` | 235 份处理；233 有可提取文本，2 needs_ocr；1,871 页记录 |
| `validate` 最终复跑 | 22 supported，0 rejected，0 human_reviewed |
| `build-labels` | 6 正向阶段标签，5 家企业；负标签 0 |
| `build-comparisons` | 2 组运行；各检查 19 家，均不足，无强配 |
| `pwsh -File .\rebuild-research.ps1` | 完成 235 元数据恢复→hash 续跑→提取→核验→标签→对照→导出；未删库 |
| 最终 `pwsh -File .\test.ps1` | 后端 58 passed，TypeScript / Vite 构建成功 |
| 最终 `pnpm --dir frontend test` | 8 passed |

待 OCR 两份（不进入支持断言）：`1212306705-c3c1d8a0fdeec449`（康美专项法律意见书），`1212306704-27c021803a28a4ba`（管理人执行监督报告）。康美结果使用其他可定位原始公告，未伪称这两份扫描文档已读通。

本轮中间财务抽取出现邻列拼接，最终检查 4 份报告原始表格页后修正 11 条财务数据，增加行/列坐标验证和 4 个针对性拒绝场景；错误中间数据未作为远端交付。核验不信任可修改的 extracted JSON，而重读 hash 匹配的 PDF。

自动化重点：真假摘录、主体/阶段、金额/单位/期间/表格单元格、原文缺失及 hash、SQLite 加法备份、重复 ID 事务保护、时点隔离/修订、无合格对照、离线 socket 阻断、手工候选导入、全文时间范围、现金尾差/满预付/零批次/成本日、模型幻觉降级、UI 反序响应及角色扩展。

浏览器使用本地真实服务和 Chromium：美的集团联网查询成功、未覆盖名字显示缺口；历史 T 日证据、独立展开后续结果、对照不足、逐页原文、3 万→33 万、延付 60 天→160 天、角色切换/核对卡和重置。截图见 `frontend/qa/history-*.png`；操作路径见 [演示脚本](DEMO_SCRIPT.md)。

离线验证：测试封锁非本地 socket，历史快照、本地原文页和现金计算仍成功；联网发现明确失败。未物理关闭网卡，不宣称官方站点离线可访问。无 LLM 密钥运行核心路径。本轮没有真实模型服务调用、Unix 实跑、生产多用户负载或外部用户测试。

保留警告：Starlette/httpx 测试客户端弃用提示，Vite ECharts 所在主包约 797 kB（gzip 约 262 kB）。不以零告警或全覆盖宣传。
