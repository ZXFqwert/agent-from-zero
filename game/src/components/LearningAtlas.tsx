import {useId, useMemo, useState, type KeyboardEvent} from 'react';
import {BookOpen, ChevronRight, Compass, Fingerprint, LockKeyhole, ScrollText, Sparkles} from 'lucide-react';
import type {GameState} from '../engine/types';
import {deriveLearningAtlas, type AtlasConcept, type AtlasLevel, type AtlasProof} from '../learningAtlas';
import {challengeTemplates} from '../challenges/catalog';
import './learning-atlas.css';

export interface LearningAtlasProps {
  games: readonly GameState[];
  /** Open the hall at this unlocked template; do not generate a mission or fill a solution. */
  onPractice?: (templateId: string) => void | Promise<void>;
  busy?: boolean;
}

const levels: Record<AtlasLevel, string> = {
  unseen: '未留证据', seen: '见过', guided: '引导实操', 'independent-transfer': '独立迁移',
};
const eventNames: Readonly<Record<string, string>> = {
  dispatched: '派遣', request: '请求', observation: '观察', result: '执行回执', verified: '现场复查', victory: '实际完成',
  'team-change': '协作交接', 'evaluation-change': '试验契约', 'evaluation-request': '试验请求',
  'evaluation-observation': '实际量测', 'evaluation-result': '试验回执', 'evaluation-verified': '试验验收',
  'lab-change': '宿主记录', 'lab-request': '宿主请求', 'lab-observation': '宿主观察', 'lab-result': '宿主回执', 'lab-verified': '宿主复查',
};

function Proof({proof}: {proof: AtlasProof}) {
  return <details className="atlas-proof">
    <summary><ScrollText size={15}/><span>{proof.scenarioTitle}<small>{levels[proof.level]} · {proof.hintUsed ? '使用过游戏提示' : '未使用游戏提示'}</small></span><ChevronRight size={15}/></summary>
    <div className="atlas-proof-source">
      <p>来源：{proof.sourceKind === 'transfer' ? '作者迁移委托' : proof.sourceKind === 'boss' ? '作者首领委托' : '作者引导委托'} · 内容 v{proof.sourceVersion} / 内核 v{proof.kernelVersion} · 第 {proof.attempt + 1} 次尝试</p>
      <code>{proof.scenarioId}</code>
      {proof.legacyCompletion && <p>旧版情境记录没有新版的独立迁移验收，这里按情境经历显示。原存档标记「{levels[proof.originalLevel]}」保留不变。</p>}
    </div>
    {proof.events.length > 0 ? <ol className="atlas-proof-events" aria-label={`${proof.scenarioTitle}的实际证据事件`}>
      {proof.events.map(event => <li key={event.id}>
        <div><strong>#{event.sequence} · {eventNames[event.type] ?? event.type}</strong>{event.realm && <span>{event.realm === 'sandbox' ? '隔离域' : '现场'}</span>}</div>
        <p>{event.text}</p>
        {event.delivered === false && <small>这一结果未交给伙伴；记录仍可供你复查。</small>}
        <code>{event.id}</code>
        {event.callId && <small>请求编号：{event.callId}</small>}
      </li>)}
    </ol> : <p className="atlas-small">这份早期记录标记了经历，未附独立的事件编号。</p>}
  </details>;
}

function Concept({concept}: {concept: AtlasConcept}) {
  const line = <><span>{concept.concept}</span><span className={`atlas-level level-${concept.level}`}>{levels[concept.level]}</span></>;
  return concept.proofs.length > 0 ? <details className="atlas-concept">
    <summary>{line}</summary>
    <div className="atlas-concept-proofs">{concept.proofs.map(proof => <Proof key={proof.id} proof={proof}/>)}</div>
  </details> : <div className="atlas-concept atlas-concept-unseen">{line}</div>;
}

export default function LearningAtlas({games, onPractice, busy = false}: LearningAtlasProps) {
  const atlas = useMemo(() => deriveLearningAtlas(games), [games]);
  const [view, setView] = useState<'journey' | 'capabilities'>('journey');
  const [evidencedOnly, setEvidencedOnly] = useState(true);
  const [opening, setOpening] = useState(false), [notice, setNotice] = useState('');
  const id = useId();
  const independent = atlas.chapters.reduce((total, chapter) => total + chapter.counts.independentTransfer, 0);
  const pending = busy || opening;
  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'journey' : event.key === 'End' ? 'capabilities' : view === 'journey' ? 'capabilities' : 'journey';
    setView(next);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next === 'journey' ? 0 : 1]?.focus();
  };
  const practice = async (templateId: string) => {
    if (pending || !onPractice || !atlas.unlockedTemplateIds.includes(templateId)) return;
    setOpening(true); setNotice('');
    try {await onPractice(templateId);} catch {setNotice('这次没有打开挑战厅，请保留当前记录后再试。');}
    finally {setOpening(false);}
  };
  return <div className="learning-atlas">
    <header className="atlas-hero">
      <span className="atlas-kicker"><Fingerprint size={16}/>工坊里的行动留痕</span>
      <h2>我的能力旅历</h2>
      <p>每个概念都来自可回查的操作。点开一条回声，看看自己在什么条件下做到了。</p>
      <div className="atlas-overview">
        <div><strong>{atlas.completedSourceCount}</strong><span>完成过的作者委托</span></div>
        <div><strong>{independent}</strong><span>有迁移证据的条目</span></div>
        <div><strong>{atlas.unlockedTemplateIds.length}<small> / 24</small></strong><span>可回访的挑战模板</span></div>
      </div>
    </header>
    <section className="atlas-revisits" aria-labelledby={`${id}-revisits`}>
      <div className="atlas-section-title"><Compass size={18}/><h3 id={`${id}-revisits`}>换条路，再会一次</h3></div>
      {atlas.revisits.length > 0 ? <div className="atlas-revisit-grid">{atlas.revisits.map(revisit => <article key={revisit.templateId} className="atlas-revisit">
        <small>已解锁的回访</small><h4>{revisit.label}</h4><p>{revisit.decision}</p>
        <details><summary>这次为什么推荐它</summary><p>记录中完成《{revisit.sourceTitle}》之后，又完成了《{revisit.interveningMainWins[0].title}》和《{revisit.interveningMainWins[1].title}》。可以试试把同一机制用在另一个情境里。</p></details>
        <button className="atlas-button" disabled={pending || !onPractice} onClick={() => void practice(revisit.templateId)}><Compass size={16}/>在挑战厅查看</button>
      </article>)}</div> : <p className="atlas-empty">先完成一个来源委托，再走过另外两种主线委托，工坊就会从你已解锁的挑战里选出回访建议。</p>}
      <p className="atlas-small">记录排列只用于建议，不代表日期或掌握程度。回访推荐和新种子都不会升级学习等级。</p>
    </section>
    {notice && <p className="atlas-notice" role="status">{notice}</p>}
    <div className="atlas-tabs" role="tablist" aria-label="旅历内容">
      <button id={`${id}-journey-tab`} role="tab" tabIndex={view === 'journey' ? 0 : -1} aria-selected={view === 'journey'} aria-controls={`${id}-journey`} onKeyDown={navigateTabs} onClick={() => setView('journey')}><BookOpen size={16}/>八章旅历</button>
      <button id={`${id}-capabilities-tab`} role="tab" tabIndex={view === 'capabilities' ? 0 : -1} aria-selected={view === 'capabilities'} aria-controls={`${id}-capabilities`} onKeyDown={navigateTabs} onClick={() => setView('capabilities')}><Sparkles size={16}/>可用的练习机制</button>
    </div>
    {view === 'journey' ? <section id={`${id}-journey`} role="tabpanel" aria-labelledby={`${id}-journey-tab`}>
      <details className="atlas-key"><summary>这些留痕各自说明什么</summary><dl>
        <dt>见过</dt><dd>已有经历记录，还没有在这份记录中完成交付。</dd>
        <dt>引导实操</dt><dd>完成过对应委托。查看来源可分清任务类型，以及是否使用了游戏提示。</dd>
        <dt>独立迁移</dt><dd>该作者委托的迁移要求实际满足，且没有使用游戏提示。仍可继续用新任务检查自己的理解。</dd>
      </dl><p>蓝图试炼按机制归入相关章节，这只是手册的阅读分组。多个产品支持相同能力，每个产品也涉及多章原理。</p></details>
      <label className="atlas-filter"><input type="checkbox" checked={evidencedOnly} onChange={event => setEvidencedOnly(event.target.checked)}/>只看已经留痕的概念</label>
      <div className="atlas-chapters">{atlas.chapters.map(chapter => {
        const visible = chapter.concepts.filter(concept => !evidencedOnly || concept.level !== 'unseen');
        return <details className="atlas-chapter" key={chapter.chapter}>
          <summary><span className="atlas-chapter-number">{chapter.chapter.toString().padStart(2, '0')}</span><span><strong>{chapter.title}</strong><small>{chapter.description}</small><small>见过 {chapter.counts.seen} · 实操 {chapter.counts.guided} · 迁移 {chapter.counts.independentTransfer} / {chapter.counts.total} 条</small></span><ChevronRight size={17}/></summary>
          <div className="atlas-chapter-content">
            <p className="atlas-counts"><span>共 {chapter.counts.total} 个概念</span><span>见过 {chapter.counts.seen}</span><span>引导实操 {chapter.counts.guided}</span><span>独立迁移 {chapter.counts.independentTransfer}</span><span>未留证据 {chapter.counts.unseen}</span></p>
            {visible.length ? visible.map(concept => <Concept key={concept.concept} concept={concept}/>) : <p className="atlas-empty">这一章还没有行动留痕。取消上方筛选，可以翻看它涉及的概念。</p>}
          </div>
        </details>;
      })}</div>
    </section> : <section id={`${id}-capabilities`} role="tabpanel" aria-labelledby={`${id}-capabilities-tab`}>
      <p className="atlas-scope-note">这里列出已完成来源委托中能实际使用的机制，以及已开放的挑战。开放练习不等于已经掌握；每个委托仍有自己的工具、预算和权限。</p>
      {atlas.capabilities.map(capability => <details className={`atlas-capability ${capability.available ? 'is-available' : 'is-locked'}`} key={capability.id}>
        <summary>{capability.available ? <Sparkles size={16}/> : <LockKeyhole size={16}/>}<span><strong>{capability.label}</strong><small>{capability.available ? '已有完成记录，可继续练习' : '先完成包含这个机制的委托'}</small></span><ChevronRight size={16}/></summary>
        <div className="atlas-capability-content"><p>{capability.description}</p>
          {capability.mechanisms.length > 0 && <ul className="atlas-mechanisms">{capability.mechanisms.map(mechanism => <li key={mechanism}>{mechanism}</li>)}</ul>}
          {capability.sources.length > 0 && <details className="atlas-capability-sources"><summary>查看 {capability.sources.length} 份来源完成记录</summary><ul>{capability.sources.map(source => <li key={source.scenarioId}><strong>{source.title}</strong><small>{source.hintUsed ? '使用过游戏提示' : '未使用游戏提示'} · {source.mechanisms.join('、')}</small>{source.victoryEventIds.map(eventId => <code key={eventId}>{eventId}</code>)}</li>)}</ul></details>}
          {capability.practiceTemplateIds.length > 0 && <div className="atlas-practice-list"><h4>可以回访</h4>{capability.practiceTemplateIds.map(templateId => <button className="atlas-button" key={templateId} disabled={pending || !onPractice} onClick={() => void practice(templateId)}><Compass size={14}/>{challengeTemplates.find(template => template.id === templateId)!.label}<ChevronRight size={14}/></button>)}</div>}
        </div>
      </details>)}
    </section>}
    <p className="atlas-footer">每个概念各自留档。章节统计呈现的是这些不同的证据，继续冒险才能让它们变得更丰富。</p>
  </div>;
}
