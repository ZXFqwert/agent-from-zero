import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { GRADUATION_CHECK_IDS, GRADUATION_PROJECT, GRADUATION_STAGES } from '../src/graduation/project.ts';

const project = resolve('python-graduation');
const python = process.env.PYTHON_EXECUTABLE || 'python';
const run = (code: string) => spawnSync(python, ['-c', code], { cwd: project, encoding: 'utf8', windowsHide: true });

test('graduation UI checklist matches every actual local Python checker', () => {
  const result = run('import json; from echo_workshop.checks import STAGE_CASES,check_ids; print(json.dumps({stage:check_ids(stage) for stage in STAGE_CASES}))');
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(result.stdout) as Record<string, string[]>;
  assert.deepEqual(Object.keys(actual), GRADUATION_STAGES.map(stage => stage.id));
  for (const stage of GRADUATION_STAGES) assert.deepEqual(actual[stage.id].sort(), [...GRADUATION_CHECK_IDS[stage.id]].sort());
  assert.equal(Object.values(actual).reduce((sum, ids) => sum + ids.length, 0), 34);
  assert.equal(GRADUATION_PROJECT.reportVersion, 1);
});

test('graduation reference passes and broken implementations are caught without model calls', () => {
  const result = spawnSync(python, ['internal/test_reference.py'], { cwd: project, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 11 tests/);
});

test('downloaded graduation scaffold is runnable and reports starter failures honestly', () => {
  const result = run(String.raw`
import json, pathlib, subprocess, sys, tempfile, zipfile
archive = pathlib.Path('../public/graduation/echo-personal-agent-v1.zip')
with zipfile.ZipFile(archive) as package:
    names = package.namelist()
    assert all(name.startswith('echo-personal-agent/') and '..' not in pathlib.PurePosixPath(name).parts for name in names)
    assert not any('/internal/' in name or name.endswith('reference.py') or '/.env' in name for name in names)
    with tempfile.TemporaryDirectory(prefix='echo-downloaded-') as directory:
        package.extractall(directory)
        root = pathlib.Path(directory)/'echo-personal-agent'
        inspect = subprocess.run([sys.executable,'workshop.py','inspect'],cwd=root,capture_output=True,encoding='utf-8',errors='replace')
        assert inspect.returncode == 0, inspect.stderr
        check = subprocess.run([sys.executable,'workshop.py','check','--stage','context','--report','reports/context.json'],cwd=root,capture_output=True,encoding='utf-8',errors='replace')
        assert check.returncode == 1, check.stderr
        report=json.loads((root/'reports/context.json').read_text(encoding='utf-8'))
        assert report['summary']=={'passed':0,'failed':3,'total':3}
        assert report['scope']['realModelCalled'] is False
        assert all(row['status']=='failed' for row in report['checks'])
        assert not (root/'workspace').exists()
print('package scaffold executed; actual starter fails 3/3 without side effects')
`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('actual starter fails 3/3'));
});
