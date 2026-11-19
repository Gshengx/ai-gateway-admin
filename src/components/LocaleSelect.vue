<template>
  <t-select
    :value="current"
    :options="options"
    :disabled="!options?.length"
    size="small"
    class="locale-select"
    :aria-label="t('header.language')"
    @change="onChange"
  />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { SelectProps } from 'tdesign-vue-next'

import {
  getApiLocale,
  setApiLocale,
  normalizeLocale,
  setDocumentTitle,
  setLocale,
  translateRouteTitle,
} from '@/locales'

import { useLocaleOptionsStore } from '@/stores/modules/localeOptions'

const localeOptions = useLocaleOptionsStore()
const route = useRoute()
const { t } = useI18n()

const current = computed(() => getApiLocale())
const options = computed<SelectProps['options']>(() =>
  localeOptions.options.map(({ label, value }) => ({ label, value })),
)

function onChange(value: unknown) {
  const code = String(value ?? '')
  if (code === current.value || !localeOptions.options.some((item) => item.value === code)) return
  setLocale(normalizeLocale(code))
  setApiLocale(code)
  setDocumentTitle(translateRouteTitle(route.meta.title))
}
onMounted(async () => {
  if (localeOptions.attempted) return
  try {
    await localeOptions.load()
  } catch {
    // A failed public directory request is reported by the request layer.
  }
})
</script>

<style scoped>
.locale-select {
  width: 120px;
}
</style>
