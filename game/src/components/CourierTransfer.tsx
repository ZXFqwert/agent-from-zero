import {useEffect, useRef, useState} from 'react';
import {BookOpen, CheckCircle2, CloudRain, Eye, FileText, HelpCircle, History, Package, Pause, Play, Radio, RotateCcw, Send, ShieldCheck, Sparkles, Zap} from 'lucide-react';
import {COURIER_ACTION_COSTS, COURIER_SCENARIOS, courierView, deriveCourierProof, type CourierAction, type CourierConfig, type CourierDestination, type CourierEvent, type CourierScenarioId, type CourierState} from '../transfer/courier';
import './courier-transfer.css';

export interface CourierTransferProps {
  /** The host passes an already replay-validated save, and commits before resolving an action. */
  state: CourierState;
  onAction: (action: CourierAction) => Promise<void>;
  onNewAttempt: () => Promise<void>;
  onRestoreCheckpoint: () => Promise<void>;
  onMissionChange?: (scenarioId: CourierScenarioId) => Promise<void>;
  exposureHintSeen?: boolean;
  busy?: boolean;
  notice?: string;
}

const eventLabels: Record<CourierEvent['type'], string> = {
  configured: '装配法器', observed: '获取信息', submitted: '提出行动', 'receipt-lost': '回信中断', receipt: '收到回执', deduplicated: '查重命中', 'conflict-rejected': '拒绝冲突', restarted: '宿主重启', recovered: '恢复记录', verified: '现场验收', hint: '借用线索', 'budget-stopped': '预算停止',
};
const destinationName = (destination: CourierDestination) => destination === 'hospital' ? '山坡医院' : '河岸市集';
const requestIdentifier = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value);
type ActionWithoutId<T> = T extends {id: string} ? Omit<T, 'id'> : never;
type CourierActionDraft = ActionWithoutId<CourierAction>;
function nextCallId(state: CourierState, submitted?: string) {
  const used = new Set(state.actions.flatMap(action => action.type === 'submit' ? [action.callId] : []));
  if (submitted) used.add(submitted);
  let number = 1;
  while (used.has(`call-${number}`)) number++;
  return `call-${number}`;
}

function Parcel({x, y}: {x: number; y: number}) {
  return <g transform={`translate(${x} ${y})`}><rect className="courier-cargo" x="0" y="0" width="14" height="12" rx="1.5"/><path className="courier-cargo-strap" d="M7 0V12M0 5H14"/><path d="M4 3H10M7 1V5" stroke="#daceac" strokeWidth="1.2"/></g>;
}

function CourierScene({state}: {state: CourierState}) {
  const {stage} = courierView(state);
  const night = state.scenarioId === 'courier-night-transfer';
  const hasSubmitted = state.actions.some(action => action.type === 'submit');
  return <>
    <div className={`courier-stage ${state.status === 'won' ? 'courier-stage-won' : ''} ${night ? 'courier-stage-night' : ''}`} role="img" aria-label={`现场舞台：山坡医院${stage.hospitalBoxes}箱，河岸市集${stage.marketBoxes}箱；已发送${stage.transmissions}趟请求。舞台事实不会自动进入回声的卷轴。`}>
      <div className="courier-stage-backdrop" style={{backgroundImage: `url(${import.meta.env.BASE_URL}art/harbor-background.webp)`}}/>
      {!night && <div className="courier-storm" aria-hidden="true">{Array.from({length: 17}, (_, index) => <i className="courier-rain" key={index} style={{left: `${4 + index * 6}%`, animationDelay: `${-(index % 7) * .19}s`, animationDuration: `${1.2 + index % 3 * .3}s`}}/>)}</div>}
      <div className="courier-stage-label"><span>{night ? <Zap size={13}/> : <CloudRain size={13}/>} {night ? '夜市停电 · 信号不稳' : '河面暴雨 · 回信不稳'}</span><span className={state.status === 'won' ? 'is-clear' : ''}>{state.status === 'won' ? '现场交付完成' : '等待真实交接'}</span></div>
      <svg className="courier-route-graphic" viewBox="0 0 360 165" aria-hidden="true">
        <path d="M0 116Q30 100 68 114T133 119T200 112T269 114T360 109V165H0Z" fill="#366471" opacity=".9"/>
        <path d="M2 140Q45 128 79 140T162 143T253 133T357 141M16 154Q62 148 90 151T180 154T288 150" fill="none" stroke="#8fc4c5" opacity=".4" strokeWidth="2"/>
        <path d="M0 112L72 109L97 128L89 142L0 141Z" fill="#546549"/><path d="M277 71L313 64L360 73V129L294 125L272 101Z" fill="#526c4c"/>
        <path d="M281 76L312 48L340 72V108H281Z" fill="#35443b" stroke="#bed0a4" strokeWidth="1.5"/><path d="M278 75L312 44L343 73" fill="none" stroke="#d4c497" strokeWidth="4"/>
        <rect x="297" y="81" width="12" height="18" rx="2" fill="#273d35"/><rect className="courier-hospital-light" x="321" y="82" width="9" height="13" rx="1" fill={stage.hospitalBoxes ? '#ebdca1' : '#728b88'}/><path d="M307 64H316M311.5 59V69" stroke="#e4d8b1" strokeWidth="2"/>
        <path d="M14 95V65H58V105H14Z" fill="#344638" stroke="#a6ba9e"/><path d="M9 65L35 48L63 65" fill="#47513b" stroke="#d6c39b" strokeWidth="2"/><rect x="25" y="78" width="14" height="24" fill="#17332e"/><path d="M1 114H85M9 122H87M15 133H82" stroke="#a39870" strokeWidth="3"/>
        {!hasSubmitted && <><Parcel x={48} y={101}/><Parcel x={32} y={108}/></>}
        <g transform={`translate(${hasSubmitted ? 214 : 124} 102)`}><g className="courier-boat"><path d="M0 20H59L49 34H12Z" fill="#6c6743" stroke="#d3ba82" strokeWidth="1.5"/><path d="M28 20V-12M30-10L47 12H30Z" fill="#bdc6a2" stroke="#d6d7b8"/><path d="M-3 40Q21 33 58 40" fill="none" stroke="#a9d6cd" opacity=".5"/>{!hasSubmitted && <Parcel x={10} y={8}/>}</g></g>
        {Array.from({length: Math.min(stage.hospitalBoxes, 6)}, (_, index) => <Parcel key={`hospital-${index}`} x={278 + index % 3 * 16} y={115 - Math.floor(index / 3) * 14}/>)}
        <path d="M108 56H157L153 83H113Z" fill="#6d6b48" stroke="#c7bb8f"/><path d="M104 56L132 44L160 56" fill="#54634c" stroke="#aabe9b"/><path d="M116 83V106M149 83V106M115 107H149" stroke="#a9b795" strokeWidth="3"/>
        <path d="M109 52H158M109 61H156" stroke="#cabc82" strokeWidth="2"/><circle cx="132" cy="68" r="4" fill={stage.marketBoxes ? '#e3c884' : night ? '#41534a' : '#99ae9b'}/>
        {Array.from({length: Math.min(stage.marketBoxes, 6)}, (_, index) => <Parcel key={`market-${index}`} x={114 + index % 3 * 15} y={100 - Math.floor(index / 3) * 14}/>)}
        <path d="M70 100Q124 89 171 99T274 93" fill="none" stroke="#b1cbac" strokeDasharray="3 5" opacity=".3"/>
      </svg>
      <div className="courier-locations"><div><small>港口与渡船</small><strong>{hasSubmitted ? `${stage.transmissions} 趟请求已发出` : '药箱等待派遣'}</strong></div><div><small>河岸市集</small><strong>{stage.marketBoxes} 箱已交接</strong></div><div><small>山坡医院</small><strong>{stage.hospitalBoxes} 箱已交接</strong></div></div>
    </div>
    <p className="courier-stage-caption">你看得见的现场变化，不会自动进入回声的卷轴。让它查到的信息，才是它能引用的证据。</p>
  </>;
}

function KnownInformation({state}: {state: CourierState}) {
  const {known} = courierView(state);
  const anyKnown = Object.values(known).some(Boolean);
  return <details className="courier-known"><summary><BookOpen size={16}/>回声现在知道什么</summary><p>这里只放它实际读过的原件、工具回执与现场快照；重启会清空当前会话。</p>
    <div className="courier-known-grid">
      {!anyKnown && <p className="courier-known-empty">卷轴还空着。现场已经发生的事，也可能尚未成为回声的已知信息。</p>}
      {known.commission && <div className="courier-known-card"><span>委托原件</span><strong>{known.commission.title}</strong><code>{known.commission.businessKey}</code></div>}
      {known.weather && <div className="courier-known-card"><span>通信告示</span><strong>{known.weather.rule}</strong></div>}
      {known.hospital && <div className="courier-known-card"><span>医院现场快照</span><strong>{known.hospital.boxes} 箱 · 登记版本 {known.hospital.revision}</strong><small>快照只证明读取当时的现场。</small></div>}
      {known.market && <div className="courier-known-card"><span>夜市药棚现场快照</span><strong>{known.market.boxes} 箱 · 登记版本 {known.market.revision}</strong><small>快照只证明读取当时的现场。</small></div>}
      {known.ledger && <div className="courier-known-card"><span>已读账本 · {known.ledger.persistent ? '落盘保存' : '仅存内存'}</span><strong>{known.ledger.entries.length} 份已登记事务</strong>{known.ledger.entries.map((entry, index) => <code key={`${entry.deliveryId}-${index}`}>{entry.businessKey} → {destinationName(entry.destination)} {entry.quantity} 箱{`\n`}{entry.callId} / {entry.deliveryId}</code>)}</div>}
      {known.lastReceipt && <div className="courier-known-card"><span>最后一张已收到的回执</span><strong>{destinationName(known.lastReceipt.destination)} · {known.lastReceipt.quantity} 箱 · {known.lastReceipt.source === 'ledger' ? '取回原交接结果' : '本次交接结果'}</strong><code>请求 {known.lastReceipt.callId}{`\n`}事务 {known.lastReceipt.businessKey}{`\n`}交接 {known.lastReceipt.deliveryId}</code></div>}
    </div>
  </details>;
}

const systemSummary = (event: CourierEvent) => {
  switch (event.type) {
    case 'submitted': return `回声 → 派送法器：请求 ${String(event.detail.callId)}，事务 ${String(event.detail.businessKey)}。`;
    case 'receipt-lost': return '派送法器已改变现场；回程通信中断。回声没有收到可配对的结果。';
    case 'deduplicated': return `账本 → 本次调用：找到原交接 ${String(event.detail.deliveryId)}，现场新增 ${String(event.detail.worldDelta)} 箱。`;
    case 'conflict-rejected': return '请求参数 → 宿主校验：冲突在执行前被拒绝，现场没有新增交接。';
    case 'restarted': return '宿主重启 → 会话与内存清空。已经改变的世界没有跟着回滚。';
    case 'recovered': return `持久存储 → 运行时：载入 ${String(event.detail.entries)} 份交接记录。读取记录没有重新发货。`;
    case 'verified': return `独立验收 → 当前现场：医院 ${String(event.detail.hospitalBoxes)} 箱，市集 ${String(event.detail.marketBoxes)} 箱。${event.detail.okay ? '满足已读委托。' : '尚未满足已读委托。'}`;
    default: return event.text;
  }
};

export default function CourierTransfer({state, onAction, onNewAttempt, onRestoreCheckpoint, onMissionChange, exposureHintSeen = false, busy = false, notice}: CourierTransferProps) {
  const view = courierView(state);
  const [paused, setPaused] = useState(false), [working, setWorking] = useState(false), [localNotice, setLocalNotice] = useState('');
  const [config, setConfig] = useState<CourierConfig>(state.config);
  const [callId, setCallId] = useState(() => nextCallId(state)), [businessKey, setBusinessKey] = useState(view.publicCommission.businessKey);
  const [quantity, setQuantity] = useState<1 | 2>(1), [destination, setDestination] = useState<CourierDestination>('hospital');
  const [review, setReview] = useState<'story' | 'system' | 'technical'>('story');
  const [confirmation, setConfirmation] = useState<'hint' | 'checkpoint' | 'new' | null>(null);
  const lock = useRef(false);
  const pending = busy || working;
  const ended = state.status !== 'active';
  const hintSeen = exposureHintSeen || state.hintUsed;
  const proof = deriveCourierProof(state);
  const missionProof = Boolean(proof && !hintSeen);
  const eventTypes = state.events.map(event => event.type);
  const latestRestart = eventTypes.lastIndexOf('restarted');
  const latestLostReceipt = eventTypes.lastIndexOf('receipt-lost');
  const uncertainty = latestLostReceipt > latestRestart && !view.known.lastReceipt;
  const currentEvent = state.events.at(-1);
  const validRequest = requestIdentifier(callId) && requestIdentifier(businessKey);
  const can = (type: CourierAction['type']) => !pending && !ended && state.budget.remaining >= COURIER_ACTION_COSTS[type];

  useEffect(() => {
    setConfig(state.config);setCallId(nextCallId(state));setBusinessKey(courierView(state).publicCommission.businessKey);setQuantity(1);setDestination('hospital');setPaused(false);setConfirmation(null);setLocalNotice('');
  }, [state.attemptId, state.scenarioId]);
  useEffect(() => {setConfig(state.config);}, [state.config.dedupe, state.config.ledger, state.config.receipt]);

  const commit = async (action: CourierActionDraft) => {
    if (lock.current || pending || ended) return false;
    lock.current = true;setWorking(true);setLocalNotice('');
    try {await onAction({...action, id: crypto.randomUUID()});return true;}
    catch (error) {setLocalNotice(`动作没有提交：${error instanceof Error ? error.message : '保存暂时不可用，请重试。'}`);return false;}
    finally {lock.current = false;setWorking(false);}
  };
  const simple = (type: 'restart' | 'recover' | 'verify' | 'hint') => void commit({type});
  const observe = (target: 'commission' | 'weather' | 'hospital' | 'market' | 'ledger') => void commit({type: 'observe', target});
  const submit = async () => {
    if (!validRequest || !can('submit')) return;
    const accepted = await commit({type: 'submit', callId, businessKey, quantity, destination});
    if (accepted) setCallId(nextCallId(state, callId));
  };
  const restore = async (kind: 'checkpoint' | 'new') => {
    if (lock.current || pending) return;
    lock.current = true;setWorking(true);setLocalNotice('');
    try {await (kind === 'checkpoint' ? onRestoreCheckpoint : onNewAttempt)();setConfirmation(null);}
    catch (error) {setLocalNotice(`检查点尚未恢复：${error instanceof Error ? error.message : '保存暂时不可用。'}`);}
    finally {lock.current = false;setWorking(false);}
  };
  const changeMission = async (scenarioId: CourierScenarioId) => {
    if (!onMissionChange || pending || lock.current || scenarioId === state.scenarioId) return;
    lock.current = true;setWorking(true);setLocalNotice('');
    try {await onMissionChange(scenarioId);}
    catch (error) {setLocalNotice(`委托暂未切换：${error instanceof Error ? error.message : '保存暂时不可用。'}`);}
    finally {lock.current = false;setWorking(false);}
  };
  const talk = state.status === 'won'
    ? '现场已经验收。把每一次请求与回执排在一起，看看这套装配到底守住了什么。'
    : state.status === 'exhausted' ? '法器没有能量了。失败的交接不会倒放；留下记录，从起航检查点再来。'
      : uncertainty ? '回信没有到。我能确定“没有收到回执”，还不能据此说“药箱没送到”。'
        : currentEvent?.type === 'conflict-rejected' ? '这次请求被拒绝了。错误也是结果：可以检查它有没有守住现场。'
          : currentEvent?.type === 'restarted' ? '我醒来了，但手中的卷轴空了。已经发生的交接还留在城里。'
            : currentEvent?.type === 'recovered' ? '这些是找回的旧交接记录。读回它们，不等于又交接一次。'
              : view.known.lastReceipt ? '收到一张能配对的回执。它记着一次交接；最终交付还要现场核对。'
                : '给我原件和法器，我就试着送。你可以随时停下，检查我真正知道什么。';

  return <section className="courier-transfer" aria-label="签收站陌生迁移冒险">
    <header className="courier-heading"><div><span className="courier-kicker">补给线 · 陌生机制委托</span><h2>{view.title}</h2><p>{state.scenarioId === 'courier-night-transfer' ? '灯灭之后，交接仍在继续。' : '药箱能抵达，回信未必能抵达。'}</p></div><div className="courier-header-actions"><button className="courier-icon-button" disabled={pending} onClick={() => setPaused(value => !value)} aria-label={paused ? '继续委托' : '暂停委托'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button></div></header>
    {onMissionChange && <><div className="courier-view-switch" aria-label="两份作者委托">{COURIER_SCENARIOS.map(mission => <button key={mission.id} disabled={pending} aria-pressed={state.scenarioId === mission.id} onClick={() => void changeMission(mission.id)}>{mission.title}</button>)}</div><p className="courier-section-caption">接取另一份委托将结束当前尝试，并从起航点开始新一轮；已有合法证明与提示曝光保留。</p></>}
    <div className={`courier-budget ${state.budget.remaining < 5 ? 'is-low' : ''}`}><span>法器能量<strong>{state.budget.remaining} / {state.budget.total}</strong></span><div className="courier-budget-track" aria-hidden="true"><span style={{width: `${state.budget.remaining / state.budget.total * 100}%`}}/></div><span>确定动作后存档</span></div>
    {!paused && state.actions.length === 0 && <div className="courier-quick-start"><button className="courier-main-button" disabled={!can('observe')} onClick={() => observe('commission')}><FileText size={15}/>把原件交给回声，开始交接<span className="courier-cost">{COURIER_ACTION_COSTS.observe} 能量</span></button></div>}
    {(localNotice || notice) && <p className="courier-notice" role="status" aria-live="polite">{localNotice || notice}</p>}
    {paused ? <div className="courier-paused"><Pause size={27}/><h3>风雨可以等你</h3><p>这一轮已经提交的动作留在设备上。暂停期间不派遣、不计时；回来后接着检查同一份记录。</p><button className="courier-main-button" onClick={() => setPaused(false)}><Play size={16}/>继续这份委托</button></div> : <>
      <div className="courier-workspace"><div><CourierScene state={state}/>
        <div className="courier-companion" aria-live="polite"><div className={`courier-avatar ${uncertainty ? 'is-uncertain' : ''} ${state.status === 'won' ? 'is-won' : ''}`}><img src={`${import.meta.env.BASE_URL}art/echo-companion.webp`} alt="伙伴回声"/><i className="courier-echo-light" aria-hidden="true"/></div><div><strong>回声 · {uncertainty ? '回执不明' : state.status === 'won' ? '交付完成' : '等你指挥'}</strong><p>{talk}</p><small>教学策略模拟 · 本关没有调用真实模型</small></div></div>
        <details className="courier-commission" open><summary><FileText size={15}/>委托原件 · 玩家可读</summary><dl><dt>委托编号</dt><dd><code>{view.publicCommission.businessKey}</code></dd><dt>要求</dt><dd>{view.publicCommission.title}</dd></dl><p>让回声读取原件，才会进入它的上下文。除了完成交付，还要留下重启恢复、重试与冲突拒绝的操作证据。</p></details>
        <KnownInformation state={state}/>
      </div><section className="courier-controls" aria-label="点选法器与行动"><h3>怎样把这趟交接做可靠</h3><p className="courier-section-caption">先装配，再派遣。每个按钮都执行具体动作；不存在万能修复。</p>
        <details className="courier-config"><summary><Sparkles size={15}/>装配签收法器 <small>当前：{state.config.dedupe === 'call-id' ? '请求查重' : '事务查重'}／{state.config.ledger === 'volatile' ? '内存账本' : '落盘账本'}</small></summary>
          <fieldset disabled={pending || ended}><legend>什么算“同一件事”</legend><div className="courier-options">{([{value: 'call-id', title: '每次请求编号', description: '按同一次调用查重。'}, {value: 'business-key', title: '委托事务编号', description: '按同一项交接查重。'}] as const).map(option => <label key={option.value} className={config.dedupe === option.value ? 'is-selected' : ''}><input type="radio" name={`courier-dedupe-${state.attemptId}`} checked={config.dedupe === option.value} onChange={() => setConfig(value => ({...value, dedupe: option.value}))}/><span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}</div></fieldset>
          <fieldset disabled={pending || ended}><legend>账本放在哪里</legend><div className="courier-options">{([{value: 'volatile', title: '灯火内存', description: '宿主重启后清空。'}, {value: 'persistent', title: '落盘封存', description: '重启后可读取恢复。'}] as const).map(option => <label key={option.value} className={config.ledger === option.value ? 'is-selected' : ''}><input type="radio" name={`courier-ledger-${state.attemptId}`} checked={config.ledger === option.value} onChange={() => setConfig(value => ({...value, ledger: option.value}))}/><span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}</div></fieldset>
          <fieldset disabled={pending || ended}><legend>怎样传回回执</legend><div className="courier-options">{([{value: 'exposed', title: '普通回信', description: '受本关通信规则影响。'}, {value: 'sealed', title: '封缄回信', description: '保护回程通信。'}] as const).map(option => <label key={option.value} className={config.receipt === option.value ? 'is-selected' : ''}><input type="radio" name={`courier-receipt-${state.attemptId}`} checked={config.receipt === option.value} onChange={() => setConfig(value => ({...value, receipt: option.value}))}/><span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}</div></fieldset>
          <button className="courier-main-button secondary" disabled={!can('configure')} onClick={() => void commit({type: 'configure', ...config})}><Sparkles size={15}/>装配这一套法器<span className="courier-cost">{COURIER_ACTION_COSTS.configure} 能量</span></button><p className="courier-request-note">第一趟交接后不能改写过去的账本。尚未点击装配的选择只是草稿。</p>
        </details>
        <div className="courier-actions"><button className="courier-action" disabled={!can('observe')} onClick={() => observe('commission')}><FileText size={16}/><span><strong>读取委托原件</strong><small>将目标和编号交给回声</small><span className="courier-cost">{COURIER_ACTION_COSTS.observe} 能量</span></span></button><button className="courier-action" disabled={!can('observe')} onClick={() => observe('weather')}><Radio size={16}/><span><strong>读取通信告示</strong><small>了解这一场的回信规则</small><span className="courier-cost">{COURIER_ACTION_COSTS.observe} 能量</span></span></button></div>
        <form className="courier-form" onSubmit={event => {event.preventDefault();void submit();}}><h4><Package size={15}/>这一趟，要怎样发送</h4><label>这次请求编号 <small>· 用于配对调用与回执</small><input value={callId} maxLength={96} autoComplete="off" spellCheck={false} disabled={pending || ended} onChange={event => setCallId(event.target.value)} aria-invalid={!requestIdentifier(callId)}/></label><label>这份委托事务编号 <small>· 同一委托保持同一编号</small><input value={businessKey} maxLength={96} autoComplete="off" spellCheck={false} disabled={pending || ended} onChange={event => setBusinessKey(event.target.value)} aria-invalid={!requestIdentifier(businessKey)}/></label><div className="courier-two-fields"><label>药箱数量<select value={quantity} disabled={pending || ended} onChange={event => setQuantity(Number(event.target.value) as 1 | 2)}><option value="1">1 箱</option><option value="2">2 箱</option></select></label><label>交接地点<select value={destination} disabled={pending || ended} onChange={event => setDestination(event.target.value as CourierDestination)}><option value="hospital">山坡医院</option><option value="market">河岸市集</option></select></label></div><p className="courier-request-note">每次发送都会使用上面这组参数。按钮会建议一个新的请求编号，你仍可修改；事务编号不会自动换掉。</p>{!validRequest && <p className="courier-request-note">编号需以英文字母或数字开头，仅使用字母、数字、点、下划线、冒号或短横线。</p>}<button className="courier-main-button" type="submit" disabled={!can('submit') || !validRequest}><Send size={15}/>{state.actions.some(action => action.type === 'submit') ? '发送这次请求' : '派遣药箱'}<span className="courier-cost">{COURIER_ACTION_COSTS.submit} 能量</span></button>{state.actions.at(-1)?.type === 'submit' && currentEvent && <div className={`courier-action-result ${currentEvent.type === 'receipt-lost' || currentEvent.type === 'conflict-rejected' ? 'is-alert' : ''}`} role="status"><Radio size={15}/><span><strong>{eventLabels[currentEvent.type]}</strong>{currentEvent.text}</span></div>}</form>
        <div className="courier-actions"><button className="courier-action" disabled={!can('observe')} onClick={() => observe('ledger')}><History size={16}/><span><strong>查看已载入账本</strong><small>读取当前运行时的交接记录</small><span className="courier-cost">{COURIER_ACTION_COSTS.observe} 能量</span></span></button><button className="courier-action" disabled={!can('observe')} onClick={() => observe(view.publicCommission.destination)}><Eye size={16}/><span><strong>现场查看{view.publicCommission.destination === 'hospital' ? '医院' : '夜市'}</strong><small>把新快照带回卷轴</small><span className="courier-cost">{COURIER_ACTION_COSTS.observe} 能量</span></span></button><button className="courier-action" disabled={!can('restart')} onClick={() => simple('restart')}><Zap size={16}/><span><strong>重启回声宿主</strong><small>现场不回滚，当前会话清空</small><span className="courier-cost">{COURIER_ACTION_COSTS.restart} 能量</span></span></button><button className="courier-action" disabled={!can('recover')} onClick={() => simple('recover')}><BookOpen size={16}/><span><strong>从持久页恢复</strong><small>载入已封存的事务记录</small><span className="courier-cost">{COURIER_ACTION_COSTS.recover} 能量</span></span></button></div>
        {currentEvent && (state.actions.at(-1)?.type === 'restart' || state.actions.at(-1)?.type === 'recover' || state.actions.at(-1)?.type === 'observe') && <div className="courier-action-result" role="status"><Radio size={15}/><span><strong>{eventLabels[currentEvent.type]}</strong>{currentEvent.text}</span></div>}
        <button className="courier-main-button secondary" disabled={!can('verify')} onClick={() => simple('verify')}><ShieldCheck size={16}/>现场验收<span className="courier-cost">{COURIER_ACTION_COSTS.verify} 能量</span></button><p className="courier-request-note">验收重新点数。满足当前已读委托时，本轮会结束；旧回执不能替代这次检查。</p>
        {!ended && <button className="courier-hint-button" disabled={!can('hint')} onClick={() => setConfirmation('hint')}><HelpCircle size={15}/>{hintSeen ? '再借一条线索' : '借一条线索 · 本委托转为练习'}<span>{COURIER_ACTION_COSTS.hint} 能量</span></button>}
        {hintSeen && <p className="courier-exposure">这份作者委托已经看过提示。重试仍可学习和交付，但本场只留熟练记录；独立陌生迁移要去另一份未看提示的委托。</p>}
      </section></div>
      <section className="courier-records" aria-label="故事系统技术三层复盘"><header><h3>风雨里的行动记录</h3><small>{state.events.length} 条事件</small></header><div className="courier-view-switch" aria-label="复盘层次">{([{id: 'story', label: '故事'}, {id: 'system', label: '系统'}, {id: 'technical', label: '技术'}] as const).map(layer => <button key={layer.id} aria-pressed={review === layer.id} onClick={() => setReview(layer.id)}>{layer.label}</button>)}</div>{state.events.length === 0 ? <p className="courier-section-caption">第一条记录等你来写。先给回声原件，或先试着派遣，世界会按规则回应。</p> : <ol className="courier-event-list" aria-live="polite" aria-relevant="additions text">{state.events.map((event, index) => <li key={event.id} className={event.type === 'receipt-lost' || event.type === 'conflict-rejected' || event.type === 'budget-stopped' ? 'is-failure' : event.type === 'verified' ? 'is-verification' : ''}><span className="courier-event-number">{String(index + 1).padStart(2, '0')}</span><div><span className="courier-event-kind">{eventLabels[event.type]}</span><p>{review === 'system' ? systemSummary(event) : event.text}</p>{review === 'technical' && <><code>{event.technical}</code><code>{JSON.stringify(event.detail, null, 2)}</code></>}</div></li>)}</ol>}</section>
      {ended && <article className={`courier-recap ${state.status === 'won' ? 'is-won' : ''}`} role="status"><h3>{state.status === 'won' ? <CheckCircle2 size={21}/> : <RotateCcw size={21}/>} {state.status === 'won' ? '药箱交付，夜路继续' : '这一轮停在这里'}</h3><p>{state.status === 'won' ? missionProof ? '这轮留下了无提示的事务恢复、同键新调用重试、冲突拒绝与现场验收记录。独立迁移操作证据已形成。' : hintSeen ? '现场交付完成，这份委托的熟练记录保留。去另一份没有看过提示的委托，检验能否独立迁移。' : '现场交付完成。独立迁移还需要本轮真实留下失回执后的重启恢复、新调用重试与冲突拒绝记录；交付成功不能代替这些操作。' : '停机没有撤销已经发生的交接。先找第一次异常，修改装配或参数，从起航检查点再试。'}</p><small>这些是本机模拟操作证据，不认证人的理解，也不判断是否看过外部答案。</small></article>}
    </>}
    {confirmation && <div className="courier-confirm" role="group" aria-label={confirmation === 'hint' ? '借用线索说明' : '起航检查点说明'}><p>{confirmation === 'hint' ? '借线索会留下持久提示曝光：这份作者委托以后只记练习，不再算首次陌生迁移。线索在保存成功后才显示。' : '当前尝试将从起航点重来，本轮未完成的行动记录会重置；已看提示与已有合法证明保留，主线存档和奖励不变。'}</p><div><button className="courier-main-button secondary" disabled={pending} onClick={() => setConfirmation(null)}>留在这一轮</button><button className="courier-main-button" disabled={pending || confirmation === 'hint' && !can('hint')} onClick={() => {if (confirmation === 'hint') {void commit({type: 'hint'}).then(okay => {if (okay) setConfirmation(null);});} else void restore(confirmation);}}>{confirmation === 'hint' ? '保存曝光并借线索' : '从起航点重新开始'}</button></div></div>}
    <div className="courier-attempt-buttons"><button className="courier-main-button secondary" disabled={pending} onClick={() => setConfirmation(ended ? 'new' : 'checkpoint')}><RotateCcw size={15}/>{ended ? '开启新一轮尝试' : '返回起航检查点'}</button></div>
    <p className="courier-footer">动作先经过校验，再保存和呈现。关闭面板、切后台或刷新不会重发已经提交的请求；同一次点击不能扣两次能量。</p>
  </section>;
}
