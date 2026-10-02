from fastapi import APIRouter, Query
from app.services import public_financials

router = APIRouter(prefix='/api/integrations/public-financials', tags=['public financials'])


@router.get('')
async def lookup(code: str = Query(pattern=public_financials.CODE.pattern, max_length=9)):
    return await public_financials.lookup(code)
