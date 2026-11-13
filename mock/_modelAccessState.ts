import type * as D from '../src/api/modules/modelAccessContract'
import { runtimeState } from './_runtime'

export const modelAccessState = runtimeState('modelAccessV15', () => ({
  providers: [] as D.Provider[],
  models: [] as D.Model[],
  grants: new Map<string, D.Grant[]>(),
  prices: new Map<string, D.PricingVersion[]>(),
  events: new Map<string, D.LifecycleEvent[]>(),
  jobs: new Map<string, D.CheckJob>(),
  jobSnapshots: new Map<string, { model: D.Model; provider: D.Provider }>(),
  discoveries: new Map<string, { data: D.Discovery; connection: number }>(),
  configs: new Map<string, D.BalanceConfig>(),
  balances: new Map<string, D.BalanceState>(),
  balanceRuns: new Map<string, D.BalanceRun>(),
  authorizationVersion: 1,
  commands: new Map<string, { signature: string; data: unknown; status: number }>(),
  initialized: false,
  historyFixtureVersion: 0,
  grantFixtureVersion: 0,
}))

export function removeModelSubject(type: D.Subject['subject_type'], id: string) {
  let changed = false
  for (const [modelId, grants] of modelAccessState.grants) {
    const remaining = grants.filter(
      (grant) => grant.subject_type !== type || grant.subject_id !== id,
    )
    if (remaining.length === grants.length) continue
    modelAccessState.grants.set(modelId, remaining)
    const model = modelAccessState.models.find((model) => model.id === modelId)
    if (model) model.versions.grants++
    changed = true
  }
  if (changed) modelAccessState.authorizationVersion++
}
