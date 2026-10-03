# 临时公网演示

GitHub 仓库提供代码，不自动托管网站。需要从其他设备访问正在运行的演示时，先在服务电脑启动单端口页面，再建立临时 HTTPS 隧道。

```powershell
pwsh -File .\start.ps1 -Demo
```

本机应能打开 `http://127.0.0.1:8086/`，并通过 `/api/health` 与 `/api/chat-health` 检查后端和对话进程。默认首页是门店查证与对话；`?view=consumer`、`?view=history`、`?view=trade` 提供其余功能。`start.ps1 -Demo` 构建页面，只将 `frontend/dist` 挂到 FastAPI；不会把仓库目录作为静态文件公开。

在第二个终端运行：

```powershell
pwsh -File .\publish-demo.ps1
```

脚本检查本机 8086 服务后通过 Cloudflare Quick Tunnel 生成临时地址。以终端本次打印的 `https://*.trycloudflare.com` 为准；旧地址不能复用。两套终端、电脑和网络连接都需保持运行。拿到链接的人可使用服务及公开演示账号的共享额度。隧道不等于长期部署，也不保证并发容量或各地可达。

复核项：在另一台设备打开首页，分别检查门店搜索、消费者入口、历史入口和对话流式回答；若上游授权或网络不可用，页面应显示状态或降级说明。真实企查查查询、模型回答和地图资料不属于仓库内的固定测试数据。Cloudflare 的 Quick Tunnel 说明见 [官方文档](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。
