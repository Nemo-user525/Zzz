/**
 * 见微查证对话服务
 *
 * 零第三方依赖，只用 Node 内置模块。目的是部署时不需要 npm install，
 * 拷走就能跑，评委现场不会因为依赖没装而报错。
 *
 * 启动：node server/index.mjs
 * 环境变量见 .env.example
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatStream, chatOnce } from './llm.js';
import { getCompanyFacts } from './company-data.js';
import { isConfigured as isQccConfigured, fetchCompanyProfile, fetchCompanyCore } from './qcc-mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 8787);

/** 极简 .env 读取，不引依赖 */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

function sendJSON(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  // 阻断路径穿越，任何 ../ 都不放行
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('页面不存在');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // 健康检查，方便部署后确认服务活着
  if (p === '/api/health') {
    return sendJSON(res, {
      ok: true,
      llm: (process.env.CHAT_LLM_KEY || process.env.LLM_KEY) ? 'configured' : 'offline-fallback',
      qcc: isQccConfigured() ? 'configured' : 'not-configured',
      tyc: process.env.TYC_KEY ? 'configured' : 'not-configured',
      model: process.env.CHAT_LLM_MODEL || process.env.LLM_MODEL || 'deepseek-v4-flash'
    });
  }

  // 工商数据直查，不走模型，便于调试与演示前自检
  if (p === '/api/company' && req.method === 'GET') {
    const q = url.searchParams.get('q') || '';
    if (!q) return sendJSON(res, { error: '缺少参数 q' }, 400);
    try {
      const mode = url.searchParams.get('mode') || 'core';
      const facts = await getCompanyFacts(q);
      if (url.searchParams.get('raw') === '1' && facts.found) {
        return sendJSON(res, await (mode === 'full' ? fetchCompanyProfile(q) : fetchCompanyCore(q)));
      }
      return sendJSON(res, facts);
    } catch (e) {
      return sendJSON(res, { error: String(e.message) }, 500);
    }
  }

  // 流式对话
  if (p === '/api/chat' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJSON(res, { error: String(e.message) }, 400);
    }
    const text = String(body.message || '').trim();
    if (!text) return sendJSON(res, { error: '消息不能为空' }, 400);
    if (text.length > 500) return sendJSON(res, { error: '单条消息过长' }, 400);
    return chatStream(text, res, String(body.company || ''));
  }

  // 一次性对话，给不需要流式的调用方
  if (p === '/api/chat-once' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const text = String(body.message || '').trim();
      if (!text) return sendJSON(res, { error: '消息不能为空' }, 400);
      if (text.length > 500) return sendJSON(res, { error: '单条消息过长' }, 400);
      return sendJSON(res, { reply: await chatOnce(text, String(body.company || '')) });
    } catch (e) {
      return sendJSON(res, { error: String(e.message) }, 500);
    }
  }

  if (req.method === 'GET') return sendJSON(res, { error: '页面由见微主站提供' }, 404);
  res.writeHead(405).end('method not allowed');
});

server.listen(PORT, '127.0.0.1', () => {
  const mode = (process.env.CHAT_LLM_KEY || process.env.LLM_KEY) ? '模型已接入' : '离线兜底模式（未配 LLM_KEY）';
  console.log(`见微查证服务已启动  http://localhost:${PORT}`);
  console.log(`模型：${process.env.CHAT_LLM_MODEL || process.env.LLM_MODEL || 'deepseek-v4-flash'} · ${mode}`);
  console.log(`企查查：${isQccConfigured() ? '已配置' : '未配置'} · 天眼查：${process.env.TYC_KEY ? '已配置' : '未配置'}`);
});
