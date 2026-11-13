// Localize response copies only. Stored business data and write DTOs stay language-neutral.
const authLabels: Record<string, string> = {
  api_key: 'API 密钥',
  api_version: 'API 版本',
  tenant_id: '租户 ID',
  client_id: '客户端 ID',
  client_secret: '客户端密钥',
  deployment: '部署名称',
  project_id: '项目 ID',
  region: '区域',
  service_account_json: '服务账号 JSON',
  secret_key: '访问密钥',
  secret_id: '访问密钥 ID',
  management_api_key: '管理 API 密钥',
}
const metricLabels: Record<string, string> = {
  input_tokens: '输入 Token',
  output_tokens: '输出 Token',
}

export function localizeModelAccessResponse(data: unknown, language: unknown): unknown {
  const chinese = String(language ?? 'zh-CN')
    .split(',')[0]!
    .trim()
    .startsWith('zh')
  if (!data || typeof data !== 'object') return data
  if (Array.isArray(data)) {
    data.forEach((item) => localizeModelAccessResponse(item, language))
    return data
  }
  const value = data as Record<string, unknown>
  if (value.default_reference && value.internal_pricing_prefill) {
    for (const target of [value.default_reference, value.internal_pricing_prefill]) {
      const periods = (target as { periods?: { name: string }[] }).periods ?? []
      for (const period of periods)
        if (['默认时段', 'Default period'].includes(period.name))
          period.name = chinese ? '默认时段' : 'Default period'
    }
  }
  if (!chinese) {
    Object.values(value).forEach((item) => localizeModelAccessResponse(item, language))
    return data
  }
  if (typeof value.key === 'string' && 'control' in value && 'value_type' in value) {
    const label = authLabels[value.key]
    if (label) value.label = label
  }
  if (typeof value.metric_key === 'string' && 'display_name' in value) {
    const label = metricLabels[value.metric_key]
    if (label) {
      value.display_name = label
      if ('description' in value) value.description = label
    }
    if (value.unit === 'PER_MILLION_TOKENS') value.unit_label = '百万 Token'
  }
  if (Array.isArray(value.auth_modes)) {
    for (const mode of value.auth_modes as Record<string, unknown>[]) {
      if (mode.value === 'API_KEY') mode.label = 'API 密钥'
    }
  }
  Object.values(value).forEach((item) => localizeModelAccessResponse(item, language))
  return data
}
