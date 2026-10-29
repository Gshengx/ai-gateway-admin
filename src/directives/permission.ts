import {
  shallowRef,
  watchEffect,
  type Directive,
  type DirectiveBinding,
  type ShallowRef,
} from 'vue'

import { canWriteResource, hasPermission, useUserStore } from '@/stores/modules/user'

type PermissionValue = string | string[]

const states = new WeakMap<
  HTMLElement,
  { binding: ShallowRef<DirectiveBinding<PermissionValue>>; stop: () => void }
>()

/**
 * Reactive action permissions: v-permission="'identity.users:write'"
 * or v-permission.write="'identity.users'". Arrays match any permission.
 * Hidden elements retain their original display for permission restoration.
 */
export const permissionDirective: Directive<HTMLElement, PermissionValue> = {
  beforeMount(el, binding) {
    const userStore = useUserStore()
    const currentBinding = shallowRef(binding)
    const display = el.style.display
    const stop = watchEffect(() => {
      const { value, modifiers } = currentBinding.value
      const codes = Array.isArray(value) ? value : [value]
      const allowed = modifiers.write
        ? codes.some((code) => canWriteResource(userStore.permissions, code))
        : hasPermission(userStore.permissions, value)
      el.style.display = allowed ? display : 'none'
    })
    states.set(el, { binding: currentBinding, stop })
  },
  updated(el, binding) {
    const state = states.get(el)
    if (state) state.binding.value = binding
  },
  beforeUnmount(el) {
    states.get(el)?.stop()
    states.delete(el)
  },
}
