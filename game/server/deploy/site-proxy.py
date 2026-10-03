"""Install or roll back this site's optional lab proxy, preserving exact bytes.

Run as root after reviewing the dedicated, disabled backend. This script does not
read model configuration, generate invitations, change other sites, or enable a
service. The preflight Nginx wrapper contains this site's candidate only.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

SITE = Path('/etc/nginx/sites-available/agent.li33.art')
ENABLED = Path('/etc/nginx/sites-enabled/agent.li33.art')
BASE = Path('/opt/agent-game-lab')
ZONES = '''# agent-game-lab dedicated rate limits (http include context)
limit_req_zone $binary_remote_addr zone=agent_li33_lab_api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=agent_li33_lab_invites:10m rate=5r/m;

'''
LOCATIONS = '''    # agent-game-lab proxy; model connection remains independently configured
    location = /api/lab/redeem {
        limit_req zone=agent_li33_lab_invites burst=3 nodelay;
        limit_req_status 429;
        client_max_body_size 8k;
        proxy_pass http://127.0.0.1:8788;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 10s;
        add_header Cache-Control "no-store" always;
        add_header X-Content-Type-Options nosniff always;
    }
    location ^~ /api/lab/ {
        limit_req zone=agent_li33_lab_api burst=20 nodelay;
        limit_req_status 429;
        client_max_body_size 8k;
        proxy_pass http://127.0.0.1:8788;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 130s;
        proxy_send_timeout 10s;
        proxy_buffering off;
        add_header Cache-Control "no-store" always;
        add_header X-Content-Type-Options nosniff always;
    }
'''


def digest(data):
    return hashlib.sha256(data).hexdigest()


def render(original):
    text = original.decode('utf-8')
    anchor = '    location / { try_files $uri $uri/ =404; }'
    if text.count('server_name agent.li33.art;') != 2 or text.count(anchor) != 1 or 'listen 443 ssl http2;' not in text or '/api/lab/' in text or 'agent_li33_lab_' in text:
        raise ValueError('Site layout differs from the reviewed static configuration')
    return (ZONES + text.replace(anchor, LOCATIONS + anchor)).encode('utf-8')


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
    if result.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(args) + '\n' + result.stderr[-1500:])


def check_paths():
    if os.geteuid() != 0 or BASE.is_symlink() or not BASE.is_dir() or SITE.is_symlink() or not SITE.is_file() or not ENABLED.is_symlink() or ENABLED.resolve() != SITE:
        raise ValueError('Unexpected user, site link or deployment root')
    info = SITE.stat()
    if info.st_uid != 0 or info.st_gid != 0 or info.st_mode & 0o022:
        raise ValueError('Refusing a non-root or writable site configuration')


def replace_site(data):
    fd, name = tempfile.mkstemp(prefix='.agent.li33.art-lab-next-', dir=SITE.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o644)
        os.chown(name, 0, 0)
        os.replace(name, SITE)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def preflight(candidate):
    with tempfile.TemporaryDirectory(prefix='agent-lab-nginx-') as temporary:
        folder = Path(temporary)
        conf = folder / 'site.conf'
        conf.write_bytes(candidate)
        wrapper = folder / 'nginx.conf'
        wrapper.write_text('events {}\nhttp { include ' + str(conf) + '; }\n', encoding='utf-8')
        command(['/usr/sbin/nginx', '-t', '-c', str(wrapper)])


def apply(release_id, expected_sha):
    original = SITE.read_bytes()
    if digest(original) != expected_sha:
        raise ValueError('Original site SHA differs from the reviewed file')
    candidate = render(original)
    preflight(candidate)
    backups = BASE / 'nginx-backups'
    if backups.is_symlink():
        raise ValueError('Refusing backup directory symlink')
    backups.mkdir(mode=0o700, exist_ok=True)
    os.chmod(backups, 0o700)
    backup = backups / (release_id + '.original.conf')
    metadata = backups / (release_id + '.json')
    if backup.exists() or backup.is_symlink() or metadata.exists() or metadata.is_symlink():
        raise ValueError('Refusing to overwrite a prior site backup')
    with backup.open('xb') as stream:
        stream.write(original)
        stream.flush()
        os.fsync(stream.fileno())
    backup.chmod(0o600)
    values = {'site': str(SITE), 'release_id': release_id, 'backup': str(backup), 'original_sha256': expected_sha, 'proxy_sha256': digest(candidate)}
    with metadata.open('x', encoding='utf-8') as stream:
        json.dump(values, stream, indent=2)
    metadata.chmod(0o600)
    if digest(SITE.read_bytes()) != expected_sha:
        raise ValueError('Site changed during preflight; no replacement performed')
    replace_site(candidate)
    try:
        command(['/usr/sbin/nginx', '-t'])
        command(['/bin/systemctl', 'reload', 'nginx'])
    except Exception:
        replace_site(original)
        command(['/usr/sbin/nginx', '-t'])
        command(['/bin/systemctl', 'reload', 'nginx'])
        raise
    print(json.dumps({**values, 'installed': True}))


def rollback(release_id, expected_sha):
    backups = BASE / 'nginx-backups'
    backup = backups / (release_id + '.original.conf')
    metadata = backups / (release_id + '.json')
    if backups.is_symlink() or backup.is_symlink() or metadata.is_symlink():
        raise ValueError('Refusing backup symlink')
    values = json.loads(metadata.read_text(encoding='utf-8'))
    original, current = backup.read_bytes(), SITE.read_bytes()
    if values['release_id'] != release_id or values['site'] != str(SITE) or values['backup'] != str(backup) or digest(original) != values['original_sha256'] or expected_sha != values['proxy_sha256'] or digest(current) != expected_sha:
        raise ValueError('Rollback file or current SHA differs from recorded deployment')
    preflight(original)
    replace_site(original)
    try:
        command(['/usr/sbin/nginx', '-t'])
        command(['/bin/systemctl', 'reload', 'nginx'])
    except Exception:
        replace_site(current)
        command(['/usr/sbin/nginx', '-t'])
        command(['/bin/systemctl', 'reload', 'nginx'])
        raise
    print(json.dumps({'rolled_back': True, 'site_sha256': digest(original)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['apply', 'rollback'])
    parser.add_argument('release_id')
    parser.add_argument('expected_sha')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9]{8}-[0-9]{6}', args.release_id) or not re.fullmatch(r'[a-f0-9]{64}', args.expected_sha):
        parser.error('Invalid release identifier or expected SHA')
    check_paths()
    lock = BASE / 'nginx-proxy.lock'
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        (apply if args.operation == 'apply' else rollback)(args.release_id, args.expected_sha)
