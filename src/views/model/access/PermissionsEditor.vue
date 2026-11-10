<template>
  <div class="ma-stack">
    <section v-for="kind in kinds" :key="kind" class="permission-group ma-stack">
      <LoadingState
        height="var(--stable-permission-height)"
        :loading="loading[kind]"
        :failed="failed[kind]"
        retryable
        @retry="load(kind)"
      >
        <div class="ma-row ma-between">
          <h3>{{ t('ma.' + kind) }}</h3>
          <t-button
            v-if="selected[kind].length"
            v-permission.write="'model.permissions'"
            theme="danger"
            variant="outline"
            @click="removing = [...selected[kind]]"
            >{{ t('ma.removeGrant') }}</t-button
          >
        </div>
        <div v-permission.write="'model.permissions'" class="ma-row">
          <SubjectSelect
            v-model="candidates[kind]"
            :type="kind"
            :labels="names"
            :locked-ids="lockedSubjects[kind]"
            @names="remember"
          /><t-button
            theme="primary"
            :disabled="!candidates[kind].length"
            :loading="saving"
            @click="add(kind)"
            >{{ t('ma.addGrant') }}</t-button
          >
        </div>
        <t-table
          :height="loading[kind] ? 'var(--stable-detail-table-height)' : undefined"
          max-height="var(--stable-detail-table-height)"
          row-key="id"
          :data="rows[kind]"
          :columns="columns"
          :selected-row-keys="selected[kind]"
          :pagination="{
            current: pages[kind],
            pageSize: 20,
            total: totals[kind],
            showPageSize: false,
          }"
          :disable-data-page="true"
          @select-change="(keys: (string | number)[]) => (selected[kind] = keys.map(String))"
          @page-change="
            (p: PageInfo) => {
              pages[kind] = p.current
              load(kind)
            }
          "
          ><template #action="{ row }"
            ><t-link
              v-permission.write="'model.permissions'"
              theme="danger"
              @click="removing = [row.id]"
              >{{ t('ma.removeGrant') }}</t-link
            ></template
          ></t-table
        >
      </LoadingState>
    </section>
    <t-dialog
      dialog-class-name="model-access-dialog"
      :close-btn="!saving"
      :visible="removing.length > 0"
      :header="t('ma.removeGrant')"
      :close-on-esc-keydown="!saving"
      :close-on-overlay-click="false"
      :cancel-btn="{ content: t('ma.cancel'), disabled: saving }"
      :confirm-btn="{ content: t('ma.confirm'), loading: saving }"
      @close="!saving && (removing = [])"
      @confirm="remove"
      ><div class="ma-stack">
        <p>{{ t('ma.deleteConfirm') }}</p>
        <t-textarea v-model="reason" :placeholder="t('ma.reason')" /></div
    ></t-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLatestRequest } from '@/utils/useLatestRequest'
import LoadingState from '@/components/LoadingState.vue'
import { MessagePlugin, type PrimaryTableCol, type PageInfo } from 'tdesign-vue-next'
import SubjectSelect from './SubjectSelect.vue'
import { accessApi, type Permission, type Subject } from '@/api/modules/modelAccess'
const props = defineProps<{ modelId?: string; modelIds?: string[] }>()
const emit = defineEmits<{ 'busy-change': [value: boolean] }>()
const value = defineModel<Permission[]>({ default: () => [] })
const { t } = useI18n()
const kinds: Subject[] = ['DEPARTMENT', 'USER_GROUP', 'USER']
const candidates = reactive<Record<Subject, string[]>>({
    DEPARTMENT: [],
    USER_GROUP: [],
    USER: [],
  }),
  selected = reactive<Record<Subject, string[]>>({ DEPARTMENT: [], USER_GROUP: [], USER: [] })
const rows = reactive<Record<Subject, Permission[]>>({ DEPARTMENT: [], USER_GROUP: [], USER: [] }),
  pages = reactive({ DEPARTMENT: 1, USER_GROUP: 1, USER: 1 }),
  totals = reactive({ DEPARTMENT: 0, USER_GROUP: 0, USER: 0 })
const names = ref<Record<string, string>>({}),
  saving = ref(false),
  removing = ref<string[]>([]),
  reason = ref('')
watch(saving, (value) => emit('busy-change', value), { flush: 'sync' })
const authorized = reactive<Record<Subject, string[]>>({ DEPARTMENT: [], USER_GROUP: [], USER: [] })
const lockedSubjects = computed(
  () =>
    Object.fromEntries(
      kinds.map((kind) => [
        kind,
        [
          ...new Set([
            ...authorized[kind],
            ...value.value
              .filter((item) => item.subject_type === kind)
              .map((item) => item.subject_id),
          ]),
        ],
      ]),
    ) as Record<Subject, string[]>,
)
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'row-select', type: 'multiple', width: 40 },
  { colKey: 'subject_name', title: t('ma.subject') },
  { colKey: 'action', title: t('ma.actions'), width: 100 },
])
function remember(map: Record<string, string>) {
  Object.assign(names.value, map)
}
async function allGranted(
  id: string,
  kind: Subject,
  seed?: Awaited<ReturnType<typeof accessApi.permissions>>,
) {
  const first = seed ?? (await accessApi.permissions(id, 1, kind))
  const remaining = await Promise.all(
    Array.from({ length: first.total_pages }, (_, i) => i + 1)
      .filter((page) => page !== first.page)
      .map((page) => accessApi.permissions(id, page, kind)),
  )
  return [...first.items, ...remaining.flatMap((page) => page.items)]
}
const loading = reactive({ DEPARTMENT: true, USER_GROUP: true, USER: true })
const failed = reactive({ DEPARTMENT: false, USER_GROUP: false, USER: false })
const requests = {
  DEPARTMENT: useLatestRequest(),
  USER_GROUP: useLatestRequest(),
  USER: useLatestRequest(),
}
async function load(kind: Subject) {
  const current = requests[kind].begin()
  const modelId = props.modelId
  loading[kind] = true
  failed[kind] = false
  try {
    if (modelId) {
      const data = await accessApi.permissions(modelId, pages[kind], kind)
      if (!current.isCurrent()) return
      if (pages[kind] > Math.max(1, data.total_pages)) {
        pages[kind] = Math.max(1, data.total_pages)
        return await load(kind)
      }
      rows[kind] = data.items
      totals[kind] = data.total
      const grants = await allGranted(modelId, kind, data)
      if (!current.isCurrent()) return
      authorized[kind] = grants.map((grant) => grant.subject_id)
      remember(Object.fromEntries(grants.map((grant) => [grant.subject_id, grant.subject_name])))
    } else {
      const list = value.value.filter((x) => x.subject_type === kind)
      totals[kind] = list.length
      pages[kind] = Math.min(pages[kind], Math.max(1, Math.ceil(list.length / 20)))
      rows[kind] = list.slice((pages[kind] - 1) * 20, pages[kind] * 20)
      if (props.modelIds?.length) {
        const lists = await Promise.all(props.modelIds.map((id) => allGranted(id, kind)))
        if (!current.isCurrent()) return
        authorized[kind] = (lists[0] ?? [])
          .filter((grant) =>
            lists.every((list) => list.some((item) => item.subject_id === grant.subject_id)),
          )
          .map((grant) => grant.subject_id)
      }
    }
    remember(Object.fromEntries(rows[kind].map((x) => [x.subject_id, x.subject_name])))
  } catch {
    if (current.isCurrent()) failed[kind] = true
  } finally {
    if (current.isCurrent()) loading[kind] = false
  }
}
async function add(kind: Subject) {
  if (loading[kind] || failed[kind] || saving.value) return
  saving.value = true
  try {
    const grants = candidates[kind]
      .filter((id) => !lockedSubjects.value[kind].includes(id))
      .map((subject_id) => ({
        subject_type: kind,
        subject_id,
        subject_name: names.value[subject_id] ?? subject_id,
      }))
    if (props.modelId || props.modelIds?.length)
      for (const id of props.modelIds ?? [props.modelId!]) await accessApi.grant(id, grants)
    if (!props.modelId)
      for (const g of grants)
        if (
          !value.value.some(
            (x) => x.subject_id === g.subject_id && x.subject_type === g.subject_type,
          )
        )
          value.value.push({
            ...g,
            id: `${g.subject_type}:${g.subject_id}`,
            physical_model_id: '',
            created_at: '',
          })
    candidates[kind] = []
    if (props.modelId || props.modelIds?.length) MessagePlugin.success(t('ma.success'))
    await load(kind)
  } catch {
    // Keep the selection available for retry; the request layer reports the error.
  } finally {
    saving.value = false
  }
}
async function remove() {
  if (saving.value || !removing.value.length) return
  if (!reason.value.trim()) {
    MessagePlugin.warning(t('ma.reasonRequired'))
    return
  }
  saving.value = true
  try {
    if (props.modelId) await accessApi.revoke(props.modelId, removing.value, reason.value)
    else value.value = value.value.filter((x) => !removing.value.includes(x.id))
    if (props.modelId) MessagePlugin.success(t('ma.success'))
    removing.value = []
    reason.value = ''
    for (const k of kinds) {
      selected[k] = []
      await load(k)
    }
  } catch {
    // Keep the selection available for retry; the request layer reports the error.
  } finally {
    saving.value = false
  }
}
watch([() => props.modelId, () => props.modelIds], () => void Promise.all(kinds.map(load)), {
  immediate: true,
  deep: true,
})
</script>
<style scoped src="./access.css"></style>
