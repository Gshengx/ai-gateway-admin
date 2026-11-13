import common from './common/en-US'
import auth from './modules/auth/en-US'
import settings from './modules/settings/en-US'
import roles from './modules/roles/en-US'
import models from './modules/models/en-US'
import keys from './modules/keys/en-US'
import dashboard from './modules/dashboard/en-US'
import users from './modules/users/en-US'
import groups from './modules/groups/en-US'
import expenses from './modules/expenses/en-US'
import budgetPlan from './modules/budgetPlan/en-US'
import budgetFlow from './modules/budgetFlow/en-US'
import projects from './modules/projects/en-US'
import systemLogs from './modules/systemLogs/en-US'
import modelAccess from './modules/modelAccess/en-US'
import { pricingFlowMessages } from './modules/modelAccess/pricingFlow'
import security from './modules/security/en-US'
import cost from './modules/cost/en-US'

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
  ...pricingFlowMessages['en-US'],
  security,
  cost,
}
