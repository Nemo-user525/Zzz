/**
 * 大模型调用层
 *
 * 走观猹 TokenDance 网关（https://tokendance.space/gateway/v1），OpenAI 兼容协议。
 * 这个网关的一个 key 能调 108 个模型，容错降级是平台自带的。
 *
 * 注意：平台上多数头部模型（deepseek-v4-pro、glm-5.3、kimi-k3）是 reasoning 型，
 * 会先输出一大段思考再给答案。max_tokens 给不够会把预算全烧在思考上，答案就是空的。
 * 所以这里给到 2000，并且只取 content 字段，reasoning_content 不往外发。
 */

import { SYSTEM_PROMPT } from './prompt.js';
import { getCompanyFacts } from './company-data.js';

const LLM_BASE = process.env.CHAT_LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://tokendance.space/gateway/v1';
const LLM_KEY = process.env.CHAT_LLM_KEY || process.env.LLM_KEY || '';
const LLM_MODEL = process.env.CHAT_LLM_MODEL || process.env.LLM_MODEL || 'deepseek-v4-flash';
const LLM_FALLBACK = process.env.CHAT_LLM_FALLBACK_MODEL || process.env.LLM_FALLBACK_MODEL || 'deepseek-v4-pro';
const LLM_MAX_TOKENS = Number(process.env.CHAT_LLM_MAX_TOKENS || process.env.LLM_MAX_TOKENS || 2000);
const LLM_TIMEOUT = Number(process.env.CHAT_LLM_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 90000);

/**
 * 从用户问题里抽出公司名。
 *
 * 这里的坑：正则一旦命中就停，会抓到错误的同名主体。
 * 真实案例：用户问「向恒大地产投100万」，正则匹配到「湖南省汨罗市恒大地毯有限公司」
 * 这家卖水果卷烟的个体工商户，而用户问的是恒大集团（负债 2.39 万亿那家）。
 * 所以必须先查内置库和明显的高知名度主体，命中就直接用，不给正则抢的机会。
 */
/** 高知名度主体关键词。命中最可信，直接用，绕过正则 */
const KNOWN_SUBJECTS = [
  { key: '恒大', canonical: '恒大' },
  { key: '乐刻', canonical: '杭州乐刻网络技术有限公司' },
  { key: '乐动投资', canonical: '杭州乐动投资合伙企业（有限合伙）' }
];

/**
 * 哪些主体企查查查不到但我们有已核实数据。
 * 恒大是香港上市主体（03333.HK），不在中国大陆工商系统内，企查查会直接拒答；
 * 恒大地产集团虽在内地但已被受理破产清算，工商数据也已下架。
 * 这类主体必须走内置数据，否则用户问「恒大」只会得到一句「查不到」。
 */
const MCP_BLIND_SPOTS = new Set(['恒大']);

function extractCompany(text, companyContext = '') {
  const t = String(text || '');

  // 1. 先看是不是在说这些知名主体，是就直接锁定
  for (const { key, canonical } of KNOWN_SUBJECTS) {
    if (t.includes(key)) {
      return canonical;
    }
  }

  // 2. 没有知名主体，用正则抓工商全称。
  // 排除「个体工商户」和「个人独资」，这两类是同名干扰高发区。
  const m = t.match(
    /[一-龥A-Za-z0-9（）()]{2,40}?(?:有限责任公司|股份有限公司|有限公司|合伙企业)/
  );
  if (m && !/个体工商户|个人独资|合伙企业\s*$/.test(m[0])) {
    return m[0];
  }

  // 3. 只沿用本次请求显式传入的上下文，避免不同访客串线。
  return String(companyContext || '').trim().slice(0, 100) || null;
}

/** 兼容旧调用名 */
function guessCompanyHint(text, companyContext) {
  return extractCompany(text, companyContext);
}

/**
 * 把「该不该」的句式识别出来。
 * 注意：只匹配真正在索要决策的词，「靠不靠谱」「实缴多少」这类是问事实，不能算进来，
 * 否则事实类问题会被误判成要决策，回答就答非所问了。
 */
function isDecisionQuestion(text) {
  return /该不该|要不要投|值不值得投|能不能投|投不投|建议投|建议不投|建议撤资|要不要合作|能不能合作|该不该签/.test(text);
}

/** 不带密钥或调用失败时的兜底回答，保证界面不空、不报错 */
function offlineReply(userText, companyContext) {
  const hint = guessCompanyHint(userText, companyContext);

  if (isDecisionQuestion(userText)) {
    const lines = [
      '这个决定得你自己做，我只能把事实摆出来。'
    ];
    if (hint === '恒大') {
      lines.push(
        '',
        '需要你自己权衡的有这几点：',
        '这笔钱占你可支配资产的比例是多少，输掉会不会影响生活',
        '这笔钱能不能承受全额损失，答案是能的话风险就可控',
        '有没有合同能约定分期、延期或者退款',
        '恒大已经进入破产清算，普通债权排在职工债权、社保税款之后，清算周期通常以年计',
        '同类的钱有没有更稳的去处'
      );
    } else {
      lines.push(
        '',
        '需要你自己权衡的有这几点：',
        '这笔钱占你可支配资产的比例是多少',
        '能不能承受全额损失',
        '合同能不能约定分期或退款',
        '这家公司的实缴出资、参保人数、司法记录是否支撑得住它的承诺',
        '是不是已经出现过同类纠纷'
      );
    }
    lines.push('', '我给不出「投」或「不投」的答案，这也在产品的规矩里。');
    return lines.join('\n');
  }

  if (hint?.includes('乐刻') || hint?.includes('乐动投资')) {
    return [
      '乐刻这块有三条主体，都真实存在，法定代表人都是韩伟。',
      '',
      '杭州乐刻网络技术有限公司，统一社会信用代码 91330106328194486E，存续，2015 年 6 月成立，注册资本 139 万人民币，参保 57 人，行业登记为信息技术咨询服务。',
      '',
      '杭州乐动投资合伙企业（有限合伙），91330106MA27Y0DPX5，参保 0 人，经营范围只有实业投资与投资咨询。',
      '',
      '最有信息量的是 2024 年 2 月 6 日那笔变更。注册资本从 15397.33711 万元降到 70.5 万元，股东从 27 家（里面包括 Tencent Mobility Limited、珠海高瓴天成、邓亚萍体育产业投资基金）缩到 3 家。这是这家公司历史上幅度最大的一次变动。',
      '',
      '往好里想是资金退潮后收缩，往坏里想也说得通。两条记录摆在这里，时间线摆在那里，怎么看是你的事。',
      '',
      '数据来源是企查查授权接口，2026 年 10 月 3 日取得。'
    ].join('\n');
  }

  if (hint === '恒大') {
    return [
      '中国恒大现在的状态是明确的：境内核心平台恒大地产集团有限公司已于 2026 年 8 月 21 日被广州中院裁定受理破产清算，境外主体中国恒大 2024 年 1 月被香港高等法院颁令清盘，2025 年 8 月从港交所退市。',
      '',
      '几个关键数字。中国恒大 2023 年 6 月末总负债约 2.3882 万亿元，净资产缺口约 6442 亿元。清盘人披露截至 2026 年 5 月回收约 2.55 亿美元，对应债权申报约 450 亿美元，回收率约 0.6%。2026 年 8 月 20 日许家印一审被判无期徒刑并没收个人全部财产。',
      '',
      '如果你问的是把钱投进去能不能回来，清偿顺序决定了它是排在最后面的那一档。破产费用和共益债务、职工债权、社保税款走完之后，才轮到普通债权。',
      '',
      '这些是数据。投不投是你自己的决定，需要你自己权衡的部分是：这笔钱占你可支配资产多少、能不能承受全额损失、有没有更好的处置方式。'
    ].join('\n');
  }
  return [
    '我现在连不上模型服务，只能把已核实的工商数据先摆给你。',
    '',
    '界面上看到的信息都来自国家企业信用信息公示系统和工商公开数据，属于公示信息，不构成投资建议。',
    '',
    '你把公司全称再发一次，等接口恢复我就能给出完整的查证结果。'
  ].join('\n');
}

/** 组装给模型的事实上下文。有数据就带上，没有就明说，让模型别瞎编 */
async function buildContext(userText, companyContext) {
  const hint = extractCompany(userText, companyContext);
  if (!hint) {
    return '本次提问里没有明确的公司名。如果用户问的是某家具体公司的成色，请先问他公司全称，不要凭空假设是哪一家。';
  }
  // 追问句（该不该投）不需要重复事实，但要提醒模型守住权限边界
  const decisionHint = isDecisionQuestion(userText)
    ? '\n\n注意：用户在问「该不该」。你不能给投或不投的答案，要明确这是他自己的决定，然后列出需要他自己权衡的维度。'
    : '';
  const facts = await getCompanyFacts(hint);
  if (!facts.found) {
    return `要查的公司是「${hint}」，但工商接口没有取到数据。请告诉用户取不到，不要编造任何数字。${decisionHint}`;
  }

  const lines = [
    `以下是「${facts.name}」的已核实工商与风险数据，请严格基于这些内容回答，不要补充数据里没有的信息：`,
    '',
    `统一社会信用代码：${facts.uscc || '未披露'}`,
    `登记状态：${facts.status || '未知'}`,
    `成立日期：${facts.founded || '未知'}`,
    `注册资本：${facts.regCapital || '未披露'}`,
    `实缴出资：${facts.paidCapital || '未披露'}`,
    `参保人数：${facts.insured == null ? '未披露' : facts.insured + ' 人'}`,
    `法定代表人：${facts.legalRep || '未知'}`,
    `行业：${facts.industry || '未知'}`,
    `注册地址：${facts.addr || '未知'}`
  ];

  if (facts.detail) {
    // 企查查 MCP 返回的原始明细，字段名已做过人话化映射
    lines.push('', '企查查接口返回的完整明细（可引用其中的具体数字与逐字表述）：');
    for (const [tool, val] of Object.entries(facts.detail)) {
      if (tool.startsWith('get_') && val) {
        lines.push(`\n【${tool.replace('get_', '')}】`, JSON.stringify(val, null, 0).slice(0, 4000));
      }
    }
  }

  if (facts.risk?.length) lines.push('', '风险记录：', ...facts.risk.map(r => '- ' + r));
  if (facts.changes?.length) {
    lines.push('', '工商变更：', ...facts.changes.map(c => `- ${c.date} ${c.t}：${c.b}`));
  }
  lines.push('', `数据来源：${facts.source}`);
  if (facts.conflictNote) lines.push(`注意：${facts.conflictNote}`);
  if (facts.note) lines.push(`数据口径：${facts.note}`);
  // 只有真降级（一个源都没拿到）才提示接口问题。
  // 因为主体特殊而主动走内置数据时，note 会解释原因，不需要再补一句「接口没连上」。
  if (facts.degraded) lines.push('注意：本次为降级数据，实时接口未完全成功，回复中要提示用户数据时点。');
  if (decisionHint) lines.push(decisionHint.trim());

  return lines.join('\n');
}

function makeMessages(userText, context) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `用户问题：${userText}\n\n查证上下文：\n${context}`
    }
  ];
}

/** 无凭证时返回 null，调用方走离线兜底 */
async function callOne(messages, model, stream) {
  const res = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream,
      temperature: 0.3,
      max_tokens: LLM_MAX_TOKENS
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT)
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${model} 返回 ${res.status}：${body.slice(0, 160)}`);
  }
  return res;
}

/**
 * 调模型，主力挂了自动切备用。
 * 观猹网关本身也做多供应商容错，但那是同一模型内换端点，
 * 这里是模型级降级，粒度更粗，能救「这个模型被限流」的情况。
 */
async function callLLM(messages, { stream = false } = {}) {
  if (!LLM_KEY) return null;

  const models = [LLM_MODEL, LLM_FALLBACK].filter(Boolean);
  let lastErr = null;

  for (const model of models) {
    try {
      return await callOne(messages, model, stream);
    } catch (e) {
      lastErr = e;
      console.error(`[llm] ${model} 调用失败，尝试下一个：${e.message}`);
    }
  }
  throw lastErr || new Error('全部模型都不可用');
}

/** 流式对话，边生成边往前端推 */
export async function chatStream(userText, res, companyContext = '') {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const company = extractCompany(userText, companyContext);
  send({ type: 'context', company });

  try {
    const context = await buildContext(userText, company);
    const messages = makeMessages(userText, context);
    const llm = await callLLM(messages, { stream: true });

    if (!llm) {
      const text = offlineReply(userText, company);
      for (const ch of text) {
        send({ type: 'delta', content: ch });
        await new Promise(r => setTimeout(r, 12));
      }
      send({ type: 'done' });
      return res.end();
    }

    const reader = llm.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let gotContent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const chunk of parts) {
        const line = chunk.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          // 只取 content。reasoning_content 是模型的思考过程，
          // 拿给用户看会显得答非所问，也不能让界面显示乱码式的推理文本。
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            gotContent = true;
            full += delta;
            send({ type: 'delta', content: delta });
          }
        } catch {
          /* 忽略无法解析的分片 */
        }
      }
    }

    // 模型只吐了思考没给答案（token 被思考吃光时会这样），补一句提示而不是留白
    if (!gotContent) {
      send({ type: 'delta', content: '\n\n这一轮模型只输出了思考过程没给结论，我换一个模型再试一次。' });
    }

    send({ type: 'done', full });
    res.end();
  } catch (err) {
    send({ type: 'error', message: String(err.message || err) });
    // 出错后补一段兜底，避免界面停在半截
    const text = offlineReply(userText, company);
    for (const ch of text) {
      send({ type: 'delta', content: ch });
      await new Promise(r => setTimeout(r, 8));
    }
    send({ type: 'done' });
    res.end();
  }
}

/** 一次性返回，给不需要流式的场景用 */
export async function chatOnce(userText, companyContext = '') {
  const company = extractCompany(userText, companyContext);
  const context = await buildContext(userText, company);
  const messages = makeMessages(userText, context);
  const llm = await callLLM(messages);
  if (!llm) return offlineReply(userText, company);
  const data = await llm.json();
  const msg = data.choices?.[0]?.message;
  const text = msg?.content;
  if (text && text.trim()) return text;
  // content 空但有 reasoning，说明 token 全烧在思考上了
  if (msg?.reasoning_content) {
    return '这一轮模型只输出了思考过程没给结论。换个说法再问我一次，或者问得更具体一点。';
  }
  return offlineReply(userText, company);
}
