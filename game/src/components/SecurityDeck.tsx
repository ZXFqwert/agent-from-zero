import { useState } from 'react';
import { FileCheck2, FlaskConical, ShieldCheck, UserCheck } from 'lucide-react';
import { reduceGame } from '../engine';
import type { GameAction, GameState, ScenarioDefinition, ToolCall } from '../engine';
import { factLabels } from '../content/scenarios';
import { displayActionLabel, displayFact, displaySource } from '../content/presentation';

type WithoutId<T> = T extends { id: string } ? Omit<T, 'id'> : never;
export type SecurityInput = WithoutId<Extract<GameAction, { type: 'security' }>>;

export default function SecurityDeck({ scenario, state, busy = false, onSecurity }: {
  scenario: ScenarioDefinition;
  state: GameState;
  busy?: boolean;
  onSecurity: (action: SecurityInput) => void | Promise<unknown>;
}) {
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [selectedOperation, setSelectedOperation] = useState('');
  const [error, setError] = useState('');
  if (!state.security || !scenario.security) return null;

  const security = state.security;
  const definitions = scenario.security;
  const disabled = busy || state.status === 'won';
  const records = state.context?.records ?? [];
  const activeIds = state.context?.activeIds ?? [];
  const proofCards = records;
  const principal = definitions.principals.find(item => item.id === security.identity?.principalId);
  const operation = scenario.operations.find(item => item.id === selectedOperation) ?? scenario.operations[0];
  const previewOperation = scenario.operations.find(item => item.id === security.preview?.call.operationId);
  const latest = state.events.filter(event => event.type === 'security-change').at(-1);
  const realmLabel = (realm: 'live' | 'sandbox') => realm === 'live' ? '城市现场' : '镜砂沙箱';
  const sourceLabel = (trust: 'registry' | 'external' | 'executor' | undefined) =>
    trust === 'registry' ? '身份登记来源' : trust === 'external' ? '外部资料' : trust === 'executor' ? '实际法器回执' : '未标注来源';
  const targetLabel = (target: string) => displayActionLabel(
    scenario.operations.find(item => item.target === target)?.label
    ?? scenario.observations.find(item => item.target === target)?.label
    ?? target,
  );
  const change = (action: SecurityInput) => {
    if (reduceGame(scenario, state, { ...action, id: 'security-ui-preview' }) === state) {
      setError('这个动作与当前状态不符。先实际读取并携带身份材料，或重新预览当前请求。未改变现场，未扣资源。');
      return;
    }
    setError('');
    void onSecurity(action);
  };
  const previewCall: Extract<ToolCall, { tool: 'operate' }> | undefined = operation ? {
    tool: 'operate', operationId: operation.id,
  } : undefined;

  return <section className="security-deck" aria-label="信任与访问契约">
    <div className="section-label"><ShieldCheck size={17} />信任与访问契约</div>
    <p className="muted">资料能提供信息，不能自行签发执行权限。来源、身份、访问契约和单次审批分别核验；登记资料也可能过期。</p>

    <div className="security-deck-realm" aria-label="当前执行空间">
      <span><FlaskConical size={16} />当前空间：<strong>{realmLabel(security.realm)}</strong></span>
      {definitions.sandbox && <div className="security-deck-realm-buttons">
        <button className="button" aria-pressed={security.realm === 'live'} disabled={disabled || security.realm === 'live'} onClick={() => change({ type: 'security', operation: 'realm', realm: 'live' })}>进入城市现场</button>
        <button className="button" aria-pressed={security.realm === 'sandbox'} disabled={disabled || security.realm === 'sandbox'} onClick={() => change({ type: 'security', operation: 'realm', realm: 'sandbox' })}>进入镜砂沙箱</button>
      </div>}
      <small>{definitions.sandbox ? '镜砂只改变沙箱里的副本。沙箱成功不能赢得现场委托，回到现场仍需执行与验收。会话分支保存材料，不是隔离空间。' : '当前委托在城市现场执行；会话分支不会建立隔离空间。'}</small>
      {security.realm === 'sandbox' && <p className="security-deck-sandbox-note" role="status">正在沙箱试验。这里的写入与验收不替代城市现场的结果。</p>}
    </div>

    <div className="security-deck-identity">
      <div className="section-label"><UserCheck size={16} />请求者身份</div>
      <p className="muted">自称、称呼和印章外观都不等于身份。选择已经读取的材料，装入卷轴，再核验其登记与凭据。</p>
      <p className="security-deck-current-identity" aria-live="polite">{principal ? <>上次核验：<strong>{principal.label}</strong><small>身份核验不授予全部操作；仍受角色范围、访问契约和审批限制。凭据失效时，须重新读取登记再核验。</small></> : <>当前没有已核验身份。</>}</p>
      {definitions.principals.map(person => {
        const matching = proofCards.filter(record => record.observationId === person.registryObservationId);
        const preferred = matching.filter(record => activeIds.includes(record.id)).at(-1) ?? matching.at(-1) ?? proofCards.at(-1);
        const proofId = proofCards.find(record => record.id === proofs[person.id])?.id ?? preferred?.id ?? '';
        const proof = proofCards.find(record => record.id === proofId);
        const isActive = Boolean(proof && activeIds.includes(proof.id));
        return <article className="security-deck-principal" aria-label={`身份核验：${person.label}`} key={person.id}>
          <h4>{person.label}</h4>
          <label>核验材料<select aria-label={`核验材料：${person.label}`} disabled={disabled} value={proofId} onChange={event => setProofs({ ...proofs, [person.id]: event.target.value })}>
            <option value="">先用观察法器读取材料</option>
            {[...proofCards].reverse().map(record => <option key={record.id} value={record.id}>{record.label.replace('检索：', '')} · {activeIds.includes(record.id) ? '已携带' : '仅在档案'} · 读取 {record.eventId.split(':').at(-1)}</option>)}
          </select></label>
          {proof && <small>{sourceLabel(proof.provenance?.trust)} · {realmLabel(proof.provenance?.realm ?? 'live')} · {isActive ? '本轮已携带，待核验' : '本轮未携带：请先在卷轴台装入这份材料。'}</small>}
          {!proof && <small>尚未读到可选择的原始材料。检索记忆不会自动取得现场身份。</small>}
          <button className="button" disabled={disabled || !proofId} onClick={() => change({ type: 'security', operation: 'authenticate', principalId: person.id, recordId: proofId })}>核验身份：{person.label}</button>
          <details><summary>登记的角色范围</summary><ul>{person.grants.map(id => <li key={id}>{displayActionLabel(scenario.operations.find(item => item.id === id)?.label ?? '未配置操作')}</li>)}</ul><small>这是角色的允许范围，实际请求还要通过本次契约和审批。</small></details>
        </article>;
      })}
    </div>

    <div className="security-deck-approval">
      <div className="section-label"><FileCheck2 size={16} />单次请求审批</div>
      <p className="muted">先查看具体动作、目标与执行空间，再签发一次性许可。许可不会执行动作；更换身份、参数或现场变化后，应重新审阅。</p>
      <label>准备审阅的行动<select aria-label="准备审阅的行动" value={operation?.id ?? ''} disabled={disabled} onChange={event => setSelectedOperation(event.target.value)}>
        {scenario.operations.map(item => <option key={item.id} value={item.id}>{displayActionLabel(item.label)}</option>)}
      </select></label>
      {operation && <div className="security-deck-request-rules">
        <small>目标：{targetLabel(operation.target)} · 空间：{realmLabel(security.realm)}</small>
        <small>{operation.security?.principalIds?.length ? `需要已核验身份：${operation.security.principalIds.map(id => definitions.principals.find(item => item.id === id)?.label ?? id).join('、')}` : '此动作没有额外身份要求。'}</small>
        <small>{operation.security?.approval ? '需要与当前请求完全一致的一次性许可。' : '此动作不要求单次审批；其他检查仍然有效。'}{operation.security?.liveOnly && ' 只允许在城市现场执行。'}</small>
        {operation.security?.trustedInputs && operation.security.trustedInputs.length > 0 && <small>关键输入须有登记来源：{operation.security.trustedInputs.map(fact => factLabels[fact] ?? fact).join('、')}。资料内容正确与请求获得授权仍是两回事。</small>}
        {operation.security?.sandboxRequires && operation.security.sandboxRequires.length > 0 && <small>现场执行前需完成沙箱试验：{operation.security.sandboxRequires.map(id => displayActionLabel(scenario.operations.find(item => item.id === id)?.label ?? id)).join('、')}。</small>}
      </div>}
      <button className="button" disabled={disabled || !previewCall} onClick={() => previewCall && change({ type: 'security', operation: 'preview', call: previewCall })}>预览请求：{operation ? displayActionLabel(operation.label) : '尚无行动'}</button>

      {security.preview && previewOperation && <article className="security-deck-preview" aria-label="当前待审批请求">
        <h4>{displayActionLabel(previewOperation.label)}</h4>
        <dl><div><dt>请求者</dt><dd>{definitions.principals.find(item => item.id === security.preview?.principalId)?.label ?? '尚未核验'}</dd></div><div><dt>目标</dt><dd>{targetLabel(previewOperation.target)}</dd></div><div><dt>空间</dt><dd>{realmLabel(security.preview.realm)}</dd></div></dl>
        {security.preview.call.arguments && <><strong>这次请求的参数</strong><div className="live-facts">{Object.entries(security.preview.call.arguments).map(([name, value]) => <span key={name}>{previewOperation.protocol?.parameters.find(field => field.name === name)?.label ?? factLabels[name] ?? name}：{displayFact(name, value)}</span>)}</div></>}
        <strong>请求声明的写入</strong>
        <div className="live-facts">{Object.entries(previewOperation.effects).map(([fact, value]) => <span key={fact}>{factLabels[fact] ?? fact}：{displayFact(fact, value)}</span>)}</div>
        <small>这是动作的预期写入，尚未执行；物理条件、权限和实际回执仍可能使请求失败，结果必须另行验收。</small>
        <button className="button primary" disabled={disabled} onClick={() => change({ type: 'security', operation: 'approve' })}>签发本次请求许可</button>
      </article>}
      {!security.preview && <small>尚未预览请求。选择行动后先查看具体内容。</small>}
      {security.permits.length > 0 && <details className="security-deck-permits"><summary>已签发许可 · {security.permits.filter(permit => !permit.consumed).length} 张未使用</summary>
        <ul>{security.permits.slice(-6).reverse().map(permit => <li key={permit.id}><strong>{permit.consumed ? '已使用' : '未使用'} · {realmLabel(permit.realm)}</strong><span>{displayActionLabel(scenario.operations.find(item => item.id === permit.call.operationId)?.label ?? '未配置操作')}</span><small>限定这次身份、动作、参数与空间；未使用不代表现在仍有效。</small></li>)}</ul>
        {security.permits.length > 6 && <small>更早的许可保留在行动记录中。</small>}
      </details>}
    </div>

    <details className="security-deck-sources"><summary>已读资料的来源边界 · {records.length} 份</summary>
      {records.length === 0 ? <p className="muted">先读取一份资料。来源不会凭空进入卷轴。</p> : <ul>{[...records].reverse().map(record => <li key={record.id}>
        <strong>{record.label.replace('检索：', '')}</strong><span>{sourceLabel(record.provenance?.trust)} · {realmLabel(record.provenance?.realm ?? 'live')} · {activeIds.includes(record.id) ? '本轮携带' : '仅在档案'}</span>
        <small>{displaySource(record.source)}{record.origin ? ` · 来自记忆 v${record.origin.revision}` : ''}{record.summaryId ? ' · 已压缩' : ''}</small>
        {record.provenance?.directiveOperationId && <small className="security-deck-directive">内含行动指示：{displayActionLabel(scenario.operations.find(item => item.id === record.provenance?.directiveOperationId)?.label ?? '额外行动')}。它属于资料内容，不是你签发的授权。</small>}
      </li>)}</ul>}
      <p className="muted">压缩、记忆检索与会话分支保留原来的来源，不能把资料升级成命令，也不能证明内容仍然正确。</p>
    </details>
    {latest && <div className="security-deck-feedback" role="status" aria-live="polite"><strong>{latest.success === false ? '本次契约未通过' : '契约回响'}</strong><p>{latest.text}</p></div>}
    {error && <p className="notice" role="alert">{error}</p>}
  </section>;
}
