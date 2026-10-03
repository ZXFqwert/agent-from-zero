import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { scenarios } from '../src/content/scenarios';
import { createGame, defaultBlueprint } from '../src/engine';
import { exportBlueprintPython, type PythonLearningStage } from '../src/exports/pythonBlueprint';

const python = (script: string, input: string) => {
  const result = spawnSync('python', ['-c', script], { input, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const lesson = scenarios.find(scenario => scenario.id === 'inherited-workshop')!;
const build = { ...defaultBlueprint, tools: ['observe', 'operate', 'verify'] as const, permissions: ['*'], budget: 16, feedback: true, verification: true };

test('export includes only current observed values, never hidden world or unreceived message bodies', () => {
  const scenario = structuredClone(scenarios.find(scenario => scenario.id === 'bp-openclaw-routing')!);
  scenario.initialWorld = { ...scenario.initialWorld, hiddenAnswer: 'DO_NOT_EXPORT_WORLD' };
  for (const message of scenario.blueprintLab?.messages ?? []) message.facts = { hiddenAnswer: 'DO_NOT_EXPORT_MESSAGE' };
  const result = exportBlueprintPython({ scenario, blueprint: { ...build, tools: [...build.tools] }, observed: { bpBobCode: { value: 'KNOWN_ONLY', source: 'observation', eventId: 'actual-receive', provenance: { observationId: 'message:bob-order', trust: 'external', realm: 'live' } } } });
  assert.ok(result.source.includes('KNOWN_ONLY'));
  assert.ok(result.source.includes('external'));
  assert.ok(!result.source.includes('DO_NOT_EXPORT_WORLD'));
  assert.ok(!result.source.includes('DO_NOT_EXPORT_MESSAGE'));
  assert.ok(!result.source.includes('ALICE-7'));
  assert.equal(result.learningTasks.length, 1);
});

test('export retains equipped tools and per-tool permissions without broadening access', () => {
  const scenario = structuredClone(lesson);
  scenario.observations.push({ id: 'private-document', label: '私人档案', target: 'private', text: '', facts: [] });
  const result = exportBlueprintPython({ scenario, blueprint: { ...build, tools: [...build.tools], permissions: ['*'], toolPermissions: { observe: ['window-state'], operate: [] } }, stage: 'tools' });
  const config = JSON.parse(python("import json,sys\ng={'__name__':'offline_export'}\nexec(compile(sys.stdin.read(),'<lesson>','exec'),g)\nprint(json.dumps(g['CONFIG'],ensure_ascii=False))", result.source));
  assert.deepEqual(config.observations.map((item: {id: string}) => item.id), ['window-state']);
  assert.deepEqual(config.operations, []);
  assert.equal(config.blueprint.toolPermissions.operate.length, 0);
  assert.equal(config.stage, 'tools');
  assert.equal(result.learningTasks.length, 2);
});

test('all authored scenarios export three syntactically valid stages and escaped text stays data', () => {
  const exports = scenarios.flatMap(scenario => (['messages', 'tools', 'loop'] as PythonLearningStage[]).map(stage => exportBlueprintPython({ scenario, blueprint: { ...build, tools: [...build.tools] }, stage }).source));
  const escaped = structuredClone(lesson);
  escaped.title = '中文"\\\n\'\'\'; raise RuntimeError("injected"); #';
  exports.push(exportBlueprintPython({ scenario: escaped, blueprint: { ...build, tools: [...build.tools] }, observed: { note: { value: '\n\"\\\'\'\'; print("injected")', source: 'observation', eventId: 'actual-note' } } }).source);
  assert.equal(python("import ast,json,sys\nitems=json.load(sys.stdin)\nfor source in items: ast.parse(source)\nprint(len(items))", JSON.stringify(exports)), String(exports.length));
  assert.equal(python("import json,sys\ng={'__name__':'offline_export'}\nexec(compile(sys.stdin.read(),'<lesson>','exec'),g)\nprint(json.dumps(g['CONFIG']['title'],ensure_ascii=False))", exports.at(-1)!), JSON.stringify(escaped.title));
});

test('default script and unfinished tools use no SDK import, environment read or network call', () => {
  const result = exportBlueprintPython({ scenario: lesson, blueprint: { ...build, tools: [...build.tools] }, stage: 'tools' });
  const output = python("import builtins,contextlib,io,sys\nsource=sys.stdin.read()\nreal_import=builtins.__import__\ndef blocked(name,*a,**k):\n if name in ('openai','dotenv'): raise RuntimeError('network SDK unexpectedly loaded')\n return real_import(name,*a,**k)\nbuiltins.__import__=blocked\ng={'__name__':'offline_export'}\nexec(compile(source,'<lesson>','exec'),g)\ng['os'].getenv=lambda name: (_ for _ in ()).throw(RuntimeError('unexpected environment read'))\nfor argv in (['lesson.py'],['lesson.py','--live']):\n sys.argv=argv\n with contextlib.redirect_stdout(io.StringIO()) as out: g['main']()\n print(out.getvalue().strip())", result.source);
  assert.ok(output.includes('默认没有网络请求'));
  assert.ok(output.includes('工具还没实现'));
});

test('stages reveal messages, one real tool roundtrip, then the bounded loop in that order', () => {
  const generated = (['messages', 'tools', 'loop'] as PythonLearningStage[]).map(stage => exportBlueprintPython({ scenario: lesson, blueprint: { ...build, tools: [...build.tools] }, stage }).source);
  const output = python("import ast,json,sys\nitems=json.load(sys.stdin)\nfor index,source in enumerate(items):\n tree=ast.parse(source)\n names={node.name for node in tree.body if isinstance(node,ast.FunctionDef)}\n loops=[node for node in ast.walk(next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='run_agent')) if isinstance(node,(ast.For,ast.While))]\n assert ('execute_tool' in names)==(index>0)\n assert bool(loops)==(index==2)\nprint('progressive source, no hidden full loop in first lesson')", JSON.stringify(generated));
  assert.ok(output.includes('progressive source'));
});

test('host checks reject unknown tools, ids, privilege changes and unimplemented advanced boundaries', () => {
  const scenario = structuredClone(lesson);
  scenario.operations.push({ ...scenario.operations[0], id: 'privileged-op', target: 'privileged', security: { principalIds: ['owner'] } });
  const result = exportBlueprintPython({ scenario, blueprint: { ...build, tools: [...build.tools] }, stage: 'loop' });
  const output = python("import json,sys\ng={'__name__':'offline_export'}\nexec(compile(sys.stdin.read(),'<lesson>','exec'),g)\nchecks=[('shell',{}),('observe',{'observation_id':'private'}),('observe',{'observation_id':'window-state','identity':'owner'}),('operate',{'operation_id':'privileged-op'})]\nfor name,payload in checks:\n try: g['execute_tool'](name,payload,{})\n except (ValueError,NotImplementedError): continue\n raise RuntimeError('a blocked request executed')\nprint('4 denied before tool effect')", result.source);
  assert.equal(output, '4 denied before tool effect');
});

test('finite parameter validation rejects booleans as integers and wrong enum or extra fields', () => {
  const result = exportBlueprintPython({ scenario: lesson, blueprint: { ...build, tools: [...build.tools] }, stage: 'loop' });
  const output = python("import sys\ng={'__name__':'offline_export'}\nexec(compile(sys.stdin.read(),'<lesson>','exec'),g)\nspec={'parameters':[{'name':'quantity','type':'integer','required':True,'values':[1,2],'minimum':1,'maximum':2}]}\nfor value in ({'quantity':True},{'quantity':3},{'quantity':1,'extra':'grant'},{}):\n try:g['validate_arguments'](spec,value)\n except ValueError:continue\n raise RuntimeError('bad args accepted')\ng['validate_arguments'](spec,{'quantity':2})\nprint('4 rejected, actual integer accepted')", result.source);
  assert.equal(output, '4 rejected, actual integer accepted');
});

test('independent actual verification establishes completion; unknown and wrong value revoke it', () => {
  const result = exportBlueprintPython({ scenario: lesson, blueprint: { ...build, tools: [...build.tools] }, stage: 'loop' });
  const output = python("import sys\ng={'__name__':'offline_export'}\nexec(compile(sys.stdin.read(),'<lesson>','exec'),g)\nverified={}\nfor response in ({'ok':True,'value':True},{'ok':False,'error':'unknown'},{'ok':True,'value':1}):\n g['verify_live']=lambda spec:response\n g['execute_tool']('verify',{'goal_id':'curtainOpen'},verified)\n if response.get('value') is True: assert verified=={'curtainOpen':True}\n else: assert verified=={}\nprint('unknown never became true')", result.source);
  assert.equal(output, 'unknown never became true');
});

test('bounded fake response flow preserves call ID, stops on failure and never reports a text claim as proof', () => {
  const result = exportBlueprintPython({ scenario: lesson, blueprint: { ...build, tools: [...build.tools] }, stage: 'loop' });
  const output = python("import contextlib,io,sys,types\ng={'__name__':'offline_export'}\nexec(compile(sys.stdin.read(),'<lesson>','exec'),g)\nns=types.SimpleNamespace\nrequests=[]\ndef create(**options):\n requests.append(options)\n message=ns(content=None,tool_calls=[ns(id='original-call-17',function=ns(name='observe',arguments='{\"observation_id\":\"window-state\"}'))])\n return ns(choices=[ns(message=message)])\nclient=ns(chat=ns(completions=ns(create=create)))\ng['read_observation']=lambda spec:{'ok':False,'error':'unknown'}\nwith contextlib.redirect_stdout(io.StringIO()) as out:g['run_agent'](client,'fake-model')\nassert len(requests)==1\nassert requests[0]['messages'][-1]['tool_call_id']=='original-call-17'\nassert '实际工具失败' in out.getvalue()\nrequests.clear()\ndef text_claim(**options):\n requests.append(options)\n return ns(choices=[ns(message=ns(content='完成了',tool_calls=[]))])\nclient.chat.completions.create=text_claim\nwith contextlib.redirect_stdout(io.StringIO()) as out:g['run_agent'](client,'fake-model')\nassert '尚未证明完成' in out.getvalue()\nprint('one actual fake request, matched call id, explicit stop; claim unverified')", result.source);
  assert.ok(output.includes('matched call id'));
});

test('successfully repeated observations still stop at actual request and tool limits', () => {
  const result = exportBlueprintPython({ scenario: lesson, blueprint: { ...build, tools: [...build.tools], loopPolicy: { maxCalls: 3, maxRetries: 0, permanentFailure: 'stop' } }, stage: 'loop' });
  const output = python("import contextlib,io,sys,types\ng={'__name__':'offline_export'}\nexec(compile(sys.stdin.read(),'<lesson>','exec'),g)\nns=types.SimpleNamespace\ncounts={'requests':0,'tools':0}\ndef create(**options):\n counts['requests']+=1\n return ns(choices=[ns(message=ns(content=None,tool_calls=[ns(id='call-'+str(counts['requests']),function=ns(name='observe',arguments='{\"observation_id\":\"window-state\"}'))]))])\ndef observe(spec):\n counts['tools']+=1\n return {'ok':True,'facts':{'curtainOpen':False}}\ng['read_observation']=observe\nclient=ns(chat=ns(completions=ns(create=create)))\nwith contextlib.redirect_stdout(io.StringIO()):g['run_agent'](client,'fake-model')\nassert counts=={'requests':4,'tools':3}\ncounts={'requests':0,'tools':0}\ng['CONFIG']['blueprint']['maxCalls']=100\nwith contextlib.redirect_stdout(io.StringIO()) as out:g['run_agent'](client,'fake-model')\nassert counts=={'requests':8,'tools':8}\nassert '模型请求轮数已用尽' in out.getvalue()\nprint('3 tool effects before limit; eight request ceiling')", result.source);
  assert.ok(output.includes('eight request ceiling'));
});

test('export is deterministic and does not mutate the scenario, construct or observed projection', () => {
  const scenario = structuredClone(lesson), state = createGame(scenario);
  const input = { scenario, blueprint: { ...build, tools: [...build.tools] }, observed: state.observed, stage: 'loop' as const }, before = JSON.stringify(input);
  const first = exportBlueprintPython(input), second = exportBlueprintPython(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.match(first.filename, /^[a-zA-Z0-9_-]+\.py$/);
  assert.equal(first.learningTasks.length, 3);
  assert.ok(first.source.includes('MODEL_BASE_URL'));
  assert.ok(first.source.includes('MODEL_NAME'));
  assert.ok(first.source.includes('MODEL_API_KEY'));
  assert.ok(!first.source.includes('responses.create'));
  assert.ok(!first.source.includes('sk-'));
});
