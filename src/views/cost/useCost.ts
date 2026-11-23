import { computed, reactive } from 'vue'
import { useUserStore } from '@/stores/modules/user'
import { useDepartmentScope } from '@/utils/useDepartmentScope'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  getCostContext,
  getCostDepartment,
  type CostDepartment,
  type CostUser,
  type BudgetStatus,
} from '@/api/modules/cost'
const departments = reactive(new Map<string, CostDepartment>())
const users = reactive<CostUser[]>([])
const scope = reactive({ root: 'hq', headquarters: true })
export function useCost() {
  const { t, locale } = useI18n()
  const english = computed(() => locale.value.startsWith('en'))
  const deptName = (id: string | null | undefined, path = false) => {
    const d = departments.get(id ?? '')
    return d ? (english.value ? (path ? d.path_en : d.name_en) : path ? d.path : d.name) : '—'
  }
  const user = useUserStore()
  const scopeKey = () => JSON.stringify([user.context.session?.user_id, user.permissionEpoch])
  useDepartmentScope(() => {
    departments.clear()
    users.splice(0)
    void init().catch(error)
  })
  async function init() {
    const current = scopeKey()
    const result = await getCostContext()
    if (current !== scopeKey()) return
    result.departments.forEach((d) => departments.set(d.id, d))
    users.splice(0, users.length, ...result.users)
    scope.root = result.scope_root_id
    scope.headquarters = result.is_headquarters
  }
  async function ensureDepartments(ids: string[]) {
    const current = scopeKey()
    await Promise.all(
      [...new Set(ids)].filter(Boolean).map(async (id) => {
        const department = await getCostDepartment(id)
        if (current === scopeKey()) departments.set(id, department)
      }),
    )
  }
  const money = (value: number, currency = 'CNY') =>
    new Intl.NumberFormat(locale.value, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
  const tokens = (value: number) => (value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : number(value))
  const userName = (id: string | null) => users.find((u) => u.id === id)?.username ?? '—'
  const statusText = (status: BudgetStatus) =>
    t(status === 'SHARED' ? 'cost.sharedBudget' : `cost.${status}`)
  const statusTheme = (status: string): 'success' | 'warning' | 'danger' | 'default' | 'primary' =>
    status === 'NORMAL' || status === 'COMPLETED' || status === 'ACTIVE'
      ? 'success'
      : status === 'WARNING' || status === 'CRITICAL'
        ? 'warning'
        : status === 'EXCEEDED' || status === 'UNCONFIGURED' || status === 'FAILED'
          ? 'danger'
          : 'default'
  const error = (err: unknown) => {
    if (!(err as { notified?: boolean })?.notified) void MessagePlugin.error(t('cost.failed'))
  }
  return {
    t,
    locale,
    english,
    departments,
    users,
    scope,
    init,
    ensureDepartments,
    deptName,
    money,
    number,
    tokens,
    userName,
    statusText,
    statusTheme,
    error,
  }
}
