from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.api.routes import router
from app.db.models import Base, engine
from app.db.history import migrate
from app.api.history import router as history_router
from app.api.qcc import router as qcc_router
from app.api.public_financials import router as public_financials_router
from app.api.consumer import router as consumer_router
from app.api.company_research import router as company_research_router

app = FastAPI(title="X-Ray 企业变化解释器", version="1.1.0")
migrate()
app.include_router(router)
app.include_router(history_router)
app.include_router(qcc_router)
app.include_router(public_financials_router)
app.include_router(consumer_router)
app.include_router(company_research_router)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"code": "invalid_input", "message": "输入不合法，请检查查询条件或数值范围", "details": [{"field": ".".join(map(str, e["loc"])), "reason": e["msg"]} for e in exc.errors()]})


@app.exception_handler(StarletteHTTPException)
async def http_error(_request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"code": "http_error", "message": str(exc.detail), "details": []})
