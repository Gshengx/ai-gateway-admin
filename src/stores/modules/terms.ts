import { defineStore } from 'pinia'
import { useUserStore } from './user'
import { acceptTermsApi, getRequiredTermsApi, type TermsStatus } from '@/api/modules/terms'
import type { NotifiedError } from '@/api/request'

export const useTermsStore = defineStore('terms', {
  state: () => ({
    status: null as TermsStatus | null,
    loaded: false,
    accepting: false,
    visible: false,
  }),
  getters: {
    requireConfirmation: () => useUserStore().context.session?.gate === 'NEEDS_TERMS',
    accepted: (state) => state.status?.accepted === true,
    blocking(): boolean {
      return this.requireConfirmation
    },
  },
  actions: {
    async loadStatus() {
      this.loaded = false
      this.status = null
      this.status = await getRequiredTermsApi()
      this.loaded = true
      this.visible =
        this.requireConfirmation || (this.status.login_popup_enabled && !this.status.accepted)
    },
    async accept() {
      if (!this.status || this.accepting) return
      this.accepting = true
      try {
        await acceptTermsApi({
          terms_id: this.status.terms_id,
          locale_code: this.status.resolved_locale,
          content_digest: this.status.content_digest,
        })
        await useUserStore().refreshContext()
        await this.loadStatus()
      } catch (error) {
        const err = error as NotifiedError
        if (err.code === 'TERMS_VERSION_CHANGED' || !err.status) {
          await useUserStore().refreshContext()
          await this.loadStatus()
        }
        throw error
      } finally {
        this.accepting = false
      }
    },
    skip() {
      if (!this.requireConfirmation) this.visible = false
    },
    reset() {
      this.$reset()
    },
  },
})
