import { chapterOneStories,type StoryLine } from './chapterOneStory';

/** Reactions change who brings the next problem. They never rewrite simulation facts. */
const reactions = [
  {source:'warehouse-gate',target:'tide-ledger',speaker:'ruin',people:'缇娅把你的交接牌带来了，特意留了来源和复查栏。正好——这两份潮簿也需要这样核对。',workshop:'缇娅把你留的故障便笺贴在仓门。我也有两张纸想请你看看：它们都写得很肯定。'},
  {source:'tide-ledger',target:'last-ferry',speaker:'ruin',people:'你把航道怎么选讲给了岸边的人。现在他们正在帮我们等对岸的回铃，船上的活就交给你了。',workshop:'你留在航牌旁的潮次和试航记录，让接班人不用重新猜一遍。现在还差这班船的交货记录。'},
  {source:'hollow-regent',target:'after-tide',speaker:'mora',people:'居民带着告示栏上的修复回执来找我：灯是真的亮了，可栈桥又在晃。我们一起去看。',workshop:'回声翻开你留的手册，指着那张真回执问：过去验收过的桥，今天还能直接打勾吗？'},
] as const;
export function getOpeningLines(id:string,choices:Readonly<Record<string,string>>):StoryLine[] {
  const lines=[...(chapterOneStories.find(story=>story.id===id)?.opening ?? [])];
  const reaction=reactions.find(entry=>entry.target===id&&['people','workshop'].includes(choices[entry.source]));
  if(reaction)lines.unshift({speaker:reaction.speaker,text:choices[reaction.source]==='people'?reaction.people:reaction.workshop});
  return lines;
}
