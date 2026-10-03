"""Static UI with a narrow SPA fallback; API and unknown asset 404s stay intact."""
from pathlib import Path
import re
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.middleware.gzip import GZipMiddleware
from app.main import app

class ConsumerStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or scope['method'] not in ('GET', 'HEAD'):
                raise
            if re.fullmatch(r'(story|method|examples/gym-card|investigations/new|investigations/[^/.]+/(identity|evidence|report))/?', path.replace(chr(92), '/')):
                return await super().get_response('index.html', scope)
            raise

dist = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
# Compress vector animation paths and bundles without buffering API job responses.
app.mount('/', GZipMiddleware(ConsumerStaticFiles(directory=dist, html=True), minimum_size=1024), name='public-ui')
