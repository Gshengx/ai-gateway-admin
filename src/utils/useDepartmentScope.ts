import { watch } from 'vue'
import { useUserStore } from '@/stores/modules/user'

/** Reset department views when the session or authorization scope changes. */
export function useDepartmentScope(reset: () => void) {
  const user = useUserStore()
  watch(() => [user.permissionEpoch, user.context.session?.user_id], reset, { flush: 'sync' })
}
