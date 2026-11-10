<template>
  <t-dialog
    :visible="visible"
    width="640px"
    :header="title"
    :close-btn="true"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false"
    :confirm-btn="null"
    :cancel-btn="{ content: t('terms.notice.closePreview') }"
    @cancel="close"
    @close="close"
  >
    <LoadingState :loading="loading">
      <t-alert v-if="warning" theme="warning" :message="warning" />
      <t-radio-group
        v-model="previewLocale"
        class="terms-locale"
        size="small"
        variant="default-filled"
      >
        <t-radio-button value="zh">{{ t('terms.notice.localeZh') }}</t-radio-button>
        <t-radio-button value="en">{{ t('terms.notice.localeEn') }}</t-radio-button>
      </t-radio-group>
      <div class="terms-content" v-html="content" />
      <t-checkbox class="terms-check">{{ t('terms.gate.checkbox') }}</t-checkbox>
    </LoadingState>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingState from '@/components/LoadingState.vue'
import {
  previewTermsApi,
  type TermsTranslation,
  type TermsTranslationDetail,
} from '@/api/modules/terms'

const props = defineProps<{
  visible: boolean
  translations: TermsTranslation[]
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()
const { t, locale } = useI18n()
const previewTranslations = ref<TermsTranslationDetail[]>([])
const failed = ref(false)
const loading = ref(false)
const previewLocale = ref<'zh' | 'en'>(locale.value.startsWith('en') ? 'en' : 'zh')
const local = computed(() =>
  props.translations.find((item) => item.locale_code.startsWith(previewLocale.value)),
)
const preview = computed(() =>
  previewTranslations.value.find((item) => item.locale_code.startsWith(previewLocale.value)),
)
const title = computed(
  () => preview.value?.title?.trim() || local.value?.title?.trim() || t('terms.notice.preview'),
)
const content = computed(() => preview.value?.body ?? local.value?.body ?? '')
const complete = computed(
  () =>
    ['zh', 'en'].every((language) =>
      props.translations.some((item) => item.locale_code.startsWith(language)),
    ) && props.translations.every((item) => item.title.trim() && item.body.trim()),
)
const warning = computed(() =>
  !complete.value
    ? t('terms.notice.previewIncomplete')
    : failed.value
      ? t('terms.notice.previewFailed')
      : '',
)
watch(
  [() => props.visible, () => props.translations],
  async ([visible], _, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    if (visible) previewLocale.value = locale.value.startsWith('en') ? 'en' : 'zh'
    previewTranslations.value = []
    failed.value = false
    loading.value = visible && complete.value
    if (!visible || !complete.value) return
    try {
      const result = await previewTermsApi({ translations: props.translations })
      if (active && props.visible) previewTranslations.value = result.translations
    } catch {
      if (active && props.visible) failed.value = true
    } finally {
      if (active) loading.value = false
    }
  },
  { immediate: true },
)
const close = () => emit('update:visible', false)
</script>
<style scoped src="@/styles/terms-dialog.css"></style>
<style scoped>
.terms-locale {
  margin: var(--td-comp-margin-m) 0 var(--td-comp-margin-l);
}
</style>
