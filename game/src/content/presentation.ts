import type { FactValue, GameState } from '../engine';

const values: Record<string, string> = {
  north: '北汊', south: '南汊', near: '本岸', far: '对岸',
  none: '尚未选择', unset: '尚未选择', main: '主钟', chain: '沿岸三铃',
  depot: '仓库', dock: '码头', midway: '半路',
  clinic: '诊室集中供药', mobile: '诊室与码头供药',
};

/** Presentation only: preserve raw facts in saves, decisions and technical replay. */
export function displayFact(fact: string, value: FactValue): string {
  if (typeof value === 'boolean') return value ? '已实现' : '未实现';
  if (typeof value === 'number') return /Crates$/.test(fact) ? `${value} 箱` : String(value);
  return values[value] ?? value;
}

export function displayActionLabel(label: string): string {
  return label.replace(/\s*·\s*\d+\s*$/, '');
}

export function budgetExplanation(state: GameState): string {
  const remaining = state.runtime?.missionRemaining;
  if (remaining === undefined) return '这次派遣的预算已停止。可以到工坊调整预算后继续。';
  if (remaining === 0) return '委托总能量已经用完。换装不会补充能量；从起点重试时，世界也会重置，历史奖励会保留。';
  if (state.budgetRemaining === 0) return `这次派遣预算已用完，委托还剩 ${remaining} 点。到工坊签订下一次派遣契约，即可继续当前现场。`;
  return `剩余能量不足以支付刚才的请求。委托还剩 ${remaining} 点，本次派遣还剩 ${state.budgetRemaining} 点；可换低成本策略，或到工坊调整派遣预算。`;
}
