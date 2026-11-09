<template>
  <div class="invocation-editor ma-stack">
    <t-form-item :label="t('ma.supportedApis')" required-mark>
      <div class="invocation-editor__standard ma-stack">
        <t-select v-model="standard" multiple filterable :disabled="disabled" :options="options" />
        <p class="ma-muted">{{ t('ma.supportedApisHelp') }}</p>
      </div>
    </t-form-item>
    <t-form-item :label="t('ma.customPath')">
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
import { validInvocationPath } from '@/utils/modelInvocation'
defineProps<{ disabled?: boolean }>()
const standard = defineModel<string[]>('standard', { required: true })
const custom = defineModel<CustomInvocationApi[]>('custom', { required: true })
const { t } = useI18n()
const options = invocationApis.map((value) => ({ value, label: invocationLabel(value) }))
const path = computed({
  get: () => custom.value[0]?.path ?? '',
  set: (value: string) => {
    custom.value = value
      ? [{ invocation_api: custom.value[0]?.invocation_api ?? '', path: value }]
      : []
  },
})
const pathError = computed(() => !!path.value && !validInvocationPath(path.value))
</script>
<style scoped src="./access.css"></style>
