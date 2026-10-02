# 公网临时演示

2026-10-02 已建立临时 HTTPS 演示入口：

https://filename-server-applied-latitude.trycloudflare.com

11:23 用户反馈原 `colon-lanka-enable-quarterly` 地址出现 1033。实际日志显示 cloudflared 仍在运行，但 HTTP/2 到边缘节点的连接反复被重置，并非用户操作问题。已创建 QUIC / IPv4 新隧道，并停止已核对身份的旧 HTTP/2 隧道（PID 37408）；原链接现已停用。临时连接恢复不代表永久可用。

电脑和手机无需安装项目，也不要求与主机在同一 Wi-Fi。此地址通过 Cloudflare Quick Tunnel 转发到本机的 8080 服务；本机必须保持开机、联网，服务与隧道必须持续运行。停止隧道后地址失效，重新创建通常会得到新地址。不是长期托管，也不保证各地网络可达性。

## 实现与启动

`backend/app/public_demo.py` 复用已有 FastAPI 应用，并仅挂载 `frontend/dist`。前端及 `/api` 同域，无需把手机上的 localhost 指向开发者电脑，也不对外发布 Vite 开发服务。

在仓库根目录先构建：

```powershell
pnpm --dir frontend build
```

终端一运行（保留窗口）：

```powershell
$env:PYTHONPATH = "$PWD/backend"; .\.venv\Scripts\python.exe -m uvicorn app.public_demo:app --host 127.0.0.1 --port 8080
```

终端二运行已从 Cloudflare 官方 GitHub Releases 下载的程序（本机位于仓库外）：

```powershell
..\demo-tools\cloudflared.exe tunnel --url http://127.0.0.1:8080 --no-autoupdate --protocol quic --edge-ip-version 4
```

以该终端实际打印的 `https://*.trycloudflare.com` 为准，不重复启动已占用 8080 的服务。当前会话已以隐藏后台进程运行，日志在仓库根目录 `public-demo.*.log` 和 `public-quic.*.log`，均被 Git 忽略。停止当前分享：在任务管理器确认 `cloudflared.exe` 命令行对应 `127.0.0.1:8080` 后结束该进程；不要结束其他用途的隧道。

## 本次实际检查

- 修复后 11:27:13—11:29:07，间隔约 15 秒的 8 次公网健康检查全部 HTTP 200；新隧道自 11:24:31 建连至检查结束未记录断连错误。此为有限时间观察，不是可用性保证。
- `pnpm build` 成功；仍有前端单包较大的提示。
- 经公网 HTTPS 请求首页、健康接口、研究库质量接口、公告第 1 页 PNG，均返回 HTTP 200。
- 经公网 `/api/simulations` 运行演示输入，0% 预付款最低现金 30,000 元，30% 为 330,000 元；后者缺口为 0，余款日为第 130 天。
- `/.env`、`/data/xray.sqlite3`、`/backend/app/main.py` 均返回 404。
- 内置浏览器打开公网标签页操作超时，未完成本次公网浏览器交互或实体手机验收，不据此声称所有移动网络均可访问。

长期公开使用仍需固定域名与服务器托管、访问控制及容量治理；此入口用于临时展示公开公告与虚构交易演示。

官方说明：https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
