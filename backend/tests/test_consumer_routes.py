from fastapi.testclient import TestClient
from app.public_demo import app


def test_consumer_deep_links_and_private_paths():
    client = TestClient(app)
    for path in ['/method', '/story', '/examples/gym-card', '/investigations/new', '/investigations/test/identity', '/investigations/test/evidence', '/investigations/test/report']:
        response = client.get(path)
        assert response.status_code == 200, path
        assert '<div id="root">' in response.text
    for path in ['/missing.js', '/.env', '/api/invalid', '/investigations/../.env']:
        assert client.get(path).status_code == 404, path
