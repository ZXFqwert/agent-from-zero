import { Flame, Heart, BookOpen, CheckCircle2 } from 'lucide-react';
import type { PlayerSave } from '../storage';
import { uiStories } from '../content/stories';

const landmarks = [
  ['harbor-light','西岸灯塔','归船有了可见的引航信号。'],
  ['warehouse-gate','药箱仓库','门已经打开，药师开始整理配送。'],
  ['last-ferry','渡船码头','药箱已经随船抵达对岸。'],
  ['after-tide','潮汐石桥','变化后的桥面也有新的验收记录。'],
  ['fog-bell','雾中铃路','第二条引航路线已经可用。'],
  ['medicine-detour','街区药灯','你选择的配送路线留下了服务点。'],
  ['cooling-furnace','工匠炉壁','冷却水和真实热量回执都有了记录。'],
  ['paired-valves','分流管道','两闸状态与各自回执已核对。'],
  ['missing-crate','公会货梯','一次业务与多次调用分开记账。'],
  ['doubled-clerk','交接柜台','箱数与签收真实吻合，纸盾已经消散。'],
];
export default function CityLedger({save}:{save:PlayerSave}) {
  const choices=Object.entries(save.choices).map(([id,choice])=>({id,story:uiStories[id],choice})).filter(entry=>entry.story);
  const relics=[['harbor-light','闭环印章','委托、行动与验收'],['tide-ledger','量潮卷轴','成本与现场证据'],['last-ferry','缆绳结','行动顺序'],['after-tide','回潮刻印','变化后的重新验收'],['etched-door','参数刻尺','结构与类型'],['paired-valves','风管回执','调用与结果配对'],['doubled-clerk','唯一订单印','重复请求与副作用']];
  return <section className="city-ledger">
    <div className="section-label"><Flame size={16}/>城区留下的变化</div>
    <div className="landmark-grid">{landmarks.map(([id,name,description])=><div className={save.completedScenarioIds.includes(id)?'restored':''} key={id}><CheckCircle2 size={16}/><strong>{name}</strong><small>{save.completedScenarioIds.includes(id)?description:'等待你的契约'}</small></div>)}</div>
    {save.completedScenarioIds.flatMap(id=>(uiStories[id]?.outcomes ?? []).filter(outcome=>save.completedGames[id]?.world[outcome.fact]===outcome.equals).map(outcome=><p className="relationship-note" key={`${id}:${outcome.fact}`}>{outcome.text}</p>))}
    {choices.length>0&&<><div className="section-label"><Heart size={16}/>居民如何记得你</div>{choices.map(({id,story,choice})=><p className="relationship-note" key={id}>{story.choices.find(c=>c.id===choice)?.consequence}</p>)}</>}
    <div className="section-label"><BookOpen size={16}/>工坊的旅途收藏</div><div className="relic-grid">{relics.filter(([id])=>save.completedScenarioIds.includes(id)).map(([id,name,text])=><span key={id}>✧ <strong>{name}</strong><small>{text}</small></span>)}</div>
    <small className="fine-print">收藏记录经历。下一份委托仍要依靠你选择的工具、信息与行动。</small>
  </section>;
}
