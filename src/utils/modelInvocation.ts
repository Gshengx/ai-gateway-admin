import type { CustomInvocationApi, Model } from '../api/modules/modelAccess'

/** Match saved identities before treating protocol changes as replacement rows. */
export function resolveInvocationApiIds(
  current: CustomInvocationApi[],
  original: CustomInvocationApi[],
): CustomInvocationApi[] {
  const usedIds = new Set<string>()
  const ids = current.map((row) => {
    const match = original.find(
      (saved) =>
        saved.id &&
        !usedIds.has(saved.id) &&
        saved.invocation_api === row.invocation_api &&
        saved.path === row.path,
    )
    if (match?.id) usedIds.add(match.id)
    return match?.id
  })
  return current.map((row, index) => {
    let id = ids[index]
    if (!id && row.id && !usedIds.has(row.id)) {
      const retained = original.find(
        (saved) => saved.id === row.id && saved.invocation_api === row.invocation_api,
      )
      if (retained?.id) {
        id = retained.id
        usedIds.add(id)
      }
    }
    return { ...(id ? { id } : {}), invocation_api: row.invocation_api, path: row.path }
  })
}

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
