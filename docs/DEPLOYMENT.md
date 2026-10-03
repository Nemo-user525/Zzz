# 持续运行的公网部署与本地启动

## 当前交付状态

仓库已提供完整的 Docker 构建、Compose 持久化和 Render Blueprint；需要在自己的云服务器或托管账号中实际部署后，才会取得固定公网地址。当前没有已上线的长期公网地址。`trycloudflare.com` 仍是临时演示入口，不作为长期部署结果。

## Windows 本地页面

首次安装依赖，在项目目录运行 `pwsh -File .\start.ps1 -Demo`。首次安装完成后可关闭该终端，改为：

```powershell
pwsh -File .\start-local.ps1 -Rebuild
```

后台运行页面和守护进程，地址为 <http://127.0.0.1:8086/>。关闭启动命令所在终端不会主动关闭后台页面；守护进程发现它管理的服务异常退出或连续三次健康检查失败后，会重新启动服务。已有其他终端启动的健康服务会继续使用，不强行结束该进程。日志和进程状态保存在 Git 忽略的 `data/runtime/`。

安装当前 Windows 用户登录后的自启动：

```powershell
pwsh -File .\start-local.ps1 -Action InstallAutoStart
pwsh -File .\start-local.ps1 -Action Status
```

该计划任务不需要保存登录密码，不修改休眠或电源设置。电脑关机、休眠或未登录时，本地网页无法访问。移除自启动及停止此脚本管理的进程：

```powershell
pwsh -File .\start-local.ps1 -Action RemoveAutoStart
pwsh -File .\start-local.ps1 -Action Stop
```

`5173` 是旧开发模式的端口；上述演示模式使用 `8086`。其他设备上的 `127.0.0.1` 指它自己的电脑，不能用于访问这里的服务。

## 云托管：Render

1. 登录自己的 Render 账号并连接 GitHub 仓库 `Nemo-user525/Zzz`。
2. 新建 Blueprint，选择 `feat/history-evidence` 分支及仓库根目录的 `render.yaml`。
3. 配置使用 **Starter 付费常驻服务与 2GB 持久磁盘**，请在平台确认当前费用后再部署。本仓库没有创建服务、绑定付款或产生托管费用。
4. 在服务的 Environment 设置自己的 `OPENROUTER_API_KEY`、`QCC_MCP_API_KEY` 等接口配置；WorkBuddy 如启用，需把回调地址改成实际域名的 `/api/consumer/workbuddy/callback`。不要将私有配置提交 Git。
5. 部署成功后，使用平台实际显示的 HTTPS 地址。没有成功的部署结果前，不应把示例地址当作可用网址。

前端和后端在同一服务中运行，不需要跨域代理。数据库、研究原文及语音模型保存在 `/app/storage`。默认会下载并校验官方离线语音模型，第一次启动需要联网并留出几分钟；不需要语音时可将 `XRAY_INSTALL_VOICE_MODEL` 设为 `0`，文字查询仍可用。

免费服务会在闲置后休眠，也不能附加持久磁盘，因此这份常驻配置没有选择免费档。参见 [Render 免费实例说明](https://render.com/docs/free)、[持久磁盘说明](https://render.com/docs/disks) 和 [Blueprint 配置](https://render.com/docs/blueprint-spec)。Blueprint 已关闭自动发布；后续更新代码后，在平台确认并手动部署。

## 自有云服务器：Docker Compose

服务器需安装 Docker Engine 和 Compose v2.24+。克隆项目、按需要准备服务端 `.env` 后执行：

```bash
git clone -b feat/history-evidence https://github.com/Nemo-user525/Zzz.git
cd Zzz
cp .env.example .env
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:8086/api/health
```

Compose 默认只绑定服务器本机的 `127.0.0.1:8086`。在服务器上用 Caddy/Nginx 接入自己拥有的域名，反向代理到该地址并配置 HTTPS；域名解析需指向服务器。代理读超时至少设为 1800 秒，避免长调查请求过早断开。需要语音时执行 `docker compose exec web python backend/setup_voice.py`；模型存入持久卷。

容器退出后由 `restart: unless-stopped` 自动重启；健康检查本身仅报告状态，不负责重启仍存活但不健康的容器。服务器需要让 Docker 随系统启动。日志：`docker compose logs -f web`；停止：`docker compose down`；不要加 `-v`，否则会删除数据库和模型所在的卷。

应用当前以单进程维护调查任务，因此保持 **一个实例、一个 worker**。服务重启后进行中的任务会中断，可重新发起；已有 SQLite 数据仍保留。不要增加 worker 数量或多实例分流。付费云托管也依赖平台及上游接口可用性，并不保证永不故障。

## 更新与备份

更新服务前备份 `/app/storage/xray.sqlite3`，建议停止写入后用 SQLite backup API 生成一致备份；保存备份至服务器外的安全位置。再拉取代码并运行 `docker compose up -d --build`。容器升级不会删除持久卷。

当前环境没有 Docker，镜像构建与云端部署尚未实测；交付验证覆盖前后端测试、前端生产构建和 Windows 本地守护进程。首次云端部署应以平台构建成功、服务健康及实际查询结果作为上线验收。
