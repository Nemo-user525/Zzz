"""Bridge the existing FastAPI site to the local, streaming chat service."""

import os

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api")


class ChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    company: str = Field(default="", max_length=100)


def service_url() -> str:
    return os.getenv("CHAT_SERVICE_URL", "http://127.0.0.1:8787").rstrip("/")


@router.get("/chat-health")
async def chat_health():
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            response = await client.get(service_url() + "/api/health")
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError):
        return {"ok": False, "message": "对话服务未启动"}


@router.post("/chat")
async def chat(input: ChatInput):
    if not input.message.strip():
        raise HTTPException(status_code=422, detail="消息不能为空")

    client = httpx.AsyncClient(timeout=httpx.Timeout(120, connect=5))
    try:
        request = client.build_request("POST", service_url() + "/api/chat", json=input.model_dump())
        response = await client.send(request, stream=True)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(status_code=503, detail="对话服务暂时不可用") from exc

    async def events():
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
