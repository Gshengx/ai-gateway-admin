import type { Model } from '../api/modules/modelAccess'

export const invocationApis = [
  'CHAT_COMPLETIONS',
  'RESPONSES',
  'MESSAGES',
  'GENERATE_CONTENT',
  'CONVERSE',
  'EMBEDDINGS',
  'IMAGE_GENERATIONS',
  'AUDIO',
  'VIDEO',
]

export function validInvocationPath(path: string) {
  return /^\/(?!\/)[^\s?#\\]*$/.test(path) && !path.includes('://')
}

/** Both flows submit one ordered configuration with unique standard protocols and custom paths. */
export function invocationConfigurationError(
  model: Pick<Model, 'supported_invocation_apis' | 'custom_invocation_apis'>,
): 'required' | 'path' | null {
  if (!model.custom_invocation_apis.length) return 'required'
  const standards = model.custom_invocation_apis.filter(
    (a) => a.invocation_api !== 'CUSTOM_PASSTHROUGH',
  )
  const passthrough = model.custom_invocation_apis.filter(
    (a) => a.invocation_api === 'CUSTOM_PASSTHROUGH',
  )
  if (
    model.custom_invocation_apis.length > 32 ||
    new Set(standards.map((a) => a.invocation_api)).size !== standards.length ||
    new Set(passthrough.map((a) => a.path)).size !== passthrough.length
  )
    return 'path'
  if (
    model.custom_invocation_apis.some(
      (api) => !api.invocation_api || !validInvocationPath(api.path),
    )
  )
    return 'path'
  return null
}

export function invocationTargets(
  model: Pick<Model, 'supported_invocation_apis' | 'custom_invocation_apis'>,
) {
  return model.custom_invocation_apis
}
