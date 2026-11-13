import { routeRegistry } from './routes'
import { usePermissionStore } from '@/stores/modules/permission'
import { pinia } from '@/stores'

const pending = new Map<string, Promise<unknown>>()

/** Start the authorized page import on menu intent, before navigation needs it. */
export function prefetchRoute(routeId?: string) {
  if (
    !routeId ||
    !usePermissionStore(pinia).routes.some((route) => route.meta?.routeId === routeId)
  )
    return
  const loader = routeRegistry[routeId]?.component
  if (typeof loader !== 'function' || pending.has(routeId)) return
  const request = Promise.resolve().then(() => (loader as () => Promise<unknown>)())
  pending.set(routeId, request)
  void request.catch(() => {
    // A later hover or navigation can retry a transient download failure.
    if (pending.get(routeId) === request) pending.delete(routeId)
  })
}
