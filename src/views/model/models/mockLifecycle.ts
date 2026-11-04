import type { PhysicalModelItem } from '@/api/modules/models'

// 临时演示数据：后端尚未提供模型生命周期接口，不能作为真实审计记录使用。
// 独立于价格、准入历史，后续由生命周期接口整体替换。
export function mockModelLifecycle(status: PhysicalModelItem['status']) {
  const transitions: Record<string, string[]> = {
    DRAFT: ['DRAFT'],
    TESTING: ['DRAFT', 'TESTING'],
    PENDING_REVIEW: ['DRAFT', 'TESTING', 'PENDING_REVIEW'],
    ACTIVE: ['DRAFT', 'TESTING', 'PENDING_REVIEW', 'ACTIVE'],
    SUSPENDED: ['DRAFT', 'TESTING', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED'],
    RETIRED: ['DRAFT', 'TESTING', 'PENDING_REVIEW', 'ACTIVE', 'RETIRED'],
  }
  return (transitions[status] ?? [status])
    .map((state, index, states) => ({
      state,
      previous: states[index - 1],
      occurredAt: new Date(Date.UTC(2026, 10, 3, 6, 41 + index)).toISOString(),
    }))
    .reverse()
}
