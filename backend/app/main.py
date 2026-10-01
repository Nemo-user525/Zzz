from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.api.routes import router
from app.db.models import Base, engine

app = FastAPI(title="X-Ray offline demo", version="1.0.0")
Base.metadata.create_all(engine)
app.include_router(router)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"code": "invalid_input", "message": "输入不合法，请检查金额、比例、日期和发货比例", "details": [{"field": ".".join(map(str, e["loc"])), "reason": e["msg"]} for e in exc.errors()]})


@app.exception_handler(StarletteHTTPException)
async def http_error(_request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"code": "http_error", "message": str(exc.detail), "details": []})
