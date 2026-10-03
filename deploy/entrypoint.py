"""Prepare persistent state, then replace this process with one ASGI worker."""
import os
from pathlib import Path
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    port = int(os.environ.get("PORT", "8086"))
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be between 1 and 65535")
    storage = Path(os.environ.get("XRAY_STORAGE_PATH", root / "storage"))
    storage.mkdir(parents=True, exist_ok=True)
    # Persist generated research material and optional ASR models along with SQLite.
    for name in ("models", "raw"):
        destination = storage / name
        destination.mkdir(parents=True, exist_ok=True)
        link = root / "data" / name
        if not link.exists():
            link.symlink_to(destination, target_is_directory=True)
        elif link.is_dir() and not link.is_symlink() and not any(link.iterdir()):
            link.rmdir()
            link.symlink_to(destination, target_is_directory=True)
    os.environ.setdefault("XRAY_DB_PATH", str(storage / "xray.sqlite3"))
    os.environ.setdefault("PYTHONPATH", str(root / "backend"))
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        # New cloud disks can be root-owned even when image directories aren't.
        for directory in (storage, storage / "models", storage / "raw"):
            os.chown(directory, 10001, 10001)
        os.setgroups([])
        os.setgid(10001)
        os.setuid(10001)
    subprocess.run([sys.executable, "-m", "app.prepare"], check=True)
    if os.environ.get("XRAY_INSTALL_VOICE_MODEL", "0") == "1":
        subprocess.run([sys.executable, "backend/setup_voice.py"], check=True)
    # Jobs live in this process: multiple workers would route polling to the wrong job store.
    os.execv(sys.executable, [sys.executable, "-m", "uvicorn", "app.public_demo:app",
                             "--host", "0.0.0.0", "--port", str(port), "--workers", "1"])


if __name__ == "__main__":
    main()
