import request, { type RequestConfig } from '@/api/request'
import type * as DTO from './modelAccessContract'

export const modelAccessApi = {
  P01: (config?: RequestConfig) =>
    request.get<DTO.TemplateList>(`/model-access/provider-templates`, {
      skipLocale: true,
      ...config,
    }),
  P02: (config?: RequestConfig) =>
    request.get<DTO.ProviderPage>(`/model-access/providers`, { skipLocale: true, ...config }),
  P03: (body: DTO.ProviderCreate, config?: RequestConfig) =>
    request.post<DTO.Provider>(`/model-access/providers`, body, config),
  P04: (provider_id: string, config?: RequestConfig) =>
    request.get<DTO.Provider>(`/model-access/providers/${encodeURIComponent(provider_id)}`, {
      skipLocale: true,
      ...config,
    }),
  P05: (provider_id: string, body: DTO.ProviderUpdate, config?: RequestConfig) =>
    request.put<DTO.Provider>(
      `/model-access/providers/${encodeURIComponent(provider_id)}`,
      body,
      config,
    ),
  P06: (provider_id: string, config?: RequestConfig) =>
    request.delete<DTO.Deleted>(
      `/model-access/providers/${encodeURIComponent(provider_id)}`,
      config,
    ),
  D01: (provider_id: string, body: DTO.DiscoveryInput, config?: RequestConfig) =>
    request.post<DTO.Discovery>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/models/discover`,
      body,
      config,
    ),
  D02: (provider_id: string, body: DTO.ImportInput, config?: RequestConfig) =>
    request.post<DTO.ImportBatchResult>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/models/import`,
      body,
      config,
    ),
  D03: (provider_id: string, body: DTO.ProviderAdmissionInput, config?: RequestConfig) =>
    request.post<DTO.BatchResult>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/models/admission-tests`,
      body,
      config,
    ),
  D04: (provider_id: string, body: DTO.PublishInput, config?: RequestConfig) =>
    request.post<DTO.BatchResult>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/models/publish`,
      body,
      config,
    ),
  D05: (provider_id: string, discovery_id: string, config?: RequestConfig) =>
    request.get<DTO.Discovery>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/model-discoveries/${encodeURIComponent(discovery_id)}`,
      { skipLocale: true, ...config },
    ),
  M01: (config?: RequestConfig) =>
    request.get<DTO.ModelPage>(`/model-access/models`, { skipLocale: true, ...config }),
  M02: (config?: RequestConfig) =>
    request.get<DTO.Summary>(`/model-access/models/summary`, { skipLocale: true, ...config }),
  M03: (body: DTO.ModelCreate, config?: RequestConfig) =>
    request.post<DTO.Model>(`/model-access/models`, body, config),
  M04: (model_id: string, config?: RequestConfig) =>
    request.get<DTO.Model>(`/model-access/models/${encodeURIComponent(model_id)}`, {
      skipLocale: true,
      ...config,
    }),
  M05: (model_id: string, body: DTO.ModelUpdate, config?: RequestConfig) =>
    request.put<DTO.Model>(`/model-access/models/${encodeURIComponent(model_id)}`, body, config),
  M06: (model_id: string, config?: RequestConfig) =>
    request.delete<DTO.Deleted>(`/model-access/models/${encodeURIComponent(model_id)}`, config),
  M07: (model_id: string, body: DTO.StatusCommand, config?: RequestConfig) =>
    request.put<DTO.Model>(
      `/model-access/models/${encodeURIComponent(model_id)}/status`,
      body,
      config,
    ),
  M08: (config?: RequestConfig) =>
    request.get<DTO.ModelTemplatePage>(`/model-access/models/templates`, {
      skipLocale: true,
      ...config,
    }),
  M09: (config?: RequestConfig) =>
    request.get<DTO.ProviderOptionPage>(`/model-access/model-options/providers`, {
      skipLocale: true,
      ...config,
    }),
  M10: (config?: RequestConfig) =>
    request.get<DTO.TagOptionPage>(`/model-access/model-options/tags`, {
      skipLocale: true,
      ...config,
    }),
  M11: (model_id: string, config?: RequestConfig) =>
    request.get<DTO.LifecycleEventPage>(
      `/model-access/models/${encodeURIComponent(model_id)}/lifecycle-events`,
      { skipLocale: true, ...config },
    ),
  M12: (config?: RequestConfig) =>
    request.get<DTO.ModelIdAvailability>(`/model-access/model-options/model-id-availability`, {
      skipLocale: true,
      ...config,
    }),
  M13: (config?: RequestConfig) =>
    request.get<DTO.PricingPreparation>(`/model-access/model-options/pricing-preparation`, {
      skipLocale: true,
      ...config,
    }),
  M14: (config?: RequestConfig) =>
    request.get<DTO.DefaultPricingPreparation>('/model-access/model-options/default-pricing', {
      skipLocale: true,
      ...config,
    }),
  C01: (model_id: string, body: DTO.CheckInput, config?: RequestConfig) =>
    request.post<DTO.CheckJob>(
      `/model-access/models/${encodeURIComponent(model_id)}/admission-tests`,
      body,
      config,
    ),
  C02: (model_id: string, config?: RequestConfig) =>
    request.get<DTO.CheckJobPage>(
      `/model-access/models/${encodeURIComponent(model_id)}/admission-tests`,
      { skipLocale: true, ...config },
    ),
  C03: (model_id: string, test_id: string, config?: RequestConfig) =>
    request.get<DTO.CheckJob>(
      `/model-access/models/${encodeURIComponent(model_id)}/admission-tests/${encodeURIComponent(test_id)}`,
      { skipLocale: true, ...config },
    ),
  C04: (model_id: string, config?: RequestConfig) =>
    request.get<DTO.CheckJob | null>(
      `/model-access/models/${encodeURIComponent(model_id)}/admission-tests/latest`,
      { skipLocale: true, ...config },
    ),
  H01: (model_id: string, body: DTO.HealthCheckInput, config?: RequestConfig) =>
    request.post<DTO.CheckJob>(
      `/model-access/models/${encodeURIComponent(model_id)}/health-checks`,
      body,
      config,
    ),
  H02: (model_id: string, config?: RequestConfig) =>
    request.get<DTO.CheckJobPage>(
      `/model-access/models/${encodeURIComponent(model_id)}/health-checks`,
      { skipLocale: true, ...config },
    ),
  H03: (model_id: string, config?: RequestConfig) =>
    request.get<DTO.CheckJob | null>(
      `/model-access/models/${encodeURIComponent(model_id)}/health-checks/latest`,
      { skipLocale: true, ...config },
    ),
  H04: (model_id: string, body: DTO.HealthConfigUpdate, config?: RequestConfig) =>
    request.put<DTO.Model>(
      `/model-access/models/${encodeURIComponent(model_id)}/health-config`,
      body,
      config,
    ),
  H05: (model_id: string, test_id: string, config?: RequestConfig) =>
    request.get<DTO.CheckJob>(
      `/model-access/models/${encodeURIComponent(model_id)}/health-checks/${encodeURIComponent(test_id)}`,
      { skipLocale: true, ...config },
    ),
  // Omit page/page_size to read a complete grant set; supplying both retains offset pagination.
  A01: (model_id: string, config?: RequestConfig) =>
    request.get<DTO.GrantPage>(`/model-access/models/${encodeURIComponent(model_id)}/permissions`, {
      skipLocale: true,
      ...config,
    }),
  A02: (model_id: string, body: DTO.GrantDelta, config?: RequestConfig) =>
    request.put<DTO.GrantResult>(
      `/model-access/models/${encodeURIComponent(model_id)}/permissions`,
      body,
      config,
    ),
  A03: (body: DTO.BatchGrantInput, config?: RequestConfig) =>
    request.post<DTO.BatchGrantResult>(`/model-access/models/permissions/batch`, body, config),
  A04: (user_id: string, config?: RequestConfig) =>
    request.get<DTO.AccessibleModelPage>(
      `/model-access/users/${encodeURIComponent(user_id)}/accessible-models`,
      { skipLocale: true, ...config },
    ),
  A05: (user_id: string, config?: RequestConfig) =>
    request.get<DTO.SubjectGrantPage>(
      `/model-access/users/${encodeURIComponent(user_id)}/model-grants`,
      { skipLocale: true, ...config },
    ),
  A06: (user_id: string, body: DTO.SubjectGrantReplace, config?: RequestConfig) =>
    request.put<DTO.SubjectGrantResult>(
      `/model-access/users/${encodeURIComponent(user_id)}/model-grants`,
      body,
      config,
    ),
  A07: (department_id: string, config?: RequestConfig) =>
    request.get<DTO.SubjectGrantPage>(
      `/model-access/departments/${encodeURIComponent(department_id)}/model-grants`,
      { skipLocale: true, ...config },
    ),
  A08: (department_id: string, body: DTO.SubjectGrantReplace, config?: RequestConfig) =>
    request.put<DTO.SubjectGrantResult>(
      `/model-access/departments/${encodeURIComponent(department_id)}/model-grants`,
      body,
      config,
    ),
  A09: (group_id: string, config?: RequestConfig) =>
    request.get<DTO.SubjectGrantPage>(
      `/model-access/groups/${encodeURIComponent(group_id)}/model-grants`,
      { skipLocale: true, ...config },
    ),
  A10: (group_id: string, body: DTO.SubjectGrantReplace, config?: RequestConfig) =>
    request.put<DTO.SubjectGrantResult>(
      `/model-access/groups/${encodeURIComponent(group_id)}/model-grants`,
      body,
      config,
    ),
  A11: (user_id: string, config?: RequestConfig) =>
    request.get<DTO.AccessibleModelPage>(
      `/model-access/users/${encodeURIComponent(user_id)}/model-grant-sources`,
      { skipLocale: true, ...config },
    ),
  A12: (config?: RequestConfig) =>
    request.get<DTO.SubjectViewPage>(`/model-access/model-permission-subjects`, {
      skipLocale: true,
      ...config,
    }),
  A13: (config?: RequestConfig) =>
    request.get<DTO.ModelAuthorizationSummaryPage>(`/model-access/model-permission-models`, {
      skipLocale: true,
      ...config,
    }),
  R01: (model_id: string, config?: RequestConfig) =>
    request.get<DTO.PricingVersionPage>(
      `/model-access/models/${encodeURIComponent(model_id)}/pricing`,
      { skipLocale: true, ...config },
    ),
  R02: (model_id: string, body: DTO.PricingInput, config?: RequestConfig) =>
    request.post<DTO.PricingVersion>(
      `/model-access/models/${encodeURIComponent(model_id)}/pricing`,
      body,
      config,
    ),
  R03: (model_id: string, config?: RequestConfig) =>
    request.get<DTO.CurrentPricing>(
      `/model-access/models/${encodeURIComponent(model_id)}/pricing/current`,
      { skipLocale: true, ...config },
    ),
  B01: (provider_id: string, config?: RequestConfig) =>
    request.get<DTO.BalanceConfig>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/balance-config`,
      { skipLocale: true, ...config },
    ),
  B02: (provider_id: string, body: DTO.BalanceConfigUpdate, config?: RequestConfig) =>
    request.put<DTO.BalanceConfig>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/balance-config`,
      body,
      config,
    ),
  B03: (provider_id: string, body: Record<string, never>, config?: RequestConfig) =>
    request.post<DTO.BalanceQueryReceipt>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/balance-query`,
      body,
      config,
    ),
  B04: (provider_id: string, config?: RequestConfig) =>
    request.get<DTO.BalanceState>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/balance`,
      { skipLocale: true, ...config },
    ),
  B05: (provider_id: string, run_id: string, config?: RequestConfig) =>
    request.get<DTO.BalanceRun>(
      `/model-access/providers/${encodeURIComponent(provider_id)}/balance-queries/${encodeURIComponent(run_id)}`,
      { skipLocale: true, ...config },
    ),
  B06: (config?: RequestConfig) =>
    request.get<DTO.BalanceRecipientOptionPage>(`/model-access/balance-recipient-options`, {
      skipLocale: true,
      ...config,
    }),
}
