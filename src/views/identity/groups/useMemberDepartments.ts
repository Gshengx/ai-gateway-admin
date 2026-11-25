import {
  getUserGroupExistingMemberDepartmentsApi,
  getUserGroupMemberDepartmentOptionsApi,
  type DepartmentQuery,
  type UserGroupMemberDepartmentOptionsQuery,
} from '@/api/modules/identity'

export function useMemberDepartments(groupId?: () => string | undefined) {
  return async (params: DepartmentQuery) => {
    const search = params.search?.trim()
    if (groupId) {
      const id = groupId()
      if (!id) return { items: [] }
      const { items } = await getUserGroupExistingMemberDepartmentsApi(id, { search })
      return { items: items.map((item) => ({ ...item, name: item.display_name })) }
    }
    const query: UserGroupMemberDepartmentOptionsQuery = search
      ? { mode: 'FULL', search }
      : { mode: 'CHILDREN', ...(params.parent_id ? { parent_id: params.parent_id } : {}) }
    const { items } = await getUserGroupMemberDepartmentOptionsApi(query)
    return { items: items.map((item) => ({ ...item, name: item.display_name })) }
  }
}
