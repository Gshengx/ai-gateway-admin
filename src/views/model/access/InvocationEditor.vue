<template>
  <div class="invocation-editor ma-stack">
    <t-form-item
      :label="t('ma.supportedApis')"
      :status="requiredError ? 'error' : undefined"
      :tips="requiredError"
      :required-mark="!custom.length"
    >
      <div class="invocation-editor__standard ma-stack">
        <t-select v-model="standard" multiple filterable :disabled="disabled">
          <t-option
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          >
            <div class="invocation-option">
              <span>{{ option.label }}</span
              ><span class="ma-muted">{{ option.description }}</span>
            </div>
          </t-option>
        </t-select>
        <p v-if="!hideHelp" class="ma-muted">{{ t('ma.supportedApisHelp') }}</p>
      </div>
    </t-form-item>
    <t-form-item :label="t('ma.customPath')" :required-mark="!standard.length">
      <t-input
        v-model="path"
        :disabled="disabled"
        :placeholder="t('ma.customPathHint')"
        :status="pathError ? 'error' : undefined"
        :tips="pathError ? t('ma.invalidApiPath') : ''"
      />
    </t-form-item>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { invocationApis, type CustomInvocationApi } from '@/api/modules/modelAccess'
import { invocationLabel } from './helpers'
import { invocationConfigurationError } from '@/utils/modelInvocation'
const props = defineProps<{
  disabled?: boolean
  hideHelp?: boolean
  validateRequired?: boolean
}>()
const standard = defineModel<string[]>('standard', { required: true })
const custom = defineModel<CustomInvocationApi[]>('custom', { required: true })
const { t } = useI18n()
const configurationError = computed(() =>
  invocationConfigurationError({
    supported_invocation_apis: standard.value,
    custom_invocation_apis: custom.value,
  }),
)
const requiredError = computed(() =>
  props.validateRequired && configurationError.value === 'required'
    ? t('ma.invocationRequired')
    : '',
)
// Temporary display-only descriptions approved by the user; excluded from requests.
const descriptions: Record<string, string> = {
  CHAT_COMPLETIONS: '/chat/completions',
  RESPONSES: '/responses',
  MESSAGES: '/messages',
  GENERATE_CONTENT: '/models/{model}:generateContent',
  CONVERSE: '/model/{modelId}/converse',
  EMBEDDINGS: '/embeddings',
  IMAGE_GENERATIONS: '/images/generations · /images/edits',
  AUDIO: '/audio/speech · /audio/transcriptions',
  VIDEO: '/videos',
}
const options = invocationApis.map((value) => ({
  value,
  label: invocationLabel(value),
  description: descriptions[value] ?? '',
}))
const path = computed({
  get: () => custom.value[0]?.path ?? '',
  set: (value: string) => {
    custom.value = value
      ? [{ invocation_api: custom.value[0]?.invocation_api ?? '', path: value }]
      : []
  },
})
const pathError = computed(() => configurationError.value === 'path')
</script>
<style scoped src="./access.css"></style>
