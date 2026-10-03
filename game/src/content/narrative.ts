import type { StoryLine } from './chapterOneStory';
import { stories } from './stories';

/** Reactions change who brings the next problem. They never rewrite simulation facts. */
const reactions = [
  {source:'rescue-rope',target:'folded-map',speaker:'ava',people:'奥伦带着救援绳回来了，告诉我你知道何时该停。回廊里的问题却是：它读过了那么多，为什么到了门前，关键的纸仍然没带上？',workshop:'我看过你留下的停止契约。现在请帮我整理另一道边界：档案里存了什么，与本轮交给伙伴什么，是两件事。'},
  {source:'absent-margin',target:'many-faced-archivist',speaker:'ava',people:'居民已经能指出摘要漏掉的页边条件。千面档案官却说它没有遗漏，只有永远正确的旧答案。',workshop:'你留下的来源链带我们走到原件面前。档案官却把所有原件封起来，说看过一次就不必再看。'},
  {source:'courier-lock',target:'brass-order',speaker:'oren',people:'你把如何配对讲给了收件人，他们能接班了。我终于能回钟楼——那里还有另一种重复：不停修复，不停失效。',workshop:'你的交接记录已经能被后来的人查证。钟楼的旧清单却只说“每项都做完”，没说应该按什么顺序做。'},
  {source:'broken-escapement',target:'endless-warden',speaker:'oren',people:'工匠现在知道故障后可以停下来。续刻守卫却认为只要停止就是背叛；它守的是仪式，还是城里的人？',workshop:'你装的保险盒已经阻止了无效敲击。可守卫把保险盒拔掉了：它说运转次数就是功绩。'} ,
  {source:'etched-door',target:'cooling-furnace',speaker:'oren',people:'刚才门前的工匠已经分得清文字和整数了。他们又问我：刻度写对了，是不是就一定能执行？一起去看炉壁吧。',workshop:'你留的刻度卡放在炉门旁，照填也通过了格式检查。可温度保护仍然拒绝执行——记录里还有什么没看见？'},
  {source:'paired-valves',target:'missing-crate',speaker:'tiya',people:'你把编号怎么配讲清楚了，我能接手归档了。不过这次根本没有回信，要先查它究竟发生了什么。',workshop:'我翻过你留的风管记录，每次请求都有编号。货梯却没有回信：调用编号和这笔运药委托，是同一种身份吗？'},
  {source:'doubled-clerk',target:'courier-lock',speaker:'oren',people:'你把重复补发的错误讲给了收件人，他们现在也想要自己的交接记录。换个地方，契约还要由你来配。',workshop:'你留下的凭证规则正在交接台流传。可不同委托不能只照抄同一张凭证；看清这两位收件人各自的请求。'},
  {source:'warehouse-gate',target:'tide-ledger',speaker:'ruin',people:'缇娅把你的交接牌带来了，特意留了来源和复查栏。正好——这两份潮簿也需要这样核对。',workshop:'缇娅把你留的故障便笺贴在仓门。我也有两张纸想请你看看：它们都写得很肯定。'},
  {source:'tide-ledger',target:'last-ferry',speaker:'ruin',people:'你把航道怎么选讲给了岸边的人。现在他们正在帮我们等对岸的回铃，船上的活就交给你了。',workshop:'你留在航牌旁的潮次和试航记录，让接班人不用重新猜一遍。现在还差这班船的交货记录。'},
  {source:'hollow-regent',target:'after-tide',speaker:'mora',people:'居民带着告示栏上的修复回执来找我：灯是真的亮了，可栈桥又在晃。我们一起去看。',workshop:'回声翻开你留的手册，指着那张真回执问：过去验收过的桥，今天还能直接打勾吗？'},
] as const;
export function getOpeningLines(id:string,choices:Readonly<Record<string,string>>):StoryLine[] {
  const lines=[...(stories.find(story=>story.id===id)?.opening ?? [])];
  const reaction=reactions.find(entry=>entry.target===id&&['people','workshop'].includes(choices[entry.source]));
  if(reaction)lines.unshift({speaker:reaction.speaker,text:choices[reaction.source]==='people'?reaction.people:reaction.workshop});
  return lines;
}
