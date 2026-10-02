"""Train a small, auditable topic router from source-supported DB assertions.

This is NOT a consumer-risk predictor: labels are event categories, not future
outcomes. Agent-labelled examples are disclosed. No invented negative samples.
"""
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from app.db.models import ROOT, SessionLocal
from app.db.history import Assertion, Fragment, Document
from app.services.consumer_search import now

MODEL = ROOT / 'data/models/consumer-topic-router.json'
LIMITATION = '历史样本以上市公司公告为主；主题路由仅帮助找复核材料，不代表消费风险、概率或训练准确率。'
REVIEW_RULES = {
    'regulatory_penalty': {'review_focus': '核对受处罚主体、具体事项、整改和撤销状态；不能由处罚直接推断门店无法履约。', 'search_terms': '处罚决定 整改 撤销 后续'},
    'delisting_notice': {'review_focus': '区分上市状态与实际经营；不能将退市自动解释为停业。', 'search_terms': '终止上市 后续 经营 公告'},
    'subsidiary_management_notice': {'review_focus': '区分子公司、母公司与门店；核对实际控制和服务承接关系。', 'search_terms': '子公司 控制权 承接 最新公告'},
}


def features(text):
    # Character bigrams require no tokenizer/model download.
    text = re.sub(r'[^\u4e00-\u9fff]', '', text)
    counts = Counter(text[i:i+2] for i in range(len(text)-1))
    norm = math.sqrt(sum(v*v for v in counts.values())) or 1
    return {k: v/norm for k, v in counts.items()}


def train():
    groups, examples = defaultdict(list), []
    with SessionLocal() as db:
        rows = db.query(Assertion, Fragment, Document).join(Fragment, Fragment.id == Assertion.fragment_id).join(Document, Document.id == Fragment.document_id).order_by(Assertion.id).all()
        for a, f, d in rows:
            meta = json.loads(a.metadata_json)
            if a.status != 'source_supported' or meta.get('is_outcome') or not meta.get('event_type'):
                continue
            path = Path(d.local_file)
            if not path.is_absolute():
                path = ROOT / path
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != d.sha256:
                continue
            import pymupdf
            try:
                with pymupdf.open(path) as pdf:
                    page = re.sub(r'\s+', '', pdf[f.page-1].get_text())
                if re.sub(r'\s+', '', f.excerpt) not in page:
                    continue
            except (ValueError, IndexError, RuntimeError):
                continue
            group = meta['event_type']
            groups[group].append(features(f.excerpt))
            examples.append({'assertion_id': a.id, 'document_id': d.id, 'url': d.url, 'sha256': d.sha256,
                             'page': f.page, 'category': group, 'reviewer_type': a.reviewer_type})
    prototypes = {}
    for name, vectors in groups.items():
        centroid = Counter()
        for vector in vectors:
            centroid.update(vector)
        norm = math.sqrt(sum(v*v for v in centroid.values())) or 1
        prototypes[name] = {k: v/norm for k, v in sorted(centroid.items())}
    data = {'algorithm': 'character-bigram-nearest-centroid-v1', 'trained_at': now(), 'sample_count': len(examples),
            'human_reviewed_count': sum(x['reviewer_type'] == 'human' for x in examples),
            'evaluation': '未做独立验证；不提供准确率', 'limitation': LIMITATION,
            'training_digest': hashlib.sha256(json.dumps(examples, sort_keys=True).encode()).hexdigest(),
            'examples': examples, 'prototypes': prototypes}
    MODEL.parent.mkdir(parents=True, exist_ok=True)
    tmp = MODEL.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    tmp.replace(MODEL)
    return {k: v for k, v in data.items() if k not in {'examples', 'prototypes'}}


def reference(text):
    if not MODEL.exists():
        return {'status': 'not_trained', 'sample_count': 0, 'matches': [], 'limitation': LIMITATION}
    try:
        model = json.loads(MODEL.read_text(encoding='utf-8'))
        vector = features(text)
        scores = sorted(((sum(vector.get(k, 0)*v for k, v in proto.items()), label) for label, proto in model['prototypes'].items()), reverse=True)
        matched = [label for score, label in scores if score >= .28][:2]
        return {'status': 'trained_topic_router' if model['sample_count'] else 'insufficient_samples', **{k: model[k] for k in ('trained_at', 'algorithm', 'sample_count', 'human_reviewed_count', 'evaluation', 'training_digest', 'limitation')},
                'matches': [{'category': label, **REVIEW_RULES.get(label, {}), 'examples': [e for e in model['examples'] if e['category'] == label][:2]} for label in matched]}
    except (ValueError, KeyError, OSError):
        return {'status': 'unavailable', 'sample_count': 0, 'matches': [], 'limitation': LIMITATION}


if __name__ == '__main__':
    print(json.dumps(train(), ensure_ascii=False, indent=2))
