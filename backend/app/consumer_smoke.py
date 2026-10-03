"""Opt-in real-network acceptance; output never substitutes production data.

PYTHONPATH=backend python -m app.consumer_smoke --query 乐刻 --company 杭州乐刻网络技术有限公司
Use --require-model to fail acceptance unless model synthesis actually succeeded.
"""
import argparse
import asyncio
import json
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / '.env', override=False)
from app.main import app  # Register the additive cache table before executing services.
from app.schemas.consumer import DiscoveryInput, AnalysisInput
from app.services.consumer import discovery, analysis


async def run(args):
    found = await discovery(DiscoveryInput(query=args.query,location=args.location))
    output = {'discovery':found.model_dump()}
    candidate = next((c for c in found.candidates if c.name==args.company),None)
    if candidate:
        result = await analysis(AnalysisInput(investigation_id=found.investigation_id,candidate_id=candidate.id))
        output['analysis']=result.model_dump()
    path=Path(args.output)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    result=output.get('analysis',{})
    print(json.dumps({'query':args.query,'discovery_mode':found.mode,'candidates':[c.name for c in found.candidates],
        'discovery_sources':len(found.sources),'analysis_mode':result.get('mode'),
        'analysis_sources':len(result.get('sources',[])), 'model_used':result.get('agent_model_used',False),
        'criteria_sample_count':result.get('criteria',{}).get('sample_count'),
        'risk':result.get('risk'), 'source_stats':result.get('source_stats'),
        'review_coverage':{k:v for k,v in result.get('reviews',{}).items() if k in {'status','collected_count','reviewed_count','counts'}},
        'cashflow_mode':result.get('cashflow',{}).get('mode'), 'output':str(path)},ensure_ascii=False,indent=2))
    if found.mode!='live_search' or not found.sources:
        return 1
    if args.company and not candidate:
        return 2
    if args.require_model and (not result.get('agent_model_used') or result.get('fallback') or not result.get('risk',{}).get('model_assessed') or not (any(i['agent_findings'] for i in result.get('indicators',[])) or result.get('risk',{}).get('reasons'))):
        return 3
    if args.require_model and (result.get('reviews',{}).get('status')!='completed' or result['reviews']['reviewed_count']!=result['reviews']['collected_count'] or not result.get('cashflow',{}).get('scenarios') or not result['risk'].get('confidence')):
        return 4
    return 0


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--query',required=True)
    parser.add_argument('--location',default='')
    parser.add_argument('--company',default='')
    parser.add_argument('--output',default='data/raw/consumer-live-check.json')
    parser.add_argument('--require-model',action='store_true')
    raise SystemExit(asyncio.run(run(parser.parse_args())))
