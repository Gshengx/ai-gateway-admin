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
            @click="requestRemove([...selected[kind]])"
            >{{ t('ma.revokeGrant') }}</t-button
          >
        </div>
        <div v-permission.write="'model.permissions'" class="ma-row">
          <SubjectSelect
            v-model="candidates[kind]"
            :type="kind"
            :labels="names"
            :locked-ids="authorized[kind]"
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
            pageSize,
            total: totals[kind],
            showPageSize: false,
          }"
          :disable-data-page="true"
          @select-change="(keys: (string | number)[]) => (selected[kind] = keys.map(String))"
          @page-change="
            (p: PageInfo) => {
              pages[kind] = p.current
              renderPage(kind)
            }
          "
          ><template #subject_name="{ row }">{{ subjectLabel(row) }}</template>
          <template #action="{ row }"
            ><t-link
              v-permission.write="'model.permissions'"
              theme="danger"
              @click="requestRemove([row.id])"
              >{{ t('ma.revokeGrant') }}</t-link
            ></template
          ></t-table
        >
      </LoadingState>
    </section>
    <t-dialog
      attach="body"
      placement="center"
      dialog-class-name="model-access-dialog"
      :close-btn="!saving"
      :visible="removing.length > 0"
      :header="t('ma.revokeGrant')"
      :close-on-esc-keydown="!saving"
      :close-on-overlay-click="false"
      :cancel-btn="{ content: t('ma.cancel'), disabled: saving }"
      :confirm-btn="{ content: t('ma.confirm'), loading: saving }"
      @close="!saving && (removing = [])"
      @confirm="remove"
      ><div class="ma-stack">
        <p>{{ t('ma.revokeGrantConfirm') }}</p>
        <p>
          {{
            removing
              .map((id) => {
                const grant = savedGrants.get(id)
                return grant ? subjectLabel(grant) : t('ma.unavailable')
              })
              .join('、')
          }}
        </p>
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

const props = defineProps<{ modelId: string }>()
const emit = defineEmits<{ 'busy-change': [value: boolean] }>()
const { t } = useI18n()
const kinds: Subject[] = ['DEPARTMENT', 'USER_GROUP', 'USER']
const pageSize = 5
const savedGrants = reactive(new Map<string, Permission>())
const collections = reactive<Record<Subject, Permission[]>>({
  DEPARTMENT: [],
  USER_GROUP: [],
  USER: [],
})
const rows = reactive<Record<Subject, Permission[]>>({ DEPARTMENT: [], USER_GROUP: [], USER: [] })
const candidates = reactive<Record<Subject, string[]>>({ DEPARTMENT: [], USER_GROUP: [], USER: [] })
const selected = reactive<Record<Subject, string[]>>({ DEPARTMENT: [], USER_GROUP: [], USER: [] })
const authorized = reactive<Record<Subject, string[]>>({ DEPARTMENT: [], USER_GROUP: [], USER: [] })
const pages = reactive({ DEPARTMENT: 1, USER_GROUP: 1, USER: 1 })
const totals = reactive({ DEPARTMENT: 0, USER_GROUP: 0, USER: 0 })
const loading = reactive({ DEPARTMENT: true, USER_GROUP: true, USER: true })
const failed = reactive({ DEPARTMENT: false, USER_GROUP: false, USER: false })
const names = ref<Record<string, string>>({})
const saving = ref(false)
const removing = ref<string[]>([])
const reason = ref('')
const requests = {
  DEPARTMENT: useLatestRequest(),
  USER_GROUP: useLatestRequest(),
  USER: useLatestRequest(),
}
watch(
  () => saving.value || removing.value.length > 0,
  (value) => emit('busy-change', value),
  { flush: 'sync' },
)
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: 'row-select', type: 'multiple', width: 40 },
  { colKey: 'subject_name', title: t('ma.subject') },
  { colKey: 'action', title: t('ma.actions'), width: 100 },
])
function remember(map: Record<string, string>) {
  Object.assign(names.value, map)
}
function subjectLabel(grant: Permission) {
  return grant.subject_type === 'USER' && grant.subject_username
    ? `${grant.subject_name}(${grant.subject_username})`
    : grant.subject_name
}
function renderPage(kind: Subject) {
  totals[kind] = collections[kind].length
  pages[kind] = Math.max(1, Math.min(pages[kind], Math.max(1, Math.ceil(totals[kind] / pageSize))))
  rows[kind] = collections[kind].slice((pages[kind] - 1) * pageSize, pages[kind] * pageSize)
}
async function load(kind: Subject) {
  const current = requests[kind].begin()
  loading[kind] = true
  failed[kind] = false
  try {
    const data = await accessApi.permissionSet(props.modelId, kind, { signal: current.signal })
    if (!current.isCurrent()) return
    const grants = data.items
    for (const [id, grant] of savedGrants) if (grant.subject_type === kind) savedGrants.delete(id)
    grants.forEach((grant) => savedGrants.set(grant.id, grant))
    collections[kind] = grants
    authorized[kind] = grants.map((grant) => grant.subject_id)
    remember(Object.fromEntries(grants.map((grant) => [grant.subject_id, subjectLabel(grant)])))
    renderPage(kind)
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
      .filter((id) => !authorized[kind].includes(id))
      .map((subject_id) => ({ subject_type: kind, subject_id }))
    if (!grants.length) return
    await accessApi.grant(props.modelId, grants)
    candidates[kind] = []
    selected[kind] = []
    MessagePlugin.success(t('ma.success'))
    pages[kind] = 1
    await load(kind)
  } catch {
    // Keep the selection for retry; the request layer reports the error.
  } finally {
    saving.value = false
  }
}
function requestRemove(ids: string[]) {
  removing.value = ids
}
async function remove() {
  if (saving.value || !removing.value.length) return
  if (!reason.value.trim()) {
    MessagePlugin.warning(t('ma.reasonRequired'))
    return
  }
  const targets = removing.value.map((id) => savedGrants.get(id)).filter((grant) => !!grant)
  const changedKinds = new Set(targets.map((grant) => grant.subject_type))
  if (!changedKinds.size) return
  saving.value = true
  try {
    await accessApi.revoke(props.modelId, removing.value, reason.value)
    MessagePlugin.success(t('ma.success'))
    removing.value = []
    reason.value = ''
    for (const kind of changedKinds) selected[kind] = []
    await Promise.all([...changedKinds].map(load))
  } catch {
    // Reconcile the current grants before a retry.
    await Promise.allSettled([...changedKinds].map(load))
    removing.value = removing.value.filter((id) => savedGrants.has(id))
  } finally {
    saving.value = false
  }
}
watch(
  () => props.modelId,
  () => {
    savedGrants.clear()
    for (const kind of kinds) {
      pages[kind] = 1
      candidates[kind] = []
      selected[kind] = []
    }
    void Promise.all(kinds.map(load))
  },
  { immediate: true, deep: true },
)
</script>
<style scoped src="./access.css"></style>
