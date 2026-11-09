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

export function invocationTargets(
  model: Pick<Model, 'supported_invocation_apis' | 'custom_invocation_apis'>,
) {
  return [
    ...model.supported_invocation_apis.map((invocation_api) => ({ invocation_api, path: '' })),
    ...model.custom_invocation_apis,
  ]
}
