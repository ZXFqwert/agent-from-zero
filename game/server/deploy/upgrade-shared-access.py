"""Safely activate a prepared shared-access release of the existing lab.

No invitations or provider calls are made. Configuration is never printed.
Backups are private. Failure keeps all database history and disables new model
runs on the restored old runtime, which cannot enforce shared quota groups.
"""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import stat
import subprocess
import tempfile
import time
from urllib.request import urlopen
import uuid

BASE = Path('/opt/agent-game-lab')
CONFIG = Path('/etc/agent-game-lab.env')
STATE = Path('/var/lib/agent-game-lab')
DATABASE = STATE / 'lab.sqlite3'
UNIT = Path('/etc/systemd/system/agent-game-lab.service')
SERVICE = 'agent-game-lab.service'
STATUS_URL = 'http://127.0.0.1:8788/api/lab/status'
RUNTIME_FILES = {
    'README.md', 'requirements.txt', 'agent_lab/__init__.py', 'agent_lab/app.py',
    'agent_lab/config.py', 'agent_lab/experiments.py', 'agent_lab/invites.py',
    'agent_lab/provider.py', 'agent_lab/store.py', 'agent_lab/world.py',
    'deploy/agent-game-lab.service', 'deploy/nginx-api.conf.example',
    'deploy/prepare.sh', 'deploy/verify.py', 'deploy/activate-disabled.sh',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def secure(path, directory=False, owner=0, group=0, mode=None):
    if path.is_symlink() or not (path.is_dir() if directory else path.is_file()):
        raise ValueError('Unexpected deployment file or directory')
    info = path.stat()
    if info.st_uid != owner or info.st_gid != group or info.st_mode & 0o022:
        raise ValueError('Unexpected deployment owner or writable path')
    if mode is not None and stat.S_IMODE(info.st_mode) != mode:
        raise ValueError('Unexpected deployment permissions')
    if not directory and info.st_nlink != 1:
        raise ValueError('Refusing hard-linked deployment file')


def environment_values(data):
    if len(data) > 32768 or b'\x00' in data:
        raise ValueError('Invalid independent service configuration')
    values = {}
    for line in data.decode('utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, sep, value = line.partition('=')
        key, value = key.strip(), value.strip()
        if not sep or not re.fullmatch(r'[A-Z_][A-Z0-9_]*', key) or key in values or value.endswith('\\'):
            raise ValueError('Unsupported independent configuration format')
        if value.startswith(('"', "'")):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError('Unsupported independent configuration quoting')
            value = value[1:-1]
        values[key] = value
    return values


def set_environment(data, key, value):
    environment_values(data)  # Reject duplicate/ambiguous fields before editing.
    if not re.fullmatch(r'[A-Za-z0-9_.-]{0,128}', value):
        raise ValueError('Passphrase must use simple single-line characters')
    lines, replaced = [], False
    for line in data.decode('utf-8').splitlines(keepends=True):
        if line.partition('=')[0].strip() == key and '=' in line:
            ending = '\r\n' if line.endswith('\r\n') else '\n'
            lines.append(key + '=' + value + ending)
            replaced = True
        else:
            lines.append(line)
    if not replaced:
        if lines and not lines[-1].endswith(('\n', '\r')):
            lines.append('\n')
        lines.append(key + '=' + value + '\n')
    result = ''.join(lines).encode('utf-8')
    environment_values(result)
    return result


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30,
                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'})
    if result.returncode:
        raise RuntimeError('Service or isolated runtime command failed')


def status():
    with urlopen(STATUS_URL, timeout=5) as response:
        data = response.read(65537)
    if len(data) > 65536:
        raise ValueError('Unexpected service health response')
    result = json.loads(data)
    if not isinstance(result, dict) or not isinstance(result.get('enabled'), bool) or not isinstance(result.get('busy'), bool):
        raise ValueError('Unexpected service health response')
    return result


def release_path(release_id):
    if not re.fullmatch(r'[0-9]{8}-[0-9]{6}', release_id):
        raise ValueError('Invalid release identifier')
    return BASE / 'releases' / release_id, BASE / 'venvs' / release_id


def verify_release(release, release_id):
    secure(release, directory=True)
    manifest_path = release / 'BUNDLE-MANIFEST.json'
    secure(manifest_path)
    manifest = json.loads(manifest_path.read_bytes())
    if (manifest.get('version') != 1 or manifest.get('release_id') != release_id or manifest.get('kind') != 'runtime'
            or len(manifest.get('files', [])) != len(RUNTIME_FILES)
            or {item['path'] for item in manifest['files']} != RUNTIME_FILES):
        raise ValueError('Prepared runtime manifest differs from expected allowlist')
    for item in manifest['files']:
        name = PurePosixPath(item['path'])
        if name.is_absolute() or '..' in name.parts or str(name) != item['path']:
            raise ValueError('Unexpected runtime manifest path')
        file = release / item['path']
        if not file.resolve().is_relative_to(release.resolve()):
            raise ValueError('Runtime file escaped the prepared release')
        secure(file)
        data = file.read_bytes()
        if len(data) != item['bytes'] or digest(data) != item['sha256']:
            raise ValueError('Prepared runtime bytes differ from its manifest')


def verify_runtime(runtime):
    secure(runtime, directory=True)
    secure(runtime / 'bin', directory=True)
    secure(runtime / 'pyvenv.cfg')
    if 'include-system-site-packages = false' not in (runtime / 'pyvenv.cfg').read_text(encoding='utf-8'):
        raise ValueError('Unexpected virtual environment configuration')
    python = runtime / 'bin/python'
    if not python.is_file() or python.resolve() != Path('/usr/bin/python3').resolve():
        raise ValueError('Virtual environment interpreter differs from the system Python')
    secure(python.resolve())


def validate(release_id, expected_current, expected_config_sha):
    if os.geteuid() != 0 or not re.fullmatch(r'[a-f0-9]{64}', expected_config_sha):
        raise ValueError('Root and reviewed configuration SHA are required')
    target, runtime = release_path(release_id)
    previous, previous_runtime = release_path(expected_current)
    if release_id == expected_current:
        raise ValueError('Refusing an already active release')
    for directory in (BASE, BASE / 'releases', BASE / 'venvs', CONFIG.parent, UNIT.parent):
        secure(directory, directory=True)
    for name, expected in (('current', previous), ('venv', previous_runtime)):
        link = BASE / name
        if not link.is_symlink() or link.resolve() != expected:
            raise ValueError('Active deployment link differs from the expected release')
    verify_release(target, release_id)
    verify_release(previous, expected_current)
    verify_runtime(runtime)
    verify_runtime(previous_runtime)
    secure(CONFIG, mode=0o600)
    secure(UNIT)
    if UNIT.read_bytes() != (target / 'deploy/agent-game-lab.service').read_bytes():
        raise ValueError('Service unit differs from the prepared reviewed unit')
    original = CONFIG.read_bytes()
    if digest(original) != expected_config_sha:
        raise ValueError('Service configuration changed since review')
    values = environment_values(original)
    if not all(values.get(name) for name in ('MODEL_BASE_URL', 'MODEL_NAME', 'MODEL_API_KEY')):
        raise ValueError('Existing service must have an enabled model configuration')
    if values.get('LAB_DATABASE', str(DATABASE)) != str(DATABASE):
        raise ValueError('Service database differs from its dedicated state path')
    import pwd
    account = pwd.getpwnam('agent-game-lab')
    if account.pw_uid == 0 or account.pw_gid == 0:
        raise ValueError('Service must use its non-root dedicated account')
    secure(STATE, directory=True, owner=account.pw_uid, group=account.pw_gid, mode=0o700)
    secure(DATABASE, owner=account.pw_uid, group=account.pw_gid, mode=0o600)
    for suffix in ('-wal', '-shm'):
        file = Path(str(DATABASE) + suffix)
        if file.exists() or file.is_symlink():
            secure(file, owner=account.pw_uid, group=account.pw_gid, mode=0o600)
    command([str(runtime / 'bin/python'), '-I', '-c', 'import sys,fastapi,httpx,pydantic; assert sys.version_info >= (3,10)'])
    return target, runtime, previous, previous_runtime, original


def private_file(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def replace_config(data):
    fd, name = tempfile.mkstemp(prefix='.agent-game-lab-access-', dir=CONFIG.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o600)
        os.chown(name, 0, 0)
        os.replace(name, CONFIG)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def replace_link(name, target):
    temporary = BASE / ('.shared-access-' + name + '-' + uuid.uuid4().hex)
    try:
        os.symlink(str(target), temporary)
        os.replace(temporary, BASE / name)
    finally:
        if temporary.is_symlink():
            temporary.unlink()


def backup_database(destination):
    # SQLite's backup API includes committed WAL; do not copy only the main file.
    private_file(destination, b'')
    with closing(sqlite3.connect(DATABASE.resolve().as_uri() + '?mode=ro', uri=True)) as source:
        if source.execute("SELECT COUNT(*) FROM runs WHERE status='active' OR inflight=1").fetchone()[0]:
            raise ValueError('An experiment became active before service stop; upgrade deferred')
        with closing(sqlite3.connect(destination)) as backup:
            source.backup(backup)
            if backup.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise ValueError('Database backup integrity check failed')
    destination.chmod(0o600)


def upgrade(release_id, expected_current, expected_config_sha, passphrase):
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', passphrase):
        raise ValueError('Invalid simple shared passphrase')
    target, runtime, previous, previous_runtime, original = validate(release_id, expected_current, expected_config_sha)
    before = status()
    if not before['enabled'] or before['busy']:
        raise ValueError('Enabled service must be idle before upgrade')
    backups = BASE / 'upgrade-backups'
    if backups.exists() or backups.is_symlink():
        secure(backups, directory=True, mode=0o700)
    else:
        backups.mkdir(mode=0o700)
    folder = backups / release_id
    if folder.exists() or folder.is_symlink():
        raise ValueError('Refusing to overwrite prior private upgrade backups')
    folder.mkdir(mode=0o700)
    candidate = set_environment(original, 'LAB_ACCESS_PASSPHRASE', passphrase)
    private_file(folder / 'environment.original', original)
    command(['/bin/systemctl', 'is-active', '--quiet', SERVICE])
    try:
        command(['/bin/systemctl', 'stop', SERVICE])
        backup_database(folder / 'lab.before.sqlite3')
        if digest(CONFIG.read_bytes()) != expected_config_sha:
            raise ValueError('Configuration changed while preparing the private backup')
        replace_config(candidate)
        replace_link('current', target)
        replace_link('venv', runtime)
        command(['/bin/systemctl', 'start', SERVICE])
        healthy = None
        for _ in range(10):
            try:
                healthy = status()
                if healthy.get('enabled') is True and healthy.get('access_enabled') is True:
                    break
            except Exception:
                pass
            time.sleep(1)
        if not healthy or healthy.get('enabled') is not True or healthy.get('access_enabled') is not True:
            raise RuntimeError('New shared-access service did not become healthy')
        private_file(folder / 'upgrade.json', json.dumps({'release_id': release_id, 'previous_release': expected_current,
                     'original_config_sha256': expected_config_sha, 'database_backup_sha256': digest((folder / 'lab.before.sqlite3').read_bytes())}, indent=2).encode('utf-8'))
        return {'upgraded': True, 'release_id': release_id, 'previous_release': expected_current,
                'backup_directory': str(folder), 'enabled': True, 'access_enabled': True}
    except BaseException:
        # Keep the current DB (including any newly issued sessions). Old code can
        # read schema 3 but cannot enforce shared quotas; disable new model runs.
        try:
            command(['/bin/systemctl', 'stop', SERVICE])
        except Exception:
            pass
        current = CONFIG.read_bytes()
        restore = original if current in (original, candidate) else current
        replace_config(set_environment(restore, 'MODEL_NAME', ''))
        replace_link('current', previous)
        replace_link('venv', previous_runtime)
        try:
            command(['/bin/systemctl', 'start', SERVICE])
        except Exception:
            pass
        raise RuntimeError('Upgrade failed; old runtime restored with model creation disabled') from None


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('release_id')
    parser.add_argument('--expect-current', required=True)
    parser.add_argument('--expected-config-sha', required=True)
    parser.add_argument('--passphrase', default='zhouxingfu')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Run this reviewed upgrader as root')
    lock = BASE / 'upgrade.lock'
    secure(BASE, directory=True)
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            info = os.fstat(stream.fileno())
            if info.st_uid != 0 or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
                raise ValueError('Unexpected private upgrade lock')
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX)
            print(json.dumps(upgrade(args.release_id, args.expect_current, args.expected_config_sha, args.passphrase)))
    except Exception:
        print(json.dumps({'upgraded': False, 'error': 'shared_access_upgrade_failed'}))
        raise SystemExit(1) from None
