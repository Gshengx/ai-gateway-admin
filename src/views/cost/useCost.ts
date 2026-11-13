import { computed, reactive } from 'vue'
import { useUserStore } from '@/stores/modules/user'
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
let pending: Promise<void> | undefined
let cachedActor = ''
const scope = reactive({ root: 'hq', headquarters: true })
export function useCost() {
  const { t, locale } = useI18n()
  const english = computed(() => locale.value.startsWith('en'))
  const deptName = (id: string | null | undefined, path = false) => {
    const d = departments.get(id ?? '')
    return d ? (english.value ? (path ? d.path_en : d.name_en) : path ? d.path : d.name) : '—'
  }
  async function init() {
    const actor = useUserStore().userInfo?.id ?? ''
    if (cachedActor !== actor) {
      pending = undefined
      departments.clear()
      users.splice(0)
      cachedActor = actor
    }
    pending ??= getCostContext()
      .then((result) => {
        result.departments.forEach((d) => departments.set(d.id, d))
        users.splice(0, users.length, ...result.users)
        scope.root = result.scope_root_id
        scope.headquarters = result.is_headquarters
      })
      .catch((error) => {
        pending = undefined
        throw error
      })
    try {
      await pending
    } finally {
      pending = undefined
    }
  }
  async function ensureDepartments(ids: string[]) {
    await Promise.all(
      [...new Set(ids)]
        .filter((id) => id && !departments.has(id))
        .map(async (id) => {
          departments.set(id, await getCostDepartment(id))
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
