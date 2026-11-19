<template>
  <span ref="anchor" hidden aria-hidden="true" />
  <t-loading
    v-if="panel"
    :loading="loading"
    :attach="attach"
    show-overlay
    :delay="0"
    :text="t('common.loading')"
    role="status"
  />
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ loading: boolean }>()
const { t } = useI18n()
const anchor = ref<HTMLElement>()
const panel = shallowRef<HTMLElement>()
const attach = () => panel.value!

onMounted(() => {
  panel.value = anchor.value?.closest('.t-drawer__content-wrapper') ?? undefined
})

watch(
  [() => props.loading, panel],
  ([loading, target], _, onCleanup) => {
    if (!loading || !target) return
    // Lock this drawer only; keep inputs mounted and preserve their permission styling.
    const regions = [...target.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element.matches('.t-drawer__header, .t-drawer__body, .t-drawer__footer'),
    )
    const previous = regions.map((element) => ({ element, inert: element.inert }))
    regions.forEach((element) => (element.inert = true))
    onCleanup(() => previous.forEach(({ element, inert }) => (element.inert = inert)))
  },
  { flush: 'post' },
)
</script>
