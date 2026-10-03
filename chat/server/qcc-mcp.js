/**
 * 企查查官方 MCP 客户端
 *
 * 走 agent.qcc.com 的 Streamable HTTP MCP，16 个工具覆盖工商、财务、变更、司法、年报等。
 * 协议要点：
 *   - POST 到 MCP URL，Accept 必须同时带 application/json 和 text/event-stream
 *   - Authorization: Bearer <key>
 *   - 响应是 SSE 格式，要从 data: 行里取 JSON
 *   - tools/call 传 name 与 arguments，所有工具统一用 searchKey 接公司名或信用代码
 *
 * 凭证从 server/.env 读，不进代码不进前端。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 复用 index.mjs 的 .env 解析规则，避免两套逻辑 */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const QCC_MCP_URL = process.env.CHAT_QCC_MCP_URL || process.env.QCC_MCP_URL || 'https://agent.qcc.com/mcp/company/stream';
const QCC_MCP_KEY = (process.env.CHAT_QCC_MCP_API_KEY || process.env.QCC_MCP_API_KEY || '').replace(/^Bearer\s+/i, '').trim();
const TIMEOUT = Number(process.env.CHAT_QCC_TIMEOUT_MS || process.env.QCC_TIMEOUT_MS || 30000);

/**
 * 查证要用的工具，按信息价值排序。
 * 前四个是主力，够回答大部分问题；其余按需补充。
 */
const TOOL_PLAN = [
  { tool: 'get_company_registration_info', key: '工商信息', weight: 10 },
  { tool: 'get_financial_data', key: '财务数据', weight: 10 },
  { tool: 'get_change_records', key: '变更记录', weight: 9 },
  { tool: 'get_annual_reports', key: '企业年报', weight: 8 },
  { tool: 'get_company_profile', key: '企业简介', weight: 6 },
  { tool: 'get_shareholder_info', key: '股东信息', weight: 6 },
  { tool: 'get_key_personnel', key: '主要人员', weight: 5 },
  { tool: 'get_actual_controller', key: '实际控制人', weight: 5 },
  { tool: 'get_branches', key: '分支机构', weight: 4 },
  { tool: 'get_external_investments', key: '对外投资', weight: 4 },
  { tool: 'get_listing_info', key: '上市信息', weight: 3 },
  { tool: 'get_beneficial_owners', key: '受益所有人', weight: 3 },
  { tool: 'get_tax_invoice_info', key: '税号开票', weight: 2 },
  { tool: 'get_company_by_query', key: '实体识别', weight: 2 },
  { tool: 'get_contact_info', key: '联系方式', weight: 1 },
  { tool: 'verify_company_accuracy', key: '准确性验证', weight: 1 }
];

export function isConfigured() {
  return Boolean(QCC_MCP_KEY);
}

/** 从 SSE 响应里抽出 data: 行并解析 */
function parseSSE(text) {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('data:')) {
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        return JSON.parse(payload);
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * 校验返回是不是真有数据。
 * 企查查对某些名称会返回 HTTP 200 + isError + 空对象，
 * 如果只看 HTTP 状态就当成功，会把「查不到」误判成「查到了但没数据」，
 * 后面模型就会对着空数据编答案。必须验内容。
 */
function isMeaningful(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.isError || obj.error) return false;
  if (obj.success === false) return false;
  if (obj.Status != null && !['200', 200].includes(obj.Status)) return false;

  // 递归找有没有实质内容：非空的字符串、数字、数组长度大于 0
  let has = false;
  const walk = (v, depth) => {
    if (has || depth > 6) return;
    if (v == null) return;
    if (Array.isArray(v)) {
      if (v.length) { has = true; return; }
      v.forEach(x => walk(x, depth + 1));
      return;
    }
    if (typeof v === 'object') {
      Object.values(v).forEach(x => walk(x, depth + 1));
      return;
    }
    const s = String(v).trim();
    // 这些是接口的占位与提示文案，不算实质内容
    if (!s || /^(未查询到|查无此|无相关|不存在|未找到|--|—|null|undefined)$/.test(s)) return;
    has = true;
  };
  walk(obj, 0);
  return has;
}

/** 调一个 MCP 工具，返回解析后的对象。数据无效时返回 null，不污染上层判断。 */
async function callTool(tool, searchKey) {
  const res = await fetch(QCC_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${QCC_MCP_KEY}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: { searchKey } }
    }),
    signal: AbortSignal.timeout(TIMEOUT)
  });

  if (!res.ok) {
    throw new Error(`企查查接口返回 ${res.status}`);
  }

  const json = parseSSE(await res.text());
  if (!json) throw new Error('企查查响应格式无法解析');
  if (json.error) throw new Error(json.error.message || '企查查接口报错');

  const text = json?.result?.content?.[0]?.text;
  if (!text) return null;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return isMeaningful({ _raw: text }) ? { _raw: text } : null;
  }
  return isMeaningful(parsed) ? parsed : null;
}

/** 把企查查返回的字段名映射成人话，喂给模型时更省 token 也更好读 */
const FIELD_LABELS = {
  企业名称: '企业名称', 统一社会信用代码: '统一社会信用代码', 法定代表人: '法定代表人',
  登记状态: '登记状态', 成立日期: '成立日期', 注册资本: '注册资本', 实缴资本: '实缴出资',
  参保人数: '参保人数', 分支机构参保人数: '分支机构参保', 人员规模: '人员规模',
  企业类型: '企业类型', 所属地区: '所属地区', 地区信息: '地区',
  核准日期: '核准日期', 注册地址: '注册地址', 通信地址: '通信地址',
  经营范围: '经营范围', 国标行业: '行业分类', 登记机关: '登记机关',
  纳税人识别号: '税号', 纳税人资质: '纳税人资质', 企业简称: '简称', 英文名: '英文名',
  营业期限: '营业期限', 组织机构代码: '组织机构代码', 工商注册号: '工商注册号'
};

function simplify(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === '' || v === undefined) continue;
    const label = FIELD_LABELS[k] || k;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const nested = simplify(v);
      if (Object.keys(nested).length) out[label] = nested;
    } else {
      out[label] = v;
    }
  }
  return out;
}

/**
 * 查一家公司的完整工商档案。
 * 逐个工具串行调用（企查查对并发敏感），任何一个失败都不影响其他，
 * 最后汇总成一份带来源标记的资料包。
 */
export async function fetchCompanyProfile(companyName) {
  if (!isConfigured()) {
    return { ok: false, reason: '企查查未配置' };
  }

  const name = String(companyName || '').trim();
  if (!name) return { ok: false, reason: '公司名为空' };

  const sections = [];
  const errors = [];

  for (const { tool, key } of TOOL_PLAN) {
    try {
      const raw = await callTool(tool, name);
      if (!raw) continue;
      // 企查查「查无此企业」会返回提示文案，不是数据，跳过
      const text = JSON.stringify(raw);
      if (/未查询到|查无此|无相关|不存在|未找到/.test(text) && text.length < 500) continue;
      sections.push({ key, tool, data: simplify(raw) });
    } catch (e) {
      errors.push({ key, msg: String(e.message || e) });
    }
  }

  if (!sections.length) {
    return {
      ok: false,
      reason: errors.length
        ? `企查查接口都调用失败了：${errors[0].msg}`
        : `企查查没有返回「${name}」的数据。可能是名称需要工商全称，或这家公司没有公开数据。`
    };
  }

  return {
    ok: true,
    query: name,
    fetchedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    source: '企查查官方 MCP（agent.qcc.com）',
    sections,
    errors
  };
}
/**
 * 只取最关键的几项，用于快速判断。
 * 工商登记最关键，先查它，因为用户最先想知道的「这家公司存在吗、什么状态、多少人」
 * 全在这一个工具里。拿到后再并行补财务和变更。
 */
export async function fetchCompanyCore(companyName) {
  if (!isConfigured()) return { ok: false, reason: '企查查未配置' };
  const name = String(companyName || '').trim();
  if (!name) return { ok: false, reason: '公司名为空' };

  const failed = [];

  let reg = null;
  let hint = null;
  try {
    reg = await callTool('get_company_registration_info', name);
  } catch (e) {
    failed.push({ tool: 'get_company_registration_info', msg: String(e.message || e) });
  }

  if (!reg) {
    // 品牌名与工商全称不一致时，用实体识别工具反查。
    // 比如用户输「乐刻运动」，实际主体可能是「杭州乐刻网络技术有限公司」
    try {
      const ident = await callTool('get_company_by_query', name);
      hint = ident && (ident['企业名称'] || ident['name'] || ident['companyName']);
      if (hint) reg = await callTool('get_company_registration_info', hint);
    } catch {
      /* 识别失败就算了 */
    }
  }

  if (!reg) {
    return {
      ok: false,
      reason:
        '企查查没有返回「' + name + '」的工商数据。' +
        (hint ? '你可能想查的是「' + hint + '」。' : '') +
        '这类情况通常是名称写了品牌名而不是工商全称，换成营业执照上的完整名称再试一次即可。',
      errors: failed
    };
  }

  const [fin, chg] = await Promise.all([
    callTool('get_financial_data', name).catch(e => {
      failed.push({ tool: 'get_financial_data', msg: String(e.message || e) });
      return null;
    }),
    callTool('get_change_records', name).catch(e => {
      failed.push({ tool: 'get_change_records', msg: String(e.message || e) });
      return null;
    })
  ]);

  const out = { get_company_registration_info: simplify(reg) };
  if (fin) out.get_financial_data = simplify(fin);
  if (chg) out.get_change_records = simplify(chg);

  return {
    ok: true,
    query: name,
    matchedName: hint,
    renamed: Boolean(hint),
    fetchedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    source: '企查查官方 MCP（agent.qcc.com）',
    ...out,
    errors: failed
  };
}
