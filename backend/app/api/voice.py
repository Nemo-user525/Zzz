"""Same-origin WAV transcription endpoint for the Xiao X microphone."""
from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.services import local_speech, voice_keywords

router = APIRouter(prefix="/api/voice", tags=["voice"])


def reject(code: str, message: str, status: int = 422):
    raise HTTPException(status_code=status, detail={"code": code, "message": message, "details": []})


@router.post("/transcribe")
async def transcribe(request: Request):
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() not in ("audio/wav", "audio/x-wav", "audio/wave"):
        reject("invalid_audio", "请使用 WAV 录音格式。", 415)
    declared_size = request.headers.get("content-length")
    if declared_size is not None:
        try:
            size = int(declared_size)
        except ValueError:
            reject("invalid_audio", "录音请求不完整，请重新录音。", 400)
        if size < 0:
            reject("invalid_audio", "录音请求不完整，请重新录音。", 400)
        if size > local_speech.MAX_WAV_BYTES:
            reject("audio_too_large", "录音最多支持 20 秒，请缩短后重试。", 413)
    payload = bytearray()
    async for chunk in request.stream():
        if len(payload) + len(chunk) > local_speech.MAX_WAV_BYTES:
            reject("audio_too_large", "录音最多支持 20 秒，请缩短后重试。", 413)
        payload.extend(chunk)
    try:
        text = await run_in_threadpool(local_speech.transcribe, bytes(payload))
    except local_speech.SpeechError as exc:
        reject(exc.code, exc.message, exc.status)
    return {"text": text, **local_speech.get_backend_info(), **await voice_keywords.extract(text)}
