"""Never let developer credentials or bundled demo credentials reach tests."""
import pytest


@pytest.fixture(autouse=True)
def isolated_qcc_credentials(monkeypatch, tmp_path):
    from app.services import consumer_qcc_mcp as mcp
    monkeypatch.setattr(mcp, 'BUNDLED_CONFIG', tmp_path / 'qcc-mcp.json')
    monkeypatch.setattr(mcp, 'LAST', {})
    monkeypatch.setenv('QCC_PROVIDER', 'direct')
    for name in ('QCC_MCP_URL', 'QCC_MCP_API_KEY', 'QCC_MCP_TOOLS'):
        monkeypatch.delenv(name, raising=False)
