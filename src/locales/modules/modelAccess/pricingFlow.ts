const pricingFlow = {
  noMetrics: [
    '当前模型暂无可用计费项，暂不计算费用，仅记录用量。',
    'No billable metrics are available for this model. Usage is recorded without calculating costs.',
  ],
  comparison: ['价格版本已变化，请核对', 'Pricing changed. Review before continuing'],
  comparisonHint: [
    '当前价已重新读取。保留草稿不会保存；确认采用草稿后，请再次点击保存。',
    'Current pricing has been reloaded. Keeping the draft does not save it. After accepting your draft, click Save again.',
  ],
  saved: ['当前已保存价格（版本 {version}）', 'Saved pricing (version {version})'],
  draft: ['待确认草稿', 'Draft to confirm'],
  keep: ['保留草稿', 'Keep draft'],
  useCurrent: ['使用当前价', 'Use current pricing'],
  useDraft: ['采用草稿并继续编辑', 'Accept draft and continue editing'],
  unpriced: ['待配置', 'Not configured'],
  refreshFailed: [
    '已保存，但价格回读失败，请重新打开详情重试。',
    'Saved, but pricing could not be reloaded. Reopen the details to retry.',
  ],
  official: ['官方原币参考', 'Official reference in original currency'],
  officialHint: [
    '仅供参考，不代表已换汇或已保存为内部价格。',
    'Reference only. No currency conversion or internal price save has occurred.',
  ],
}

export const pricingFlowMessages = {
  'zh-CN': {
    pricingFlow: Object.fromEntries(
      Object.entries(pricingFlow).map(([key, value]) => [key, value[0]]),
    ),
  },
  'en-US': {
    pricingFlow: Object.fromEntries(
      Object.entries(pricingFlow).map(([key, value]) => [key, value[1]]),
    ),
  },
}
