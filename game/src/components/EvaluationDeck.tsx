import { useEffect, useState } from 'react';
import './evaluation.css';
import { ClipboardCheck, FlaskConical, Scale, ShieldCheck } from 'lucide-react';
import type { GameEvent, GameState, ScenarioDefinition, ToolCall, ToolName } from '../engine';
import type { EvaluationAction, EvaluationCriterion, EvaluationDefinition, EvaluationEventFields, EvaluationEventType, EvaluationRun, EvaluationState } from '../engine/evaluation-contract';
import { factLabels } from '../content/scenarios';
import { displayActionLabel, displayFact } from '../content/presentation';

type WithoutId<T> = T extends { id: string } ? Omit<T, 'id'> : never;
export type EvaluationInput = WithoutId<EvaluationAction>;
type EvaluationEvent = Omit<GameEvent, 'type'> & EvaluationEventFields & { type: GameEvent['type'] | EvaluationEventType };
type EvaluationScenario = ScenarioDefinition & { evaluation?: EvaluationDefinition };
type EvaluationGameState = Omit<GameState, 'events'> & { evaluation?: EvaluationState; events: EvaluationEvent[] };
const toolLabels: Record<ToolName, string> = { observe: '观察', operate: '行动', verify: '验收' };
const statusLabels = { queued: '已锁定，待执行', running: '执行法器', measuring: '量测结果', completed: '报告已完成', cancelled: '已取消', exhausted: '资源耗尽' };
const checkLabels = { pass: '通过', fail: '未通过', unknown: '未知，需补证' };
const categoryLabels = { normal: '正常情境', boundary: '边界情境', exception: '故障情境', holdout: '封存留出' };
const toggle = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
const equalIds = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

export default function EvaluationDeck({ scenario, state, busy = false, onEvaluation }: {
  scenario: EvaluationScenario;
  state: EvaluationGameState;
  busy?: boolean;
  onEvaluation: (input: EvaluationInput) => void | Promise<unknown>;
}) {
  const [candidateId, setCandidateId] = useState(state.evaluation?.candidateId ?? '');
  const [criterionIds, setCriterionIds] = useState<string[]>(state.evaluation?.criterionIds ?? []);
  const [aggregation, setAggregation] = useState<'all' | 'any'>(state.evaluation?.aggregation ?? 'all');
  const [caseId, setCaseId] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setCandidateId(state.evaluation?.candidateId ?? '');
    setCriterionIds(state.evaluation?.criterionIds ?? []);
    setAggregation(state.evaluation?.aggregation ?? 'all');
    setError('');
  }, [scenario.id, state.evaluation?.generation, state.evaluation?.candidateRevision, state.evaluation?.contractRevision]);
  useEffect(() => { setCaseId(''); setShowAllHistory(false); }, [scenario.id, state.evaluation?.generation]);
  if (!scenario.evaluation || !state.evaluation) return null;

  const definitions = scenario.evaluation, evaluation = state.evaluation;
  const disabled = busy || state.status === 'won';
  const activeRun = evaluation.runs.find(run => run.id === evaluation.activeRunId);
  const running = Boolean(activeRun && ['queued', 'running', 'measuring'].includes(activeRun.status));
  const candidate = definitions.candidates.find(item => item.id === candidateId);
  const lockedCandidate = definitions.candidates.find(item => item.id === evaluation.candidateId);
  const selectedCase = definitions.cases.find(item => item.id === caseId);
  const draftChanged = candidateId !== evaluation.candidateId || aggregation !== evaluation.aggregation || !equalIds(criterionIds, evaluation.criterionIds);
  const isCurrent = (run: EvaluationRun) => run.candidateId === evaluation.candidateId && run.candidateRevision === evaluation.candidateRevision && run.contractRevision === evaluation.contractRevision;
  const currentRuns = evaluation.runs.filter(isCurrent);
  const displayedRun = activeRun ?? currentRuns.at(-1);
  const completedRuns = currentRuns.filter(run => run.status === 'completed');
  const testedCaseIds = new Set(completedRuns.map(run => run.caseId));
  const requiredTested = definitions.gate.caseIds.filter(id => testedCaseIds.has(id)).length;
  const currentCertificate = evaluation.certificate && evaluation.certificate.candidateId === evaluation.candidateId && evaluation.certificate.candidateRevision === evaluation.candidateRevision && evaluation.certificate.contractRevision === evaluation.contractRevision;
  const currentSeal = evaluation.seal && evaluation.seal.candidateId === evaluation.candidateId && evaluation.seal.candidateRevision === evaluation.candidateRevision && evaluation.seal.contractRevision === evaluation.contractRevision;
  const caseName = (id: string) => definitions.cases.find(item => item.id === id)?.label ?? id;
  const candidateName = (id: string) => definitions.candidates.find(item => item.id === id)?.label ?? id;
  const metricName = (id: string) => definitions.metrics.find(item => item.id === id)?.label ?? id;
  const criterionName = (id: string) => definitions.criteria.find(item => item.id === id)?.label ?? id;
  const targetName = (target: string) => scenario.observations.find(item => item.target === target)?.label ?? scenario.operations.find(item => item.target === target)?.label ?? target;
  const callLabel = (call: ToolCall) => call.tool === 'observe' ? displayActionLabel(scenario.observations.find(item => item.id === call.observationId)?.label ?? call.observationId)
    : call.tool === 'operate' ? displayActionLabel(scenario.operations.find(item => item.id === call.operationId)?.label ?? call.operationId)
    : `验收：${scenario.goals.find(item => item.fact === call.fact)?.label ?? factLabels[call.fact] ?? call.fact}`;
  const callCost = (call: ToolCall) => call.tool === 'observe' ? scenario.observations.find(item => item.id === call.observationId)?.cost ?? scenario.limits?.toolCosts?.observe ?? 1
    : call.tool === 'operate' ? scenario.operations.find(item => item.id === call.operationId)?.cost ?? scenario.limits?.toolCosts?.operate ?? 1
    : scenario.goals.find(item => item.fact === call.fact)?.verifyCost ?? scenario.limits?.toolCosts?.verify ?? 1;
  const criterionRule = (criterion: EvaluationCriterion) => {
    const metric = definitions.metrics.find(item => item.id === criterion.metricId);
    if (criterion.equals !== undefined) return `${metric?.label ?? criterion.metricId}须为${displayFact(metric?.fact ?? '', criterion.equals)}`;
    return `${metric?.label ?? criterion.metricId}${criterion.atLeast !== undefined ? `至少 ${criterion.atLeast}` : ''}${criterion.atLeast !== undefined && criterion.atMost !== undefined ? '，' : ''}${criterion.atMost !== undefined ? `至多 ${criterion.atMost}` : ''}`;
  };
  const selectedMetrics = (run: EvaluationRun) => definitions.metrics.filter(metric => definitions.criteria.some(criterion => run.criterionIds.includes(criterion.id) && criterion.metricId === metric.id));
  const runEvents = (run: EvaluationRun) => state.events.filter(event => run.eventIds.includes(event.id));
  const runCost = (run: EvaluationRun) => runEvents(run).reduce((cost, event) => cost + (event.cost ?? 0), 0);
  const latest = state.events.filter(event => event.type === 'evaluation-change').at(-1);
  const history = [...evaluation.runs].reverse().filter(run => run.id !== displayedRun?.id);
  const visibleHistory = showAllHistory ? history : history.slice(0, 5);
  const seenCount = definitions.cases.filter(item => evaluation.seenCaseIds.includes(item.id)).length;

  const change = async (input: EvaluationInput) => {
    if (disabled) return;
    if (input.operation === 'configure' && (!input.candidateId || input.criterionIds.length === 0)) { setError('先选一份行动构筑，再选择至少一项真实检查。选择还没有锁定，也没有消耗晶石。'); return; }
    if (input.operation === 'run' && draftChanged) { setError('上方选择还未锁定。先锁定构筑与验收契约，让这次试验明确对应哪一版。'); return; }
    setError('');
    try { await onEvaluation(input); } catch { setError('这次操作尚未确认完成。查看行动记录和当前试验状态后再继续，页面不会自行补造报告。'); }
  };

  const renderRun = (run: EvaluationRun) => {
    const metrics = selectedMetrics(run), events = runEvents(run);
    const finishedMeasurements = metrics.filter(metric => run.measurements.some(item => item.metricId === metric.id));
    const knownMeasurements = run.measurements.filter(item => item.known).length;
    const passed = run.checks.filter(check => check.status === 'pass').length;
    const unknown = run.checks.filter(check => check.status === 'unknown').length;
    return <>
      <div className="evaluation-deck-versions"><span>构筑 v{run.candidateRevision}</span><span>契约 v{run.contractRevision}</span><span>实际消耗 {runCost(run)} 点</span></div>
      {!isCurrent(run) && <p className="evaluation-deck-note">历史版本：可回看原因，不能作为当前构筑的交付证据。</p>}
      <small>{candidateName(run.candidateId)} · {run.aggregation === 'all' ? '所选条件全部通过' : '所选条件至少一项通过'} · {run.firstSeen ? '本案例首次开启' : '已见案例再测，属于调试 / 回归'}。首次开启不保证通过或普遍可靠。</small>
      <div className="evaluation-deck-counts"><span>策略进度 <strong>{run.cursor}/{definitions.candidates.find(item => item.id === run.candidateId)?.steps.length ?? 0}</strong></span><span>已量测 <strong>{finishedMeasurements.length}/{metrics.length}</strong></span><span>未测 <strong>{metrics.length - finishedMeasurements.length}</strong></span></div>
      <small>量测后仍可能未知：已取得数值 {knownMeasurements} 项。跳过不匹配的已知分支不收费；实际失败会留下成本与回执。</small>
      <ul className="evaluation-deck-check-results">{run.criterionIds.map(id => {
        const criterion = definitions.criteria.find(item => item.id === id);
        const check = run.checks.find(item => item.criterionId === id);
        return <li key={id}><div><strong>{criterionName(id)}</strong><span className={`evaluation-deck-status${check ? ` evaluation-deck-status-${check.status}` : ''}`}>{check ? checkLabels[check.status] : '尚未形成检查'}</span></div><small>{criterion && criterionRule(criterion)}</small></li>;
      })}</ul>
      {run.report && <p>本契约报告：<span className={`evaluation-deck-status evaluation-deck-status-${run.report}`}>{checkLabels[run.report]}</span><small>通过 {passed} / {run.criterionIds.length} 项 · 未知 {unknown} 项。分母仅是这份契约选中的条件，遗漏的条件不会自动补上。</small></p>}
      {run.toolFailed && <p className="evaluation-deck-note">法器已出现失败，剩余行动停止；继续量测可以查清实际留下什么，量测不会替你修复它。</p>}
      <details><summary>实际输入与逐项量测 · {metrics.length} 项</summary>
        {Object.keys(run.observed).length > 0 ? <ul className="evaluation-deck-metrics">{Object.entries(run.observed).map(([fact, record]) => <li key={fact}><strong>{factLabels[fact] ?? fact}：{displayFact(fact, record.value)}</strong><small>试验内实际已知 · {record.source === 'observation' ? '观察入口' : record.source === 'receipt' ? '法器回执' : record.source === 'verification' ? '验收回执' : '资料记录'} · {record.provenance?.observationId ?? '来源见运行记录'}</small></li>)}</ul> : <p className="muted">试验尚未取得任何输入。情境的隐藏初始值不会直接进入构筑。</p>}
        <ul className="evaluation-deck-metrics">{metrics.map(metric => {
          const measurement = run.measurements.find(item => item.metricId === metric.id);
          return <li key={metric.id}><strong>{metric.label}：{!measurement ? '尚未量测' : !measurement.known || measurement.value === undefined ? '未知，入口未提供这个字段' : displayFact(metric.fact, measurement.value)}</strong><small>入口：{displayActionLabel(scenario.observations.find(item => item.id === metric.observationId)?.label ?? metric.observationId)} · 实际量测成本 {callCost({ tool: 'observe', observationId: metric.observationId })} 点</small>{measurement && <small>本次试验来源：{measurement.provenance.observationId} · 回执 {measurement.eventId.split(':').at(-1)}。不作为城市身份或现场完成证明。</small>}</li>;
        })}</ul>
      </details>
      <details><summary>输入 → 请求 → 回执 → 检查 · {events.length} 条记录</summary><ol className="evaluation-deck-events">{events.map(event => <li key={event.id}><span>{event.text}</span>{event.cost !== undefined && <small>本条实际成本：{event.cost} 点</small>}{event.delivered !== false && event.facts && <small>{Object.entries(event.facts).map(([fact, value]) => `${factLabels[fact] ?? fact}：${displayFact(fact, value)}`).join('；')}</small>}</li>)}</ol></details>
    </>;
  };

  return <section className="evaluation-deck" aria-label="镜面评价台">
    <div className="section-label"><FlaskConical size={18}/> 镜面评价台 · 教学策略模拟</div>
    <p>试验镜里发生的事留在镜里。先明确你要测什么，再让法器给出证据；居民的现场仍须实际交付。</p>
    <div className="evaluation-deck-counts"><span>指定案例已测 <strong>{requiredTested}/{definitions.gate.caseIds.length}</strong></span><span>案例已见 <strong>{seenCount}/{definitions.cases.length}</strong></span><span>委托晶石 <strong>{state.runtime?.missionRemaining ?? state.budgetRemaining}</strong></span></div>
    <small>“已测”表示当前版本完成了运行与量测，可能通过、失败或未知。反复运行同一案例不会增加不同案例覆盖。</small>

    <details className="evaluation-deck-stage" open={!evaluation.candidateId || draftChanged}>
      <summary><span><Scale size={16}/> 1 · 选构筑与验收契约</span><small>{lockedCandidate ? `已锁定 ${lockedCandidate.label}` : '尚未锁定'}</small></summary>
      <label>待测试的行动构筑<select aria-label="待测试的行动构筑" value={candidateId} disabled={disabled || running} onChange={event => { setCandidateId(event.target.value); setError(''); }}><option value="">先选构筑</option>{definitions.candidates.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {candidate && <div className="evaluation-deck-candidate"><strong>{candidate.label}</strong><p>{candidate.description}</p><small>法器范围：{candidate.tools.map(tool => toolLabels[tool]).join('、')} · 目标权限：{candidate.permissions.map(target => target === '*' ? '本场声明的全部目标' : displayActionLabel(targetName(target))).join('、')}。试验不借用回声现场的身份或单次许可。</small><details><summary>有限行动步骤与预计成本 · {candidate.steps.length} 步</summary><ol className="evaluation-deck-steps">{candidate.steps.map((step, index) => <li key={index}><strong>{index + 1}. {callLabel(step.call)} · {callCost(step.call)} 点</strong>{step.whenKnown && <small>仅在实际已知符合 {Object.entries(step.whenKnown).map(([fact, value]) => `${factLabels[fact] ?? fact}＝${displayFact(fact, value)}`).join('、')} 时执行；未知不会被当作符合。</small>}</li>)}</ol><small>预计成本只指请求声明的普通成本。物理失败按真实失败成本记录，量测另付费。</small></details></div>}
      <fieldset disabled={disabled || running}><legend>你选择哪些条件作为检查 · 已选 {criterionIds.length}/{definitions.criteria.length}</legend>{definitions.criteria.map(criterion => <label className="evaluation-deck-check" key={criterion.id}><input type="checkbox" checked={criterionIds.includes(criterion.id)} onChange={() => { setCriterionIds(toggle(criterionIds, criterion.id)); setError(''); }}/><span>{criterion.label}<small>{criterionRule(criterion)} · 量测 {metricName(criterion.metricId)}</small></span></label>)}</fieldset>
      <label>所选条件怎样组成报告<select aria-label="验收条件组合" value={aggregation} disabled={disabled || running} onChange={event => { setAggregation(event.target.value as 'all' | 'any'); setError(''); }}><option value="all">全部满足（all）</option><option value="any">至少一项满足（any）</option></select></label>
      <small>至少一项满足可以产生绿色报告，未满足的其他项仍然存在。正式门槛另行核对，不能靠删检查或平均分抵消。</small>
      {running && <p className="evaluation-deck-note">这轮版本已锁定。先完成或取消试验，再修改构筑与契约。</p>}
      <button className="button primary" disabled={disabled || running || !candidateId || criterionIds.length === 0 || !draftChanged} onClick={() => void change({ type: 'evaluation', operation: 'configure', candidateId, criterionIds: definitions.criteria.filter(item => criterionIds.includes(item.id)).map(item => item.id), aggregation })}>锁定构筑与验收契约 · 不耗晶石</button>
      {evaluation.candidateId && <div className="evaluation-deck-versions"><span>当前构筑 v{evaluation.candidateRevision}</span><span>当前契约 v{evaluation.contractRevision}</span></div>}
      {draftChanged && evaluation.candidateId && <small>选择尚未锁定。下方历史仍对应原版本；改变配置后，旧报告仅供回看。</small>}
    </details>

    <div className="evaluation-deck-stage">
      <h4><FlaskConical size={16}/> 2 · 选择案例，逐步执行与量测</h4>
      <label>这次运行的情境<select aria-label="试验案例" value={caseId} disabled={disabled || running} onChange={event => { setCaseId(event.target.value); setError(''); }}><option value="">先选一个案例</option>{definitions.cases.map(item => <option key={item.id} value={item.id}>{item.label} · {categoryLabels[item.category]} · {evaluation.seenCaseIds.includes(item.id) ? '已见' : '未运行'}</option>)}</select></label>
      {selectedCase && <div className="evaluation-deck-case-note"><strong>{selectedCase.label} · {categoryLabels[selectedCase.category]}</strong><p>{selectedCase.category === 'holdout' && !evaluation.seenCaseIds.includes(selectedCase.id) ? '封存情境：运行会锁定当前构筑与契约，并记录首次开启。取得输入前不显示隐藏条件。' : selectedCase.description}</p><small>{evaluation.seenCaseIds.includes(selectedCase.id) ? '已经见过；再次运行是调试或回归，不再是新的留出证据。' : '运行之后即记为已见，取消或重试也不能把它重新包装成未见。'} 独立测试世界不会复制到城市。</small></div>}
      {definitions.cases.some(item => item.category === 'holdout') && <div className="evaluation-deck-candidate"><strong>{currentSeal ? '当前版本已封存' : '留出试验前，先封存这份构筑与契约'}</strong><small>{currentSeal ? `构筑 v${evaluation.candidateRevision} · 契约 v${evaluation.contractRevision}。开启案例将记录这一版，修改配置后需要重新封存。` : '封存不证明有效，只明确在看见留出情境之前你选择了哪一版。公开案例可以先运行，无需封存。'}</small>{evaluation.seal && !currentSeal && <small>旧封存为构筑 v{evaluation.seal.candidateRevision} / 契约 v{evaluation.seal.contractRevision}，不适用于当前版本。</small>}<button className="button" disabled={disabled || running || !evaluation.candidateId || draftChanged || Boolean(currentSeal)} onClick={() => void change({ type: 'evaluation', operation: 'seal' })}>封存当前版本 · 不耗晶石</button></div>}
      <button className="button primary" disabled={disabled || running || !evaluation.candidateId || !caseId || draftChanged || selectedCase?.category === 'holdout' && !currentSeal} onClick={() => void change({ type: 'evaluation', operation: 'run', caseId })}>锁定这次试验并入队 · 不耗晶石</button>
      {selectedCase?.category === 'holdout' && !currentSeal && <small>这个留出情境需要当前版本的封存记录。先锁定配置，再点“封存当前版本”；旧版本封存不能代替。</small>}
      {!evaluation.candidateId && <small>先在上方锁定一份构筑与契约。</small>}
      {displayedRun && <article className="evaluation-deck-run" aria-label="当前镜面试验"><h4>{caseName(displayedRun.caseId)} · {statusLabels[displayedRun.status]}</h4>{renderRun(displayedRun)}{running && <><button className="button primary" disabled={disabled} onClick={() => void change({ type: 'evaluation', operation: 'tick' })}>{state.status === 'paused' ? '恢复委托并推进试验一步' : displayedRun.status === 'measuring' ? '实际量测下一项' : '执行下一步法器或分支'}</button><small>{state.status === 'paused' && '委托已暂停；只有明确点击这个按钮才恢复。'}每次最多执行一个声明步骤或一项量测，真实调用扣委托晶石。不会连续自动刷完案例。</small><button className="button" disabled={disabled} onClick={() => void change({ type: 'evaluation', operation: 'cancel' })}>停止这轮试验 · 保留已发生的回执与成本</button></>}</article>}
      {history.length > 0 && <details><summary>报告档案 · {history.length} 轮可回看</summary>{visibleHistory.map(run => <details key={run.id} className={`evaluation-deck-run${isCurrent(run) ? '' : ' evaluation-deck-history-old'}`}><summary><span>{caseName(run.caseId)} · {candidateName(run.candidateId)}<small>{isCurrent(run) ? '当前版本' : '历史版本，不可用于当前交付'}</small></span><b>{run.report ? checkLabels[run.report] : statusLabels[run.status]}</b></summary>{renderRun(run)}</details>)}{history.length > 5 && <button className="button" disabled={busy} onClick={() => setShowAllHistory(!showAllHistory)}>{showAllHistory ? '收起较早报告' : `查看全部 ${history.length} 轮报告`}</button>}</details>}
    </div>

    <details className="evaluation-deck-stage" open={completedRuns.length > 0 || Boolean(evaluation.certificate)}>
      <summary><span><ShieldCheck size={16}/> 3 · 核对证据，再回现场交付</span><small>{currentCertificate ? '当前版本已有证书' : '尚缺当前证书'}</small></summary>
      <strong>委托的正式门槛</strong>
      <ul className="evaluation-deck-gaps"><li>指定案例：{definitions.gate.caseIds.map(caseName).join('、')}，每个都须有当前版本的真实证据。</li><li>不可省略的检查：{definitions.gate.criterionIds.map(criterionName).join('、')}。删掉一项也不会改变委托要求。</li>{definitions.gate.requireAll && <li>正式契约必须使用全部满足（all）；局部绿灯不能抵消其他必要条件。</li>}</ul>
      <small>本版完成了 {completedRuns.length} 轮报告，其中 {completedRuns.filter(run => run.report === 'pass').length} 轮在自选契约中通过；这两个数字都不是正式交付资格。</small>
      <button className="button primary" disabled={disabled || running || !evaluation.candidateId || Boolean(currentCertificate) || draftChanged} onClick={() => void change({ type: 'evaluation', operation: 'certify' })}><ClipboardCheck size={16}/> 核对当前证据并签发资格 · 不耗晶石</button>
      {evaluation.certificate && <div className={`evaluation-deck-certificate${currentCertificate ? '' : ' evaluation-deck-history-old'}`}><strong>{currentCertificate ? '证书已签发：只覆盖这一版与这些案例' : '旧证书：当前版本不可使用'}</strong><small>{candidateName(evaluation.certificate.candidateId)} · 构筑 v{evaluation.certificate.candidateRevision} · 契约 v{evaluation.certificate.contractRevision} · {evaluation.certificate.runIds.length} 份报告。证书不保证全部未知情境。</small></div>}
      <p className="evaluation-deck-note">下一步回到本页的现场法器台，实际执行并验收：{scenario.goals.map(goal => goal.label).join('、')}。试验报告变绿、签发证书或修改契约，都不会搬运现场货箱、修好居民设施或撤销已经发生的动作。</p>
    </details>
    {latest && <div className="evaluation-deck-feedback" role="status" aria-live="polite"><strong>{latest.evaluationPhase === 'rejected' || latest.success === false ? '本次证据尚未通过' : '评价台回响'}</strong><p>{latest.text}</p></div>}
    {error && <p className="evaluation-deck-error" role="alert">{error}</p>}
  </section>;
}
