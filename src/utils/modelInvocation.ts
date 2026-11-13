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

/** Standard APIs and custom paths are alternatives; every supplied path must be valid. */
export function invocationConfigurationError(
  model: Pick<Model, 'supported_invocation_apis' | 'custom_invocation_apis'>,
): 'required' | 'path' | null {
  if (model.custom_invocation_apis.some((api) => !validInvocationPath(api.path))) return 'path'
  if (!model.supported_invocation_apis.length && !model.custom_invocation_apis.length)
    return 'required'
  return null
}

export function invocationTargets(
  model: Pick<Model, 'supported_invocation_apis' | 'custom_invocation_apis'>,
) {
  return [
    ...model.supported_invocation_apis.map((invocation_api) => ({ invocation_api, path: '' })),
    ...model.custom_invocation_apis,
  ]
}
