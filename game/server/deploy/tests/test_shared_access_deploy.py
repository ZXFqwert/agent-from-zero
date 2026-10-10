"""Deployment filesystem/commands/status are isolated fakes; no service/network."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import sys
from types import SimpleNamespace

import pytest


DEPLOY = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def upgrade(tmp_path, monkeypatch):
    module = load('shared_upgrade_test', DEPLOY / 'upgrade-shared-access.py')
    base, config, database = tmp_path / 'base', tmp_path / 'service.env', tmp_path / 'state.sqlite3'
    base.mkdir()
    original = b'# private fake environment\r\nMODEL_BASE_URL=https://invalid.example/v1\r\nMODEL_NAME=fake-only\r\nMODEL_API_KEY="test-only-secret-retain-exactly"\r\nLAB_MAX_STEPS=8\r\n'
    config.write_bytes(original)
    with sqlite3.connect(database) as db:
        db.executescript("CREATE TABLE runs(id TEXT PRIMARY KEY,status TEXT,inflight INTEGER); CREATE TABLE tokens(id TEXT); INSERT INTO tokens VALUES('old-token-digest'); PRAGMA user_version=2;")
    target, runtime = base / 'releases/20261010-191901', base / 'venvs/20261010-191901'
    previous, previous_runtime = base / 'releases/20261003-190302', base / 'venvs/20261003-190302'
    monkeypatch.setattr(module, 'BASE', base)
    monkeypatch.setattr(module, 'CONFIG', config)
    monkeypatch.setattr(module, 'DATABASE', database)
    monkeypatch.setattr(module.os, 'O_NOFOLLOW', getattr(os, 'O_NOFOLLOW', 0), raising=False)
    monkeypatch.setattr(module.os, 'chown', lambda *args: None, raising=False)
    monkeypatch.setattr(module, 'validate', lambda *args: (target, runtime, previous, previous_runtime, original))
    monkeypatch.setattr(module, 'secure', lambda *args, **kwargs: None)
    monkeypatch.setattr(module.time, 'sleep', lambda seconds: None)
    links = {'current': previous, 'venv': previous_runtime}
    monkeypatch.setattr(module, 'replace_link', lambda name, path: links.update({name: path}))
    commands, health = [], {'initial': True, 'fail': False, 'busy': False}

    def command(args):
        commands.append(args)
        if args[1] == 'start' and links['current'] == target:
            # Simulate startup migration and a newly issued browser session.
            with sqlite3.connect(database) as db:
                db.execute('PRAGMA user_version=3')
                db.execute("INSERT INTO tokens VALUES('new-shared-token-digest')")

    def status():
        if health['initial']:
            health['initial'] = False
            return {'enabled': True, 'busy': health['busy']}
        return {'enabled': True, 'access_enabled': not health['fail'], 'busy': False}

    monkeypatch.setattr(module, 'command', command)
    monkeypatch.setattr(module, 'status', status)
    module.test = SimpleNamespace(base=base, config=config, database=database, original=original, links=links,
                                  commands=commands, health=health, target=target, runtime=runtime,
                                  previous=previous, previous_runtime=previous_runtime, command=command)
    return module


def activate(module):
    return module.upgrade('20261010-191901', '20261003-190302', module.digest(module.test.original), 'zhouxingfu')


def assert_disabled_original(module):
    values = module.environment_values(module.test.config.read_bytes())
    assert values['MODEL_NAME'] == ''
    assert values['MODEL_API_KEY'] == 'test-only-secret-retain-exactly'
    assert module.test.links == {'current': module.test.previous, 'venv': module.test.previous_runtime}
    assert b'MODEL_API_KEY="test-only-secret-retain-exactly"\r\n' in module.test.config.read_bytes()


def test_upgrade_succeeds_with_private_exact_environment_and_sqlite_backup(upgrade):
    result = activate(upgrade)
    assert result['upgraded'] is True
    assert result['access_enabled'] is True
    assert 'test-only-secret-retain-exactly' not in json.dumps(result)
    assert upgrade.test.links == {'current': upgrade.test.target, 'venv': upgrade.test.runtime}
    values = upgrade.environment_values(upgrade.test.config.read_bytes())
    assert values['LAB_ACCESS_PASSPHRASE'] == 'zhouxingfu'
    assert values['MODEL_API_KEY'] == 'test-only-secret-retain-exactly'
    backup = upgrade.test.base / 'upgrade-backups/20261010-191901'
    assert (backup / 'environment.original').read_bytes() == upgrade.test.original
    with sqlite3.connect(backup / 'lab.before.sqlite3') as db:
        assert db.execute('SELECT COUNT(*) FROM tokens').fetchone()[0] == 1
        assert db.execute('PRAGMA user_version').fetchone()[0] == 2
    with sqlite3.connect(upgrade.test.database) as db:
        assert db.execute('SELECT COUNT(*) FROM tokens').fetchone()[0] == 2
        assert db.execute('PRAGMA user_version').fetchone()[0] == 3
    if os.name != 'nt':
        assert stat.S_IMODE(backup.stat().st_mode) == 0o700
        assert all(stat.S_IMODE(file.stat().st_mode) == 0o600 for file in backup.iterdir())
    assert [args[1] for args in upgrade.test.commands] == ['is-active', 'stop', 'start']


def test_busy_service_rejected_before_any_stop_config_or_backup(upgrade):
    upgrade.test.health['busy'] = True
    with pytest.raises(ValueError, match='idle'):
        activate(upgrade)
    assert upgrade.test.commands == []
    assert upgrade.test.config.read_bytes() == upgrade.test.original
    assert not (upgrade.test.base / 'upgrade-backups').exists()


def test_failed_health_keeps_new_sessions_and_restores_disabled_old_runtime(upgrade):
    upgrade.test.health['fail'] = True
    with pytest.raises(RuntimeError, match='model creation disabled'):
        activate(upgrade)
    assert_disabled_original(upgrade)
    with sqlite3.connect(upgrade.test.database) as db:
        assert db.execute('PRAGMA user_version').fetchone()[0] == 3
        assert db.execute('SELECT COUNT(*) FROM tokens').fetchone()[0] == 2
    assert [args[1] for args in upgrade.test.commands] == ['is-active', 'stop', 'start', 'stop', 'start']


def test_corrupt_database_cannot_block_failure_disable_and_restore(upgrade):
    upgrade.test.database.write_bytes(b'not-a-sqlite-file')
    with pytest.raises(RuntimeError, match='model creation disabled'):
        activate(upgrade)
    assert_disabled_original(upgrade)
    assert upgrade.test.database.read_bytes() == b'not-a-sqlite-file'


def test_activity_race_after_stop_defers_switch_without_reverting_records(upgrade):
    with sqlite3.connect(upgrade.test.database) as db:
        db.execute("INSERT INTO runs VALUES('race-run','active',1)")
    with pytest.raises(RuntimeError, match='model creation disabled'):
        activate(upgrade)
    assert_disabled_original(upgrade)
    with sqlite3.connect(upgrade.test.database) as db:
        assert db.execute("SELECT status,inflight FROM runs WHERE id='race-run'").fetchone() == ('active', 1)
        assert db.execute('SELECT COUNT(*) FROM tokens').fetchone()[0] == 1


def test_metadata_write_failure_keeps_database_migration_and_new_sessions(upgrade, monkeypatch):
    original = upgrade.private_file

    def write(path, data):
        if path.name == 'upgrade.json':
            raise OSError('fake-full-disk')
        original(path, data)

    monkeypatch.setattr(upgrade, 'private_file', write)
    with pytest.raises(RuntimeError, match='model creation disabled'):
        activate(upgrade)
    assert_disabled_original(upgrade)
    with sqlite3.connect(upgrade.test.database) as db:
        assert db.execute('SELECT COUNT(*) FROM tokens').fetchone()[0] == 2


def test_parallel_config_change_is_preserved_while_old_creation_is_disabled(upgrade, monkeypatch):
    original = upgrade.backup_database

    def backup(path):
        original(path)
        upgrade.test.config.write_bytes(upgrade.test.original.replace(b'test-only-secret-retain-exactly', b'rotated-test-secret'))

    monkeypatch.setattr(upgrade, 'backup_database', backup)
    with pytest.raises(RuntimeError, match='model creation disabled'):
        activate(upgrade)
    values = upgrade.environment_values(upgrade.test.config.read_bytes())
    assert values['MODEL_API_KEY'] == 'rotated-test-secret'
    assert values['MODEL_NAME'] == ''
    assert upgrade.test.links['current'] == upgrade.test.previous


@pytest.mark.parametrize('phrase', ['', 'x\nMODEL_NAME=override', 'x"', 'x' * 129])
def test_invalid_passphrase_is_rejected_before_mutations(upgrade, phrase):
    with pytest.raises(ValueError):
        upgrade.upgrade('20261010-191901', '20261003-190302', upgrade.digest(upgrade.test.original), phrase)
    assert upgrade.test.commands == []
    assert upgrade.test.config.read_bytes() == upgrade.test.original


@pytest.mark.parametrize('config', [b'MODEL_NAME=one\nMODEL_NAME=two\n', b'MODEL_NAME="unterminated\n', b'MODEL_NAME=value\\\n', b'export MODEL_NAME=fake\n', b'MODEL_NAME=x\x00\n'])
def test_ambiguous_environment_rejected_without_echoing_secrets(upgrade, config):
    with pytest.raises(ValueError) as error:
        upgrade.environment_values(config)
    assert 'one' not in str(error.value)
    assert config.decode('utf-8', errors='replace') not in str(error.value)


def test_prepared_manifest_verifier_rejects_tampering_and_unknown_files(upgrade, tmp_path):
    release = tmp_path / 'prepared'
    release.mkdir()
    files = []
    for name in upgrade.RUNTIME_FILES:
        file = release / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(b'fake-reviewed-runtime')
        files.append({'path': name, 'bytes': file.stat().st_size, 'sha256': upgrade.digest(file.read_bytes())})
    manifest = {'version': 1, 'kind': 'runtime', 'release_id': '20261010-191901', 'files': files}
    path = release / 'BUNDLE-MANIFEST.json'
    path.write_text(json.dumps(manifest), encoding='utf-8')
    upgrade.verify_release(release, '20261010-191901')
    (release / 'agent_lab/app.py').write_bytes(b'tampered')
    with pytest.raises(ValueError, match='bytes'):
        upgrade.verify_release(release, '20261010-191901')
    files[0]['path'] = '../outside'
    path.write_text(json.dumps(manifest), encoding='utf-8')
    with pytest.raises(ValueError, match='allowlist'):
        upgrade.verify_release(release, '20261010-191901')


@pytest.fixture
def proxy(tmp_path, monkeypatch):
    if os.name == 'nt':
        monkeypatch.setitem(sys.modules, 'fcntl', SimpleNamespace(LOCK_EX=2, flock=lambda *args: None))
    module = load('shared_proxy_test', DEPLOY / 'shared-access-proxy.py')
    core = load('reviewed_proxy_test', DEPLOY / 'site-proxy.py')
    base = tmp_path / 'base'
    base.mkdir()
    site = tmp_path / 'site.conf'
    # The reviewed original installer renders exactly the legacy installed proxy.
    static = b'server {\n    server_name agent.li33.art;\n}\nserver {\n    listen 443 ssl http2;\n    server_name agent.li33.art;\n    location / { try_files $uri $uri/ =404; }\n}\n'
    legacy = core.render(static)
    site.write_bytes(legacy)
    monkeypatch.setattr(core, 'BASE', base)
    monkeypatch.setattr(core, 'SITE', site)
    monkeypatch.setattr(core, 'render', module.render)
    monkeypatch.setattr(core, 'check_paths', lambda: None)
    monkeypatch.setattr(core.os, 'chown', lambda *args: None, raising=False)
    monkeypatch.setattr(module, 'BASE', base)
    monkeypatch.setattr(module, 'SITE', site)
    monkeypatch.setattr(module, 'trusted', lambda *args, **kwargs: None)
    monkeypatch.setattr(module.os, 'O_NOFOLLOW', getattr(os, 'O_NOFOLLOW', 0), raising=False)
    # Model just the root-owned lock; preserve real directory identities for cleanup.
    real_fstat = module.os.fstat
    def lock_fstat(fd):
        info = real_fstat(fd)
        lock = base / 'nginx-proxy.lock'
        if lock.exists() and os.path.samestat(info, lock.stat()):
            values = list(info)
            values[0], values[3], values[4], values[5] = stat.S_IFREG | 0o600, 1, 0, 0
            return os.stat_result(values)
        return info
    monkeypatch.setattr(module.os, 'fstat', lock_fstat)
    calls, failures = [], {'reload': False}

    def command(args):
        calls.append(args)
        if failures['reload'] and args[:2] == ['/bin/systemctl', 'reload']:
            failures['reload'] = False
            raise RuntimeError('fake-reload-failure')

    monkeypatch.setattr(core, 'command', command)
    module.test = SimpleNamespace(core=core, base=base, site=site, original=legacy, calls=calls, failures=failures)
    return module


def test_proxy_only_adds_exact_access_zone_and_location(proxy):
    rendered = proxy.render(proxy.test.original)
    assert rendered.count(b'location = /api/lab/access {') == 1
    assert b'zone=agent_li33_lab_access:10m rate=5r/m;' in rendered
    assert b'limit_req zone=agent_li33_lab_access burst=3 nodelay;' in rendered
    # Removing the two additions reconstructs every original byte.
    assert rendered.replace(proxy.ACCESS_ZONE.encode(), b'').replace(proxy.ACCESS_LOCATION.encode(), b'') == proxy.test.original
    for directive in ('client_max_body_size 8k;', 'proxy_read_timeout 10s;', 'proxy_send_timeout 10s;', 'no-store', 'nosniff'):
        assert directive in proxy.ACCESS_LOCATION


def test_proxy_success_and_independent_rollback_preserve_exact_original(proxy):
    before = hashlib.sha256(proxy.test.original).hexdigest()
    proxy.deploy('apply', '20261010-191901', before, proxy.test.core)
    installed = proxy.test.site.read_bytes()
    assert installed != proxy.test.original
    assert (proxy.test.base / 'nginx-backups/20261010-191901.original.conf').read_bytes() == proxy.test.original
    proxy.deploy('rollback', '20261010-191901', hashlib.sha256(installed).hexdigest(), proxy.test.core)
    assert proxy.test.site.read_bytes() == proxy.test.original


def test_proxy_reload_failure_restores_original_bytes_and_reloads_original(proxy):
    proxy.test.failures['reload'] = True
    with pytest.raises(RuntimeError, match='reload'):
        proxy.deploy('apply', '20261010-191901', hashlib.sha256(proxy.test.original).hexdigest(), proxy.test.core)
    assert proxy.test.site.read_bytes() == proxy.test.original
    assert sum(args[:2] == ['/bin/systemctl', 'reload'] for args in proxy.test.calls) == 2


def test_proxy_wrong_expected_sha_and_duplicate_access_do_not_mutate(proxy):
    with pytest.raises(ValueError, match='SHA'):
        proxy.deploy('apply', '20261010-191901', '0' * 64, proxy.test.core)
    assert proxy.test.calls == []
    assert proxy.test.site.read_bytes() == proxy.test.original
    with pytest.raises(ValueError, match='layout'):
        proxy.render(proxy.render(proxy.test.original))


def test_proxy_rejects_modified_trusted_core_before_import(proxy, tmp_path, monkeypatch):
    altered = tmp_path / 'altered.py'
    altered.write_text('raise AssertionError("must not execute")', encoding='utf-8')
    monkeypatch.setattr(proxy, 'CORE', altered)
    with pytest.raises(ValueError, match='SHA'):
        proxy.load_core()
    assert hashlib.sha256((DEPLOY / 'site-proxy.py').read_bytes()).hexdigest() == proxy.CORE_SHA
