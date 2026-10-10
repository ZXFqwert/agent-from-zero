import {useMemo, useState} from 'react';
import {ArrowRight, Check, ChevronRight, Link2, Lock, Route} from 'lucide-react';
import type {GameState} from '../engine';
import {deriveCoreCurriculum} from '../curriculum';
import {scenarios} from '../content/scenarios';
import {isUnlocked} from '../content/progression';
import type {CurriculumHistory} from '../curriculumHistory';
import type {CourierProgress} from '../courierProgress';
import './learning-workshop.css';

export interface CoreCurriculumProps {
  games: readonly GameState[];
  history?: CurriculumHistory | null;
  completedScenarioIds: readonly string[];
  onScenario: (id: string, restart?: boolean) => Promise<void>;
  busy?: boolean;
  courierProgress?: CourierProgress | null;
  courierUnlocked?: boolean;
  onCourier?: () => void;
}

export default function CoreCurriculum({games, history, completedScenarioIds, onScenario, busy = false, courierProgress, courierUnlocked = false, onCourier}: CoreCurriculumProps) {
  const curriculum = useMemo(() => deriveCoreCurriculum([...games, ...(history?.records ?? [])], {revisitStartIndex: games.length, courierProgress}), [games, history, courierProgress]);
  const [gapsOnly, setGapsOnly] = useState(true), [opening, setOpening] = useState(false), [notice, setNotice] = useState('');
  const next = curriculum.concepts.find(concept => concept.nextScenarioId && isUnlocked(concept.nextScenarioId, [...completedScenarioIds]));
  const source = next ? scenarios.find(scenario => scenario.id === next.nextScenarioId) : undefined;
  const pending = opening || busy;
  const needsRestart = (id: string) => completedScenarioIds.includes(id) && !games.some(game => game.scenarioId === id && game.status !== 'won');
  const open = async (id: string) => {
    if (pending || !isUnlocked(id, [...completedScenarioIds])) return;
    setOpening(true); setNotice('');
    try {await onScenario(id, needsRestart(id));} catch {setNotice('这份委托暂未打开。你的学习记录已保留，请稍后重试。');}
    finally {setOpening(false);}
  };
  return <section className="core-curriculum learning-workshop" aria-labelledby="core-curriculum-title">
    <header className="workshop-hero">
      <span className="workshop-kicker"><Link2 size={16}/>让每一块知识接上下一块</span>
      <h2 id="core-curriculum-title">你的 Agent 核心学习链</h2>
      <p>不同委托中的同一种机制，现在会汇成一条路。走过引导、独立操作、陌生迁移，再在其他冒险之后重新用它。</p>
      <div className="workshop-metrics"><span><strong>{curriculum.counts.evidencedStages}<small> / {curriculum.counts.totalStages}</small></strong>阶段有行动证据</span><span><strong>{curriculum.counts.transferConcepts}</strong>核心机制有迁移记录</span><span><strong>{curriculum.counts.revisitedConcepts}</strong>核心机制有间隔回访</span></div>
    </header>
    {source && next && <article className="workshop-next">
      <span className="workshop-kicker"><Route size={16}/>下一封值得接的委托</span>
      <h3>{source.title}</h3><p>练习「{next.title}」：{next.principle}</p>
      <button className="workshop-button" disabled={pending} onClick={() => void open(source.id)}>{needsRestart(source.id) ? '重新尝试这份委托' : '回到这份委托'}<ArrowRight size={16}/></button>
    </article>}
    {!source && <p className="workshop-note">先沿城市地图推进。学习链会保留尚缺的阶段；新委托仍遵循原来的剧情解锁条件。</p>}
    <label className="workshop-filter"><input type="checkbox" checked={gapsOnly} onChange={event => setGapsOnly(event.target.checked)}/>只看还有待练阶段的机制</label>
    <div className="core-concepts">{curriculum.concepts.filter(concept => !gapsOnly || concept.stages.some(stage => stage.status === 'pending')).map(concept => <details className="core-concept" key={concept.id}>
      <summary><span><strong>{concept.title}</strong><small>{concept.stages.filter(stage => stage.status === 'evidenced').length} / 4 阶段留痕</small></span><div className="core-stage-dots" aria-label={concept.stages.map(stage => `${stage.label}：${stage.status === 'evidenced' ? '有证据' : '待练'}`).join('；')}>{concept.stages.map(stage => <i key={stage.id} className={stage.status === 'evidenced' ? 'is-evidenced' : ''}>{stage.status === 'evidenced' ? <Check size={11}/> : <span/>}</i>)}</div><ChevronRight size={17}/></summary>
      <div className="core-concept-body"><p>{concept.principle}</p>{concept.prerequisites.length > 0 && <small>前置机制：{concept.prerequisites.map(id => curriculum.concepts.find(item => item.id === id)?.title ?? id).join('、')}</small>}
        <ol className="core-stages">{concept.stages.map(stage => <li key={stage.id} className={stage.status === 'evidenced' ? 'is-evidenced' : ''}>
          <h4>{stage.status === 'evidenced' ? <Check size={15}/> : <Route size={15}/>} {stage.label}<small>{stage.status === 'evidenced' ? '有行动证据' : '待练'}</small></h4><p>{stage.explanation}</p>{stage.gap && <p className="workshop-note">{stage.gap}</p>}
          {stage.proofs.length > 0 && <details className="core-source-proofs"><summary>查看 {stage.proofs.length} 份实际来源</summary>{stage.proofs.map((proof, index) => <div key={`${proof.scenarioId}-${index}`}><strong>{proof.title}</strong><small>{proof.hintUsed ? '使用过游戏提示' : '未使用游戏提示'}</small>{proof.eventIds.map(id => <code key={id}>{id}</code>)}</div>)}</details>}
          {stage.status === 'pending' && stage.scenarioIds.length > 0 && <div className="core-route-buttons">{stage.scenarioIds.map(id => {const mission = scenarios.find(item => item.id === id), unlocked = isUnlocked(id, [...completedScenarioIds]); return mission ? <button className="workshop-button secondary" key={id} disabled={pending || !unlocked} onClick={() => void open(id)}>{unlocked ? <ArrowRight size={14}/> : <Lock size={14}/>}<span>{mission.title}{!unlocked ? <small>沿主线继续后开放</small> : needsRestart(id) && <small>重新开始新尝试，旧交付记录保留</small>}</span></button> : null;})}</div>}
          {concept.id === 'idempotent-effects' && stage.id === 'transfer' && onCourier && <button className="workshop-button secondary" disabled={pending || !courierUnlocked} onClick={onCourier}>{courierUnlocked ? <ArrowRight size={14}/> : <Lock size={14}/>}<span>陌生签收站 · 实际接管发货<small>{courierUnlocked ? '两份作者情境，保存独立行动与提示曝光' : '先完成第二章「无声的货梯」'}</small></span></button>}
        </li>)}</ol>
      </div>
    </details>)}</div>
    {notice && <p role="status" className="workshop-note">{notice}</p>}
    <details className="workshop-explainer"><summary>记录怎样算数</summary><p>来自原游戏委托中可回查的实际事件，按稳定机制编号合并。重复同一条行动记录、更换种子或复制存档不会补上一个阶段。间隔回访要求先走过另外两种主线委托，再留下新的独立操作记录。</p><p>新版开始保留实际完成顺序，最多96份。旧存档仍用于前三阶段；它没有完整的历史尝试顺序，因此不会补算过去的间隔回访。</p><p>陌生签收站使用独立作者规则重放，只补业务幂等迁移这一阶段。看过本场游戏提示再重试不能洗掉曝光；已提前取得的合法记录保留。这些本机文件可以编辑，不是防作弊证书。</p><p>这张地图记录做过什么，不能替你断言已经掌握。原始逐概念旅历和主线存档仍保留。</p>{curriculum.ignoredRecordCount > 0 && <p>有 {curriculum.ignoredRecordCount} 份不兼容或未通过验证的记录未计入。</p>}</details>
  </section>;
}
