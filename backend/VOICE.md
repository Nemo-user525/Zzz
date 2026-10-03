# 小 X 本地语音识别

网页发送最多 20 秒的 16 kHz、单声道、16 bit PCM WAV 到同源 `POST /api/voice/transcribe`。后端默认使用 **SenseVoice Small int8 + Sherpa ONNX**，指定普通话并开启标点、数字规范化。原始识别文字保留在 `text`，查询字段由单独的提取步骤处理。录音只在请求内存中使用，不保存、不发送给第三方。模型首次加载后复用，CPU 推理放在工作线程中；每段录音有独立 stream，最多接收两个待处理请求，共享模型串行推理。

从仓库根目录安装依赖和官方模型（Windows）：

```powershell
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.venv\Scripts\python.exe backend\setup_voice.py
```

Linux/macOS 使用 `.venv/bin/python`；安装脚本要求 Python 3.12 或更新版本。脚本从 [Sherpa 官方模型发布地址](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2) 下载约 163 MB 的压缩包，解压后的模型约 228 MiB，校验固定 SHA256 `7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e`，保留模型原始 LICENSE 文件。模型说明见 [Sherpa SenseVoice 官方文档](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html)。

默认目录是 `data/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`，已被 Git 忽略；部署时必须运行安装脚本，或用 `XRAY_SENSEVOICE_MODEL_PATH` 指向包含 `model.int8.onnx`、`tokens.txt` 的目录。Windows 应在仓库根目录启动服务；外部模型路径使用 ASCII 目录名，避免原生加载器的路径兼容问题。首次识别需加载模型，客户端保留至少 45 秒超时。

仅当 SenseVoice 文件或运行库不可用时，才尝试已有 Vosk 小模型作为基础识别降级；不会因为识别结果为空或某个专名出错而切换模型。`get_backend_info()` 明确返回 `engine`、`degraded` 和 `engine_message`，API 应把这些字段返回客户端，降级时显示基础识别提示。设 `XRAY_VOICE_ALLOW_VOSK_FALLBACK=0` 可禁用降级。确实需要备用模型时运行 `backend/setup_voice.py --vosk`，其路径可由 `XRAY_VOSK_MODEL_PATH` 指定。两个模型都不可用时返回 503。

麦克风需在 HTTPS 或 localhost 中由用户点击授权，不依赖浏览器厂商的远程语音服务。SenseVoice 能改善普通话整句识别，但门店专名仍可能出现同音字，界面应允许查看原文及修改查询。

检查接口（在开发服务启动后）：

```powershell
curl.exe -H "Content-Type: audio/wav" --data-binary "@path/to/16khz-mono-pcm.wav" http://127.0.0.1:8086/api/voice/transcribe
```

仅接受上述 WAV 格式。空白或未识别到语音返回 422，超过 20 秒返回 413，服务繁忙或未配置返回 503。错误结构沿用应用的 `code`、`message`、`details`，不将模型路径或原始异常暴露给网页。

本机实测（2026-10-03，Windows Huihui 合成语音，不代表真人口音准确率）：冷启动约 3.0 秒；后续短句 0.08–0.15 秒，约 12 秒的长句 0.36 秒。`蜜雪冰城`、`海底捞`及查询整句可以正确识别；`乐刻`仍被识别为`乐客`。测试音频和原始结果留在忽略的 `data/runtime/voice-qa/`，不把同音字硬编码改成特定品牌。
