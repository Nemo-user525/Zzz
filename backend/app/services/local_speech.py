"""Bounded, offline Chinese speech recognition; audio is only kept in memory."""
from __future__ import annotations

import io
import json
import logging
import os
from pathlib import Path
import re
import threading
import wave

SAMPLE_RATE = 16_000
MAX_SECONDS = 20
MAX_WAV_BYTES = SAMPLE_RATE * 2 * MAX_SECONDS + 65_536
DEFAULT_MODEL = Path(__file__).resolve().parents[3] / "data/models/vosk-model-small-cn-0.22"
DEFAULT_SENSEVOICE = Path(__file__).resolve().parents[3] / "data/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17"
_model = None
_sensevoice = None
_backend = None
_model_lock = threading.Lock()
_backend_lock = threading.Lock()
_inference_lock = threading.Lock()
_recognition_slots = threading.BoundedSemaphore(2)
logger = logging.getLogger(__name__)


class SpeechError(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def read_pcm(payload: bytes) -> bytes:
    """Validate WAV metadata and actual PCM length before loading a model."""
    if len(payload) > MAX_WAV_BYTES:
        raise SpeechError("audio_too_large", "录音最多支持 20 秒，请缩短后重试。", 413)
    try:
        with wave.open(io.BytesIO(payload), "rb") as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, SAMPLE_RATE, "NONE"):
                raise SpeechError("invalid_audio", "录音格式不正确，请重新点击小 X 录音。")
            frames = wav.getnframes()
            if frames <= 0:
                raise SpeechError("no_speech", "没有听到声音，请靠近麦克风再试一次。")
            if frames > SAMPLE_RATE * MAX_SECONDS:
                raise SpeechError("audio_too_long", "录音最多支持 20 秒，请缩短后重试。", 413)
            pcm = wav.readframes(frames)
            if len(pcm) != frames * 2:
                raise SpeechError("invalid_audio", "录音数据不完整，请重新点击小 X 录音。")
            return pcm
    except (wave.Error, EOFError, ValueError) as exc:
        raise SpeechError("invalid_audio", "无法读取这段录音，请重新点击小 X 录音。") from exc


def _native_path(path: Path) -> str:
    native_path = str(path)
    if os.name == "nt" and not native_path.isascii():
        relative_path = os.path.relpath(path)
        if relative_path.isascii():
            native_path = relative_path
    return native_path


def _get_sensevoice():
    global _sensevoice
    with _model_lock:
        if _sensevoice is not None:
            return _sensevoice
        model_path = Path(os.environ.get("XRAY_SENSEVOICE_MODEL_PATH", str(DEFAULT_SENSEVOICE)))
        if not all((model_path / filename).is_file() for filename in ("model.int8.onnx", "tokens.txt")):
            raise SpeechError("speech_not_configured", "中文语音识别模型尚未准备好，请稍后重试或输入文字。", 503)
        try:
            import sherpa_onnx
            _sensevoice = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                model=_native_path(model_path / "model.int8.onnx"),
                tokens=_native_path(model_path / "tokens.txt"),
                num_threads=2,
                sample_rate=SAMPLE_RATE,
                language="zh",
                use_itn=True,
                provider="cpu",
                debug=False,
            )
        except Exception as exc:
            raise SpeechError("speech_unavailable", "中文语音识别服务暂时不可用，请稍后重试或输入文字。", 503) from exc
        return _sensevoice


def _get_model():
    """Load the lower-accuracy legacy recognizer only as an availability fallback."""
    global _model
    with _model_lock:
        if _model is not None:
            return _model
        model_path = Path(os.environ.get("XRAY_VOSK_MODEL_PATH", str(DEFAULT_MODEL)))
        if not (model_path / "am/final.mdl").is_file():
            raise SpeechError("speech_not_configured", "语音识别服务尚未准备好，请稍后重试或输入文字。", 503)
        try:
            import vosk
            vosk.SetLogLevel(-1)
            # Vosk's Windows native loader does not accept UTF-8 absolute paths.
            # A relative ASCII path works when the project directory is Chinese.
            _model = vosk.Model(_native_path(model_path))
        except Exception as exc:
            # Do not expose host paths, native loader errors, or recordings to clients.
            raise SpeechError("speech_unavailable", "语音识别服务暂时不可用，请稍后重试或输入文字。", 503) from exc
        return _model


def _get_backend():
    global _backend
    with _backend_lock:
        if _backend is not None:
            return _backend
        try:
            _backend = ("sensevoice", _get_sensevoice())
        except SpeechError:
            if os.environ.get("XRAY_VOICE_ALLOW_VOSK_FALLBACK", "1") != "1":
                raise
            _backend = ("vosk", _get_model())
            logger.warning("SenseVoice unavailable; using lower-accuracy Vosk fallback.")
        return _backend


def get_backend_info() -> dict:
    """Expose degraded recognition explicitly, without loading a model or paths."""
    name = _backend[0] if _backend is not None else "unloaded"
    degraded = name == "vosk"
    return {
        "engine": name,
        "degraded": degraded,
        "engine_message": "当前使用基础语音识别，店名可能出现同音字，请核对。" if degraded else "",
    }


def _decode_sensevoice(recognizer, pcm: bytes) -> str:
    import numpy as np
    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
    # Suppress empty/near-digital-silence hallucinations before neural decoding.
    if float(np.max(np.abs(samples))) <= 16 / 32768:
        return ""
    # The model is shared; separate streams keep utterances isolated. Serialize
    # inference because the native recognizer does not promise concurrent decode.
    with _inference_lock:
        stream = recognizer.create_stream()
        stream.accept_waveform(SAMPLE_RATE, samples)
        recognizer.decode_stream(stream)
        return re.sub(r"<\|[^|]*\|>", "", stream.result.text).strip()


def _decode_vosk(model, pcm: bytes) -> str:
    from vosk import KaldiRecognizer
    recognizer = KaldiRecognizer(model, SAMPLE_RATE)
    pieces: list[str] = []
    for offset in range(0, len(pcm), 8_000):
        if recognizer.AcceptWaveform(pcm[offset:offset + 8_000]):
            pieces.append(json.loads(recognizer.Result()).get("text", ""))
    pieces.append(json.loads(recognizer.FinalResult()).get("text", ""))
    return " ".join(pieces).strip()


def transcribe(payload: bytes) -> str:
    pcm = read_pcm(payload)
    if not _recognition_slots.acquire(blocking=False):
        raise SpeechError("speech_busy", "小 X 正在处理语音，请稍等片刻再试。", 503)
    try:
        name, model = _get_backend()
        raw = _decode_sensevoice(model, pcm) if name == "sensevoice" else _decode_vosk(model, pcm)
        text = re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", raw)
        if not text:
            raise SpeechError("no_speech", "没有听清，请靠近麦克风，再说一次门店名称。")
        return text
    except SpeechError:
        raise
    except Exception as exc:
        raise SpeechError("speech_failed", "这段语音没能识别，请再试一次或输入文字。", 503) from exc
    finally:
        _recognition_slots.release()
