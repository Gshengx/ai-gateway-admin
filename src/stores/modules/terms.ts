import { defineStore } from 'pinia'
import { useUserStore } from './user'
import {
  acceptTermsApi,
  getRequiredTermsApi,
  type TermsStatus,
  type TermsConfig,
} from '@/api/modules/terms'
import type { NotifiedError } from '@/api/request'

type TermsConfiguration = Pick<TermsConfig, 'mandatory_confirmation' | 'login_popup_enabled'>

export const useTermsStore = defineStore('terms', {
  state: () => ({
    status: null as TermsStatus | null,
    configuration: null as TermsConfiguration | null,
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
    updateConfiguration(configuration: TermsConfiguration) {
      this.configuration = {
        mandatory_confirmation: configuration.mandatory_confirmation,
        login_popup_enabled: configuration.login_popup_enabled,
      }
    },
    async loadStatus() {
      this.loaded = false
      this.status = null
      this.status = await getRequiredTermsApi()
      // Seed this login's memory once; later config reads must not be overwritten by its snapshot.
      if (!this.configuration) this.updateConfiguration(this.status)
      this.loaded = true
      this.visible =
        this.requireConfirmation || (this.status.login_popup_enabled && !this.status.accepted)
    },
    async accept(afterAccept?: () => Promise<void>) {
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
        await afterAccept?.()
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
      if (!this.accepting && !this.requireConfirmation) this.visible = false
    },
    reset() {
      this.$reset()
    },
  },
})
