import importlib

import pytest

from app.config import settings


@pytest.fixture
def api_module(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    settings.cache_clear()
    module = importlib.import_module("app.main")
    module.store.close()
    module = importlib.reload(module)
    yield module
    module.store.close()
    settings.cache_clear()
