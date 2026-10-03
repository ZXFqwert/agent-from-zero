import { Flame, Heart, BookOpen, CheckCircle2 } from 'lucide-react';
import type { PlayerSave } from '../storage';
import { uiStories } from '../content/stories';

const landmarks = [
  ['stamps-and-supplies','实物签收窗','印章以外，物资真正到了居民手中。'],
  ['three-lamps-one-boundary','私门外的灯路','亮灯和保护私门分别有证据。'],
  ['sunny-day-ledger','风雨账房','正常与故障案例接受同一版构筑检验。'],
  ['unweighed-crate','称重货台','未知信息被补查，没有被算成零。'],
  ['perfect-mirror-speaker','镜面议会','居民的实际处境接受独立检查。'],
  ['glasshouse-audit','玻璃花房','根部供水经过实测，绿叶没有替代验收。'],
  ['three-hands','南岸接头','测绘与施工通过实际交接修复了接头。'],
  ['private-scrolls','私卷递送台','有限共享板把选定的尺寸交给了施工伙伴。'],
  ['wet-foundation','桥墩施工台','下游等待的是这项成功接回的实际基础任务。'],
  ['chorus-bridgewright','七匠之桥','总图按版本合并，桥面经过现场实测与验收。'],
  ['sky-depot-handoff','空中货栈','陌生岗位也完成了交接、施工和实际送达。'],
  ['footer-order','物资递信窗','物资到达避难所，资料附言没有变成王令。'],
  ['glass-court','镜砂水闸','试验与现场各有执行和验收。'],
  ['counterfeit-regent','伪令王庭','撤销的凭证被重新核验，居民得到实际保护。'],
  ['river-relief','河谷救援营地','适当的身份与批准把物资交到营地。'],
  ['night-handoff','隔夜门禁','接班人从有来历的档案找回口令。'],
  ['saved-procedure','修泵工作间','保存的流程再次实际执行并验水。'],
  ['palimpsest-keeper','旧日档案炉','现行规则取代旧律，修订来历仍可查看。'],
  ['flooded-scriptorium','水围书房','跨会话找回条件，让读者重新使用书房。'],
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
  ['folded-map','卷轴门廊','回声携带实际需要的资料。'],
  ['many-faced-archivist','回廊档案桥','旧口令的面具落下，新实测恢复通道。'],
  ['brass-order','黄铜基座','校准不再被稍后的润滑冲掉。'],
  ['endless-warden','报时钟楼','续刻仪式已停止，居民通道恢复。'],
  ['rescue-rope','断桥救援台','孩子沿着有牢固锚点的绳子回来了。'],
];
export default function CityLedger({save}:{save:PlayerSave}) {
  const choices=Object.entries(save.choices).map(([id,choice])=>({id,story:uiStories[id],choice})).filter(entry=>entry.story);
  const relics=[['borrowed-seal','核验镜','来源与身份分别查证'],['one-use-writ','单次门令','批准一个具体请求'],['glass-court','镜砂瓶','隔离世界与独立验收'],['counterfeit-regent','换印册','旧授权可以被撤销'],['night-handoff','记忆灯','保存与检索分开'],['saved-procedure','流程册','可再次执行的方法'],['palimpsest-keeper','修订钥匙','经验的范围与纠错'],['harbor-light','闭环印章','委托、行动与验收'],['tide-ledger','量潮卷轴','成本与现场证据'],['last-ferry','缆绳结','行动顺序'],['after-tide','回潮刻印','变化后的重新验收'],['etched-door','参数刻尺','结构与类型'],['paired-valves','风管回执','调用与结果配对'],['doubled-clerk','唯一订单印','重复请求与副作用'],['cooling-pulse','冷却晶石','有限重试'],['endless-warden','停刻保险盒','明确的停止条件'],['narrow-satchel','折卷扣','保留任务条件的压缩'],['many-faced-archivist','溯源镜','让旧快照重新接受检验']];
  return <section className="city-ledger">
    {save.completedScenarioIds.includes('three-hands')&&<><div className="section-label"><Heart size={16}/>同行的伙伴</div><div className="relic-grid"><span><strong>弥灯 · 测绘伙伴</strong><small>南岸的实测让它加入工坊。把资料交到手里，才能看见同一个问题。</small></span>{save.completedScenarioIds.includes('private-scrolls')&&<span><strong>砧舟 · 工匠伙伴</strong><small>它在私卷递送台与你会合。任务、版本与岗位决定了怎样协作。</small></span>}</div></>}
    <div className="section-label"><Flame size={16}/>城区留下的变化</div>
    <div className="landmark-grid">{landmarks.map(([id,name,description])=><div className={save.completedScenarioIds.includes(id)?'restored':''} key={id}><CheckCircle2 size={16}/><strong>{name}</strong><small>{save.completedScenarioIds.includes(id)?description:'等待你的契约'}</small></div>)}</div>
    {save.completedScenarioIds.flatMap(id=>(uiStories[id]?.outcomes ?? []).filter(outcome=>save.completedGames[id]?.world[outcome.fact]===outcome.equals).map(outcome=><p className="relationship-note" key={`${id}:${outcome.fact}`}>{outcome.text}</p>))}
    {choices.length>0&&<><div className="section-label"><Heart size={16}/>居民如何记得你</div>{choices.map(({id,story,choice})=><p className="relationship-note" key={id}>{story.choices.find(c=>c.id===choice)?.consequence}</p>)}</>}
    <div className="section-label"><BookOpen size={16}/>工坊的旅途收藏</div><div className="relic-grid">{relics.filter(([id])=>save.completedScenarioIds.includes(id)).map(([id,name,text])=><span key={id}>✧ <strong>{name}</strong><small>{text}</small></span>)}</div>
    <small className="fine-print">收藏记录经历。下一份委托仍要依靠你选择的工具、信息与行动。</small>
  </section>;
}
