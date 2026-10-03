import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Compass, Gem, Layers3, LockKeyhole, RotateCcw, Sparkles, Tent, X } from 'lucide-react';
import { challengeTemplates } from '../challenges/catalog';
import type { CapabilityGrowth, ChallengeRecord, ChallengeSpec, ExpeditionAction, ExpeditionSpec, ExpeditionState } from '../challenges/types';
import './challenge-hall.css';

type ExpeditionControl = Exclude<ExpeditionAction, {type: 'game'}>;
export interface ChallengeHallProps {
  /** Only persisted, replay-validated learning evidence may supply these entries. */
  growth: readonly CapabilityGrowth[];
  unlockedTemplateIds: readonly string[];
  lockReasons?: Readonly<Record<string, string>>;
  expeditionUnlocked: boolean;
  expeditionLockReason?: string;
  activeChallenge?: ChallengeRecord | null;
  activeExpedition?: ExpeditionState | null;
  busy?: boolean;
  /** A recommendation focuses a public commission; it never accepts or configures it. */
  initialTemplateId?: string;
  onStartChallenge: (spec: ChallengeSpec) => Promise<unknown>;
  onStartExpedition: (spec: ExpeditionSpec) => Promise<unknown>;
  onContinue: (kind: 'challenge' | 'expedition') => Promise<unknown>;
  onExpeditionAction: (action: ExpeditionControl) => Promise<unknown>;
}

const tierNames = {1: '点亮与执行', 2: '卷轴与边界', 3: '协作与制度'};
const statusNames = {ready: '等待装配', running: '正在执行', paused: '已暂停', stalled: '等待你调整', exhausted: '本次资源用完', won: '实际验收通过'};
const growthNames = {unseen: '尚无记录', seen: '已经尝试', guided: '实操通过', 'independent-transfer': '已记录独立迁移'};
export function challengeSeedCode(seed: number): string { return seed.toString(36).toUpperCase(); }
export function parseChallengeSeed(code: string): number | undefined {
  const normalized = code.trim().toUpperCase();
  if (!/^[0-9A-Z]{1,7}$/.test(normalized)) return;
  const seed = Number.parseInt(normalized, 36);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) return;
  return seed;
}
function randomSeed(): number {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 0x100000000);
}
const templateFor = (id: string) => challengeTemplates.find(template => template.id === id);

/** Entry and earned-state display only. The normal scene and command deck execute the actual mission. */
export default function ChallengeHall({growth, unlockedTemplateIds, lockReasons = {}, expeditionUnlocked, expeditionLockReason, activeChallenge, activeExpedition, busy = false, initialTemplateId, onStartChallenge, onStartExpedition, onContinue, onExpeditionAction}: ChallengeHallProps) {
  const [tier, setTier] = useState<0 | 1 | 2 | 3>(0), [unlockedOnly, setUnlockedOnly] = useState(false);
  const [seedCode, setSeedCode] = useState(() => challengeSeedCode(randomSeed())), [working, setWorking] = useState(false), [error, setError] = useState(''), [abandonOpen, setAbandonOpen] = useState(false);
  const [replacement, setReplacement] = useState<ChallengeSpec | null>(null);
  const replacementBox = useRef<HTMLDivElement>(null);
  const recommendedCard = useRef<HTMLElement>(null);
  const lock = useRef(false), alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (replacement) replacementBox.current?.focus(); }, [replacement]);
  useEffect(() => {
    if (!initialTemplateId || !unlockedTemplateIds.includes(initialTemplateId)) return;
    const frame = requestAnimationFrame(() => {recommendedCard.current?.focus({preventScroll:true});recommendedCard.current?.scrollIntoView({block:'nearest'});});
    return () => cancelAnimationFrame(frame);
  }, [initialTemplateId]);
  const unlocked = new Set(unlockedTemplateIds), pending = busy || working;
  const seed = parseChallengeSeed(seedCode);
  const liveChallenge = Boolean(activeChallenge && activeChallenge.game.status !== 'won');
  const liveExpedition = activeExpedition?.status === 'active';
  const occupied = liveExpedition;
  const visible = challengeTemplates.filter(template => (!tier || template.tier === tier) && (!unlockedOnly || unlocked.has(template.id)));
  const recorded = challengeTemplates.filter(template => growth.some(entry => entry.mechanism === template.mechanism && entry.level !== 'unseen')).length;
  const openCount = challengeTemplates.filter(template => unlocked.has(template.id)).length;
  async function perform(action: () => Promise<unknown>) {
    if (busy || lock.current) return;
    lock.current = true; setWorking(true); setError('');
    try { await action(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '这次操作尚未确认，请保留当前记录再试。'); }
    finally { lock.current = false; if (alive.current) setWorking(false); }
  }
  const newChallenge = (templateId: string) => { if (seed === undefined || !unlocked.has(templateId) || occupied) return; const spec: ChallengeSpec = {factoryVersion: 1, templateId, seed}; if (liveChallenge) setReplacement(spec); else void perform(() => onStartChallenge(spec)); };

  return <section className="challenge-hall" aria-label="长期委托与三层远征">
    <header className="challenge-hall-hero"><span className="challenge-hall-kicker"><Compass size={15}/> 城市修好了，陌生委托仍会到来</span><h2>回声的远行手册</h2><p>带着自己的构筑去试。费用、材料与故障有变体；破解问题靠你实际观察、行动和验收。</p><div className="challenge-hall-stats"><div><strong>{openCount}<small> / 24</small></strong><span>可接委托</span></div><div><strong>{recorded}</strong><span>机制留下实操记录</span></div><div><strong>3</strong><span>远征连续楼层</span></div></div></header>

    {activeChallenge && <article className="challenge-current"><div><small>你的当前委托</small><h3>{templateFor(activeChallenge.spec.templateId)?.label ?? '已有委托'}</h3><p>{statusNames[activeChallenge.game.status]} · 编号 {challengeSeedCode(activeChallenge.spec.seed)}</p><span className="challenge-crystals"><Gem size={15}/> 当前委托剩余 {activeChallenge.game.runtime?.missionRemaining ?? activeChallenge.game.budgetRemaining} 晶石</span></div><button className="button" disabled={pending} onClick={() => void perform(() => onContinue('challenge'))}>{activeChallenge.game.status === 'won' ? '查看真实复盘' : '返回这场委托'}<ArrowRight size={15}/></button></article>}
    {replacement && <div className="challenge-abandon" ref={replacementBox} tabIndex={-1} role="alertdialog" aria-modal="false" aria-labelledby="challenge-replace-title"><h3 id="challenge-replace-title">换成「{templateFor(replacement.templateId)?.label}」？</h3><p>编号 {challengeSeedCode(replacement.seed)}。当前未结束的普通委托现场会被替换；已经保留的胜利证明和检查点继续保存。想保留当前进度，可以先返回委托创建检查点。</p><button className="button" disabled={pending || occupied} onClick={() => void perform(async () => { await onStartChallenge(replacement); if (alive.current) setReplacement(null); })}>确认换这张委托</button><button className="button" disabled={pending} onClick={() => setReplacement(null)}>留在原委托</button></div>}

    <article className="challenge-expedition">
      <div className="challenge-expedition-heading"><Layers3 size={28}/><div><small>有限资源 · 连续构筑</small><h3>三层回声远征</h3></div></div>
      <p>从执行、信息到协作，连过三种委托。三层共用一袋晶石；到下一层与重试本层都不会补回已经花掉的资源。</p>
      {activeExpedition ? <>
        <div className="challenge-expedition-pool"><Gem size={19}/><strong>{activeExpedition.remaining}<small> / {activeExpedition.definition.initialBudget} 晶石</small></strong><span>{activeExpedition.status === 'cleared' ? '三层均已验收' : activeExpedition.status === 'abandoned' ? '这次远征已收队' : `正在第 ${activeExpedition.floor + 1} 层`}</span></div>
        <ol className="challenge-floor-list">{([0, 1, 2] as const).map(floor => {
          const done = activeExpedition.finished.some(attempt => attempt.floor === floor);
          const current = activeExpedition.status === 'active' && floor === activeExpedition.floor;
          return <li key={floor} className={done ? 'is-cleared' : current ? 'is-current' : ''}><span>{done ? <Check size={15}/> : floor + 1}</span><div><strong>{done || current ? templateFor(activeExpedition.definition.floors[floor].templateId)?.label ?? '远征委托' : '下一片未知城区'}</strong><small>{done ? '现场验收通过' : current ? statusNames[activeExpedition.game.status] : activeExpedition.status === 'abandoned' ? '此次未探索' : '到达后揭开委托'}</small></div></li>;
        })}</ol>
        <p className="challenge-small">编号 {challengeSeedCode(activeExpedition.definition.spec.seed)} · 已结束尝试 {activeExpedition.attempts.length} 次。记录费用来自实际执行，不按等级打折。</p>
        {activeExpedition.status === 'active' ? <div className="challenge-action-row">
          <button className="button primary" disabled={pending} onClick={() => void perform(() => onContinue('expedition'))}>返回本层<ArrowRight size={15}/></button>
          {activeExpedition.game.status === 'won' && <button className="button" disabled={pending || activeExpedition.floor < 2 && activeExpedition.remaining <= 0} onClick={() => void perform(() => onExpeditionAction({type: 'advance'}))}>{activeExpedition.floor === 2 ? '完成远征并收队' : '带剩余晶石前往下一层'}</button>}
          <button className="button" disabled={pending || activeExpedition.game.status === 'won' || activeExpedition.remaining <= 0} onClick={() => void perform(() => onExpeditionAction({type: 'retry-floor'}))}><RotateCcw size={14}/>重试本层，消耗不退回</button>
          <button className="button" disabled={pending} onClick={() => setAbandonOpen(value => !value)}><Tent size={14}/>收队</button>
        </div> : <button className="button" disabled={pending} onClick={() => void perform(() => onContinue('expedition'))}>查看这次远征的真实记录<ArrowRight size={15}/></button>}
        {abandonOpen && activeExpedition.status === 'active' && <div className="challenge-abandon" role="group" aria-label="确认收队"><p>收队会结束这次远征。已完成的楼层和已花的晶石留在记录里；下一次可以重新出发。</p><button className="button" disabled={pending} onClick={() => void perform(async () => { await onExpeditionAction({type: 'abandon'}); setAbandonOpen(false); })}>结束本次远征</button><button className="button" disabled={pending} onClick={() => setAbandonOpen(false)}><X size={14}/>继续留在远征中</button></div>}
      </> : <div className="challenge-expedition-empty"><span><Tent size={23}/> 这次会把什么难题带到同一袋资源里？</span><p className="challenge-small">到达的楼层才揭开情境，卷轴和权限要重新检查。开局晶石按三场可解委托的真实费用生成。</p></div>}
      {!liveExpedition && <><button className="button primary full" disabled={pending || !expeditionUnlocked || occupied || seed === undefined} onClick={() => { if (seed !== undefined && expeditionUnlocked && !occupied) void perform(() => onStartExpedition({factoryVersion: 1, seed})); }}><Layers3 size={17}/>开始一场三层远征</button>{!expeditionUnlocked && <p className="challenge-lock"><LockKeyhole size={15}/>{expeditionLockReason ?? '先完成对应的主线实操，取得执行、信息与协作的能力记录。'}</p>}</>}
      {!liveExpedition && liveChallenge && <p className="challenge-small">开始远征会保留当前普通委托；两种尝试使用各自的现场与资源，不把一边的验收算给另一边。</p>}
    </article>

    <section className="challenge-catalog" aria-label="24类委托目录"><div className="challenge-catalog-heading"><div><small>24 种不同的关键操作</small><h3>挑一张新的委托</h3></div><Sparkles size={21}/></div>
      <fieldset className="challenge-tier-picker"><legend>想挑战哪一类？</legend>{([0, 1, 2, 3] as const).map(value => <label key={value}><input type="radio" name="challenge-tier" checked={tier === value} onChange={() => setTier(value)}/><span>{value === 0 ? '全部委托' : tierNames[value]}</span></label>)}</fieldset>
      <label className="challenge-filter"><input type="checkbox" checked={unlockedOnly} onChange={event => setUnlockedOnly(event.target.checked)}/>只看我已经解锁的委托</label>
      <details className="challenge-seed"><summary>换一份可复现的变体</summary><p>相同委托与编号产生相同变体。换编号会改变实际条件，是否学会仍由陌生任务中的操作记录判断。</p><label>变体编号<input value={seedCode} onChange={event => setSeedCode(event.target.value.toUpperCase())} disabled={pending} maxLength={7} autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text" aria-invalid={seed === undefined}/></label><button className="button" disabled={pending} onClick={() => setSeedCode(challengeSeedCode(randomSeed()))}><RotateCcw size={14}/>抽一份新变体</button>{seed === undefined && <p role="alert">编号使用 1–7 位数字或英文字母，并须在有效范围内。</p>}</details>
      {occupied && <p className="challenge-notice">当前远征还在进行。先返回其中继续，或在上方收队后再接新的委托。</p>}
      <div className="challenge-commission-grid">{visible.map(template => {
        const capability = growth.find(entry => entry.mechanism === template.mechanism), isOpen = unlocked.has(template.id);
        return <article key={template.id} ref={template.id === initialTemplateId ? recommendedCard : undefined} tabIndex={template.id === initialTemplateId ? -1 : undefined} className={`challenge-commission tier-${template.tier} ${isOpen ? 'is-unlocked' : 'is-locked'}`}><div className="challenge-commission-badge"><span>{tierNames[template.tier]}</span>{isOpen ? <Compass size={16}/> : <LockKeyhole size={16}/>}</div><h4>{template.label}</h4><p>{template.decision}</p><div className="challenge-growth"><span>{growthNames[capability?.level ?? 'unseen']}</span>{(capability?.practiceWins ?? 0) > 0 && <small>保留胜利证明 {capability!.practiceWins} 份</small>}</div>
          {isOpen ? <button className="button" disabled={pending || occupied || seed === undefined} onClick={() => newChallenge(template.id)}>{liveChallenge ? '换成这张委托' : '接受委托'}<ArrowRight size={14}/></button> : <p className="challenge-lock">{lockReasons[template.id] ?? '先在主线取得对应机制的实际记录。'}</p>}
        </article>;
      })}</div>{visible.length === 0 && <p className="challenge-empty">这一类暂没有已解锁的委托。可以关闭筛选查看下一步的能力方向。</p>}
    </section>
    <p className="challenge-growth-note">能力来自已经验证的实操历史。同一种实际决策变体保留一份胜利证明；它不是全部重打次数。重复原关或只换编号，不会自动增加“独立迁移”认定，等级也不能替你满足工具、资料、权限或验收条件。</p>
    {working && <p role="status" className="challenge-notice">正在保存并准备这次委托…</p>}{error && <p role="alert" className="error-message">{error}</p>}
  </section>;
}
