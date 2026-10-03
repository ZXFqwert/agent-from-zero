import { useEffect, useState } from 'react';
import { ClipboardList, GitMerge, Mail, Users } from 'lucide-react';
import { reduceGame } from '../engine';
import type { ContextRecord, FactMap, GameAction, GameState, ScenarioDefinition, SourceProvenance, TeamBlueprint, ToolCall, ToolName } from '../engine';
import { factLabels } from '../content/scenarios';
import { displayActionLabel, displayFact, displaySource } from '../content/presentation';

type WithoutId<T> = T extends { id: string } ? Omit<T, 'id'> : never;
export type TeamInput = WithoutId<Extract<GameAction, { type: 'team' }>>;
const toolLabels: Record<ToolName, string> = { observe: '观察', operate: '行动', verify: '验收' };
const statusLabels = { queued: '已排队', waiting: '等待交接', running: '正在执行', succeeded: '任务完成', failed: '失败停止', cancelled: '已取消' };
const shortId = (id: string) => id.split(':').slice(-3).join(' · ');
const sourceLabel = (source?: SourceProvenance) => !source ? '未标注来源' : `${source.trust === 'registry' ? '登记资料' : source.trust === 'executor' ? '实际法器回执' : '外部资料'} · ${source.realm === 'live' ? '城市现场' : '镜砂沙箱'} · ${source.observationId}`;
const toggle = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];

export default function TeamDeck({ scenario, state, busy = false, onTeam }: {
  scenario: ScenarioDefinition;
  state: GameState;
  busy?: boolean;
  onTeam: (input: TeamInput) => void | Promise<unknown>;
}) {
  const [jobId, setJobId] = useState('');
  const [actorId, setActorId] = useState('');
  const [inputs, setInputs] = useState<string[]>([]);
  const [boardRefs, setBoardRefs] = useState<Array<{ slotId: string; revision: number }>>([]);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [requestId, setRequestId] = useState('');
  const [resultId, setResultId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [publishRecordId, setPublishRecordId] = useState('');
  const [fields, setFields] = useState<string[]>([]);
  const [contractActorId, setContractActorId] = useState('');
  const [draftContracts, setDraftContracts] = useState<Record<string, TeamBlueprint>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    setJobId(''); setActorId(''); setInputs([]); setBoardRefs([]); setDependencies([]);
    setRequestId(''); setResultId(''); setSlotId(''); setPublishRecordId(''); setFields([]);
    setContractActorId(''); setDraftContracts({}); setError('');
  }, [scenario.id, state.team?.scheduler.generation]);
  if (!scenario.team || !state.team) return null;

  const definitions = scenario.team, team = state.team;
  const disabled = busy || state.status === 'won';
  const records = state.context?.records ?? [], activeIds = state.context?.activeIds ?? [];
  const job = definitions.jobs.find(item => item.id === jobId);
  const actor = definitions.actors.find(item => item.id === actorId);
  const dispatchContract = team.actors.find(item => item.id === actor?.id)?.blueprint;
  const actorName = (id: string) => definitions.actors.find(item => item.id === id)?.label ?? id;
  const jobName = (id: string) => definitions.jobs.find(item => item.id === id)?.label ?? id;
  const artifactName = (id: string) => definitions.artifacts.find(item => item.id === id)?.label ?? id;
  const taskName = (id: string) => {
    const task = team.tasks.find(item => item.id === id);
    return task ? `${jobName(task.jobId)} · ${actorName(task.actorId)} · ${shortId(task.id)}` : shortId(id);
  };
  const callLabel = (call: ToolCall) => call.tool === 'observe' ? displayActionLabel(scenario.observations.find(item => item.id === call.observationId)?.label ?? call.observationId)
    : call.tool === 'operate' ? displayActionLabel(scenario.operations.find(item => item.id === call.operationId)?.label ?? call.operationId)
    : `验收：${scenario.goals.find(item => item.fact === call.fact)?.label ?? factLabels[call.fact] ?? call.fact}`;
  const callCost = (call: ToolCall) => call.tool === 'observe' ? scenario.observations.find(item => item.id === call.observationId)?.cost ?? scenario.limits?.toolCosts?.observe ?? 1
    : call.tool === 'operate' ? scenario.operations.find(item => item.id === call.operationId)?.cost ?? scenario.limits?.toolCosts?.operate ?? 1
    : scenario.goals.find(item => item.fact === call.fact)?.verifyCost ?? scenario.limits?.toolCosts?.verify ?? 1;
  const visibleFacts = (record: ContextRecord): FactMap => {
    const summary = scenario.observations.find(item => item.id === record.observationId)?.document?.summaries?.find(item => item.id === record.summaryId);
    return Object.fromEntries(Object.entries(record.facts).filter(([fact]) => !summary || summary.retain.includes(fact)));
  };
  const recordAllowed = (record: ContextRecord) => Boolean(job && (record.teamOrigin
    ? job.inputJobIds?.includes(team.tasks.find(item => item.id === record.teamOrigin?.taskId)?.jobId ?? '')
    : job.inputObservationIds.includes(record.observationId)));
  const inputCards = records.filter(recordAllowed);
  const selectedInputs = inputs.filter(id => inputCards.some(record => record.id === id));
  const selectedBoard = boardRefs.filter(ref => definitions.board.some(slot => slot.id === ref.slotId));
  const selectedDependencies = dependencies.filter(id => team.tasks.some(task => task.id === id));
  const latest = state.events.filter(event => event.type === 'team-change').at(-1);
  const pending = team.tasks.filter(task => ['queued', 'waiting', 'running'].includes(task.status));
  const pendingResults = team.results.filter(result => !result.received);
  const selectedSlot = definitions.board.find(item => item.id === slotId) ?? definitions.board[0];
  const currentSlot = team.board.find(item => item.id === selectedSlot?.id);
  const publishRecord = records.find(record => record.id === publishRecordId);
  const publishFields = publishRecord ? Object.keys(visibleFacts(publishRecord)).filter(fact => selectedSlot?.allowedFacts.includes(fact)) : [];
  const selectedFields = fields.filter(fact => publishFields.includes(fact));
  const contractActor = definitions.actors.find(item => item.id === contractActorId) ?? definitions.actors[0];
  const existingContract = team.actors.find(item => item.id === contractActor?.id)?.blueprint;
  const contract = contractActor ? draftContracts[contractActor.id] ?? existingContract : undefined;
  const contractBusy = Boolean(contractActor && pending.some(task => task.actorId === contractActor.id));
  const availableTargets = contractActor?.permissions.includes('*')
    ? [...new Set([...scenario.observations.map(item => item.target), ...scenario.operations.map(item => item.target)])]
    : contractActor?.permissions ?? [];
  const targetLabel = (target: string) => callLabel(scenario.observations.some(item => item.target === target)
    ? { tool: 'observe', observationId: scenario.observations.find(item => item.target === target)!.id }
    : scenario.operations.some(item => item.target === target) ? { tool: 'operate', operationId: scenario.operations.find(item => item.target === target)!.id }
    : { tool: 'verify', fact: target });
  const change = (input: TeamInput) => {
    let previewState = state;
    if (input.operation === 'tick' && state.status === 'paused') {
      previewState = reduceGame(scenario, state, { id: `team-ui-resume-preview-${state.processedActionIds.length}`, type: 'resume', mode: 'manual' });
      if (previewState === state) { setError('这次派遣还不能恢复。检查剩余晶石；本轮预算不足时，先到工坊签订下一次派遣，再继续保留的工作队列。'); return; }
    }
    if (input.operation === 'merge') {
      const proposal = team.proposals.find(item => item.id === input.proposalId);
      const task = team.tasks.find(item => item.id === proposal?.taskId);
      if (task && task.status !== 'succeeded') { setError('这项工作还没有完整成功。草稿不能替代其余步骤；先查看任务的等待或失败记录。总图未改变。'); return; }
      if (task && !team.results.some(result => result.taskId === task.id && result.received)) { setError('草稿已经形成，但这项任务的结果还没交接。先按编号接回结果，再审阅总图版本与草稿。'); return; }
    }
    if (reduceGame(scenario, previewState, { ...input, id: `team-ui-preview-${state.processedActionIds.length}` }) === previewState) {
      setError(input.operation === 'receive' ? '这份结果与选中的原任务编号不匹配，或已经接回。未重复执行任务、未扣资源。'
        : input.operation === 'merge' ? '草稿基准与当前总图版本不一致，或缺少有效生成记录。请取得新总图作为输入，重新生成；这次没有覆盖成果。'
        : input.operation === 'tick' ? state.status === 'paused' ? '委托已经暂停。先从主控恢复，再推进协作；任务与现场仍在暂停点。' : '现在没有可推进的任务。查看等待原因，接回已完成的上游结果，或取消失败依赖后重新安排；等待不扣晶石。'
        : input.operation === 'publish' ? '这次发布不符合当前槽版本、字段范围或资料来源。请重选实际资料和可分享字段；共享板未改变。'
        : input.operation === 'configure' ? '这个契约超出伙伴可配置范围，或伙伴仍有未结束任务。先完成或取消任务；已用晶石不会退回。'
        : input.operation === 'cancel' ? '任务已结束或不能取消。已经发生的现场变化与费用仍然保留。'
        : '任务不能排队。检查负责者、已取得输入、共享板版本、已有依赖和任务上限；没有工具执行、没有扣晶石。');
      return;
    }
    setError(''); void onTeam(input);
  };
  const updateContract = (next: TeamBlueprint) => contractActor && setDraftContracts({ ...draftContracts, [contractActor.id]: next });
  const factList = (facts: FactMap, provenance?: Record<string, SourceProvenance>, fallback?: SourceProvenance) => <ul className="team-deck-facts">{Object.entries(facts).map(([fact, value]) => <li key={fact}><span>{factLabels[fact] ?? fact}：<strong>{displayFact(fact, value)}</strong></span>{(provenance?.[fact] || fallback) && <small>{sourceLabel(provenance?.[fact] ?? fallback)}</small>}</li>)}</ul>;

  return <section className="team-deck" aria-label="伙伴协作台">
    <div className="section-label"><Users size={17} />伙伴协作台</div>
    <p className="muted">你决定谁带哪些资料、做哪一项工作。伙伴使用明确的教学策略，执行有限法器步骤；增加伙伴不会自动增加事实或权限。</p>
    <div className="team-deck-overview"><span>逻辑轮次 <strong>{team.scheduler.round}</strong></span><span>等待或执行 <strong>{pending.length}</strong></span><span>待接回 <strong>{pendingResults.length}</strong></span><span>共用晶石 <strong>{state.runtime?.missionRemaining ?? state.budgetRemaining}</strong></span></div>

    <article className="team-deck-dispatch" aria-label="安排伙伴任务">
      <h4><ClipboardList size={16} />安排一项工作</h4>
      <label>1 · 任务<select aria-label="协作任务" value={job?.id ?? ''} disabled={disabled} onChange={event => { setJobId(event.target.value); setActorId(''); setInputs([]); setBoardRefs([]); setDependencies([]); }}><option value="">选择要完成的工作</option>{definitions.jobs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>2 · 负责者<select aria-label="任务负责者" value={actor?.id ?? ''} disabled={disabled || !job} onChange={event => setActorId(event.target.value)}><option value="">选择负责的伙伴</option>{definitions.actors.map(item => <option key={item.id} value={item.id}>{item.label}{job && !job.actorIds.includes(item.id) ? ' · 本任务未开放' : ''}</option>)}</select></label>
      {actor && <small>{actor.description} · 卷轴容量 {actor.contextCapacity} 格。能力来自工作契约。</small>}
      {dispatchContract && <details className="team-deck-dispatch-contract"><summary>这次将使用的伙伴契约</summary><small>工具：{dispatchContract.tools.map(tool => toolLabels[tool]).join('、') || '未装备'}。单任务预算 {dispatchContract.budget} 点。</small><small>目标范围：{dispatchContract.permissions.includes('*') ? '本关声明的全部虚拟目标' : dispatchContract.permissions.map(targetLabel).join('、') || '未授权目标'}。</small>{dispatchContract.toolPermissions && <small>法器各自范围：{Object.entries(dispatchContract.toolPermissions).map(([tool, targets]) => `${toolLabels[tool as ToolName]}：${targets?.map(targetLabel).join('、') || '未授权'}`).join('；')}。</small>}</details>}
      {job && <>
        <div className="team-deck-job-rules"><strong>这项工作需要的输入</strong><span>{job.requiredInputFacts?.length ? job.requiredInputFacts.map(fact => factLabels[fact] ?? fact).join('、') : '不要求事先带入字段，可先执行所列观察。'}</span><small>可负责：{job.actorIds.map(actorName).join('、')}。预计成功路径 {job.steps.reduce((sum, call) => sum + callCost(call), 0)} 点晶石，实际按每次请求收费；失败也可能有费用。</small></div>
        <fieldset className="team-deck-inputs"><legend>3 · 给他携带的真实资料</legend><small>从已取得的资料明确交给伙伴，不要求回声自己装卷；已派出的输入是这次的快照。</small>{inputCards.length ? inputCards.map(record => <label className="team-deck-check" key={record.id}><input type="checkbox" aria-label={`任务输入：${record.label}`} disabled={disabled} checked={selectedInputs.includes(record.id)} onChange={() => setInputs(toggle(inputs, record.id))} /><span>{record.label}<small>{Object.keys(visibleFacts(record)).map(fact => factLabels[fact] ?? fact).join('、')} · {record.summaryId ? scenario.observations.find(item => item.id === record.observationId)?.document?.summaries?.find(item => item.id === record.summaryId)?.units ?? record.units : record.units} 格{record.summaryId ? '（摘要）' : ''} · {activeIds.includes(record.id) ? '回声已携带' : '回声档案中'}{record.artifactOrigin ? ` · 总图 v${record.artifactOrigin.revision}` : ''}</small></span></label>) : <p className="muted">还没有可选的实际资料。先观察或接回结果；没有输入的任务也可能实际失败。</p>}</fieldset>
        {definitions.board.length > 0 && <details className="team-deck-board-inputs"><summary>从共享板取输入 · 已选 {selectedBoard.length} 条</summary>{team.board.map(slot => {
          const ref = selectedBoard.find(item => item.slotId === slot.id);
          return <label className="team-deck-check" key={slot.id}><input type="checkbox" aria-label={`共享板输入：${definitions.board.find(item => item.id === slot.id)?.label ?? slot.id}`} disabled={disabled || !slot.record} checked={Boolean(ref)} onChange={() => setBoardRefs(ref ? boardRefs.filter(item => item.slotId !== slot.id) : [...boardRefs, { slotId: slot.id, revision: slot.revision }])} /><span>{definitions.board.find(item => item.id === slot.id)?.label ?? slot.id} · v{slot.revision}<small>{slot.record ? `${slot.record.label} · ${slot.record.units} 格` : '尚未发布'}{ref && ref.revision !== slot.revision ? ` · 你选的是旧 v${ref.revision}，取消勾选后重选当前版本。` : ''}</small></span></label>;
        })}</details>}
        <details className="team-deck-dependencies"><summary>等哪些已有任务交接完 · 已选 {selectedDependencies.length} 项</summary><small>依赖绑定具体编号。上游成功并接回后才能执行；同名的新任务不会替换旧编号。</small>{team.tasks.length ? team.tasks.map(task => <label className="team-deck-check" key={task.id}><input type="checkbox" aria-label={`任务依赖：${taskName(task.id)}`} disabled={disabled} checked={selectedDependencies.includes(task.id)} onChange={() => setDependencies(toggle(dependencies, task.id))} /><span>{taskName(task.id)}<small>{statusLabels[task.status]} · {task.resultId && team.results.find(result => result.id === task.resultId)?.received ? '结果已接回' : '交接尚未完成'}</small></span></label>) : <p className="muted">还没有已有任务。先排第一项工作，再为下一项选择它。</p>}</details>
        <details className="team-deck-job-steps"><summary>查看这项工作的法器与收费 · {job.steps.length} 步</summary><ol>{job.steps.map((call, index) => {
          const operation = call.tool === 'operate' ? scenario.operations.find(item => item.id === call.operationId) : undefined;
          return <li key={index}><strong>{toolLabels[call.tool]} · {callLabel(call)}</strong><small>{callCost(call)} 点晶石{operation?.collaboration?.draftArtifactId ? ' · 形成设计草稿，不直接施工' : call.tool === 'operate' ? ' · 成功后改变现场' : ' · 取得实际回响'}</small>{operation?.collaboration?.actorIds?.length ? <small>实际执行岗位：{operation.collaboration.actorIds.map(actorName).join('、')}。宽泛目标权限不能替代岗位能力。</small> : null}</li>;
        })}</ol><small>排队保存这次输入与契约。以后换卷轴或发布新板条目，不会悄悄更改这项任务。</small></details>
      </>}
      <button className="button primary" disabled={disabled || !job || !actor} onClick={() => job && actor && change({ type: 'team', operation: 'enqueue', jobId: job.id, actorId: actor.id, inputRecordIds: selectedInputs, boardRefs: selectedBoard, afterTaskIds: selectedDependencies })}>排队：{job?.label ?? '先选择工作'}</button>
      <small>排队不收费、不执行。全部伙伴共用委托晶石；最终完成仍由回声在现场验收。</small>
    </article>

    <div className="team-deck-scheduler"><button className="button primary" disabled={disabled || !pending.length} onClick={() => change({ type: 'team', operation: 'tick' })}>{state.status === 'paused' ? '恢复委托并推进协作一轮' : '推进协作一轮'}</button><small>{state.status === 'paused' && '委托已暂停；点击这个按钮才恢复。'}每名可运行伙伴最多做一步；这是逻辑轮，不是现实秒数。等待不扣费，切后台不会偷偷推进。</small></div>
    {team.tasks.length > 0 && <div className="team-deck-queue"><h4>工作队列 · {team.tasks.length} 项</h4>{[...team.tasks].reverse().map(task => <details className={`team-deck-task team-deck-status-${task.status}`} key={task.id} aria-label={`协作任务记录：${taskName(task.id)}`}><summary><span><strong>{jobName(task.jobId)}</strong><small>{actorName(task.actorId)} · {shortId(task.id)}</small></span><b>{statusLabels[task.status]}</b></summary>
      <p>已执行 {task.cursor} / {definitions.jobs.find(item => item.id === task.jobId)?.steps.length ?? 0} 步 · 任务还可用 {task.remainingBudget} 点晶石。</p>
      {(task.waitingReason || task.failureReason) && <p className="team-deck-reason">{task.failureReason ?? task.waitingReason}</p>}
      {task.afterTaskIds.length > 0 && <p>依赖：{task.afterTaskIds.map(taskName).join('；')}</p>}
      <details><summary>他实际携带与知道什么</summary><small>派遣时的私有快照。你看见的其他资料不会自动进他的卷轴；所知内容也可能过期。</small>{task.inputs.map(record => <article className="team-deck-private-card" key={record.id}><strong>{record.label}</strong><small>{displaySource(record.source)}</small>{factList(visibleFacts(record), record.fieldProvenance, record.provenance)}</article>)}<strong className="team-deck-subtitle">任务当前已知字段</strong>{factList(Object.fromEntries(Object.entries(task.observed).map(([fact, known]) => [fact, known.value])), Object.fromEntries(Object.entries(task.observed).filter(([, known]) => known.provenance).map(([fact, known]) => [fact, known.provenance!])))}{task.inputs.length === 0 && Object.keys(task.observed).length === 0 && <p className="muted">目前没有取得字段。</p>}</details>
      <details><summary>这一项工作的执行契约</summary><small>法器：{task.blueprint.tools.map(tool => toolLabels[tool]).join('、') || '未装备'}。范围：{task.blueprint.permissions.includes('*') ? '声明的全部虚拟目标' : task.blueprint.permissions.map(targetLabel).join('、') || '未授权目标'}。不会借用回声的身份或单次许可。</small></details>
      {['queued', 'waiting', 'running'].includes(task.status) && <button className="button" disabled={disabled} onClick={() => change({ type: 'team', operation: 'cancel', taskId: task.id })}>取消剩余工作：{jobName(task.jobId)}</button>}
    </details>)}</div>}

    {team.results.length > 0 && <article className="team-deck-receive" aria-label="协作结果交接"><h4><Mail size={16} />结果到了，还需要接回</h4><p className="muted">按原任务编号匹配回信。接回只进入回声档案，还须装卷；子任务完成不是主委托完成。</p>
      <label>原任务<select aria-label="接回的原任务" value={team.tasks.some(task => task.id === requestId) ? requestId : ''} disabled={disabled} onChange={event => setRequestId(event.target.value)}><option value="">选择你在等待的任务编号</option>{team.tasks.map(task => <option key={task.id} value={task.id}>{taskName(task.id)} · {statusLabels[task.status]}</option>)}</select></label>
      <label>回信<select aria-label="接回的任务结果" value={team.results.some(result => result.id === resultId && !result.received) ? resultId : ''} disabled={disabled} onChange={event => setResultId(event.target.value)}><option value="">选择一份未接回的结果</option>{pendingResults.map(result => <option key={result.id} value={result.id}>{jobName(result.jobId)} · {actorName(result.actorId)} · 任务 {shortId(result.taskId)} · 结果 {shortId(result.id)}</option>)}</select></label>
      <button className="button primary" disabled={disabled || !requestId || !pendingResults.some(result => result.id === resultId)} onClick={() => change({ type: 'team', operation: 'receive', taskId: requestId, resultId })}>按编号接回结果</button>
      <details><summary>查看实际结果与来源 · {team.results.length} 份</summary>{[...team.results].reverse().map(result => <article className="team-deck-result" key={result.id}><strong>{jobName(result.jobId)} · {result.received ? '已接回' : '等待接回'}</strong><small>{actorName(result.actorId)} · 原任务 {shortId(result.taskId)} · 结果 {shortId(result.id)}</small>{factList(result.facts, result.fieldProvenance)}{Object.keys(result.facts).length === 0 && <small>没有允许导出的已知字段。完成通知不能制造新事实。</small>}<small>来源事件：{result.sourceEventIds.map(shortId).join('、') || '没有工具记录'}</small></article>)}</details>
    </article>}

    {definitions.artifacts.length > 0 && <div className="team-deck-artifacts" aria-label="草稿与总图"><h4><GitMerge size={16} />草稿与总图</h4><p className="muted">草稿成功不是施工。合并要对上总图版本；合并之后还要真实施工与验收。</p>{team.artifacts.map(artifact => <article className="team-deck-artifact" key={artifact.id}><strong>{artifactName(artifact.id)} · 当前 v{artifact.revision}</strong>{factList(artifact.fields)}{Object.keys(artifact.fields).length === 0 && <small>尚未合并字段。</small>}{team.proposals.filter(proposal => proposal.artifactId === artifact.id).map(proposal => <div className={`team-deck-proposal ${!proposal.merged && proposal.baseRevision !== artifact.revision ? 'team-deck-conflict' : ''}`} key={proposal.id}><strong>{actorName(proposal.actorId)}的草稿 · {proposal.merged ? '已合并' : '未合并'}</strong><small>任务 {shortId(proposal.taskId)} · 草稿 {shortId(proposal.id)}</small><p>草稿基准 <b>v{proposal.baseRevision}</b> → 总图当前 <b>v{artifact.revision}</b></p>{factList(proposal.fields)}{!proposal.merged && proposal.baseRevision !== artifact.revision && <p className="team-deck-reason">总图已经更新。取得当前版本作为新任务输入，重新形成草稿；拒绝不会覆盖已有成果。</p>}<button className="button" disabled={disabled || proposal.merged} onClick={() => change({ type: 'team', operation: 'merge', proposalId: proposal.id, expectedRevision: artifact.revision })}>{proposal.merged ? '草稿已合并' : `合并草稿：${artifactName(artifact.id)}`}</button></div>)}</article>)}</div>}

    {definitions.board.length > 0 && <details className="team-deck-board" aria-label="有限共享板"><summary>共享板 · {team.board.filter(slot => slot.record).length} / {definitions.board.length} 个槽</summary><p className="muted">发布已读到的资料，明确选择字段。发布不让所有伙伴自动知道，新任务还须选取板上的版本。</p>{team.board.map(slot => <article className="team-deck-board-slot" key={slot.id}><strong>{definitions.board.find(item => item.id === slot.id)?.label ?? slot.id} · v{slot.revision}</strong>{slot.record ? <><small>{slot.record.label} · {displaySource(slot.record.source)}</small>{factList(visibleFacts(slot.record), slot.record.fieldProvenance, slot.record.provenance)}</> : <small>空槽</small>}</article>)}
      <label>发布位置<select aria-label="共享板发布位置" value={selectedSlot?.id ?? ''} disabled={disabled} onChange={event => { setSlotId(event.target.value); setFields([]); }} >{definitions.board.map(slot => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></label>
      <label>实际资料<select aria-label="共享板发布资料" value={publishRecord?.id ?? ''} disabled={disabled} onChange={event => { setPublishRecordId(event.target.value); setFields([]); }}><option value="">选择一份已取得资料</option>{[...records].reverse().map(record => <option key={record.id} value={record.id}>{record.label} · {activeIds.includes(record.id) ? '已携带' : '档案中'}{record.artifactOrigin ? ` · 总图 v${record.artifactOrigin.revision}` : ''}</option>)}</select></label>
      <fieldset><legend>允许发布的已知字段</legend>{publishFields.length ? publishFields.map(fact => <label className="team-deck-check" key={fact}><input type="checkbox" aria-label={`共享字段：${factLabels[fact] ?? fact}`} disabled={disabled} checked={selectedFields.includes(fact)} onChange={() => setFields(toggle(fields, fact))} /><span>{factLabels[fact] ?? fact}：{displayFact(fact, visibleFacts(publishRecord!)[fact])}</span></label>) : <p className="muted">这份资料没有本槽允许分享的字段。不能任意填写值，也不能分享超出范围的身份材料。</p>}</fieldset>
      <button className="button" disabled={disabled || !publishRecord || !selectedSlot || !currentSlot || !selectedFields.length} onClick={() => publishRecord && selectedSlot && currentSlot && change({ type: 'team', operation: 'publish', slotId: selectedSlot.id, recordId: publishRecord.id, expectedRevision: currentSlot.revision, fieldKeys: selectedFields })}>发布到共享板：{selectedSlot?.label ?? '没有槽位'}</button><small>这次以共享板 v{currentSlot?.revision ?? 0} 为基准。原观察来源、任务来历和所选字段会保留。</small>
    </details>}

    {contractActor && contract && <details className="team-deck-contract" aria-label="伙伴工作契约"><summary>伙伴工作契约 · 查看或缩小能力范围</summary><p className="muted">选择法器、目标与任务预算。既有任务使用排队时的契约；忙碌伙伴先结束或取消工作，已用晶石不退还。</p>
      <label>配置伙伴<select aria-label="配置的伙伴" value={contractActor.id} disabled={disabled} onChange={event => setContractActorId(event.target.value)}>{definitions.actors.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p>{contractActor.description}</p><small>本章最多 {contractActor.contextCapacity} 格资料 · 单任务预算上限 {contractActor.budget} 点。不是伙伴智能排名。</small>
      <fieldset><legend>装备法器</legend>{contractActor.tools.map(tool => <label className="team-deck-check" key={tool}><input type="checkbox" aria-label={`伙伴法器：${actorName(contractActor.id)} · ${toolLabels[tool]}`} disabled={disabled || contractBusy} checked={contract.tools.includes(tool)} onChange={() => updateContract({ ...contract, tools: toggle(contract.tools, tool) as ToolName[] })} /><span>{toolLabels[tool]}</span></label>)}</fieldset>
      <fieldset><legend>允许目标</legend>{availableTargets.map(target => <label className="team-deck-check" key={target}><input type="checkbox" aria-label={`伙伴范围：${actorName(contractActor.id)} · ${targetLabel(target)}`} disabled={disabled || contractBusy} checked={contract.permissions.includes('*') || contract.permissions.includes(target)} onChange={() => updateContract({ ...contract, permissions: toggle(contract.permissions.includes('*') ? availableTargets : contract.permissions, target) })} /><span>{targetLabel(target)}</span></label>)}</fieldset>
      <label>单任务可用晶石 <input aria-label={`伙伴任务预算：${actorName(contractActor.id)}`} type="number" inputMode="numeric" min={1} max={contractActor.budget} disabled={disabled || contractBusy} value={contract.budget} onChange={event => updateContract({ ...contract, budget: Number(event.target.value) })} /></label>
      {contract.toolPermissions && <small>已有分法器范围仍保留：{Object.entries(contract.toolPermissions).map(([tool, targets]) => `${toolLabels[tool as ToolName]}：${targets?.map(targetLabel).join('、') || '未授权'}`).join('；')}。</small>}
      <button className="button" disabled={disabled || contractBusy} onClick={() => change({ type: 'team', operation: 'configure', actorId: contractActor.id, blueprint: contract })}>签订伙伴契约：{contractActor.label}</button>{contractBusy && <p className="team-deck-reason">这个伙伴还有未结束任务，当前契约不能改变派出的快照。</p>}
    </details>}

    {latest && <div className="team-deck-feedback" role="status" aria-live="polite"><strong>协作回响</strong><p>{latest.text}</p></div>}
    {error && <p className="team-deck-error" role="alert">{error}</p>}
  </section>;
}
