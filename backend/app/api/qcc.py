from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field
from app.services import qcc

router = APIRouter(prefix='/api/integrations/qcc', tags=['企业联网查询'])


class LookupInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    query: str = Field(min_length=2, max_length=100, pattern=r'^[^\x00-\x1f\x7f]+$')


@router.get('/status')
def status(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    key, secret = qcc.credentials()
    return {'configured': bool(key and secret), 'provider': '企查查', 'api_code': '736', 'documentation_url': qcc.DOCS}


@router.post('/lookup')
async def lookup(body: LookupInput, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return await qcc.lookup(body.query)
