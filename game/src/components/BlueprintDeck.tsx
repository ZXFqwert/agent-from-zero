import { useEffect, useState } from 'react';
import type { GameState, ScenarioDefinition, ToolCall, ToolName, FactMap } from '../engine';
import type { LabAction, LabModule, LabQueueMode, LabRouting, LabRule, LabSource, LabTask } from '../engine/blueprint-contract';
import { labCallDenial, labProviders, labRoles, labTarget, matchingLabPermit, moduleGraphDenial, validLabAction } from '../engine/blueprint';
import { factLabels } from '../content/scenarios';
import { displayActionLabel, displayFact } from '../content/presentation';
import './blueprint.css';

type WithoutId<T> = T extends { id: string } ? Omit<T, 'id'> : never;
export type BlueprintInput = WithoutId<LabAction>;
export interface BlueprintDeckProps {
  scenario: ScenarioDefinition;
  state: GameState;
  busy?: boolean;
  onLab: (input: BlueprintInput) => Promise<unknown>;
  selectedCall?: ToolCall;
  onPause?: () => void | Promise<unknown>;
  onResume?: () => void | Promise<unknown>;
}
const tools: Record<ToolName | '*', string> = { '*': '全部法器', observe: '观察', operate: '行动', verify: '验收' };
const decisions: Record<LabRule['decision'], string> = { allow: '允许', ask: '逐项询问', deny: '拒绝' };
const statuses: Record<LabTask['status'], string> = { queued: '排队，尚未接收正文', running: '正在执行', 'waiting-approval': '等待精确批准', succeeded: '入口步骤已完成', failed: '已停止：调用失败', cancelled: '已取消剩余步骤' };
const routingNames: Record<LabRouting, string> = { main: '全部进入同一会话', sender: '按账号与寄件人分会话', 'channel-sender': '按频道、账号与寄件人分会话' };
const queueNames: Record<LabQueueMode, string> = { followup: '顺序排队', collect: '收集同源新资料', interrupt: '中断同源旧任务', steer: '改向同源新任务' };
const queueDescriptions: Record<LabQueueMode, string> = {
  followup: '保留队首，等它停止后再执行本信。', collect: '仅同一原始来源且队首已开始：把新资料交给队首，本信仍排队。',
  interrupt: '仅同一原始来源：取消队首尚未执行的步骤，排入本信。', steer: '仅同一原始来源：新委托取代队首剩余步骤；已发生的行动保留。',
};
const kinds: Record<LabModule['kind'], string> = { model: '模型', loop: '循环', tools: '工具', storage: '日志存储', extension: '扩展' };
const active = (task: LabTask) => ['queued', 'running', 'waiting-approval'].includes(task.status);
const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];

/** This panel operates the finite teaching host; it never reads the hidden world to fill a model's inputs. */
export default function BlueprintDeck({ scenario, state, busy = false, onLab, selectedCall, onPause, onResume }: BlueprintDeckProps) {
  const lab = state.lab, definition = scenario.blueprintLab;
  const [providerId, setProviderId] = useState(lab?.providerId ?? '');
  const [modelId, setModelId] = useState(lab?.modelId ?? '');
  const [roleId, setRoleId] = useState(lab?.roleId ?? '');
  const [ruleRoleId, setRuleRoleId] = useState(lab?.roleId ?? '');
  const [rules, setRules] = useState<LabRule[]>(lab?.rules[lab.roleId] ?? []);
  const [workspaceTargets, setWorkspaceTargets] = useState<string[]>(lab?.workspaceTargets ?? []);
  const [routing, setRouting] = useState<LabRouting>(lab?.routing ?? 'sender');
  const [messageId, setMessageId] = useState('');
  const [queueMode, setQueueMode] = useState<LabQueueMode>('followup');
  const [moduleIds, setModuleIds] = useState<string[]>(lab?.activeModuleIds ?? []);
  const [extensionId, setExtensionId] = useState('');
  const [extensionRealm, setExtensionRealm] = useState<'live' | 'sandbox'>('live');
  const [mounts, setMounts] = useState<string[]>([]);
  const [operationId, setOperationId] = useState('');
  const [argumentsDraft, setArgumentsDraft] = useState<FactMap>({});
  const [requestKey, setRequestKey] = useState('');
  const [signal, setSignal] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const current = state.lab;
    if (!current) return;
    setProviderId(current.providerId); setModelId(current.modelId); setRoleId(current.roleId);
    setWorkspaceTargets([...current.workspaceTargets]); setRouting(current.routing); setModuleIds([...current.activeModuleIds]);
  }, [scenario.id, lab?.generation, lab?.configurationRevision]);
  useEffect(() => {
    setRuleRoleId(state.lab?.roleId ?? ''); setMessageId(''); setExtensionId('');
    setQueueMode('followup'); setShowHistory(false); setSignal(''); setError('');
  }, [scenario.id, lab?.generation]);
  useEffect(() => { setRules(structuredClone(state.lab?.rules[ruleRoleId] ?? [])); }, [scenario.id, lab?.generation, lab?.configurationRevision, ruleRoleId]);
  useEffect(() => {
    const scope = state.lab?.moduleScopes[extensionId];
    setExtensionRealm(scope?.realm ?? 'live'); setMounts([...(scope?.mounts ?? [])]);
    setOperationId('');
  }, [scenario.id, lab?.generation, lab?.configurationRevision, extensionId]);
  useEffect(() => {
    const operation = scenario.operations.find(item => item.id === operationId);
    setArgumentsDraft({ ...(operation?.protocol?.defaults ?? {}) }); setRequestKey('');
  }, [scenario.id, operationId]);
  if (!definition || !lab) return null;

  const providers = labProviders(scenario), roles = labRoles(scenario);
  const selectedProvider = providers.find(item => item.id === providerId);
  const currentProvider = providers.find(item => item.id === lab.providerId);
  const currentModel = currentProvider?.models.find(item => item.id === lab.modelId);
  const currentRole = roles.find(item => item.id === lab.roleId);
  const pendingTasks = lab.tasks.filter(active), hasQueue = pendingTasks.length > 0;
  const disabled = busy || pending || state.status === 'won';
  const paused = state.status === 'paused';
  const targetIds = [...new Set([...scenario.observations.map(item => item.target), ...scenario.operations.map(item => item.target)])];
  const targetName = (id: string) => id === '*' ? '全部目标' : displayActionLabel(scenario.observations.find(item => item.target === id)?.label ?? scenario.operations.find(item => item.target === id)?.label ?? id);
  const moduleName = (id: string) => definition.modules?.find(item => item.id === id)?.label ?? id;
  const roleName = (id: string) => roles.find(item => item.id === id)?.label ?? id;
  const callLabel = (call: ToolCall) => call.tool === 'observe' ? displayActionLabel(scenario.observations.find(item => item.id === call.observationId)?.label ?? call.observationId)
    : call.tool === 'operate' ? displayActionLabel(scenario.operations.find(item => item.id === call.operationId)?.label ?? call.operationId)
    : `验收：${scenario.goals.find(item => item.fact === call.fact)?.label ?? factLabels[call.fact] ?? call.fact}`;
  const callCost = (call: ToolCall) => call.tool === 'observe' ? scenario.observations.find(item => item.id === call.observationId)?.cost ?? scenario.limits?.toolCosts?.observe ?? 1
    : call.tool === 'operate' ? scenario.operations.find(item => item.id === call.operationId)?.cost ?? scenario.limits?.toolCosts?.operate ?? 1
    : scenario.goals.find(item => item.fact === call.fact)?.verifyCost ?? scenario.limits?.toolCosts?.verify ?? 1;
  const can = (input: BlueprintInput) => !disabled && validLabAction(scenario, state, { ...input, id: 'lab-ui-check' });
  const isHead = (task: LabTask) => pendingTasks.find(item => item.sessionKey === task.sessionKey)?.id === task.id;
  const latest = [...state.events].reverse().find(event => event.type.startsWith('lab-'));
  const modulesDenial = definition.modules ? moduleGraphDenial(scenario, moduleIds, lab.projectTrusted) : undefined;
  const extension = definition.modules?.find(item => item.id === extensionId && item.kind === 'extension');
  const extensionOperations = scenario.operations.filter(item => extension?.operationIds?.includes(item.id));
  const extensionOperation = extensionOperations.find(item => item.id === operationId);
  const extensionState: GameState = extension && state.security ? { ...state, security: { ...state.security, realm: lab.moduleScopes[extension.id]?.realm ?? 'live' } } : state;
  const invokeCall: Extract<ToolCall, { tool: 'operate' }> = {
    tool: 'operate', operationId,
    ...(extensionOperation?.protocol ? { arguments: argumentsDraft, ...(requestKey ? { requestKey } : {}) } : {}),
  };
  const snapshot = lab.snapshots[state.sessions?.activeId ?? ''];
  const finishedTasks = lab.tasks.filter(task => !active(task));
  const visibleTasks = [...pendingTasks, ...(showHistory ? finishedTasks : finishedTasks.slice(-3))];
  const currentAsk = selectedCall ? can({ type: 'lab', operation: 'approve', call: selectedCall }) : false;
  const hasModules = definition.modules !== undefined;

  const preflightReason = (input: BlueprintInput) => {
    if (input.operation === 'approve') {
      const task = input.taskId ? lab.tasks.find(item => item.id === input.taskId) : undefined;
      const probe: GameState = input.moduleId && state.security ? { ...state, security: { ...state.security, realm: lab.moduleScopes[input.moduleId]?.realm ?? 'live' } } : state;
      return labCallDenial(scenario, probe, input.call, { task, moduleId: input.moduleId, ignoreAsk: true }) ?? '当前请求不需要新批准，或已有对应的单次许可。';
    }
    if (input.operation === 'activate') return moduleGraphDenial(scenario, input.moduleIds, lab.projectTrusted) ?? '模块选择未改变，或需要先暂停才能切换已有日志的存储模块。';
    if (input.operation === 'enqueue') return '该队列方式当前不可用：收集、打断和改向都要求同一原始来源的队首；收集还要求它已经开始。请检查执行域与剩余资源。';
    if (input.operation === 'tick') return '这个任务不是当前会话队首，或仍在等待许可；检查停止原因、执行域和剩余资源。';
    if (input.operation === 'commit') return '尚无可提交的新请求、输入或回执，或没有激活日志存储模块。';
    if (input.operation === 'power-cycle') return '先暂停委托，并激活日志存储模块，再从已提交事件恢复。';
    if (hasQueue) return '先完成或取消入口队列，再修改宿主配置。正在执行的任务保留派遣时的配置。';
    return '这次配置没有变化，或超出了本试炼声明的能力范围。未执行任何动作。';
  };
  const change = async (input: BlueprintInput) => {
    if (disabled) return;
    // The parent resumes a paused mission only for this explicit tick; no other action silently resumes it.
    const resumedTick = input.operation === 'tick' && paused;
    if (!resumedTick && !validLabAction(scenario, state, { ...input, id: 'lab-ui-check' })) { setError(preflightReason(input)); return; }
    setError(''); setPending(true);
    try {
      const result = await onLab(input);
      if (result === false) setError('宿主拒绝了这次操作。当前状态与行动记录是实际结果，页面没有补造执行步骤。');
    } catch { setError('这次操作尚未确认完成。请查看当前任务与行动记录后再继续。'); }
    finally { setPending(false); }
  };
  const pauseOrResume = async (callback: (() => void | Promise<unknown>) | undefined) => {
    if (disabled || !callback) return;
    setError(''); setPending(true);
    try { await callback(); } catch { setError('运行状态尚未确认改变，请检查委托状态。'); }
    finally { setPending(false); }
  };
  const updateRule = (index: number, patch: Partial<LabRule>) => setRules(items => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const moveRule = (index: number, direction: -1 | 1) => setRules(items => {
    const next = [...items], destination = index + direction;
    if (destination < 0 || destination >= next.length) return items;
    [next[index], next[destination]] = [next[destination], next[index]];
    return next;
  });
  const renderSource = (source: LabSource) => <dl className="blueprint-source">
    <div><dt>显示姓名（不作认证）</dt><dd>{source.displayName}</dd></div>
    <div><dt>原始寄件人</dt><dd><code>{source.senderId}</code></dd></div>
    <div><dt>账号 / 对端</dt><dd><code>{source.accountId} / {source.peerId}</code></dd></div>
    <div><dt>原始频道</dt><dd><code>{source.channelId}</code></dd></div>
    <div><dt>固定回信目标</dt><dd>{targetName(source.replyTarget)} <code>{source.replyTarget}</code></dd></div>
  </dl>;
  const renderKnown = (observed: LabTask['observed']) => Object.keys(observed).length ? <dl className="blueprint-facts">{Object.entries(observed).map(([fact, record]) => <div key={fact}>
    <dt>{factLabels[fact] ?? fact}</dt><dd>{displayFact(fact, record.value)}<small>{record.source === 'observation' ? '观察 / 来信' : record.source === 'verification' ? '实际验收' : record.source === 'memory' ? '记忆' : '执行回执'} · {record.provenance?.trust === 'external' ? '外部资料' : record.provenance?.trust === 'registry' ? '登记来源' : '执行来源'}</small></dd>
  </div>)}</dl> : <p className="blueprint-note">尚未取得事实。排队本身不会把现场状态或来信正文偷偷加入上下文。</p>;
  const renderExactCall = (call: ToolCall) => <div className="blueprint-call"><strong>{tools[call.tool]} · {callLabel(call)}</strong><small>目标：{targetName(labTarget(scenario, call) ?? '')}</small>
    <small>声明成本 {callCost(call)} 点{call.tool === 'operate' && scenario.operations.find(item => item.id === call.operationId)?.failureCost !== undefined ? `；物理条件不成立时 ${scenario.operations.find(item => item.id === call.operationId)!.failureCost} 点` : ''}。实际费用以请求回执为准。</small>
    {call.tool === 'operate' && call.arguments && <pre aria-label="这次请求的精确参数">{JSON.stringify(call.arguments, null, 2)}</pre>}
    {call.tool === 'operate' && call.requestKey && <small>幂等键：<code>{call.requestKey}</code></small>}
  </div>;

  return <section className="blueprint-deck" aria-label="现实蓝图试炼控制台">
    <div className="blueprint-heading"><div><span className="blueprint-eyebrow">现实蓝图 · 有限教学宿主</span><h3>把设计取舍变成行动</h3></div><span className="blueprint-badge">配置 v{lab.configurationRevision}</span></div>
    <p className="blueprint-note">这里执行可检查的工具步骤。模型选择、岗位权限、工作区与入口身份分别生效；这些模拟不代表产品智能排名。</p>
    <div className="blueprint-summary"><span>模型 <strong>{currentModel?.label ?? lab.modelId}</strong></span><span>岗位 <strong>{currentRole?.label ?? lab.roleId}</strong></span><span>执行域 <strong>{state.security?.realm === 'sandbox' ? '内置沙箱' : '现场'}</strong></span><span>入口待办 <strong>{pendingTasks.length}</strong></span></div>
    <div className={`blueprint-stop ${paused || state.status === 'exhausted' ? 'is-stopped' : ''}`} role="status">
      <strong>{state.status === 'won' ? '现场已验收完成' : state.status === 'exhausted' ? '资源耗尽，执行已停止' : paused ? '委托已暂停' : state.status === 'running' ? '委托正在运行' : '等待派遣委托'}</strong>
      <span>{hasQueue ? '入口任务保留派遣时的模型、岗位和来源上限；配置暂时锁定。' : '现在可以逐层改装。配置操作本身不会改变现场。'}</span>
      {paused && onResume && <button type="button" disabled={disabled} onClick={() => void pauseOrResume(onResume)}>恢复委托</button>}
      {(state.status === 'ready' || state.status === 'stalled') && onResume && <button type="button" disabled={disabled} onClick={() => void pauseOrResume(onResume)}>开始逐步委托</button>}
      {state.status === 'running' && onPause && <button type="button" disabled={disabled} onClick={() => void pauseOrResume(onPause)}>暂停委托</button>}
    </div>
    {error && <p className="blueprint-error" role="alert">{error}</p>}
    {latest && <p className={`blueprint-feedback ${latest.success === false ? 'is-rejected' : ''}`} aria-live="polite">最近回执：{latest.text}</p>}

    {definition.providers !== undefined && <details className="blueprint-block"><summary>模型连接 <span>{currentProvider?.label} / {currentModel?.label}</span></summary><div className="blueprint-body">
      <p>换模型仅改变消息适配器，不会授予新权限或扩大工作区。</p>
      <div className="blueprint-two"><label>模型提供方<select value={providerId} disabled={disabled || hasQueue} onChange={event => { const id = event.target.value; setProviderId(id); setModelId(providers.find(item => item.id === id)?.models[0]?.id ?? ''); }}>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
        <label>模型<select value={modelId} disabled={disabled || hasQueue} onChange={event => setModelId(event.target.value)}>{selectedProvider?.models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label></div>
      <p className="blueprint-note">当前草稿合同：{selectedProvider?.models.find(model => model.id === modelId)?.adapter === 'text-only' ? '仅文字输出，无法提供此工具调用合同' : '有限工具调用合同'}</p>
      <button type="button" disabled={!can({ type: 'lab', operation: 'select-model', providerId, modelId })} onClick={() => void change({ type: 'lab', operation: 'select-model', providerId, modelId })}>应用模型连接</button>
    </div></details>}

    {definition.roles !== undefined && <details className="blueprint-block"><summary>岗位与有序权限 <span>{currentRole?.label}</span></summary><div className="blueprint-body">
      <label>执行岗位<select value={roleId} disabled={disabled || hasQueue} onChange={event => setRoleId(event.target.value)}>{roles.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
      <p className="blueprint-note">此岗位声明的法器：{roles.find(role => role.id === roleId)?.tools.map(tool => tools[tool]).join('、') || '无'}。权限规则不能增加未声明的法器。</p>
      <button type="button" disabled={!can({ type: 'lab', operation: 'select-role', roleId })} onClick={() => void change({ type: 'lab', operation: 'select-role', roleId })}>切换执行岗位</button>
      <hr /><label>编辑哪个岗位的规则<select value={ruleRoleId} disabled={disabled || hasQueue} onChange={event => setRuleRoleId(event.target.value)}>{roles.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
      <p>从上到下匹配，<strong>最后一条匹配规则决定结果</strong>；没有匹配则拒绝。询问只允许批准当前这件精确请求一次。</p>
      <ol className="blueprint-rules">{rules.map((rule, index) => <li key={index}><fieldset disabled={disabled || hasQueue}><legend>规则 {index + 1}</legend>
        <div className="blueprint-rule-fields"><label>法器<select aria-label={`规则${index + 1}法器`} value={rule.tool} onChange={event => updateRule(index, { tool: event.target.value as LabRule['tool'] })}>{Object.entries(tools).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>目标<select aria-label={`规则${index + 1}目标`} value={rule.target} onChange={event => updateRule(index, { target: event.target.value })}><option value="*">全部目标</option>{targetIds.map(id => <option key={id} value={id}>{targetName(id)}</option>)}</select></label>
          <label>决定<select aria-label={`规则${index + 1}决定`} value={rule.decision} onChange={event => updateRule(index, { decision: event.target.value as LabRule['decision'] })}>{Object.entries(decisions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
        <div className="blueprint-buttons"><button type="button" aria-label={`规则${index + 1}上移`} disabled={index === 0} onClick={() => moveRule(index, -1)}>上移</button><button type="button" aria-label={`规则${index + 1}下移`} disabled={index === rules.length - 1} onClick={() => moveRule(index, 1)}>下移</button><button type="button" aria-label={`删除规则${index + 1}`} onClick={() => setRules(items => items.filter((_, i) => i !== index))}>删除</button></div>
      </fieldset></li>)}</ol>
      {!rules.length && <p className="blueprint-note">此岗位无规则，所有目标默认拒绝。</p>}
      <div className="blueprint-buttons"><button type="button" disabled={disabled || hasQueue || rules.length >= 12} onClick={() => setRules(items => [...items, { tool: '*', target: '*', decision: 'deny' }])}>增加规则（{rules.length}/12）</button><button type="button" disabled={!can({ type: 'lab', operation: 'rules', roleId: ruleRoleId, rules })} onClick={() => void change({ type: 'lab', operation: 'rules', roleId: ruleRoleId, rules })}>保存有序规则</button></div>
    </div></details>}

    {definition.workspaceTargets !== undefined && <details className="blueprint-block"><summary>可写工作区 <span>{lab.workspaceTargets.length} 个目标</span></summary><div className="blueprint-body">
      <p>勾选的是宿主可写范围。角色允许、一次批准和项目加载信任都不会自动扩展这个范围。</p>
      <fieldset className="blueprint-checks" disabled={disabled || hasQueue}><legend>工作区目标</legend>{definition.workspaceTargets.map(target => <label key={target}><input type="checkbox" checked={workspaceTargets.includes(target)} onChange={() => setWorkspaceTargets(items => toggle(items, target))} /><span>{targetName(target)}<small>{target}</small></span></label>)}</fieldset>
      <button type="button" disabled={!can({ type: 'lab', operation: 'workspace', targets: workspaceTargets })} onClick={() => void change({ type: 'lab', operation: 'workspace', targets: workspaceTargets })}>应用工作区范围</button>
    </div></details>}

    {selectedCall && <details className="blueprint-block" open={currentAsk || undefined}><summary>现场精确请求 <span>{currentAsk ? '可逐项批准' : matchingLabPermit(scenario, state, selectedCall) ? '已有一次许可' : '查看合同'}</span></summary><div className="blueprint-body">
      {renderExactCall(selectedCall)}
      <p className="blueprint-note">许可绑定当前岗位、执行域、配置版本与现场版本，执行后消耗。它不能越过拒绝规则、不可写工作区或原始身份上限。</p>
      {!currentAsk && <p>{labCallDenial(scenario, state, selectedCall, { ignoreAsk: true }) ?? '当前规则未要求新批准，或此精确请求已有有效许可。'}</p>}
      <button type="button" disabled={!currentAsk} onClick={() => void change({ type: 'lab', operation: 'approve', call: selectedCall })}>只批准这次现场请求</button>
    </div></details>}

    {definition.messages !== undefined && <>
      <details className="blueprint-block"><summary>原始入口与路由 <span>{routingNames[lab.routing]}</span></summary><div className="blueprint-body">
        <p>显示姓名与正文自称都是资料。宿主确定原始来源、会话归属与固定回信地址，玩家不能在正文里改写身份。</p>
        <label>会话路由<select value={routing} disabled={disabled || hasQueue} onChange={event => setRouting(event.target.value as LabRouting)}>{Object.entries(routingNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <button type="button" disabled={!can({ type: 'lab', operation: 'router', routing })} onClick={() => void change({ type: 'lab', operation: 'router', routing })}>应用入口路由</button>
        <hr /><label>待接收来信<select value={messageId} disabled={disabled} onChange={event => setMessageId(event.target.value)}><option value="">选择一封来信</option>{definition.messages.map(message => <option key={message.id} value={message.id}>{message.label}</option>)}</select></label>
        {definition.messages.find(message => message.id === messageId) && (() => { const message = definition.messages!.find(item => item.id === messageId)!; return <div className="blueprint-message">{renderSource(message.source)}<p className="blueprint-note">来源可用法器：{message.tools.map(tool => tools[tool]).join('、')}。目标上限：{message.targets.map(targetName).join('、')}。正文中的事实要等实际接收后才出现在任务卡中。</p></div>; })()}
        <label>队列处理方式<select value={queueMode} disabled={disabled} onChange={event => setQueueMode(event.target.value as LabQueueMode)}>{Object.entries(queueNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><p className="blueprint-note">{queueDescriptions[queueMode]}</p>
        {messageId && !can({ type: 'lab', operation: 'enqueue', messageId, mode: queueMode }) && <p className="blueprint-note">当前不能按此方式接入。除顺序排队外，都需要同一原始来源的队首；收集还要求队首已开始。入口只在现场执行域运行。</p>}
        <button type="button" disabled={!can({ type: 'lab', operation: 'enqueue', messageId, mode: queueMode })} onClick={() => void change({ type: 'lab', operation: 'enqueue', messageId, mode: queueMode })}>按{queueNames[queueMode]}接入</button>
      </div></details>
      <div className="blueprint-queue" aria-label="真实入口任务队列"><h4>入口队列 <span>{pendingTasks.length} 项未完成</span></h4><p className="blueprint-note">每次推进只执行队首的一步。换配置、取消和断电都不撤销已经发生的现场动作。</p>
        {!lab.tasks.length && <p>还没有接入来信。</p>}
        {visibleTasks.map(task => {
          const call = task.steps[task.cursor]?.call, head = isHead(task), live = state.security?.realm === 'live';
          const approve: BlueprintInput | undefined = call ? { type: 'lab', operation: 'approve', taskId: task.id, call } : undefined;
          const denial = call ? labCallDenial(scenario, state, call, { task }) : undefined;
          const tickInput: BlueprintInput = { type: 'lab', operation: 'tick', taskId: task.id };
          const canTick = !disabled && (paused ? live && head && (state.runtime?.missionRemaining ?? 0) > 0 && !(task.status === 'waiting-approval' && denial) : validLabAction(scenario, state, { ...tickInput, id: 'lab-ui-check' }));
          const taskEvent = [...state.events].reverse().find(event => event.labTaskId === task.id && (event.success === false || event.labPhase === 'completed' || event.labPhase === 'cancelled'));
          return <article key={task.id} className={`blueprint-task ${task.status === 'failed' || task.status === 'waiting-approval' ? 'is-stopped' : ''}`}>
            <div className="blueprint-task-heading"><strong>{definition.messages!.find(item => item.id === task.messageId)?.label ?? task.messageId}</strong><span>{statuses[task.status]}{head ? ' · 会话队首' : ''}</span></div>
            <small className="blueprint-id">真实任务 <code>{task.id}</code><br />会话 <code>{task.sessionKey}</code></small>
            <div className="blueprint-versions"><span>步骤 {task.cursor}/{task.steps.length}</span><span>实际消耗 {state.events.filter(event => task.eventIds.includes(event.id)).reduce((total, event) => total + (event.cost ?? 0), 0)} 点</span><span>岗位 {roleName(task.roleId)}</span><span>模型 {providers.find(item => item.id === task.providerId)?.models.find(item => item.id === task.modelId)?.label ?? task.modelId}</span></div>
            <details><summary>固定来源与已经取得的事实</summary>{renderSource(task.source)}<p className="blueprint-note">派遣时的来源上限：{task.tools.map(tool => tools[tool]).join('、')}；{task.targets.map(targetName).join('、')}。</p>{renderKnown(task.observed)}</details>
            {active(task) && call && <>{renderExactCall(call)}{denial && <p className="blueprint-note">下一步边界：{denial}</p>}</>}
            {taskEvent && <p className="blueprint-task-result">{taskEvent.text}</p>}
            {active(task) && <div className="blueprint-buttons"><button type="button" disabled={!canTick} onClick={() => void change(tickInput)}>{paused ? '恢复委托并推进入口一步' : '推进入口一步'}</button>
              {approve && can(approve) && <button type="button" onClick={() => void change(approve)}>只批准此任务的这次请求</button>}
              <button type="button" disabled={!can({ type: 'lab', operation: 'cancel', taskId: task.id })} onClick={() => void change({ type: 'lab', operation: 'cancel', taskId: task.id })}>取消剩余步骤</button></div>}
            {active(task) && !head && <p className="blueprint-note">同一会话的前一项尚未停止；此任务不能抢先执行。</p>}
          </article>;
        })}
        {finishedTasks.length > 3 && <button type="button" onClick={() => setShowHistory(value => !value)}>{showHistory ? '收起较早任务' : `展开全部 ${finishedTasks.length} 项已停止任务`}</button>}
      </div>
    </>}

    {definition.memorySnapshot && <details className="blueprint-block"><summary>记忆存储与会话启动块 <span>存储 v{lab.storeVersion} / 启动块 {snapshot ? `v${snapshot.storeVersion}` : '尚无'}</span></summary><div className="blueprint-body">
      <p>写入档案会更新存储，当前会话仍保留启动时的快照。新会话抓取新版；分支继承旧版；切回旧会话仍使用旧块。实际检索回响并放入上下文，才明确带入新信息。</p>
      <div className="blueprint-versions"><span>当前会话 <code>{state.sessions?.activeId}</code></span><span>存储 v{lab.storeVersion}</span><span>启动块 {snapshot ? `v${snapshot.storeVersion}` : '无'}</span></div>
      {snapshot && snapshot.storeVersion < lab.storeVersion && <p className="blueprint-warning">存储已有新版，当前启动块尚未更新。打开工坊档案或会话面板，决定检索新版还是开启新会话。</p>}
      {snapshot?.records.length ? snapshot.records.map(record => <details key={record.memoryId}><summary>{record.key} · 记忆修订 {record.revision}</summary><dl className="blueprint-facts">{Object.entries(record.facts).map(([fact, value]) => <div key={fact}><dt>{factLabels[fact] ?? fact}</dt><dd>{displayFact(fact, value)}</dd></div>)}</dl><small>来源信任：{record.provenance?.trust === 'external' ? '外部资料' : record.provenance?.trust === 'registry' ? '登记来源' : '执行 / 已存档来源'}</small></details>) : <p className="blueprint-note">此启动块没有记忆记录。</p>}
    </div></details>}

    {hasModules && <details className="blueprint-block"><summary>模块组合与项目加载信任 <span>已激活 {lab.activeModuleIds.length} 项</span></summary><div className="blueprint-body">
      <p>宿主接口 v{definition.interfaceVersion ?? 1}。模块依赖、接口、存储格式与项目加载信任都要成立，名字相似不能替代合同。</p>
      <div className="blueprint-trust"><strong>项目资源加载：{lab.projectTrusted ? '已明确允许' : '尚未允许'}</strong><p className="blueprint-note">这只决定能否加载项目声明的资源，不能授予法器、工作区或扩展挂载范围。</p><button type="button" disabled={!can({ type: 'lab', operation: 'trust-project', trusted: !lab.projectTrusted })} onClick={() => void change({ type: 'lab', operation: 'trust-project', trusted: !lab.projectTrusted })}>{lab.projectTrusted ? '撤销项目加载信任' : '允许加载项目资源'}</button></div>
      <fieldset className="blueprint-modules" disabled={disabled || hasQueue}><legend>选择完整模块组合</legend>{definition.modules!.map(module => <label key={module.id}><input type="checkbox" checked={moduleIds.includes(module.id)} onChange={() => setModuleIds(items => toggle(items, module.id))} /><span><strong>{module.label}</strong><small>{kinds[module.kind]} · 接口 v{module.interfaceVersion}{module.projectResource ? ' · 项目资源' : ''}{module.logFormat ? ` · 日志格式 v${module.logFormat}` : ''}</small><small>依赖：{module.requires.length ? module.requires.map(moduleName).join('、') : '无'}{module.tools?.length ? `；法器：${module.tools.map(tool => tools[tool]).join('、')}` : ''}</small>{lab.activeModuleIds.includes(module.id) && <em>实际已激活</em>}</span></label>)}</fieldset>
      {modulesDenial && <p className="blueprint-warning">当前组合：{modulesDenial.replace('缺少model模块', '缺少模型模块').replace('缺少loop模块', '缺少循环模块').replace('缺少tools模块', '缺少工具模块').replace('缺少storage模块', '缺少存储模块')}</p>}
      <button type="button" disabled={!can({ type: 'lab', operation: 'activate', moduleIds })} onClick={() => void change({ type: 'lab', operation: 'activate', moduleIds })}>激活所选组合并卸载未选模块</button>
      <details><summary>实际注册作用域（{lab.registrations.length} 项）</summary><ul className="blueprint-registrations">{lab.registrations.map((registration, index) => <li key={`${registration.moduleId}-${index}`}>{moduleName(registration.moduleId)} · {registration.kind === 'listener' ? '事件监听' : '法器'} · <code>{tools[registration.name as ToolName] ?? scenario.operations.find(item => item.id === registration.name)?.label ?? registration.name}</code></li>)}</ul>{!lab.registrations.length && <p className="blueprint-note">尚无工具或监听注册。</p>}</details>
    </div></details>}

    {definition.modules?.some(module => module.kind === 'extension') && <details className="blueprint-block"><summary>扩展自己的执行域 <span>挂载与调用分别确认</span></summary><div className="blueprint-body">
      <p>扩展在它自己的执行域中运行。内置工具的沙箱不会自动包住扩展；项目加载信任也不会替扩展挂载资源。</p>
      <label>声明的扩展<select value={extensionId} disabled={disabled} onChange={event => setExtensionId(event.target.value)}><option value="">选择扩展</option>{definition.modules.filter(module => module.kind === 'extension').map(module => <option key={module.id} value={module.id}>{module.label}{lab.activeModuleIds.includes(module.id) ? '（已激活）' : '（未激活）'}</option>)}</select></label>
      {extension && <>
        <label>扩展执行域<select value={extensionRealm} disabled={disabled || hasQueue} onChange={event => setExtensionRealm(event.target.value as 'live' | 'sandbox')}><option value="live">现场：会产生真实虚拟世界变化</option>{scenario.security?.sandbox && <option value="sandbox">扩展自己的沙箱：预演</option>}</select></label>
        <fieldset className="blueprint-checks" disabled={disabled || hasQueue}><legend>此扩展的挂载目标</legend>{(extension.mountableTargets ?? []).map(target => <label key={target}><input type="checkbox" checked={mounts.includes(target)} onChange={() => setMounts(items => toggle(items, target))} /><span>{targetName(target)}<small>{target}</small></span></label>)}</fieldset>
        <button type="button" disabled={!can({ type: 'lab', operation: 'module-scope', moduleId: extension.id, realm: extensionRealm, mounts })} onClick={() => void change({ type: 'lab', operation: 'module-scope', moduleId: extension.id, realm: extensionRealm, mounts })}>应用扩展自己的执行域与挂载</button>
        <p className="blueprint-note">实际范围：{lab.moduleScopes[extension.id]?.realm === 'sandbox' ? '扩展沙箱' : '现场'}；实际挂载：{lab.moduleScopes[extension.id]?.mounts.map(targetName).join('、') || '无'}。</p>
        <hr /><label>明确调用的扩展法器<select value={operationId} disabled={disabled} onChange={event => setOperationId(event.target.value)}><option value="">选择一件扩展法器</option>{extensionOperations.map(operation => <option key={operation.id} value={operation.id}>{displayActionLabel(operation.label)}</option>)}</select></label>
        {extensionOperation?.protocol?.parameters.map(parameter => <label key={parameter.name}>{parameter.label}<select value={String(argumentsDraft[parameter.name] ?? '')} disabled={disabled} onChange={event => { const choice = parameter.choices.find(item => String(item.value) === event.target.value); if (choice) setArgumentsDraft(items => ({ ...items, [parameter.name]: choice.value })); }}><option value="">选择参数</option>{parameter.choices.map((choice, index) => <option key={index} value={String(choice.value)}>{choice.label}</option>)}</select></label>)}
        {extensionOperation?.protocol && <label>本次幂等键（可选）<input value={requestKey} maxLength={100} disabled={disabled} onChange={event => setRequestKey(event.target.value)} /></label>}
        {extensionOperation && <>{renderExactCall(invokeCall)}{labCallDenial(scenario, extensionState, invokeCall, { moduleId: extension.id }) && <p className="blueprint-warning">当前边界：{labCallDenial(scenario, extensionState, invokeCall, { moduleId: extension.id })}</p>}
          {can({ type: 'lab', operation: 'approve', moduleId: extension.id, call: invokeCall }) && <button type="button" onClick={() => void change({ type: 'lab', operation: 'approve', moduleId: extension.id, call: invokeCall })}>只批准此扩展执行域的这次请求</button>}
          {matchingLabPermit(scenario, extensionState, invokeCall, undefined, extension.id) && <p className="blueprint-note">此扩展、此执行域和此精确请求已有单次许可。内置工具与其他扩展不能借用。</p>}
        </>}
        {paused && <p className="blueprint-note">先恢复委托，再明确调用扩展。恢复不会自动执行此法器。</p>}
        <button type="button" disabled={!extensionOperation || !can({ type: 'lab', operation: 'invoke', moduleId: extension.id, call: invokeCall })} onClick={() => void change({ type: 'lab', operation: 'invoke', moduleId: extension.id, call: invokeCall })}>在此扩展实际执行域中调用一次</button>
      </>}
    </div></details>}

    {hasModules && <details className="blueprint-block"><summary>提交、断电与临时显示 <span>已提交 {lab.log.entries.length} 条真实事件</span></summary><div className="blueprint-body">
      <div className="blueprint-versions"><span>存储提供方 {lab.log.providerId ? moduleName(lab.log.providerId) : '尚未激活'}</span><span>日志格式 v{lab.log.format}</span><span>提交至事件 #{lab.log.committedSequence}</span></div>
      <p>只有真实输入、请求、回执和验收进入恢复日志。断电后重新形成已提交事实的投影；现场、资源与执行游标不回滚，已经发出的动作不重做。</p>
      <div className="blueprint-buttons"><button type="button" disabled={!can({ type: 'lab', operation: 'commit' })} onClick={() => void change({ type: 'lab', operation: 'commit' })}>提交新的真实事件</button>{!paused && onPause && <button type="button" disabled={disabled || state.status !== 'running'} onClick={() => void pauseOrResume(onPause)}>先暂停，准备断电恢复</button>}<button type="button" disabled={!can({ type: 'lab', operation: 'power-cycle' })} onClick={() => void change({ type: 'lab', operation: 'power-cycle' })}>断电并从已提交日志恢复</button></div>
      {!paused && <p className="blueprint-note">断电恢复需要先暂停委托。未提交信息会消失，身份与一次批准需要重新取得。</p>}
      <details><summary>已提交记录（只展示已取得事实）</summary>{lab.log.entries.length ? <ol className="blueprint-log">{lab.log.entries.map(event => <li key={event.id}><strong>#{event.sequence} · {event.type === 'lab-change' ? '实际输入' : event.tool ? tools[event.tool] : '执行事件'}</strong><p>{event.text}</p>{event.facts && Object.keys(event.facts).length > 0 && <dl className="blueprint-facts">{Object.entries(event.facts).map(([fact, value]) => <div key={fact}><dt>{factLabels[fact] ?? fact}</dt><dd>{displayFact(fact, value)}</dd></div>)}</dl>}</li>)}</ol> : <p className="blueprint-note">日志为空，显示成功动画也不会生成恢复证据。</p>}</details>
      <hr /><label>临时显示信号（最多 200 字）<input value={signal} maxLength={200} disabled={disabled} onChange={event => setSignal(event.target.value)} placeholder="例如：舞台灯变绿" /></label><button type="button" disabled={!can({ type: 'lab', operation: 'ui-signal', signal })} onClick={() => void change({ type: 'lab', operation: 'ui-signal', signal })}>只更新临时显示</button>
      {lab.uiSignal && <p className="blueprint-ui-signal" role="status">临时信号：{lab.uiSignal}</p>}<p className="blueprint-note">此信号不改变世界，不作执行回执，不进入恢复日志。</p>
    </div></details>}
  </section>;
}
