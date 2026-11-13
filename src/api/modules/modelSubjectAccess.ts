import { modelAccessApi as api } from './modelAccessApi'
import type { SubjectGrantPage } from './modelAccessContract'
import type { OffsetPageQuery } from '@/api/types'
import type { RequestConfig } from '@/api/request'

const versions = new Map<string, number>()
const pagination = <T extends { total: number; page_size: number }>(p: T) => ({
  ...p,
  total_pages: Math.ceil(p.total / p.page_size),
})
export async function subjectGrants(
  kind: 'USER' | 'DEPARTMENT' | 'USER_GROUP',
  id: string,
  params: OffsetPageQuery,
  config: RequestConfig = {},
) {
  const read = kind === 'USER' ? api.A05 : kind === 'DEPARTMENT' ? api.A07 : api.A09
  const result = await read(id, { ...config, params })
  if ((params.page ?? 1) > 1 && versions.get(`${kind}:${id}`) !== result.authorization_version)
    throw new Error('VERSION_CONFLICT')
  versions.set(`${kind}:${id}`, result.authorization_version)
  return {
    ...pagination(result),
  }
}
export async function replaceSubjectGrants(
  kind: 'USER' | 'DEPARTMENT' | 'USER_GROUP',
  id: string,
  physical_model_ids: string[],
  reason?: string,
) {
  const version = versions.get(`${kind}:${id}`)
  if (version === undefined) throw new Error('Authorization set must be read before saving')
  const write = kind === 'USER' ? api.A06 : kind === 'DEPARTMENT' ? api.A08 : api.A10
  const result = await write(id, {
    expected_authorization_version: version,
    physical_model_ids,
    ...(reason ? { reason } : {}),
  })
  versions.set(`${kind}:${id}`, result.authorization_version)
  return result
}
export async function modelSources(id: string, params: OffsetPageQuery) {
  return pagination(await api.A11(id, { params }))
}
export async function modelOptions(
  params: OffsetPageQuery & { search?: string; subject_type?: string; subject_id?: string },
) {
  const { search, ...rest } = params
  const result = await api.A13({ params: { ...rest, q: search } })
  return { ...pagination(result), items: result.items }
}

export async function subjectGrantSet(
  kind: 'USER' | 'DEPARTMENT' | 'USER_GROUP',
  id: string,
): Promise<SubjectGrantPage> {
  const read = kind === 'USER' ? api.A05 : kind === 'DEPARTMENT' ? api.A07 : api.A09
  const first = await read(id, { params: { page: 1, page_size: 100 } })
  const items = [...first.items]
  for (let page = 2; page <= Math.ceil(first.total / first.page_size); page++) {
    const next = await read(id, { params: { page, page_size: 100 } })
    if (next.authorization_version !== first.authorization_version)
      throw new Error('VERSION_CONFLICT')
    items.push(...next.items)
  }
  versions.set(`${kind}:${id}`, first.authorization_version)
  return { ...first, items }
}
