"""Install the pinned official offline Chinese ASR model, without uploading audio.

Run from repository root: .venv/Scripts/python.exe backend/setup_voice.py
Use --vosk only to provision the optional lower-accuracy availability fallback.
"""
import argparse
from pathlib import Path
import hashlib
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1] / "data/models"
MODELS = {
    "sensevoice": {
        "name": "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
        "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2",
        "sha256": "7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e",
        "files": ("model.int8.onnx", "tokens.txt"),
        "suffix": ".tar.bz2",
    },
    "vosk": {
        "name": "vosk-model-small-cn-0.22",
        "url": "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip",
        "sha256": "3af8b0e7e0f835ae9d414ce5df580237a3cfb08d586c9fbbb0f7ff29ad5b14ba",
        "files": ("am/final.mdl",),
        "suffix": ".zip",
    },
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vosk", action="store_true", help="Install the lower-accuracy fallback instead of SenseVoice")
    config = MODELS["vosk" if parser.parse_args().vosk else "sensevoice"]
    name = config["name"]
    ROOT.mkdir(parents=True, exist_ok=True)
    ready = ROOT / name / ".verified-sha256"
    files_ready = all((ROOT / name / filename).is_file() for filename in config["files"])
    if files_ready and ready.is_file() and ready.read_text().strip() == config["sha256"]:
        print(f"Voice model ready: {ROOT / name}")
        return
    archive = ROOT / f"{name}{config['suffix']}"
    if not archive.is_file():
        pending = archive.with_suffix(archive.suffix + ".part")
        with urllib.request.urlopen(config["url"], timeout=60) as source, pending.open("wb") as target:
            count = 0
            while chunk := source.read(1024 * 1024):
                count += len(chunk)
                if count > 300 * 1024 * 1024:
                    raise RuntimeError("Unexpected model archive size")
                target.write(chunk)
        pending.replace(archive)
    with archive.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if digest != config["sha256"]:
        raise RuntimeError("Model archive checksum does not match the pinned official release")
    print(f"Model archive SHA256: {digest}")
    if config["suffix"] == ".zip":
        with zipfile.ZipFile(archive) as zipped:
            for entry in zipped.infolist():
                destination = (ROOT / entry.filename).resolve()
                if not destination.is_relative_to(ROOT.resolve()) or entry.filename.split("/", 1)[0] != name:
                    raise RuntimeError("Unexpected archive path")
            zipped.extractall(ROOT)
    else:
        with tarfile.open(archive) as zipped:
            for entry in zipped.getmembers():
                destination = (ROOT / entry.name).resolve()
                if not destination.is_relative_to(ROOT.resolve()) or entry.name.split("/", 1)[0] != name:
                    raise RuntimeError("Unexpected archive path")
            zipped.extractall(ROOT, filter="data")
    if not all((ROOT / name / filename).is_file() for filename in config["files"]):
        raise RuntimeError("Model archive is incomplete")
    ready.write_text(config["sha256"] + "\n")
    print(f"Voice model ready: {ROOT / name}")


if __name__ == "__main__":
    main()
