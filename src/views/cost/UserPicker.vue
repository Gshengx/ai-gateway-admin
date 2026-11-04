<template>
  <t-select-input
    :value="labels"
    :popup-visible="popupVisible"
    :placeholder="placeholder || t('cost.selectRecipients')"
    :disabled="disabled || loading"
    :popup-props="{ placement: 'bottom-left', overlayInnerClassName: 'cost-user-popup' }"
    :tag-props="{ closable: !disabled }"
    :min-collapsed-num="0"
    multiple
    clearable
    @popup-visible-change="popupVisible = $event"
    @tag-change="changeTags"
    @clear="emit('update:modelValue', [])"
  >
    <template #suffixIcon><t-icon name="chevron-down" /></template>
    <template #panel>
      <div v-if="popupVisible" class="user-picker-panel">
        <DepartmentSelect v-model="department" @change="query" />
        <t-input v-model="search" :placeholder="t('cost.searchUsers')" clearable @enter="query" />
        <t-table
          size="small"
          row-key="id"
          :data="items"
          :columns="columns"
          :show-header="false"
          :loading="fetching"
          max-height="var(--cost-user-list-height)"
          :selected-row-keys="modelValue"
          :disable-data-page="true"
          :pagination="{
            current: page,
            pageSize: 20,
            total,
            theme: 'simple',
            size: 'small',
            showPageSize: false,
            showJumper: false,
            totalContent: false,
          }"
          @select-change="selectRows"
          @page-change="changePage"
        />
      </div>
    </template>
  </t-select-input>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PageInfo, PrimaryTableCol, SelectInputProps } from 'tdesign-vue-next'
import { getCostUsers } from '@/api/modules/cost'
import DepartmentSelect from './DepartmentSelect.vue'
import { useCost } from './useCost'
const props = defineProps<{
  modelValue: string[]
  options: { value: string; label: string; disabled?: boolean }[]
  disabled?: boolean
  loading?: boolean
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()
const { t, error, locale } = useCost()
const popupVisible = ref(false),
  department = ref(''),
  search = ref(''),
  page = ref(1),
  total = ref(0),
  fetching = ref(false)
const items = ref<{ id: string; name: string; disabled: boolean }[]>([])
const labels = computed(() =>
  props.modelValue.map((id) => props.options.find((u) => u.value === id)?.label ?? id),
)
const columns = computed<PrimaryTableCol[]>(() => [
  {
    colKey: 'row-select',
    type: 'multiple',
    width: 40,
    disabled: ({ row }) => Boolean(row.disabled),
  },
  { colKey: 'name', title: t('cost.selectUsers') },
])
let version = 0,
  timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  if (!popupVisible.value) return
  const current = ++version
  fetching.value = true
  try {
    const result = await getCostUsers({
      page: page.value,
      page_size: 20,
      search: search.value.trim(),
      department_id: department.value,
      allowed_ids: props.options.map((u) => u.value).join(','),
    })
    if (current !== version) return
    total.value = result.total
    items.value = result.items.map((u) => ({
      id: u.id,
      name: props.options.find((item) => item.value === u.id)?.label ?? `${u.name} (${u.username})`,
      disabled: props.options.find((item) => item.value === u.id)?.disabled ?? false,
    }))
  } catch (err) {
    error(err)
  } finally {
    if (current === version) fetching.value = false
  }
}
function query() {
  clearTimeout(timer)
  page.value = 1
  void load()
}
function changePage(info: PageInfo) {
  page.value = info.current
  void load()
}
function selectRows(keys: (string | number)[]) {
  const ids = items.value.map((u) => u.id)
  emit('update:modelValue', [
    ...new Set([...props.modelValue.filter((id) => !ids.includes(id)), ...keys.map(String)]),
  ])
}
const changeTags: NonNullable<SelectInputProps['onTagChange']> = (_value, context) => {
  if (context.trigger === 'clear') emit('update:modelValue', [])
  else if (
    (context.trigger === 'tag-remove' || context.trigger === 'backspace') &&
    typeof context.index === 'number'
  )
    emit(
      'update:modelValue',
      props.modelValue.filter((_id, index) => index !== context.index),
    )
}
watch(search, () => {
  version++
  clearTimeout(timer)
  timer = setTimeout(query, 250)
})
watch(popupVisible, (visible) => {
  clearTimeout(timer)
  version++
  if (visible) {
    search.value = ''
    department.value = ''
    query()
  }
})
watch(locale, query)
onBeforeUnmount(() => {
  version++
  clearTimeout(timer)
})
</script>
<style scoped>
.user-picker-panel {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
  min-width: 0;
}
.user-picker-panel :deep(.t-table__pagination) {
  padding: var(--td-comp-paddingTB-s) 0 0;
}
.user-picker-panel :deep(.t-table td) {
  font-size: var(--td-font-size-body-medium);
}
</style>
