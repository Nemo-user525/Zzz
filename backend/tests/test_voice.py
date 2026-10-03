import io
import json
import sys
import types
import wave

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.api import voice
from app.services import local_speech

app = FastAPI()
app.include_router(voice.router)
client = TestClient(app)


def wav_bytes(*, frames=1600, rate=16000, channels=1, width=2):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(width)
        wav.setframerate(rate)
        wav.writeframes(b"\0" * frames * width * channels)
    return output.getvalue()


@pytest.mark.parametrize("payload", [b"not a wave", wav_bytes(rate=48000), wav_bytes(channels=2), wav_bytes(width=1), wav_bytes()[:-10]], ids=["not-wav", "wrong-rate", "stereo", "wrong-width", "truncated"])
def test_reject_invalid_audio_before_model_load(monkeypatch, payload):
    monkeypatch.setattr(local_speech, "_get_backend", lambda: pytest.fail("Invalid audio must not load model"))
    response = client.post("/api/voice/transcribe", content=payload, headers={"Content-Type": "audio/wav"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_audio"


def test_empty_and_too_long_wavs_are_rejected():
    for frames, code, status in [(0, "no_speech", 422), (320001, "audio_too_long", 413)]:
        response = client.post("/api/voice/transcribe", content=wav_bytes(frames=frames), headers={"Content-Type": "audio/wav"})
        assert response.status_code == status
        assert response.json()["detail"]["code"] == code


def test_request_type_and_streamed_body_limit(monkeypatch):
    monkeypatch.setattr(local_speech, "transcribe", lambda _: pytest.fail("Oversized request must not transcribe"))
    assert client.post("/api/voice/transcribe", content=b"audio").status_code == 415
    response = client.post("/api/voice/transcribe", content=iter([b"a" * 400000, b"b" * 400000]), headers={"Content-Type": "audio/wav"})
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "audio_too_large"


def decoder(monkeypatch, result="杭州 乐刻 健身房", failure=False):
    class Recognizer:
        def __init__(self, model, rate):
            assert rate == 16000
        def AcceptWaveform(self, chunk):
            if failure:
                raise RuntimeError("private native library path")
            return False
        def FinalResult(self):
            return json.dumps({"text": result})
    monkeypatch.setattr(local_speech, "_get_backend", lambda: ("vosk", object()))
    monkeypatch.setitem(sys.modules, "vosk", types.SimpleNamespace(KaldiRecognizer=Recognizer))


def test_transcription_returns_chinese_text(monkeypatch):
    decoder(monkeypatch)
    response = client.post("/api/voice/transcribe", content=wav_bytes(), headers={"Content-Type": "audio/wav"})
    assert response.status_code == 200
    assert response.json()['text'] == '杭州乐刻健身房'
    assert response.json()['query'] == '乐刻健身房'
    assert response.json()['location'] == '杭州'
    assert response.json()['needs_clarification'] is False


def test_silence_is_explicit_not_success_with_empty_text(monkeypatch):
    decoder(monkeypatch, result="")
    response = client.post("/api/voice/transcribe", content=wav_bytes(), headers={"Content-Type": "audio/wav"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "no_speech"


def test_missing_model_is_actionable_and_does_not_disclose_paths(monkeypatch, tmp_path):
    monkeypatch.setattr(local_speech, "_model", None)
    monkeypatch.setattr(local_speech, "_sensevoice", None)
    monkeypatch.setattr(local_speech, "_backend", None)
    monkeypatch.setenv("XRAY_SENSEVOICE_MODEL_PATH", str(tmp_path / "private-sensevoice-directory"))
    monkeypatch.setenv("XRAY_VOSK_MODEL_PATH", str(tmp_path / "private-model-directory"))
    response = client.post("/api/voice/transcribe", content=wav_bytes(), headers={"Content-Type": "audio/wav"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "speech_not_configured"
    assert "private-model-directory" not in response.text


def test_failed_decoder_releases_slot_for_retry(monkeypatch):
    decoder(monkeypatch, failure=True)
    for _ in range(3):
        response = client.post("/api/voice/transcribe", content=wav_bytes(), headers={"Content-Type": "audio/wav"})
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "speech_failed"
        assert "private native" not in response.text
    decoder(monkeypatch)
    assert local_speech.transcribe(wav_bytes()) == "杭州乐刻健身房"


def test_busy_decoder_is_bounded(monkeypatch):
    slots = local_speech._recognition_slots
    assert slots.acquire(blocking=False)
    assert slots.acquire(blocking=False)
    try:
        monkeypatch.setattr(local_speech, "_get_backend", lambda: pytest.fail("Busy worker must not load model"))
        response = client.post("/api/voice/transcribe", content=wav_bytes(), headers={"Content-Type": "audio/wav"})
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "speech_busy"
    finally:
        slots.release()
        slots.release()


def test_sensevoice_is_preferred_and_reused(monkeypatch):
    model = object()
    calls = []
    monkeypatch.setattr(local_speech, "_backend", None)
    monkeypatch.setattr(local_speech, "_get_sensevoice", lambda: calls.append(True) or model)
    monkeypatch.setattr(local_speech, "_get_model", lambda: pytest.fail("Available SenseVoice must never use Vosk"))
    assert local_speech._get_backend() == ("sensevoice", model)
    assert local_speech._get_backend() == ("sensevoice", model)
    assert calls == [True]
    assert local_speech.get_backend_info() == {"engine": "sensevoice", "degraded": False, "engine_message": ""}


def test_vosk_fallback_is_explicit_and_only_for_unavailable_model(monkeypatch, caplog):
    monkeypatch.setattr(local_speech, "_backend", None)
    monkeypatch.setenv("XRAY_VOICE_ALLOW_VOSK_FALLBACK", "1")
    def unavailable():
        raise local_speech.SpeechError("speech_unavailable", "暂时不可用", 503)
    monkeypatch.setattr(local_speech, "_get_sensevoice", unavailable)
    monkeypatch.setattr(local_speech, "_get_model", lambda: object())
    assert local_speech._get_backend()[0] == "vosk"
    info = local_speech.get_backend_info()
    assert info["degraded"] is True
    assert "同音字" in info["engine_message"]
    assert "lower-accuracy Vosk fallback" in caplog.text


def test_disabling_fallback_preserves_setup_error(monkeypatch):
    monkeypatch.setattr(local_speech, "_backend", None)
    monkeypatch.setenv("XRAY_VOICE_ALLOW_VOSK_FALLBACK", "0")
    def unavailable():
        raise local_speech.SpeechError("speech_not_configured", "未配置", 503)
    monkeypatch.setattr(local_speech, "_get_sensevoice", unavailable)
    monkeypatch.setattr(local_speech, "_get_model", lambda: pytest.fail("Disabled fallback must not load"))
    with pytest.raises(local_speech.SpeechError) as error:
        local_speech._get_backend()
    assert error.value.code == "speech_not_configured"


def test_sensevoice_converts_pcm_and_keeps_streams_separate():
    import numpy as np
    streams = []
    class Recognizer:
        def create_stream(self):
            stream = types.SimpleNamespace(result=types.SimpleNamespace(text="<|zh|><|Speech|>蜜雪冰城。"))
            stream.accept_waveform = lambda rate, samples: streams.append((stream, rate, samples.copy()))
            return stream
        def decode_stream(self, stream):
            pass
    recognizer = Recognizer()
    pcm = np.array([-32768, 0, 32767], dtype="<i2").tobytes()
    assert local_speech._decode_sensevoice(recognizer, pcm) == "蜜雪冰城。"
    assert local_speech._decode_sensevoice(recognizer, pcm) == "蜜雪冰城。"
    assert streams[0][0] is not streams[1][0]
    assert streams[0][1] == 16000
    assert streams[0][2].dtype == np.float32
    assert streams[0][2][0] == -1
    assert 0.99 < streams[0][2][2] < 1


def test_neural_decoder_skips_digital_silence():
    assert local_speech._decode_sensevoice(None, b"\0" * 3200) == ""
