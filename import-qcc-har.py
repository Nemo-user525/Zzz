"""Local-only adapter for an operator's authorized QCC browser export."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent/'backend'))
from app.services.consumer_qcc_web import extract_har, save

def main():
    parser=argparse.ArgumentParser(description='从本人有权访问的企查查 HAR 响应提取企业字段；不重放请求，不保存凭据。')
    parser.add_argument('--file',required=True)
    parser.add_argument('--company',required=True)
    args=parser.parse_args()
    path=Path(args.file)
    if path.stat().st_size>32*1024*1024:parser.error('HAR 超过 32MB，请仅导出公司资料请求。')
    rows=extract_har(json.loads(path.read_text(encoding='utf-8-sig')),args.company)
    if not rows:
        print('未找到精确匹配公司且含工商字段的成功 JSON 响应；没有导入记录。')
        return 1
    save(rows)
    print(f'已导入 {len(rows)} 条企业字段记录。原始 HAR 和认证信息均未复制，资料标注为未在线复验。')
    return 0

if __name__=='__main__':raise SystemExit(main())
