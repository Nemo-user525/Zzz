"""Turn spoken search requests into editable fields, without starting a query."""
import asyncio
import re
from pydantic import BaseModel, ConfigDict, Field
from app.services import consumer_model

CITIES = '北京 上海 天津 重庆 杭州 宁波 温州 绍兴 嘉兴 湖州 金华 台州 丽水 衢州 舟山 广州 深圳 珠海 佛山 东莞 中山 惠州 南京 苏州 无锡 常州 南通 徐州 扬州 镇江 泰州 盐城 淮安 连云港 宿迁 合肥 芜湖 福州 厦门 泉州 济南 青岛 烟台 郑州 洛阳 武汉 长沙 成都 绵阳 贵阳 昆明 西安 兰州 西宁 银川 乌鲁木齐 拉萨 南宁 海口 三亚 石家庄 太原 呼和浩特 沈阳 大连 长春 哈尔滨 南昌 赣州 香港 澳门 台北'.split()
CITY = re.compile('|'.join(sorted(CITIES, key=len, reverse=True)))
LEGAL = re.compile(r'(?:股份有限公司|有限责任公司|有限公司|个人独资企业|个体工商户|银行|大学|医院)$')
LEADING = re.compile(r'^(?:(?:嗯|呃|那个|你好|小[ Xx叉]|请|麻烦|能不能|可以|我想|我要|我需要|帮我|给我|替我|查询|查一下|查一查|查查|查找|查|了解一下|了解|看看|看一下|搜索一下|搜索|一下|下|关于|的|在|位于)[，,、\s]*)+')
TRAILING = re.compile(r'(?:这家(?:公司|企业|店|门店)|这个(?:品牌|公司)|的(?:企业|公司)?(?:信息|资料|风险|经营状况)|是否|有没有|怎么样|靠谱吗|好不好|能不能|看看|帮我|请问|谢谢|可以吗|好吗|吧|呢|吗|呀|啊).*$')


class Fields(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    query: str = Field(default='', max_length=80)
    location: str = Field(default='', max_length=120)


def compact(text):
    return re.sub(r'[\s，,。.!！?？、：:;；“”"‘’]', '', text)


def fallback(text: str) -> Fields:
    value = re.sub(r'\s+', ' ', text).strip(' ，,。.!！?？')
    if re.search(r'^(?:你好|你是谁|谢谢|再见|开始|结束|取消|停止|跳舞|今天天气|讲个笑话)[。！!？，,\s]*$', value):
        return Fields()
    # An explicit correction wins; do not combine two companies into one query.
    value = re.split(r'(?:不对[，,]?|改成|换成|我是说)', value)[-1].strip()
    value = LEADING.sub('', value)
    locations = list(dict.fromkeys(match.group() for match in CITY.finditer(value)))
    if len(locations) > 1:
        return Fields()
    location = locations[0] if locations else ''
    explicit = re.search(r'(?:城市(?:是|在)?|位置(?:是|在)?|位于|在)\s*(' + CITY.pattern + r')(?:市)?([\u4e00-\u9fff]{2,5}(?:区|县))?', value)
    if explicit:
        location = explicit[1] + (explicit[2] or '')
        value = value[:explicit.start()] + value[explicit.end():]
    value = re.split(r'[，,。；;]', value)[0].strip()
    value = TRAILING.sub('', value).strip(' 的，,。！!？?')
    if not LEGAL.search(value) and location:
        value = re.sub(r'^' + re.escape(location) + r'市?(?:的)?', '', value)
    value = LEADING.sub('', value).strip(' 的，,。！!？?')
    if len(value) < 2 or len(value) > 80 or re.search(r'以及|或者|和.+(?:公司|门店|健身)|还有|有没有|如何|怎么|为什么', value):
        return Fields(location=location)
    return Fields(query=value, location=location)


def grounded(fields: Fields, text: str) -> bool:
    original = compact(text)
    return bool(2 <= len(fields.query) <= 80 and compact(fields.query) in original
                and (not fields.location or compact(fields.location) in original))


async def extract(text: str) -> dict:
    text = text[:600]
    fields = fallback(text)
    source = 'local'
    # Short names already have an unambiguous local parse. Longer spoken requests
    # can use the project's existing model; never wait behind a long investigation.
    if len(compact(text)) > 16 and not consumer_model.MODEL_GATE.locked() and consumer_model.effective_mode() != 'offline':
        try:
            candidate = await asyncio.wait_for(consumer_model.structured(
                '这是语音输入字段提取任务，不是企业调查。只从 transcript 原文逐字提取一个要查询的门店、品牌或公司名称 query，和城市/地址 location。'
                '删除请求动词、语气词、风险问题。保留完整公司法定名称，不把名称里的城市删除。'
                'query 与 location 必须分别为原文连续片段，不纠正同音字、不翻译、不添加原文没有的字。'
                '没有明确企业/品牌/门店对象、同时要求多家且未明确改口、只是聊天时 query 为空。'
                '只输出 query 和 location 两个字符串；不需要任何引用。',
                {'transcript': text}, Fields, reasoning=False), timeout=8)
            if grounded(candidate, text):
                fields, source = candidate, 'model'
        except Exception:
            pass
    valid = grounded(fields, text)
    return {
        'query': fields.query if valid else '',
        'location': fields.location if valid else '',
        'needs_clarification': not valid,
        'keyword_source': source,
        'message': '已提取名称和位置，可以在查询栏修改。' if valid else '没能确定要查哪一家，请说出一个门店、品牌或公司名称。',
    }
