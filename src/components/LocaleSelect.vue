<template>
  <t-select
    :value="current"
    :options="options"
    size="small"
    class="locale-select"
    :aria-label="t('header.language')"
    @change="onChange"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { SelectProps } from 'tdesign-vue-next'

import {
  getCurrentLocale,
  normalizeLocale,
  setDocumentTitle,
  setLocale,
  translateRouteTitle,
  SUPPORTED_LOCALES,
} from '@/locales'

const route = useRoute()
const { t } = useI18n()

const current = computed(() => getCurrentLocale())
const options = computed<SelectProps['options']>(() =>
  SUPPORTED_LOCALES.map((item) => ({ label: item.label, value: item.value })),
)

function onChange(value: unknown) {
  const locale = normalizeLocale(String(value ?? ''))
  if (locale === current.value) return
  setLocale(locale)
  setDocumentTitle(translateRouteTitle(route.meta.title))
}
</script>

<style scoped>
.locale-select {
  width: 120px;
}
</style>
