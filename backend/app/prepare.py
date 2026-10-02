"""Prepare the configured local database and auditable topic references."""
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / '.env', override=False)
from app.main import app  # Register all additive tables, using the configured DB path.
from app.db.seed import seed
from app.services.consumer_criteria import train


if __name__ == '__main__':
    print(json.dumps({'seed': seed(), 'consumer_criteria': train()}, ensure_ascii=False, default=str))
