import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  getSecurityOptions,
  type Allowlist,
  type DetectionAction,
  type DetectionRule,
  type Environment,
  type Scope,
  type SecurityOption,
  type SecurityOptions,
  type SecurityPolicy,
} from '@/api/modules/security'
import type { NotifiedError } from '@/api/request'

export const domains = ['ACCESS_CONTROL', 'DATA_CONTROL', 'SECURITY_DETECTION', 'AUDIT'] as const
export const sensitivities = ['PUBLIC', 'GENERAL', 'IMPORTANT', 'CORE']
export const risks = ['HIGH', 'MEDIUM', 'LOW']
export const engines = ['PROMPT_INJECTION', 'JAILBREAK', 'CONTENT_COMPLIANCE', 'MALICIOUS_IOC']
export const categories = ['EMPLOYEE', 'ENTERPRISE', 'CUSTOMER', 'PRODUCT', 'IT']
export const auditFields = [
  'SYSTEM_PROMPT',
  'USER_PROMPT',
  'REQUEST_TOOLS',
  'RESPONSE_CONTENT',
  'RESPONSE_TOOL_CALLS',
]
export function useSecurity() {
  const { t, te, locale } = useI18n()
  const options = ref<SecurityOptions>()
  const errorMessage = ref('')
  const fieldErrors = ref<string[]>([])
  const english = computed(() => locale.value.startsWith('en'))
  const label = (key: string) => (te(`security.${key}`) ? t(`security.${key}`) : key)
  const choices = (keys: readonly string[]) => keys.map((value) => ({ value, label: label(value) }))
  const optionLabel = (o: SecurityOption) => (english.value ? o.name_en : o.name)
  const optionChoices = (items: SecurityOption[] = []) =>
    items.map((o) => ({ value: o.id, label: optionLabel(o) }))
  const name = (item: SecurityPolicy | DetectionRule) =>
    item.seed_key ? label(item.seed_key) : item.name
  const description = (item: SecurityPolicy) =>
    item.seed_key && te(`security.${item.seed_key}Description`)
      ? label(`${item.seed_key}Description`)
      : item.description
  const idLabel = (id: string) => {
    const o = options.value
    const item =
      o &&
      [...o.users, ...o.groups, ...o.logical_models, ...o.physical_models, ...o.departments].find(
        (v) => v.id === id,
      )
    return item ? optionLabel(item) : id
  }
  const scopeSummary = (scope: Scope, user = false) =>
    scope.type === 'ALL'
      ? label(user ? 'ALL_USERS' : 'ALL_MODELS')
      : scope.type === 'ATTRIBUTES'
        ? scope.attributes.map((a) => `${a.field} ${label(a.operator)} ${a.value}`).join('; ')
        : scope.values.map((v) => (scope.type === 'LEVEL' ? label(v) : idLabel(v))).join(', ')
  const environmentSummary = (e: Environment) =>
    [
      e.time_start ? `${e.time_start}–${e.time_end}` : '',
      e.source_ips.length ? `${e.exclude_ips ? '! ' : ''}${e.source_ips.join(', ')}` : '',
      ...e.clients,
      e.terminal_type === 'ALL' ? '' : label(e.terminal_type),
      ...e.terminal_ids,
    ]
      .filter(Boolean)
      .join('; ') || label('allEnvironment')
  const actionSummary = (a: DetectionAction, rules: DetectionRule[] = []) => {
    const selector =
      a.kind === 'FILE'
        ? a.file_checks.map(label).join(' + ')
        : a.selector === 'ALL'
          ? label('allRules')
          : a.selector === 'ATTRIBUTES'
            ? label('ATTRIBUTES')
            : a.values
                .map((v) =>
                  a.selector === 'IDS'
                    ? name(rules.find((r) => r.id === v) ?? ({ name: v } as DetectionRule))
                    : label(v),
                )
                .join(', ')
    return `${selector} → ${label(a.action)}`
  }
  const allowSummary = (a: Allowlist, rules: DetectionRule[] = []) =>
    [
      a.user_ids.length ? `${label('user')}: ${a.user_ids.map(idLabel).join(', ')}` : '',
      a.model_ids.length ? `${label('model')}: ${a.model_ids.map(idLabel).join(', ')}` : '',
      a.rule_ids.length
        ? `${label('detectionRules')}: ${a.rule_ids
            .map((id) => rules.find((r) => r.id === id))
            .map((r, i) => (r ? name(r) : a.rule_ids[i]))
            .join(', ')}`
        : '',
      ['ACCESS_CONTROL', 'DATA_CONTROL'].includes(a.type) &&
      environmentSummary(a.environment_condition) !== label('allEnvironment')
        ? environmentSummary(a.environment_condition)
        : '',
    ]
      .filter(Boolean)
      .join('; ') || label('ALL')
  async function loadOptions() {
    options.value = await getSecurityOptions()
  }
  async function resolveDepartments(ids: string[]) {
    if (!ids.length || !options.value) return
    const result = await getSecurityOptions(undefined, ids)
    options.value.departments = [
      ...new Map(
        [...options.value.departments, ...result.departments].map((d) => [d.id, d]),
      ).values(),
    ]
  }
  function error(err: unknown) {
    const e = err as NotifiedError
    if (e.notified) return
    const violations = e.params?.violations as { field: string; code: string }[] | undefined
    fieldErrors.value = violations?.map((v) => v.field) ?? []
    const code = violations?.[0]?.code ?? e.code
    errorMessage.value =
      code && t(`security.${code}`) !== `security.${code}` ? label(code) : label('error')
    void MessagePlugin.error(errorMessage.value)
  }
  function clearErrors() {
    errorMessage.value = ''
    fieldErrors.value = []
  }
  return {
    t,
    locale,
    label,
    choices,
    options,
    optionChoices,
    optionLabel,
    name,
    description,
    idLabel,
    scopeSummary,
    environmentSummary,
    actionSummary,
    allowSummary,
    loadOptions,
    resolveDepartments,
    error,
    errorMessage,
    fieldErrors,
    clearErrors,
  }
}
