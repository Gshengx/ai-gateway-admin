import { computed, onScopeDispose, watch } from 'vue'
import { useUserStore } from '@/stores/modules/user'

/** A revoked operation cannot resume its old draft or dispatch a delayed command. */
export function usePermissionScope(
  resource: string,
  onRevoked: () => void,
  options: { allowRead?: boolean } = {},
) {
  const user = useUserStore()
  const controller = new AbortController()
  const permitted = computed(
    () =>
      user.permissionSnapshot?.capabilities.some(
        (capability) =>
          capability.resource_code === resource &&
          (options.allowRead ? capability.can_read : capability.can_write),
      ) ?? false,
  )
  const canWrite = computed(
    () =>
      user.permissionsReady &&
      !controller.signal.aborted &&
      permitted.value &&
      (user.permissionSnapshot?.capabilities.some(
        (capability) => capability.resource_code === resource && capability.can_write,
      ) ??
        false),
  )
  watch(
    permitted,
    (allowed) => {
      if (!allowed) {
        controller.abort()
        onRevoked()
      }
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => controller.abort())
  return { canWrite, signal: controller.signal }
}
