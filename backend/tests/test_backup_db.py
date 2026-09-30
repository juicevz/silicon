import importlib.util
from pathlib import Path
import sqlite3
import stat

import pytest


spec = importlib.util.spec_from_file_location(
    "backup_db", Path(__file__).resolve().parents[2] / "deploy" / "backup_db.py"
)
assert spec and spec.loader
backup_db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup_db)


def test_online_backup_restores_committed_wal_data(tmp_path):
    source, destination = tmp_path / "live.sqlite", tmp_path / "backups"
    with sqlite3.connect(source) as live:
        live.execute("PRAGMA journal_mode=WAL")
        live.execute("CREATE TABLE observations (price INTEGER)")
        live.execute("INSERT INTO observations VALUES (385)")
        live.commit()
        snapshot = backup_db.backup(source, destination)
        with sqlite3.connect(snapshot) as restored:
            assert restored.execute("SELECT price FROM observations").fetchall() == [(385,)]
            assert restored.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        live.execute("INSERT INTO observations VALUES (400)")
        live.commit()
        with sqlite3.connect(snapshot) as restored:
            assert restored.execute("SELECT COUNT(*) FROM observations").fetchone() == (1,)
    assert stat.S_IMODE(snapshot.stat().st_mode) == 0o600
    assert not list(destination.glob("*.tmp"))


def test_retention_preserves_manual_and_partial_backups(tmp_path):
    source, destination = tmp_path / "live.sqlite", tmp_path / "backups"
    with sqlite3.connect(source) as db:
        db.execute("CREATE TABLE observations (price INTEGER)")
    destination.mkdir()
    manual = destination / "before-release.sqlite"
    partial = destination / "daily-silicon-20260101T000000.000000Z.sqlite.tmp"
    manual.write_text("manual")
    partial.write_text("partial")
    snapshots = [backup_db.backup(source, destination, keep=2) for _ in range(3)]
    assert not snapshots[0].exists()
    assert all(path.exists() for path in snapshots[1:])
    assert manual.read_text() == "manual"
    assert partial.read_text() == "partial"


@pytest.mark.parametrize("corrupt", [False, True])
def test_failed_source_does_not_create_or_prune_a_backup(tmp_path, corrupt):
    source, destination = tmp_path / "live.sqlite", tmp_path / "backups"
    destination.mkdir()
    prior = destination / "daily-silicon-20260101T000000.000000Z.sqlite"
    prior.write_text("previous backup")
    if corrupt:
        source.write_text("not a SQLite database")
    with pytest.raises((FileNotFoundError, sqlite3.DatabaseError)):
        backup_db.backup(source, destination, keep=1)
    assert list(destination.iterdir()) == [prior]
    assert source.exists() == corrupt
