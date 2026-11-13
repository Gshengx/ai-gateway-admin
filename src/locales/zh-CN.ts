import common from './common/zh-CN'
import auth from './modules/auth/zh-CN'
import settings from './modules/settings/zh-CN'
import roles from './modules/roles/zh-CN'
import models from './modules/models/zh-CN'
import keys from './modules/keys/zh-CN'
import dashboard from './modules/dashboard/zh-CN'
import users from './modules/users/zh-CN'
import groups from './modules/groups/zh-CN'
import expenses from './modules/expenses/zh-CN'
import budgetPlan from './modules/budgetPlan/zh-CN'
import budgetFlow from './modules/budgetFlow/zh-CN'
import projects from './modules/projects/zh-CN'
import systemLogs from './modules/systemLogs/zh-CN'
import modelAccess from './modules/modelAccess/zh-CN'
import { pricingFlowMessages } from './modules/modelAccess/pricingFlow'
import security from './modules/security/zh-CN'
import cost from './modules/cost/zh-CN'

export default {
  ...common,
  ...auth,
  ...settings,
  ...roles,
  ...models,
  ...keys,
  ...dashboard,
  ...users,
  ...groups,
  expenses,
  budgetPlan,
  budgetFlow,
  projects,
  logs: systemLogs,
  ma: modelAccess,
  ...pricingFlowMessages['zh-CN'],
  security,
  cost,
}
