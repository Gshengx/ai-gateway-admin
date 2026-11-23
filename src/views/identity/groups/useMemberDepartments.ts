import { inject, provide, type InjectionKey } from 'vue'
import {
  getUserGroupMemberDepartmentOptionsApi,
  type DepartmentQuery,
  type UserGroupMemberDepartmentOption,
  type UserGroupMemberDepartmentOptionsQuery,
} from '@/api/modules/identity'

type MemberDepartmentLoader = (
  params: DepartmentQuery,
) => Promise<{ items: (UserGroupMemberDepartmentOption & { name: string })[] }>
const memberDepartmentLoaderKey: InjectionKey<MemberDepartmentLoader> = Symbol('memberDepartments')

export function useMemberDepartments() {
  const inherited = inject(memberDepartmentLoaderKey, null)
  if (inherited) return inherited
  const loadMemberDepartments: MemberDepartmentLoader = async (params) => {
    const search = params.search?.trim()
    const query: UserGroupMemberDepartmentOptionsQuery = search
      ? { mode: 'FULL', search }
      : { mode: 'CHILDREN', ...(params.parent_id ? { parent_id: params.parent_id } : {}) }
    const { items } = await getUserGroupMemberDepartmentOptionsApi(query)
    return { items: items.map((item) => ({ ...item, name: item.display_name })) }
  }
  provide(memberDepartmentLoaderKey, loadMemberDepartments)
  return loadMemberDepartments
}
