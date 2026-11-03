import type { LogicalModel, LogicalModelPermission } from '../src/api/modules/logicalModels'
import type { PhysicalModelItem } from '../src/api/modules/models'

// vite-plugin-mock 分文件打包，使用同一份内存数据保证模型和用户授权视图同步。
const store = globalThis as typeof globalThis & {
  __aisLogicalState?: {
    models: PhysicalModelItem[]
    logical: LogicalModel[]
    grants: LogicalModelPermission[]
  }
}
export const logicalState = (store.__aisLogicalState ??= { models: [], logical: [], grants: [] })
