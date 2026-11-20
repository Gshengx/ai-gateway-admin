import {
  getUserGroupMemberDepartmentOptionsApi,
  type DepartmentQuery,
} from '@/api/modules/identity'

export function useMemberDepartments() {
  return async function loadMemberDepartments(params: DepartmentQuery) {
    const { items } = await getUserGroupMemberDepartmentOptionsApi({
      mode: 'CHILDREN',
      ...(params.parent_id ? { parent_id: params.parent_id } : {}),
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    })
    return { items: items.map((item) => ({ ...item, name: item.display_name })) }
  }
}
