<template>
  <div class="provider-tabs">
    <t-button
      v-if="overflow"
      theme="default"
      variant="text"
      :disabled="atStart"
      :aria-label="t('ma.previousProviders')"
      @click="shift(-1)"
      ><t-icon name="chevron-left"
    /></t-button>
    <div
      ref="strip"
      class="provider-tabs__strip"
      role="tablist"
      :aria-label="t('ma.provider')"
      @scroll="measure"
      @wheel.prevent="wheel"
    >
      <button
        v-for="item in tabs"
        :key="item.id"
        :ref="(el) => setTab(item.id, el)"
        type="button"
        role="tab"
        :aria-selected="modelValue === item.id"
        :class="['provider-tabs__tab', { 'is-active': modelValue === item.id }]"
        @click="select(item.id)"
      >
        <t-avatar
          v-if="item.icon"
          class="provider-tabs__icon"
          size="small"
          shape="round"
          aria-hidden="true"
          >{{ item.icon }}</t-avatar
        >
        <span class="provider-tabs__label"
          ><span class="provider-tabs__name">{{ item.name }}</span
          ><span class="provider-tabs__count">{{ item.count }}</span></span
        >
      </button>
    </div>
    <template v-if="overflow"
      ><t-button
        theme="default"
        variant="text"
        :disabled="atEnd"
        :aria-label="t('ma.nextProviders')"
        @click="shift(1)"
        ><t-icon name="chevron-right" /></t-button
      ><t-dropdown trigger="click"
        ><t-button theme="default" variant="text" :aria-label="t('ma.hiddenProviders')"
          ><t-icon name="chevron-down" /></t-button
        ><t-dropdown-menu
          ><t-dropdown-item v-for="item in hidden" :key="item.id" @click="select(item.id)"
            ><span class="provider-tabs__menu-item"
              ><t-avatar
                v-if="item.icon"
                class="provider-tabs__icon"
                size="small"
                shape="round"
                aria-hidden="true"
                >{{ item.icon }}</t-avatar
              ><span class="provider-tabs__label"
                >{{ item.name }}<span class="provider-tabs__count">{{ item.count }}</span></span
              ></span
            ></t-dropdown-item
          ></t-dropdown-menu
        ></t-dropdown
      ></template
    >
  </div>
</template>
<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
  type ComponentPublicInstance,
} from 'vue'
import { useI18n } from 'vue-i18n'
import type { Provider } from '@/api/modules/modelAccess'
const props = defineProps<{ modelValue: string; providers: Provider[]; total: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string] }>()
const { t } = useI18n()
const strip = ref<HTMLElement>(),
  overflow = ref(false),
  atStart = ref(true),
  atEnd = ref(false),
  hidden = ref<{ id: string; name: string; count: number; icon: string }[]>([])
const elements = new Map<string, HTMLElement>()
const providerIcons: Record<string, string> = {
  openai: 'O',
  bailian: '阿',
  volcengine: '火',
  compatible: '兼',
  openrouter: 'R',
}
const tabs = computed(() => [
  { id: '', name: t('ma.all'), count: props.total, icon: '' },
  ...props.providers.map((p) => ({
    id: p.id,
    name: p.name,
    count: p.model_count,
    icon: providerIcons[p.template_key] ?? p.name.charAt(0),
  })),
])
function setTab(id: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) elements.set(id, el)
  else elements.delete(id)
}
function measure() {
  const el = strip.value
  if (!el) return
  overflow.value = el.scrollWidth > el.clientWidth + 1
  atStart.value = el.scrollLeft <= 1
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
  const bounds = el.getBoundingClientRect()
  hidden.value = tabs.value.filter((p) => {
    const r = elements.get(p.id)?.getBoundingClientRect()
    return r && (r.left < bounds.left - 1 || r.right > bounds.right + 1)
  })
}
function shift(direction: number) {
  strip.value?.scrollBy({ left: direction * (strip.value.clientWidth * 0.75), behavior: 'smooth' })
}
function wheel(e: WheelEvent) {
  strip.value?.scrollBy({ left: e.deltaX || e.deltaY })
}
function select(id: string) {
  emit('update:modelValue', id)
  emit('change', id)
  nextTick(() => {
    const el = elements.get(id),
      root = strip.value
    if (el && root) {
      const r = el.getBoundingClientRect(),
        b = root.getBoundingClientRect()
      if (r.left < b.left) root.scrollBy({ left: r.left - b.left, behavior: 'smooth' })
      else if (r.right > b.right) root.scrollBy({ left: r.right - b.right, behavior: 'smooth' })
    }
  })
}
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (strip.value) observer.observe(strip.value)
  measure()
})
watch(tabs, () => nextTick(measure))
onBeforeUnmount(() => observer?.disconnect())
</script>
<style scoped>
.provider-tabs {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-page);
  border-radius: var(--td-radius-large);
  overflow: hidden;
}
.provider-tabs > :deep(.t-button),
.provider-tabs > :deep(.t-dropdown) {
  height: auto;
  align-self: stretch;
  display: flex;
  align-items: center;
}
.provider-tabs :deep(.t-button__text) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.provider-tabs__strip {
  display: flex;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.provider-tabs__strip::-webkit-scrollbar {
  display: none;
}
.provider-tabs__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 0;
  border-right: 1px solid var(--td-component-stroke);
  background: transparent;
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-l);
  font: inherit;
  color: var(--td-text-color-primary);
  cursor: pointer;
}
.provider-tabs__tab.is-active {
  color: var(--td-brand-color);
  background: var(--td-bg-color-container);
  box-shadow: inset 0 calc(-1 * var(--model-tab-indicator-width)) var(--td-brand-color);
}
.provider-tabs__count {
  margin-left: var(--td-comp-margin-xs);
  color: var(--td-text-color-placeholder);
  font-size: var(--td-font-size-body-small);
  line-height: var(--td-line-height-body-small);
}
.provider-tabs__label {
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}
.provider-tabs__icon {
  flex-shrink: 0;
  margin-right: var(--td-comp-margin-s);
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  font-weight: var(--td-font-weight-medium);
}
.provider-tabs__menu-item {
  display: flex;
  align-items: center;
}
</style>
