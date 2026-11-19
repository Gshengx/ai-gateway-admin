import { ref } from 'vue'
import { getUserDetailApi } from '@/api/modules/identity'
import { userLabel, userDisplayName } from './userLabel'

/** Resolve only referenced, visible users; unavailable identities retain their original label. */
export function useUserLabels() {
  const names = ref<Record<string, string>>({})
  const usernames = ref<Record<string, string>>({})
  const pending = new Map<string, Promise<void>>()
  async function resolve(ids: string[]) {
    await Promise.all(
      [...new Set(ids.filter(Boolean))].map((id) => {
        if (usernames.value[id]) return
        let request = pending.get(id)
        if (!request) {
          request = getUserDetailApi(id, { skipErrorHandler: true })
            .then(({ user }) => {
              usernames.value[id] = user.username
              names.value[id] = user.display_name
            })
            .catch(() => {
              /* Original names remain visible when access is unavailable. */
            })
            .finally(() => {
              pending.delete(id)
            })
          pending.set(id, request)
        }
        return request
      }),
    )
  }
  return {
    resolve,
    displayName: (id: string, name?: string | null) =>
      userDisplayName(name || names.value[id], usernames.value[id]),
    label: (id: string, name?: string | null) => userLabel(name, usernames.value[id]),
  }
}
