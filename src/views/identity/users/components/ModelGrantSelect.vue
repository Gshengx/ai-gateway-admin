<template>
  <t-select-input
    class="model-grant-select"
    :value="display"
    :popup-visible="popupVisible"
    :disabled="disabled"
    :placeholder="t('users.detail.models.selectPlaceholder')"
    :tag-props="{ closable: true }"
    :min-collapsed-num="0"
    multiple
    clearable
    @popup-visible-change="popupVisible = $event"
    @tag-change="changeTags"
    @clear="selection = []"
  >
    <template #suffixIcon><t-icon name="chevron-down" /></template>
    <template #panel>
      <div v-if="popupVisible" class="model-grant-picker" @click.stop>
        <t-input
          v-model="keyword"
          :placeholder="t('users.detail.models.searchPlaceholder')"
          clearable
        />
        <t-loading :loading="loading">
          <div class="model-grant-picker__options">
            <t-checkbox
              v-for="item in items"
              :key="item.id"
              :checked="locked.has(item.id) || selection.includes(item.id)"
              :disabled="locked.has(item.id)"
              @change="(checked: boolean) => toggle(item.id, checked)"
              >{{ names[item.id] }}</t-checkbox
            >
            <p v-if="!items.length && !loading" class="model-grant-picker__empty">
              {{ t('users.detail.models.empty') }}
            </p>
          </div>
        </t-loading>
        <t-pagination
          size="small"
          theme="simple"
          :current="page"
          :page-size="pageSize"
          :total="total"
          :disabled="loading"
          :show-page-size="false"
          :show-jumper="false"
          :total-content="false"
          @current-change="changePage"
        />
      </div>
    </template>
  </t-select-input>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SelectInputProps } from 'tdesign-vue-next'
import { getLogicalModelOptionsApi, type LogicalModelOption } from '@/api/modules/identity'
const props = defineProps<{ disabled?: boolean; lockedIds: string[] }>()
const selection = defineModel<string[]>({ required: true })
const emit = defineEmits<{ names: [labels: Record<string, string>] }>()
const { t, locale } = useI18n()
const popupVisible = ref(false),
  keyword = ref(''),
  loading = ref(false),
  page = ref(1),
  total = ref(0)
const pageSize = 5
const items = ref<LogicalModelOption[]>([]),
  names = ref<Record<string, string>>({})
const locked = computed(() => new Set(props.lockedIds))
const display = computed(() => selection.value.map((id) => names.value[id] ?? id))
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const request = ++generation
  loading.value = true
  try {
    const result = await getLogicalModelOptionsApi({
      page: page.value,
      page_size: pageSize,
      search: keyword.value.trim() || undefined,
    })
    if (request !== generation) return
    items.value = result.items
    total.value = result.total
    const labels = Object.fromEntries(
      result.items.map((item) => [
        item.id,
        item.localized_name || item.display_name || item.logical_name,
      ]),
    )
    Object.assign(names.value, labels)
    emit('names', labels)
  } catch {
    if (request === generation) {
      items.value = []
      total.value = 0
    }
  } finally {
    if (request === generation) loading.value = false
  }
}
function query() {
  page.value = 1
  void load()
}
function changePage(value: number) {
  page.value = value
  void load()
}
function toggle(id: string, checked: boolean) {
  if (locked.value.has(id)) return
  selection.value = checked
    ? [...new Set([...selection.value, id])]
    : selection.value.filter((item) => item !== id)
}
const changeTags: NonNullable<SelectInputProps['onTagChange']> = (_value, context) => {
  if (context.trigger === 'clear') selection.value = []
  else if (typeof context.index === 'number')
    selection.value = selection.value.filter((_id, index) => index !== context.index)
}
watch(keyword, () => {
  generation++
  clearTimeout(timer)
  timer = setTimeout(query, keyword.value ? 250 : 0)
})
watch(popupVisible, (visible) => {
  if (!visible) return
  clearTimeout(timer)
  if (keyword.value) keyword.value = ''
  else query()
})
watch(locale, () => {
  if (popupVisible.value) query()
})
watch(locked, () => {
  const pending = selection.value.filter((id) => !locked.value.has(id))
  if (pending.length !== selection.value.length) selection.value = pending
})
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})
</script>
<style scoped>
.model-grant-select {
  flex: 1;
  min-width: 0;
  width: 100%;
}
.model-grant-picker {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
  padding: var(--td-comp-paddingTB-s) var(--td-comp-paddingLR-s);
}
.model-grant-picker__options {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
}
.model-grant-picker__options :deep(.t-checkbox) {
  margin: 0;
}
.model-grant-picker__empty {
  color: var(--td-text-color-placeholder);
  margin: 0;
}
</style>
