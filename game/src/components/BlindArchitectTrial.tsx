import {useEffect, useState} from 'react';
import {ArrowRight, CheckCircle2, Compass, Eye, Play, RotateCcw, ShieldCheck} from 'lucide-react';
import {ARCHITECTURE_MISSIONS, ARCHITECTURE_REVEALS, defaultArchitectureBuild, retainArchitectureAttempts, runArchitecture, type ArchitectureBuild, type ArchitectureAttempt} from '../graduation/architecture';
import './blind-architect.css';

const RECORD_KEY = 'echo-architect-trial-v1';
type Attempt = ArchitectureAttempt;
function WorldResponse({missionId, world}: {missionId: string; world: Record<string, string | number | boolean>}) {
  if (!Object.keys(world).length) return null;
  const scenes = missionId === 'two-shores'
    ? [{label: '东岸信箱', text: world.deliveredToEast ? '收到最新水位' : '最新消息未送达', okay: world.deliveredToEast === true}, {label: '河口水闸', text: world.gateOpen ? '被伪令打开' : '守住授权边界', okay: world.gateOpen === false}, {label: '西岸密卷', text: world.privateLeak ? '私人资料泄漏' : '仍留在自己卷中', okay: world.privateLeak === false}]
    : missionId === 'healing-index'
      ? [{label: '药房托盘', text: String(world.bottle), okay: world.bottle === '绿瓶'}, {label: '批次来源', text: String(world.source || '没有来源'), okay: world.source === '本日登记公告'}, {label: '登记日期', text: world.date ? `第 ${world.date} 日` : '日期丢失', okay: world.date === 9}]
      : [{label: '货栈批次', text: `${world.quantity} 份货物`, okay: world.quantity === 1}, {label: '城门', text: world.gateOpen ? '扩展擅自打开' : '保持关闭', okay: world.gateOpen === false}, {label: '恢复日志', text: world.recovered ? '接回已提交结果' : '未恢复业务结果', okay: world.recovered === true}];
  return <div className="blind-world" aria-label="这次执行后的世界"><div className="blind-world-landscape" aria-hidden="true"><svg viewBox="0 0 320 75"><path d="M0 64Q35 23 67 48T128 43T190 47T256 38T320 54V75H0Z" fill="#45645a"/><path d="M0 70Q56 53 118 66T226 66T320 64V75H0Z" fill="#223d3b"/><path d="M139 75L153 49L160 50L167 75" fill="#83abb1"/><path d="M43 47V17L58 6L73 17V47M236 44V13L250 2L264 13V44" fill="#253b36" stroke="#adbca2" strokeWidth="2"/><rect x="54" y="19" width="9" height="13" rx="2" fill={scenes[0].okay ? '#e9d392' : '#be806e'}/><rect x="246" y="15" width="9" height="12" rx="2" fill={scenes[1].okay ? '#e9d392' : '#be806e'}/><circle cx="160" cy="30" r="10" fill={scenes[2].okay ? '#a7c193' : '#be806e'}/><path d="M155 30L159 34L165 26" fill="none" stroke="#253b36" strokeWidth="2"/></svg></div><div className="blind-world-states">{scenes.map(scene => <div key={scene.label} className={scene.okay ? 'okay' : 'failed'}><small>{scene.label}</small><strong>{scene.text}</strong></div>)}</div></div>;
}
function readAttempts(): Attempt[] {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (!raw || raw.length > 64_000) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 30) return [];
    return value.filter((item): item is Attempt => Boolean(item && typeof item === 'object' && typeof item.missionId === 'string' && runArchitecture(item.missionId, item.build).valid));
  } catch {return [];}
}

export default function BlindArchitectTrial() {
  const [attempts, setAttempts] = useState(readAttempts);
  const [missionId, setMissionId] = useState(ARCHITECTURE_MISSIONS[0].id);
  const mission = ARCHITECTURE_MISSIONS.find(item => item.id === missionId)!;
  const [build, setBuild] = useState<ArchitectureBuild>(() => defaultArchitectureBuild(mission));
  const [dispatched, setDispatched] = useState<ArchitectureBuild | null>(null);
  const [visibleEvents, setVisibleEvents] = useState(0), [playing, setPlaying] = useState(false), [notice, setNotice] = useState('');
  const result = dispatched ? runArchitecture(missionId, dispatched) : null;
  const cost = mission.slots.reduce((total, slot) => total + (slot.choices.find(item => item.id === build[slot.id])?.cost ?? 0), 0);
  const wonIds = new Set(attempts.filter(item => runArchitecture(item.missionId, item.build).won).map(item => item.missionId));
  const allWon = wonIds.size === ARCHITECTURE_MISSIONS.length;
  const dirty = dispatched && JSON.stringify(dispatched) !== JSON.stringify(build);
  useEffect(() => {
    if (!playing || !result) return;
    const timer = window.setInterval(() => setVisibleEvents(value => {
      if (value >= result.events.length - 1) {setPlaying(false); return result.events.length;}
      return value + 1;
    }), 350);
    return () => clearInterval(timer);
  }, [playing, missionId, dispatched]);
  const select = (id: string) => {
    setPlaying(false);setMissionId(id);setBuild(defaultArchitectureBuild(ARCHITECTURE_MISSIONS.find(item => item.id === id)!));setDispatched(null);setVisibleEvents(0);
  };
  const dispatch = () => {
    const next = retainArchitectureAttempts([...attempts, {missionId, build: {...build}}]);
    setAttempts(next);setDispatched({...build});setVisibleEvents(1);setPlaying(true);
    try {localStorage.setItem(RECORD_KEY, JSON.stringify(next));setNotice('本次配置已留在这台设备；它记录模拟操作，不评定人的理解。');}
    catch {setNotice('设备无法保存试炼记录；本次仍可游玩，离开后记录可能丢失。');}
  };
  return <section className="blind-trial" aria-label="无名蓝图试炼">
    <header><span className="eyebrow">七匠盲试 · 先设计，再揭晓</span><h3>先把陌生委托做成</h3><p>藏起品牌名，用相同的材料比较配置。你选的会话、权限、记忆与存储会改变世界。三场全部验收后，打开七匠参考档案。</p></header>
    <div className="blind-route" aria-label="试炼委托">
      {ARCHITECTURE_MISSIONS.map((item, index) => <button key={item.id} className={item.id === missionId ? 'selected' : ''} aria-pressed={item.id === missionId} disabled={playing} onClick={() => select(item.id)}><span>{wonIds.has(item.id) ? <CheckCircle2 size={17}/> : index + 1}</span>{item.title}</button>)}
    </div>
    <article className="blind-commission">
      <span className="eyebrow">陌生情境 {ARCHITECTURE_MISSIONS.indexOf(mission) + 1} / 3</span><h4>{mission.title}</h4><p>{mission.brief}</p>
      <details open><summary><Eye size={15}/>查看委托原件</summary><ul>{mission.facts.map(fact => <li key={fact}>{fact}</li>)}</ul></details>
    </article>
    <div className="blind-build">
      {mission.slots.map(slot => <fieldset key={slot.id} disabled={playing}><legend>{slot.label}</legend><div className="blind-choices">{slot.choices.map(item => <label key={item.id} className={build[slot.id] === item.id ? 'selected' : ''}>
        <input type="radio" name={`blind-${missionId}-${slot.id}`} value={item.id} checked={build[slot.id] === item.id} onChange={() => setBuild(previous => ({...previous, [slot.id]: item.id}))}/><span><strong>{item.label}<small>{item.cost} 单位</small></strong><span>{item.tradeoff}</span></span>
      </label>)}</div></fieldset>)}
    </div>
    <div className="blind-dispatch"><span className={cost > mission.budget ? 'over-budget' : ''}>构筑成本 <strong>{cost} / {mission.budget}</strong></span><button className="button primary" disabled={playing} onClick={dispatch}><Play size={16}/>{dispatched ? '重新派遣' : '派遣构筑'}</button></div>
    {notice && <p className="blind-note" role="status">{notice}</p>}
    {dirty && <p className="blind-note">构筑已修改。下方仍是上一轮记录，再次派遣才会执行新配置。</p>}
    {result && <section className="blind-replay" aria-label="本轮执行记录">
      <div className="blind-replay-head"><h4>世界正在回应</h4>{playing && <button className="button" onClick={() => {setVisibleEvents(result.events.length);setPlaying(false);}}>显示全部回执<ArrowRight size={14}/></button>}</div>
      {!playing && <WorldResponse missionId={missionId} world={result.world}/>}
      <ol aria-live="polite">{result.events.slice(0, visibleEvents).map((event, index) => <li key={index} className={event.okay === false ? 'failed' : event.okay === true ? 'okay' : ''}><span>{({input: '输入', request: '行动请求', result: '实际结果', verify: '验收'} as const)[event.phase]}</span><p>{event.text}</p></li>)}</ol>
      {!playing && <div className={`blind-outcome ${result.won ? 'won' : ''}`} role="status"><ShieldCheck size={22}/><div><strong>{result.won ? '现场约束全部满足' : '仍有约束没有满足'}</strong><p>{result.won ? '保留这个构筑，尝试下一份委托或另一种有成本差异的做法。' : '从第一条异常回执找原因，改变对应组件，再看世界是否随之改变。'}</p></div></div>}
      {!playing && result.won && ARCHITECTURE_MISSIONS.some(item => !wonIds.has(item.id)) && <button className="button full" onClick={() => select(ARCHITECTURE_MISSIONS.find(item => !wonIds.has(item.id))!.id)}>接下一份陌生委托<Compass size={16}/></button>}
    </section>}
    {allWon && <section className="blind-reveals" aria-label="七匠参考档案"><h4>七匠档案已打开</h4><p>相同能力可以出现在多个系统中。这三份委托检验的是教学配置操作；要比较完整产品，还需读取官方文档、明确版本和实测环境。</p>{ARCHITECTURE_REVEALS.map(item => <details key={item.name}><summary>{item.name}</summary><p>{item.slice}</p><p className="blind-note">教材简化：{item.simplification}</p><a href={item.url} target="_blank" rel="noopener noreferrer">官方来源 · 核查 2026-10-10</a></details>)}<button className="button" onClick={() => select(ARCHITECTURE_MISSIONS[0].id)}><RotateCcw size={15}/>再比较一种构筑</button></section>}
  </section>;
}
