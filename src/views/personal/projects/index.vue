<template>
  <router-view v-if="route.name !== 'PersonalProjects'" />
  <div v-else class="projects-page">
    <div class="project-heading">
      <div>
        <h1>{{ t('projects.mine') }}</h1>
        <p>{{ t('projects.mineIntro') }}</p>
      </div>
    </div>
    <t-card :bordered="false">
      <FilterBar class="project-filters"
        ><template #content
          ><div class="project-toolbar list-toolbar">
            <t-input
              class="list-search"
              v-model="search"
              clearable
              :placeholder="t('projects.search')"
              @change="first"
            />
            <t-select class="list-filter" v-model="status" :options="statuses" @change="first" />
            <t-select
              class="list-filter"
              v-model="role"
              :options="roles"
              @change="first"
            /></div></template
      ></FilterBar>
      <t-table
        row-key="id"
        :data="items"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        @page-change="changePage"
      >
        <template #role="{ row }"
          ><t-tag variant="light" :theme="row.role === 'ADMIN' ? 'primary' : 'default'">{{
            t(`projects.${row.role}`)
          }}</t-tag></template
        >
        <template #status="{ row }"
          ><t-tag variant="light" :theme="row.status === 'ACTIVE' ? 'success' : 'default'">{{
            t(`projects.${row.status}`)
          }}</t-tag></template
        >
        <template #budget="{ row }">{{ budgetText(row) }}</template>
        <template #usage="{ row }">{{
          row.usage ? money(row.usage.amount, row.budget?.currency) : '—'
        }}</template>
        <template #actions="{ row }"
          ><t-space
            ><t-link theme="primary" @click="router.push(`/account/projects/${row.id}`)">{{
              t('projects.view')
            }}</t-link
            ><t-link
              v-if="
                row.role === 'ADMIN' &&
                row.status === 'ACTIVE' &&
                row.budget &&
                row.budget.status !== 'DISABLED'
              "
              theme="primary"
              v-permission.write="'personal.work_orders'"
              @click="apply(row.id)"
              >{{ t('projects.applyBudget') }}</t-link
            ></t-space
          ></template
        >
      </t-table>
    </t-card>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { PrimaryTableCol, PageInfo } from 'tdesign-vue-next'
import { getProjects, type ProjectItem } from '@/api/modules/projects'
import FilterBar from '@/components/FilterBar.vue'
import '@/styles/projects.css'
const { t, locale } = useI18n()
const route = useRoute(),
  router = useRouter()
const search = ref(''),
  status = ref(''),
  role = ref(''),
  loading = ref(false)
const items = ref<ProjectItem[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })
let version = 0
const statuses = computed(() => [
  { value: '', label: t('projects.allStatus') },
  ...['ACTIVE', 'DISABLED', 'ARCHIVED'].map((value) => ({ value, label: t(`projects.${value}`) })),
])
const roles = computed(() => [
  { value: '', label: t('projects.allRoles') },
  ...['ADMIN', 'MEMBER'].map((value) => ({ value, label: t(`projects.${value}`) })),
])
const columns = computed<PrimaryTableCol<ProjectItem>[]>(() => [
  { colKey: 'name', title: t('projects.name'), minWidth: 180 },
  { colKey: 'role', title: t('projects.role'), width: 130 },
  { colKey: 'department', title: t('projects.department'), minWidth: 190, ellipsis: true },
  { colKey: 'status', title: t('projects.projectStatus'), width: 120 },
  { colKey: 'budget', title: t('projects.budgetStatus'), width: 140 },
  { colKey: 'usage', title: t('projects.myCost'), width: 160 },
  { colKey: 'actions', title: t('projects.actions'), width: 180 },
])
function money(amount: number, currency = 'CNY') {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency }).format(amount)
}
function budgetText(p: ProjectItem) {
  return t(
    !p.budget
      ? 'projects.unconfigured'
      : p.budget.status === 'DISABLED'
        ? 'projects.budgetDisabled'
        : `projects.${p.budget.status}`,
  )
}
function apply(id: string) {
  void router.push({
    path: '/personal/work-orders',
    query: { create: 'project-budget', projectId: id },
  })
}
async function load() {
  if (route.name !== 'PersonalProjects') return
  const request = ++version
  loading.value = true
  try {
    const result = await getProjects(
      {
        page: pagination.current,
        page_size: pagination.pageSize,
        search: search.value,
        status: status.value,
        role: role.value,
      },
      true,
    )
    if (request === version) {
      items.value = result.items
      pagination.total = result.total
    }
  } catch {
    /* interceptor */
  } finally {
    if (request === version) loading.value = false
  }
}
function first() {
  pagination.current = 1
  void load()
}
function changePage(info: PageInfo) {
  pagination.current = info.current
  pagination.pageSize = info.pageSize
  void load()
}
onMounted(load)
watch([locale, () => route.params.id], load)
</script>
