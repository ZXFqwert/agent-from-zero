import {useMemo, useState} from 'react';
import {deriveReusableBuilds, previewReusableBuild, type BuildReuseInput, type ReusableBuildSource} from '../buildReuse';
import type {AgentBlueprint, ScenarioDefinition, ToolName} from '../engine/types';
import './build-reuse.css';

export interface BuildReusePickerProps {
  records: BuildReuseInput;
  /** Canonical current definition, including a validated expedition's actual floor budget. */
  scenario: ScenarioDefinition;
  /** Set a local Workshop draft. This callback must not automatically configure or dispatch. */
  onDraft: (draft: AgentBlueprint, source: ReusableBuildSource) => void;
  busy?: boolean;
}
const toolNames: Record<ToolName, string> = {observe: '观察', operate: '行动', verify: '验收'};
const scopes = [{id: 'author', label: '剧情委托'}, {id: 'challenge', label: '自由委托'}, {id: 'expedition', label: '连续远征'}] as const;
function sourceLabel(source: ReusableBuildSource): string {
  return `${source.title}${source.floor ? ` · 第 ${source.floor} 层` : ''} · ${source.scope === 'author' ? `第 ${source.attempt + 1} 次` : `编号 ${source.seed.toString(36).toUpperCase()}`} · ${source.hintUsed ? '用过提示' : '未用提示'}`;
}
export default function BuildReusePicker({records, scenario, onDraft, busy = false}: BuildReusePickerProps) {
  const catalogue = useMemo(() => deriveReusableBuilds(records), [records]);
  const [selection, setSelection] = useState('');
  const [error, setError] = useState('');
  const selectedId = catalogue.sources.some(source => source.id === selection) ? selection : '';
  const preview = useMemo(() => selectedId ? previewReusableBuild(records, selectedId, scenario) : null,
    [records, selectedId, scenario]);
  const chooseDraft = () => {
    // Recheck actual source records on the click, rather than using edited or stale displayed settings.
    const current = previewReusableBuild(records, selectedId, scenario);
    if (!current) {setError('这份来源或当前委托已改变，请重新选择。'); return;}
    try {onDraft(structuredClone(current.draft), structuredClone(current.source)); setError('');}
    catch {setError('工坊草稿没有打开，请重试。');}
  };
  return <details className="build-reuse">
    <summary>从已交付构筑起草 <span>{catalogue.sources.length} 份可查记录</span></summary>
    <div className="build-reuse-body">
      <p>沿用法器与行动策略，在新工坊重新签权限、装卷和设置参数。选中记录不会执行行动。</p>
      {catalogue.sources.length === 0 ? <p className="build-reuse-empty">完成一件委托后，这里会留下可复用的交付配置。</p> : <>
        <label className="build-reuse-select">选择一份交付记录
          <select aria-label="选择已交付构筑" value={selectedId} onChange={event => {setSelection(event.target.value); setError('');}} disabled={busy}>
            <option value="">先选来源</option>
            {scopes.map(scope => <optgroup key={scope.id} label={scope.label}>
              {catalogue.sources.filter(source => source.scope === scope.id).map(source => <option key={source.id} value={source.id}>{sourceLabel(source)}</option>)}
            </optgroup>)}
          </select>
        </label>
        {preview && <section className="build-reuse-preview" aria-label="构筑草稿预览">
          <h4>{preview.source.title} → {scenario.title}</h4>
          <div className="build-reuse-knobs">
            <span>{preview.draft.tools.length ? preview.draft.tools.map(tool => toolNames[tool]).join(' / ') : '未装备法器'}</span>
            <span>反馈{preview.draft.feedback ? '开启' : '关闭'} · 验收{preview.draft.verification ? '开启' : '关闭'}</span>
            <span>每次派遣上限 {preview.draft.budget} · 新权限 0 项</span>
            {preview.draft.stableRequestKeys !== undefined && <span>稳定请求键{preview.draft.stableRequestKeys ? '开启' : '关闭'}</span>}
            {preview.draft.loopPolicy && <span>最多 {preview.draft.loopPolicy.maxCalls} 次调用 / {preview.draft.loopPolicy.maxRetries} 次重试 · 永久失败{preview.draft.loopPolicy.permanentFailure === 'stop' ? '停止' : '尝试恢复'}</span>}
            {preview.draft.instructionPolicy && <span>资料策略：{preview.draft.instructionPolicy === 'data-only' ? '只提取数据' : '遵从附带指令'}</span>}
          </div>
          <p className="build-reuse-sign">访问契约空白：请在工坊重新签订。</p>
          <details><summary>迁移时需要重新检查</summary><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
          {!!preview.blueprintErrors.length && <div className="build-reuse-errors"><p>放入工坊后还需要调整：</p><ul>{preview.blueprintErrors.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
          <details><summary>查看来源证明</summary><p>{preview.source.scope === 'author' ? '剧情委托' : preview.source.scope === 'challenge' ? '自由委托' : `连续远征第 ${preview.source.floor} 层`} · 来源版本 {preview.source.sourceVersion} / 内核 {preview.source.kernelVersion} · 第 {preview.source.attempt + 1} 次尝试 · {preview.source.hintUsed ? '用过提示' : '未用提示'}</p>
            <p>交付事件：<code>{preview.source.victoryEventIds.join('、')}</code></p>
            {preview.source.floorStartBudget !== undefined && <p>该层起始共享预算：{preview.source.floorStartBudget}。这是来源证明，不带入新委托。</p>}
            <p>{preview.source.configureEventId ? <>最后换装：<code>{preview.source.configureEventId}</code>{preview.source.configureActionId && <> · <code>{preview.source.configureActionId}</code></>}</> : '使用初始构筑，没有换装事件。'}</p>
            <p>记录的是交付时的配置，过程可能换过装。这里只复用你的设计记录。</p>
          </details>
          <button type="button" onClick={chooseDraft} disabled={busy}>放入工坊草稿</button>
          <small>接下来由你调整，再点工坊的应用按钮。</small>
        </section>}
      </>}
      {catalogue.postSeasonRejected && <p className="build-reuse-errors">挑战或远征记录未通过复核，这部分没有作为构筑来源。</p>}
      {!!catalogue.ignoredRecordCount && <p className="build-reuse-muted">{catalogue.ignoredRecordCount} 条不符合来源或数量要求的记录没有显示。</p>}
      {!!catalogue.omittedSourceCount && <p className="build-reuse-muted">本次最多显示 {catalogue.sources.length} 份，另有 {catalogue.omittedSourceCount} 份未展开。</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
