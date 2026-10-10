"""Add this site's shared login limiter using the reviewed proxy installer.

The original installer provides preflight, exact private backup, atomic site
replacement and exact byte restoration on test/reload failure. It is loaded
only from the fixed root-owned path and only at its reviewed source SHA.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat

BASE = Path('/opt/agent-game-lab')
CORE = BASE / 'deploy-tools/site-proxy.py'
CORE_SHA = 'b6a73479b0eee4c5e6489a14924919263c8c7fcc8a965c6de996fafe93dc703a'
SITE = Path('/etc/nginx/sites-available/agent.li33.art')
ENABLED = Path('/etc/nginx/sites-enabled/agent.li33.art')
INVITE_ZONE = 'limit_req_zone $binary_remote_addr zone=agent_li33_lab_invites:10m rate=5r/m;\n'
ACCESS_ZONE = 'limit_req_zone $binary_remote_addr zone=agent_li33_lab_access:10m rate=5r/m;\n'
ANCHOR = '    location = /api/lab/redeem {'
ACCESS_LOCATION = '''    # Shared access; separate from the legacy invitation limiter
    location = /api/lab/access {
        limit_req zone=agent_li33_lab_access burst=3 nodelay;
        limit_req_status 429;
        client_max_body_size 8k;
        proxy_pass http://127.0.0.1:8788;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
        add_header Cache-Control "no-store" always;
        add_header X-Content-Type-Options nosniff always;
    }
'''


def render(original):
    text = original.decode('utf-8')
    if (text.count(INVITE_ZONE) != 1 or text.count(ANCHOR) != 1
            or text.count('server_name agent.li33.art;') != 2
            or text.count('    location ^~ /api/lab/ {') != 1
            or 'listen 443 ssl http2;' not in text
            or '/api/lab/access' in text or 'agent_li33_lab_access' in text):
        raise ValueError('Site layout differs from the reviewed lab proxy')
    return text.replace(INVITE_ZONE, INVITE_ZONE + ACCESS_ZONE).replace(ANCHOR, ACCESS_LOCATION + ANCHOR).encode('utf-8')


def trusted(path, directory=False, private=False):
    if path.is_symlink() or not (path.is_dir() if directory else path.is_file()):
        raise ValueError('Unexpected trusted deployment path')
    info = path.stat()
    expected = 0o700 if directory else 0o600
    if info.st_uid != 0 or info.st_gid != 0 or info.st_mode & 0o022:
        raise ValueError('Deployment path must be root-owned and non-writable')
    if private and stat.S_IMODE(info.st_mode) != expected:
        raise ValueError('Deployment backup must be private')
    if not directory and info.st_nlink != 1:
        raise ValueError('Refusing hard-linked deployment file')


def load_core():
    trusted(BASE, directory=True)
    trusted(CORE.parent, directory=True)
    trusted(CORE)
    data = CORE.read_bytes()
    if hashlib.sha256(data).hexdigest() != CORE_SHA:
        raise ValueError('Trusted proxy installer SHA differs from reviewed code')
    spec = importlib.util.spec_from_file_location('agent_lab_reviewed_proxy', CORE)
    core = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(core)
    if core.BASE != BASE or core.SITE != SITE or core.ENABLED != ENABLED:
        raise ValueError('Trusted proxy installer paths differ')
    core.render = render
    return core


def deploy(operation, release_id, expected_sha, core=None):
    if not re.fullmatch(r'[0-9]{8}-[0-9]{6}', release_id) or not re.fullmatch(r'[a-f0-9]{64}', expected_sha):
        raise ValueError('Invalid release identifier or expected SHA')
    core = core or load_core()
    core.check_paths()
    trusted(SITE.parent, directory=True)
    backups = BASE / 'nginx-backups'
    if backups.exists() or backups.is_symlink():
        trusted(backups, directory=True, private=True)
    if operation == 'rollback':
        trusted(backups / (release_id + '.original.conf'), private=True)
        trusted(backups / (release_id + '.json'), private=True)
    elif operation != 'apply':
        raise ValueError('Invalid proxy operation')
    lock = BASE / 'nginx-proxy.lock'  # Shares the original installer's lock.
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        info = os.fstat(stream.fileno())
        if info.st_uid != 0 or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
            raise ValueError('Unexpected proxy lock owner or mode')
        import fcntl
        fcntl.flock(stream, fcntl.LOCK_EX)
        (core.apply if operation == 'apply' else core.rollback)(release_id, expected_sha)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['apply', 'rollback'])
    parser.add_argument('release_id')
    parser.add_argument('expected_sha')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Run this reviewed installer as root')
    try:
        deploy(args.operation, args.release_id, args.expected_sha)
    except Exception:
        print(json.dumps({'installed': False, 'error': 'proxy_update_failed'}))
        raise SystemExit(1) from None
