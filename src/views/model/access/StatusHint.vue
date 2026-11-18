<template>
  <div ref="root" class="status-hint" :class="{ 'status-hint--expanded': expanded }">
    <span ref="measurement" class="status-hint__measurement" aria-hidden="true">{{ text }}</span>
    <span class="status-hint__text">{{ text }}</span>
    <button
      v-if="truncated"
      type="button"
      class="status-hint__toggle"
      :aria-label="t(expanded ? 'ma.collapseStatusHint' : 'ma.fullStatusHint')"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
      @keydown.esc="expanded = false"
    >
      <t-icon :name="expanded ? 'caret-up-small' : 'caret-down-small'" aria-hidden="true" />
    </button>
  </div>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ text: string }>()
const { t } = useI18n()
const root = ref<HTMLElement>()
const measurement = ref<HTMLElement>()
const truncated = ref(false)
const expanded = ref(false)
let observer: ResizeObserver | undefined

function measure() {
  // Measure a hidden single line so expanding the visible text never removes its collapse control.
  truncated.value =
    !!root.value && !!measurement.value && measurement.value.scrollWidth > root.value.clientWidth
  if (!truncated.value) expanded.value = false
}
watch(
  () => props.text,
  async () => {
    expanded.value = false
    await nextTick()
    measure()
  },
)
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (root.value) observer.observe(root.value)
  measure()
  void document.fonts.ready.then(measure)
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<style scoped>
.status-hint {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-xs);
  width: 100%;
  min-width: 0;
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
  line-height: var(--td-line-height-body-small);
}
.status-hint__measurement {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  white-space: nowrap;
  pointer-events: none;
}
.status-hint__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-hint__toggle {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  vertical-align: middle;
  cursor: pointer;
}
.status-hint__toggle:hover {
  color: var(--td-brand-color-hover);
}
.status-hint__toggle:focus-visible {
  outline: var(--td-size-1) solid var(--td-brand-color);
  outline-offset: var(--td-size-1);
  border-radius: var(--td-radius-small);
}
.status-hint--expanded {
  display: block;
}
.status-hint--expanded .status-hint__text {
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
}
.status-hint--expanded .status-hint__toggle {
  margin-inline-start: var(--td-comp-margin-xs);
}
</style>
