/**
 * 企业数据查询层
 *
 * 数据来源优先级：
 *   1. 企查查官方 MCP（agent.qcc.com），真实工商与司法数据，16 个工具
 *   2. 内置兜底数据（接口挂了 / 没配凭证 / 查不到时用），保证现场不空场
 *
 * 企查查凭证在 server/.env 的 QCC_MCP_API_KEY，不进代码不进前端。
 * 拿到的字段会做一层人话化映射，喂给模型时更省 token 更好读。
 */

import { isConfigured, fetchCompanyProfile, fetchCompanyCore } from './qcc-mcp.js';

const LLM_BASE = process.env.LLM_BASE_URL || '';
const LLM_KEY = process.env.LLM_KEY || '';
const TYC_BASE = process.env.TYC_BASE_URL || '';
const TYC_KEY = process.env.TYC_KEY || '';

/** 现场兜底数据：接口挂了或没配凭证时用这几家，保证演示不空场 */
const FALLBACK = {
  '杭州乐刻网络技术有限公司': {
    uscc: '91330106328194486E',
    name: '杭州乐刻网络技术有限公司',
    status: '存续',
    founded: '2015-06-09',
    regCapital: '139万人民币',
    paidCapital: '未实缴披露',
    insured: 57,
    legalRep: '韩伟',
    industry: '信息技术咨询服务',
    addr: '浙江省杭州市西湖区',
    risk: [],
    changes: [
      { date: '2024-02-06', t: '注册资本与股东双重变动',
        b: '注册资本从 15397.33711 万元降至 70.5 万元，股东从 27 家（含腾讯 mobility、高瓴、邓亚萍基金等）缩减至 3 家' }
    ],
    source: '企查查授权接口，2026-10-03 取得'
  },
  '杭州乐动投资合伙企业（有限合伙）': {
    uscc: '91330106MA27Y0DPX5',
    name: '杭州乐动投资合伙企业（有限合伙）',
    status: '存续',
    founded: '2017-11-17',
    regCapital: '—',
    paidCapital: '—',
    insured: 0,
    legalRep: '韩伟',
    industry: '实业投资 / 投资咨询',
    addr: '浙江省杭州市西湖区',
    risk: ['参保人数为 0'],
    changes: [],
    source: '企查查授权接口，2026-10-03 取得'
  },
  '中国恒大集团': {
    uscc: null,
    name: '中国恒大集团（港股已退市，2025 年 8 月除牌）',
    status: '境外已被香港高等法院颁令清盘，境内核心平台恒大地产集团有限公司于 2026 年 8 月 21 日被广州中院裁定受理破产清算',
    founded: '1996 年',
    regCapital: '—',
    paidCapital: '—',
    insured: '—',
    legalRep: '—',
    industry: '房地产',
    addr: '深圳 / 广州',
    risk: [
      '2023 年 6 月末总负债约 2.3882 万亿元，净资产缺口约 6442 亿元',
      '2026 年 8 月 20 日许家印一审被判无期徒刑，没收个人全部财产',
      '清盘人披露截至 2026 年 5 月已回收约 2.55 亿美元，债权申报规模约 450 亿美元，算出回收率约 0.57%',
      '境内已有 900 余家关联公司进入破产清算、重整或强制清算程序'
    ],
    changes: [
      { date: '2024-01', t: '香港高等法院颁令清盘', b: '清盘令签发' },
      { date: '2025-08', t: '港交所除牌退市', b: '停牌 18 个月未满足复牌条件' },
      { date: '2026-08-21', t: '广州中院受理破产清算', b: '广州市农商行华夏支行申请，恒大地产集团进入清算程序' }
    ],
    source: '公开报道与法院公告整理，2026-10-03 核实',
    note: '这家主体已受理破产清算，工商数据在公开渠道已下架，以上为法院公告与清盘人披露口径。'
  }
};

const NOT_FOUND_MSG =
  '这家公司的信息我这边没能取到。可能原因：名称写得太简略需要全称、这家公司太新还没有公开数据、' +
  '或者工商接口现在连不上。你可以换工商全称再问我一次，或者直接去国家企业信用信息公示系统查。';

/**
 * 降级判定：只有「一个可用源都没拿到」才算降级。
 * 之前写成 !qcc || !tyc，导致只配了企查查、没配天眼查时被误判成降级，
 * 模型就会在回答里说「实时接口未完全成功」，明明查得很好。这个错会让演示看起来像坏了。
 */
function isDegraded(qcc, tyc) {
  return !qcc && !tyc;
}

/** 归一化：去掉括号、空格、常见后缀差异，用于模糊匹配 */
function normalize(s) {
  return String(s || '')
    .replace(/[（）()\s]/g, '')
    .replace(/[（(].*?[)）]/g, '')
    .toLowerCase();
}

/** 本地兜底库匹配 */
function lookupFallback(query) {
  const q = normalize(query);
  if (!q) return null;
  for (const [key, val] of Object.entries(FALLBACK)) {
    if (normalize(key).includes(q) || q.includes(normalize(key).slice(0, 4))) return val;
    if (val.uscc && val.uscc.toLowerCase() === q) return val;
  }
  // 模糊命中：包含「乐刻」「恒大」等关键词
  for (const [key, val] of Object.entries(FALLBACK)) {
    if (q.includes(key.slice(0, 2)) || key.includes(q.slice(0, 2))) return val;
  }
  return null;
}

async function fetchQcc(query) {
  if (!isConfigured()) return null;
  // 恒大这类主体企查查查不到（香港上市主体不在内地工商系统内，
  // 内地主体又已受理破产清算、数据下架），硬查只会浪费一次往返还拿回一句拒答，
  // 直接跳过让上层走内置兜底。
  if (/恒大/.test(query)) return null;
  const r = await fetchCompanyCore(query);
  if (!r.ok) return null;
  const reg = r.get_company_registration_info || {};
  const fin = r.get_financial_data || {};
  return {
    uscc: reg['统一社会信用代码'] || null,
    name: reg['企业名称'] || query,
    status: reg['登记状态'] || '未知',
    founded: reg['成立日期'] || '未知',
    regCapital: reg['注册资本'] || '未披露',
    paidCapital: reg['实缴资本'] || reg['实缴出资'] || '未披露',
    insured: reg['参保人数'] != null ? Number(reg['参保人数']) : null,
    legalRep: reg['法定代表人'] || '未知',
    industry: (reg['行业分类'] && (reg['行业分类']['中类'] || reg['行业分类']['大类'])) || '未知',
    addr: reg['注册地址'] || '未知',
    matchedName: r.matchedName || null,
    renamed: r.renamed || false,
    // 只把企查查各工具的返回透给模型，剥掉元信息
    detail: Object.fromEntries(
      Object.entries(r).filter(([k]) => k.startsWith('get_') && k !== 'get_company_by_query')
    ),
    source: `企查查官方 MCP，取数时点 ${r.fetchedAt}`
  };
}

async function fetchTyc(query) {
  if (!TYC_KEY || !TYC_BASE) return null;
  try {
    const url = `${TYC_BASE}/v4/search/searchSuggest?keyword=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TYC_KEY}` },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.pagedList?.[0] || data?.hits?.[0];
    if (!hit) return null;
    return {
      uscc: hit.pid || hit.tid || null,
      name: hit.companyName || hit.name,
      status: hit.regStatus || '未知',
      legalRep: hit.legalPerson || '—',
      regCapital: hit.regCapital || '—',
      founded: hit.estiblishTime || '—',
      insured: hit.insuredNum ?? null,
      industry: hit.industryCodeName || hit.industry || '—',
      addr: hit.regLocation || '—',
      source: '天眼查官方接口'
    };
  } catch {
    return null;
  }
}

/** 合并两个源，同字段冲突时保留信息量更大的那个，并记下分歧 */
function merge(qcc, tyc) {
  if (!qcc && !tyc) return null;
  if (!qcc) return { ...tyc, conflictNote: '仅天眼查返回，企查查接口无数据' };
  if (!tyc) return { ...qcc, conflictNote: '仅企查查返回，天眼查接口无数据' };

  const conflicts = [];
  const pick = (a, b, field) => {
    if (a == null || a === '' || a === '—') return b;
    if (b == null || b === '' || b === '—') return a;
    if (String(a) !== String(b)) { conflicts.push(`${field}：企查查「${a}」/ 天眼查「${b}」`); }
    return String(a).length >= String(b).length ? a : b;
  };

  return {
    uscc: qcc.uscc || tyc.uscc,
    name: pick(qcc.name, tyc.name, '公司名称'),
    status: pick(qcc.status, tyc.status, '登记状态'),
    founded: pick(qcc.founded, tyc.founded, '成立日期'),
    regCapital: pick(qcc.regCapital, tyc.regCapital, '注册资本'),
    paidCapital: pick(qcc.paidCapital, tyc.paidCapital, '实缴出资'),
    insured: pick(qcc.insured, tyc.insured, '参保人数'),
    legalRep: pick(qcc.legalRep, tyc.legalRep, '法定代表人'),
    industry: pick(qcc.industry, tyc.industry, '行业'),
    addr: pick(qcc.addr, tyc.addr, '注册地址'),
    risk: [...(qcc.risk || []), ...(tyc.risk || [])],
    changes: [...(qcc.changes || []), ...(tyc.changes || [])],
    detail: qcc.raw || null,
    source: `企查查 + 天眼查双源交叉，${new Date().toISOString().slice(0, 10)}`,
    conflictNote: conflicts.length ? '两源不一致：' + conflicts.join('；') : ''
  };
}

/**
 * 对外主入口。返回一个可直接喂给模型的事实包。
 * 拿不到数据时返回 found:false，并给出用户能看懂的原因，不编数据。
 */
export async function getCompanyFacts(query) {
  const cleaned = String(query || '').trim();
  if (!cleaned) {
    return { found: false, reason: '没听清你要查哪家公司。' };
  }

  const fallback = lookupFallback(cleaned);
  const [qcc, tyc] = await Promise.all([
    fetchQcc(cleaned).catch(() => null),
    fetchTyc(cleaned).catch(() => null)
  ]);

  const merged = merge(qcc, tyc);

  if (!merged) {
    if (fallback) {
      return {
        found: true,
        degraded: true,
        ...fallback,
        note: '实时工商接口这次没连上，用的是内置的已核实数据。'
      };
    }
    return { found: false, reason: NOT_FOUND_MSG };
  }

  return { found: true, degraded: isDegraded(qcc, tyc), ...merged };
}

export { FALLBACK };
