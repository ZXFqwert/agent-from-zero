import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'python-graduation');
const destination = resolve(root, 'public/graduation/echo-personal-agent-v1.zip');
const python = process.env.PYTHON_EXECUTABLE || 'python';
const code = String.raw`
from pathlib import Path
import hashlib, json, sys, zipfile
source, destination = map(Path, sys.argv[1:])
allowed_roots = {'echo_workshop', 'fixtures', 'lessons'}
allowed_files = {'README.md', '.gitignore', 'learner.py', 'extension.py', 'workshop.py', 'personal-brief.json', 'personal-mission.json', 'mission.example.json', 'requirements-live.txt'}
files = sorted(path for path in source.rglob('*') if path.is_file() and '__pycache__' not in path.parts and (path.relative_to(source).as_posix() in allowed_files or path.relative_to(source).parts[0] in allowed_roots) and path.suffix in {'.py', '.json', '.md', '.txt'} or path.is_file() and path.relative_to(source).as_posix() == '.gitignore')
if not files or not (source/'README.md').is_file(): raise SystemExit('Graduation project incomplete')
destination.parent.mkdir(parents=True, exist_ok=True)
prefix = 'echo-personal-agent/'
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        relative = path.relative_to(source).as_posix()
        if any(part in {'internal', '.env', 'workspace', 'reports', 'sessions', '__pycache__'} for part in path.relative_to(source).parts): raise SystemExit('Forbidden graduation file')
        info = zipfile.ZipInfo(prefix + relative, (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())
with zipfile.ZipFile(destination) as archive:
    if archive.testzip() is not None: raise SystemExit('Graduation zip corrupt')
    if any('/internal/' in name or name.endswith('reference.py') for name in archive.namelist()): raise SystemExit('Reference answer accidentally packaged')
print(json.dumps({'file': destination.name, 'files': len(files), 'bytes': destination.stat().st_size, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}))
`;
const result = spawnSync(python, ['-c', code, source, destination], { encoding: 'utf8', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Graduation build failed.');
process.stdout.write(result.stdout);
