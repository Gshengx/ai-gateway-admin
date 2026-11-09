import { runtimeState } from './_runtime'
import type {
  Model,
  Permission,
  Provider,
  Pricing,
  TestRun,
  Candidate,
} from '../src/api/modules/modelAccess'

export const modelAccessState = runtimeState('modelAccess', () => ({
  models: [] as Model[],
  providers: [] as Provider[],
  permissions: new Map<string, Permission[]>(),
  prices: new Map<string, Pricing[]>(),
  runs: new Map<string, TestRun[]>(),
  discoveries: new Map<string, { provider: string; items: Candidate[] }>(),
  polls: new Map<string, number>(),
  initialized: false,
}))
