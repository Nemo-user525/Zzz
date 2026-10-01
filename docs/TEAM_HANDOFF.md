# 两人联调交接

推荐分支：`feat/data-engine`（产品/核心技术）与 `feat/db-frontend`（数据库/网页）。本轮完整基线已落地，分支是后续协作建议。

| 负责人 | 文件所有权 |
|---|---|
| 产品/核心技术 | `docs/openapi.yaml`、`data/source_manifest.json`、`data/verified/`、`data/use_cases.json`、`backend/app/api/`、`backend/app/schemas/`、`backend/app/services/` |
| 数据库/网页 | `backend/app/db/`、`frontend/src/`、`frontend/src/api/` |

接口冻结点：`docs/openapi.yaml` v1.0.0；前端类型在 `frontend/src/api/types.ts`，离线 mock 在 `frontend/src/api/mock.ts`。新增字段先改 OpenAPI，再同步 Pydantic/TypeScript。页面不硬编码企业事实；数据库不保存用户角色文案。

配置扩展：在 `data/use_cases.json` 追加对象并设 `default_use_case_id`，可改 `target_user`、`decision_goal`、标题、主按钮和 `output_template.sections[].fields`。目前支持的字段键见 `frontend/src/App.tsx` 的 `cardField`。只要使用现有字段，增加财务负责人等新靶向用户不改 `companies/sources/facts/risk_events` 或 `backend/app/services/evidence.py`。若新目标需要新的决策算法，可新增独立服务和 API，不修改证据模型。`GET /api/use-cases` 实时读取配置；页面右上方的场景选择可验证。

PowerShell 联调：从根目录运行 `.\start.ps1 -SkipInstall`；后端 `http://127.0.0.1:8000`，前端 `http://127.0.0.1:5173`，Vite 代理 `/api`。示例：`Invoke-RestMethod http://127.0.0.1:8000/api/health`；`Invoke-RestMethod http://127.0.0.1:8000/api/demo-scenario | ConvertTo-Json -Depth 6`。用该情景 JSON 向 `POST /api/simulations` 请求，0% 预付款最低 30,000 元，30% 最低 330,000 元。

共同验收：两次运行 `python -m app.db.seed`，检查计数不变；执行 `test.ps1`；页面点击公告来源、推演、调到 30%、打开算法和核对卡；检查实际公司覆盖数字与资料日期。
