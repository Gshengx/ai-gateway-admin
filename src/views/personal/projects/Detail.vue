<template>
  <div v-if="project" class="projects-page">
    <div class="project-heading">
      <div>
        <t-link theme="primary" @click="router.push('/account/projects')">{{
          t('projects.back')
        }}</t-link>
        <h1 class="detail-title">
          {{ project.name }}
          <t-tag variant="light" :theme="project.status === 'ACTIVE' ? 'success' : 'default'">{{
            t(`projects.${project.status}`)
          }}</t-tag>
          <t-tag variant="light">{{ t(`projects.${project.role}`) }}</t-tag>
        </h1>
        <p>{{ project.department }}</p>
      </div>
    </div>
    <t-card :bordered="false">
      <t-descriptions :column="2" layout="horizontal" item-layout="vertical"
        ><t-descriptions-item :label="t('projects.name')">{{ project.name }}</t-descriptions-item
        ><t-descriptions-item :label="t('projects.projectStatus')">{{
          t(`projects.${project.status}`)
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('projects.department')">{{
          project.department
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('projects.admin')">{{
          project.admins.join(locale.startsWith('en') ? ', ' : '、')
        }}</t-descriptions-item
        ><t-descriptions-item :label="t('projects.description')" :span="2">{{
          project.description || '—'
        }}</t-descriptions-item></t-descriptions
      >
      <section class="detail-section">
        <div class="section-heading">
          <div>
            <h2>{{ t('projects.budgetStatus') }}</h2>
            <p>{{ t('projects.budgetHint') }}</p>
          </div>
          <t-button
            v-if="
              project.status === 'ACTIVE' &&
              project.budget &&
              project.budget.status !== 'DISABLED' &&
              userStore.permissions.includes('personal.work_orders:write')
            "
            v-permission.write="'personal.projects'"
            theme="default"
            @click="apply"
            >{{ t('projects.increaseBudget') }}</t-button
          >
        </div>
        <div class="metrics">
          <div>
            <span>{{ t('projects.budgetStatus') }}</span
            ><strong>{{ budgetStatus }}</strong>
          </div>
          <template v-if="project.budget">
            <div>
              <span>{{ t('projects.periodBudget') }}</span
              ><strong>{{ money(project.budget.amount) }}</strong
              ><small>{{
                t('projects.period', {
                  start: formatDate(project.budget.start),
                  end: formatDate(project.budget.end),
                })
              }}</small>
            </div>
            <div>
              <span>{{ t('projects.memberLimit') }}</span
              ><strong>{{ money(project.budget.member_limit) }}</strong>
            </div>
            <div>
              <span>{{ t('projects.consumed') }}</span
              ><strong>{{ money(project.budget.consumed) }}</strong>
            </div>
            <div>
              <span>{{ t('projects.balance') }}</span
              ><strong>{{ money(project.budget.amount - project.budget.consumed) }}</strong>
            </div>
            <div>
              <span>{{ t('projects.usage') }}</span
              ><strong>{{ usagePercent.toFixed(1) }}%</strong
              ><t-progress :percentage="Math.min(100, usagePercent)" :label="false" /><small>{{
                t('projects.thresholds')
              }}</small>
            </div>
          </template>
        </div>
      </section>
      <section class="detail-section">
        <h2>{{ t('projects.availableModels') }}</h2>
        <p class="hint">{{ t('projects.modelsHint') }}</p>
        <t-space v-if="project.models.length" break-line
          ><t-tag v-for="model in project.models" :key="model.id" variant="light"
            >{{ model.name }} · {{ model.display_name }}</t-tag
          ></t-space
        >
        <p v-else class="hint">{{ t('projects.noModels') }}</p>
      </section>
      <section class="detail-section">
        <h2>{{ t('projects.myUsage') }}</h2>
        <p class="hint">{{ t('projects.usageHint') }}</p>
        <div class="metrics usage-metrics">
          <div>
            <span>{{ t('projects.personalCost') }}</span
            ><strong>{{ project.usage ? money(project.usage.amount) : '—' }}</strong>
          </div>
          <div>
            <span>{{ t('projects.requests') }}</span
            ><strong>{{ project.usage?.requests.toLocaleString(locale) ?? '—' }}</strong>
          </div>
          <div>
            <span>{{ t('projects.tokens') }}</span
            ><strong>{{ project.usage ? tokens(project.usage.tokens) : '—' }}</strong>
          </div>
        </div>
        <h3>{{ t('projects.ranking') }}</h3>
        <div v-for="(model, index) in project.ranking" :key="model.id" class="ranking-row">
          <span>{{ String(index + 1).padStart(2, '0') }} · {{ model.name }}</span
          ><span>{{ model.provider }}</span
          ><span>{{
            t('projects.callCount', { count: model.requests.toLocaleString(locale) })
          }}</span
          ><strong>{{ money(model.amount) }}</strong>
        </div>
        <p v-if="!project.ranking.length" class="hint">{{ t('projects.noUsage') }}</p>
      </section>
      <section class="detail-section">
        <div class="section-heading">
          <t-space
            ><h2>{{ t('projects.members') }}</h2>
            <span class="hint">{{
              t('projects.people', { count: project.member_count })
            }}</span></t-space
          ><t-space v-if="project.can_manage" v-permission.write="'personal.projects'"
            ><t-button theme="default" @click="addVisible = true">{{
              t('projects.addMember')
            }}</t-button></t-space
          >
        </div>
        <t-table
          row-key="id"
          :data="members"
          :columns="columns"
          :loading="loading"
          :pagination="pagination"
          @page-change="changePage"
        >
          <template #expandedRow="{ row }">
            <div class="member-models">
              <h3>{{ t('projects.memberModelDetails', { name: row.display_name }) }}</h3>
              <t-table row-key="id" :data="row.model_usage" :columns="usageColumns">
                <template #amount="{ row: usage }">{{ money(usage.amount) }}</template>
                <template
                  v-for="key in [
                    'requests',
                    'tokens',
                    'input_tokens',
                    'output_tokens',
                    'cache_tokens',
                  ]"
                  #[key]="{ row: usage }"
                  :key="key"
                  >{{ usage[key].toLocaleString(locale) }}</template
                >
              </t-table>
            </div>
          </template>
          <template #role="{ row }"
            ><t-tag variant="light">{{ t(`projects.${row.role}`) }}</t-tag></template
          ><template #joined_at="{ row }">{{ formatDate(row.joined_at) }}</template
          ><template #amount="{ row }">{{ money(row.amount) }}</template
          ><template #requests="{ row }">{{ row.requests.toLocaleString(locale) }}</template
          ><template #tokens="{ row }">{{ tokens(row.tokens) }}</template>
          <template #actions="{ row }"
            ><t-space v-if="project.can_manage" v-permission.write="'personal.projects'"
              ><t-link v-if="row.role !== 'ADMIN'" theme="primary" @click="promote(row.id)">{{
                t('projects.promote')
              }}</t-link
              ><t-link theme="danger" @click="prepare(row.id, row.display_name)">{{
                t('projects.remove')
              }}</t-link></t-space
            ></template
          >
        </t-table>
      </section>
    </t-card>
    <t-dialog
      :visible="addVisible"
      :header="t('projects.addTitle')"
      :confirm-btn="{ content: t('projects.add'), loading: saving, disabled: !addIds.length }"
      :cancel-btn="t('projects.cancel')"
      :close-on-overlay-click="false"
      @close="closeAdd"
      @confirm="add"
    >
      <t-form label-align="top"
        ><t-form-item :label="t('projects.selectUsers')"
          ><ProjectPicker
            v-model="addIds"
            :exclude="[...project.admin_ids, ...project.member_ids]"
            :placeholder="t('projects.userSearch')" /></t-form-item
        ><t-form-item :label="t('projects.role')"
          ><div class="field-stack">
            <t-select
              v-model="addRole"
              :options="[
                { value: 'MEMBER', label: t('projects.normalMember') },
                { value: 'ADMIN', label: t('projects.ADMIN') },
              ]"
            /><span class="hint">{{ t('projects.memberRoleHint') }}</span>
          </div></t-form-item
        ></t-form
      >
    </t-dialog>
    <t-dialog
      :visible="!!pending"
      :header="t('projects.removeTitle')"
      placement="top"
      :confirm-btn="{
        theme: 'danger',
        content: t('projects.confirmRemove'),
        loading: saving,
      }"
      :cancel-btn="t('projects.cancel')"
      :close-on-overlay-click="false"
      @close="pending = null"
      @confirm="mutate"
      ><div class="project-confirm">
        <p>{{ confirmation }}</p>
      </div></t-dialog
    >
  </div>
  <t-alert v-else-if="errorText" theme="error" :message="errorText"
    ><template #operation
      ><t-link @click="load">{{ t('projects.retry') }}</t-link></template
    ></t-alert
  >
  <t-loading v-else :loading="loading" />
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin, type PrimaryTableCol, type PageInfo } from 'tdesign-vue-next'
import {
  getProject,
  getProjectMembers,
  addProjectMembers,
  changeProjectMembers,
  type ProjectDetail,
  type ProjectMember,
  type ProjectRole,
  type ProjectModelUsage,
} from '@/api/modules/projects'
import { formatDate } from '@/utils/datetime'
import ProjectPicker from '@/views/identity/projects/ProjectPicker.vue'
import { useUserStore } from '@/stores/modules/user'
import '@/styles/projects.css'
const { t, locale } = useI18n()
const route = useRoute(),
  router = useRouter()
const userStore = useUserStore()
const project = ref<ProjectDetail>(),
  members = ref<ProjectMember[]>([])
const errorText = ref('')
const loading = ref(false),
  saving = ref(false),
  addVisible = ref(false)
const addIds = ref<string[]>([]),
  addRole = ref<ProjectRole>('MEMBER')
const pending = ref<{ id: string; name: string } | null>(null)
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })
const id = computed(() => String(route.params.id))
let version = 0
const budgetStatus = computed(() =>
  t(
    !project.value?.budget
      ? 'projects.unconfigured'
      : project.value.budget.status === 'DISABLED'
        ? 'projects.budgetDisabled'
        : `projects.${project.value.budget.status}`,
  ),
)
const usagePercent = computed(() =>
  project.value?.budget?.amount
    ? (project.value.budget.consumed / project.value.budget.amount) * 100
    : 0,
)
const confirmation = computed(() =>
  pending.value ? t('projects.removeBody', { name: pending.value.name }) : '',
)
const columns = computed<PrimaryTableCol<ProjectMember>[]>(() => [
  { colKey: 'display_name', title: t('projects.displayName'), width: 100 },
  { colKey: 'username', title: t('projects.username'), width: 120 },
  { colKey: 'department', title: t('projects.userDepartment'), minWidth: 190, ellipsis: true },
  { colKey: 'role', title: t('projects.role'), width: 120 },
  { colKey: 'joined_at', title: t('projects.joined'), width: 120 },
  { colKey: 'requests', title: t('projects.calls'), width: 110 },
  { colKey: 'amount', title: t('projects.amount'), width: 130 },
  { colKey: 'tokens', title: t('projects.tokens'), width: 120 },
  ...(project.value?.can_manage
    ? [{ colKey: 'actions', title: t('projects.actions'), width: 190, fixed: 'right' as const }]
    : []),
])
const usageColumns = computed<PrimaryTableCol<ProjectModelUsage>[]>(() => [
  { colKey: 'name', title: t('projects.modelName'), minWidth: 150 },
  { colKey: 'provider', title: t('projects.provider'), minWidth: 140 },
  ...['requests', 'amount', 'tokens', 'input_tokens', 'output_tokens', 'cache_tokens'].map(
    (colKey) => ({
      colKey,
      title: t(`projects.${colKey === 'requests' ? 'calls' : colKey}`),
      width: 130,
    }),
  ),
])
function money(amount: number) {
  return new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: project.value?.budget?.currency ?? 'CNY',
  }).format(amount)
}
function tokens(amount: number) {
  return amount >= 1000000
    ? `${(amount / 1000000).toFixed(2)}M`
    : amount.toLocaleString(locale.value)
}
function apply() {
  void router.push({
    path: '/personal/work-orders',
    query: { create: 'project-budget', projectId: id.value },
  })
}
async function load() {
  const request = ++version
  loading.value = true
  errorText.value = ''
  try {
    const [detail, result] = await Promise.all([
      getProject(id.value),
      getProjectMembers(id.value, { page: pagination.current, page_size: pagination.pageSize }),
    ])
    if (request === version) {
      project.value = detail
      members.value = result.items
      pagination.total = result.total
    }
  } catch (error) {
    errorText.value = (error as Error).message || t('projects.failed')
  } finally {
    if (request === version) loading.value = false
  }
}
function changePage(info: PageInfo) {
  pagination.current = info.current
  pagination.pageSize = info.pageSize
  void load()
}
function closeAdd() {
  addVisible.value = false
  addIds.value = []
  addRole.value = 'MEMBER'
}
async function add() {
  if (saving.value || !addIds.value.length) return
  saving.value = true
  try {
    await addProjectMembers(id.value, addIds.value, addRole.value)
    closeAdd()
    MessagePlugin.success(t('projects.success'))
    await load()
  } catch {
    /* interceptor */
  } finally {
    saving.value = false
  }
}
async function promote(userId: string) {
  if (saving.value) return
  saving.value = true
  try {
    await changeProjectMembers(id.value, [userId], 'promote')
    MessagePlugin.success(t('projects.success'))
    await load()
  } catch {
    /* interceptor */
  } finally {
    saving.value = false
  }
}
function prepare(userId: string, name: string) {
  if (project.value?.admin_ids.length === 1 && project.value.admin_ids[0] === userId) {
    MessagePlugin.warning(t('projects.lastAdmin'))
    return
  }
  pending.value = { id: userId, name }
}
async function mutate() {
  if (!pending.value || saving.value) return
  saving.value = true
  try {
    const selfRemoved = pending.value.id === userStore.userInfo?.id
    await changeProjectMembers(id.value, [pending.value.id], 'remove')
    pending.value = null
    MessagePlugin.success(t('projects.success'))
    if (selfRemoved) {
      await router.push('/account/projects')
      return
    }
    if (members.value.length === 1 && pagination.current > 1) pagination.current--
    await load()
  } catch {
    /* interceptor */
  } finally {
    saving.value = false
  }
}
onMounted(load)
watch([locale, id], () => {
  pagination.current = 1
  void load()
})
</script>
<style scoped>
.detail-title {
  margin-top: var(--td-comp-margin-l) !important;
}
.detail-section {
  margin-top: var(--td-comp-margin-l);
  padding-top: var(--td-comp-paddingTB-l);
  border-top: 1px solid var(--td-component-stroke);
}
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--td-comp-margin-l);
  margin-bottom: var(--td-comp-margin-l);
}
h2 {
  margin: 0;
  font-size: var(--td-font-size-title-medium);
}
h3 {
  font-size: var(--td-font-size-title-small);
  margin: var(--td-comp-margin-l) 0 var(--td-comp-margin-s);
}
.section-heading p,
.hint {
  color: var(--td-text-color-secondary);
}
.section-heading p {
  margin-bottom: 0;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--td-comp-margin-l);
}
.usage-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.metrics > div {
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-secondarycontainer);
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
}
.metrics span,
.metrics small {
  color: var(--td-text-color-secondary);
}
.metrics strong {
  font-size: var(--td-font-size-title-medium);
}
.ranking-row {
  display: flex;
  justify-content: space-between;
  gap: var(--td-comp-margin-l);
  padding: var(--td-comp-paddingTB-s) 0;
}
.field-stack {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
  width: 100%;
}
.member-models {
  padding: var(--td-comp-paddingTB-m) var(--td-comp-paddingLR-m);
}
</style>
