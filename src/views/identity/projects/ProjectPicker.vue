<template>
  <div class="picker-field">
    <t-select
      :value="modelValue"
      :options="options"
      :placeholder="placeholder"
      multiple
      filterable
      clearable
      :loading="loading"
      :filter="() => true"
      @search="search"
      @change="change"
    >
      <template v-if="page < totalPages" #panel-bottom-content>
        <t-button block variant="text" :loading="loading" @click.stop="load(page + 1)">{{
          t('projects.loadMore')
        }}</t-button>
      </template>
    </t-select>
    <div v-if="showSelection && modelValue.length" class="selected-members">
      <span>{{ t('projects.selectedMembers') }}</span>
      <t-tag
        v-for="id in modelValue"
        :key="id"
        closable
        variant="light"
        :title="cache[id]"
        @close="
          emit(
            'update:modelValue',
            modelValue.filter((value) => value !== id),
          )
        "
        >{{ (cache[id] ?? id).split('（')[0] }}</t-tag
      >
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SelectProps } from 'tdesign-vue-next'
import {
  projectUserOptions,
  projectModelOptions,
  type ProjectMember,
  type ProjectRef,
} from '@/api/modules/projects'
const props = defineProps<{
  modelValue: string[]
  kind?: 'model' | 'user'
  placeholder?: string
  exclude?: string[]
  showSelection?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const { t, locale } = useI18n()
const cache = ref<Record<string, string>>({})
const visible = ref<string[]>([])
const loading = ref(false)
const page = ref(1)
const totalPages = ref(1)
let keyword = ''
let version = 0
let timer: ReturnType<typeof setTimeout> | undefined
const options = computed(() =>
  [...new Set([...props.modelValue, ...visible.value])]
    .filter((id) => !props.exclude?.includes(id) || props.modelValue.includes(id))
    .map((id) => ({ value: id, label: cache.value[id] ?? id })),
)
async function load(current = 1) {
  const request = ++version
  loading.value = true
  try {
    const result = await (props.kind === 'model' ? projectModelOptions : projectUserOptions)({
      page: current,
      page_size: 100,
      search: keyword,
    })
    if (request !== version) return
    result.items.forEach((item: ProjectRef | ProjectMember) => {
      cache.value[item.id] =
        'username' in item
          ? `${item.display_name}（${item.username}） · ${item.department}`
          : item.display_name
    })
    visible.value =
      current === 1
        ? result.items.map((item) => item.id)
        : [...visible.value, ...result.items.map((item) => item.id)]
    page.value = current
    totalPages.value = result.total_pages
  } catch {
    /* Shared interceptor displays the error. */
  } finally {
    if (request === version) loading.value = false
  }
}
function search(text: string) {
  keyword = text
  clearTimeout(timer)
  timer = setTimeout(() => void load(), 250)
}
const change: SelectProps['onChange'] = (value) =>
  emit('update:modelValue', Array.isArray(value) ? value.map(String) : [])
onMounted(() => void load())
watch(locale, () => void load())
onBeforeUnmount(() => {
  version++
  clearTimeout(timer)
})
</script>
<style scoped>
.picker-field {
  width: 100%;
}
.selected-members {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--td-comp-margin-s);
  margin-top: var(--td-comp-margin-l);
  color: var(--td-text-color-secondary);
}
</style>
