<template>
  <t-drawer
    :visible="visible"
    :header="t(project ? 'projects.edit' : 'projects.create')"
    size="var(--project-form-width)"
    :close-on-overlay-click="false"
    @close="emit('close')"
  >
    <t-form class="project-form" label-align="top" :data="form">
      <section>
        <h3>{{ t('projects.basic') }}</h3>
        <t-form-item :label="t('projects.name')" required-mark
          ><t-input
            v-model="form.name"
            :maxlength="100"
            :placeholder="t('projects.namePlaceholder')"
        /></t-form-item>
        <t-form-item :label="t('projects.description')"
          ><t-textarea
            v-model="form.description"
            :maxlength="500"
            :placeholder="t('projects.descriptionPlaceholder')"
        /></t-form-item>
      </section>
      <section>
        <h3>{{ t('projects.permissions') }}</h3>
        <t-form-item :label="t('projects.department')" required-mark>
          <div class="field-stack">
            <DepartmentTreeSelect
              v-model="form.department_id"
              :resolve-descendants="false"
              :searchable="false"
              :clearable="false"
            />
            <div class="hint">
              {{ t('projects.departmentHint') }}
              <t-tooltip :content="t('projects.saveBeforeBudget')" :disabled="Boolean(project?.id)">
                <t-link theme="primary" :disabled="!project?.id" @click="budget">{{
                  t('projects.budgetLink')
                }}</t-link>
              </t-tooltip>
            </div>
          </div>
        </t-form-item>
        <t-form-item :label="t('projects.admin')" required-mark
          ><div class="field-stack">
            <ProjectPicker
              v-model="form.admin_ids"
              :placeholder="t('projects.adminPlaceholder')"
            /><span class="hint">{{ t('projects.adminHint') }}</span>
          </div></t-form-item
        >
        <t-form-item>
          <template #label
            ><span class="member-label"
              ><span>{{ t('projects.members') }}</span
              ><span class="hint">{{
                t('projects.selectedCount', { count: form.member_ids.length })
              }}</span></span
            ></template
          >
          <div class="field-stack">
            <ProjectPicker
              v-model="form.member_ids"
              show-selection
              :exclude="form.admin_ids"
              :placeholder="t('projects.memberPlaceholder')"
            /><span class="hint">{{ t('projects.memberHint') }}</span>
          </div></t-form-item
        >
      </section>
      <section>
        <h3>{{ t('projects.strategy') }}</h3>
        <t-form-item :label="t('projects.modelPolicy')"
          ><div class="field-stack">
            <ProjectPicker
              v-model="form.model_ids"
              kind="model"
              :placeholder="t('projects.modelPlaceholder')"
            /><span class="hint">{{ t('projects.modelHint') }}</span>
          </div></t-form-item
        >
      </section>
    </t-form>
    <template #footer>
      <t-space>
        <t-button theme="default" @click="emit('close')">{{ t('projects.cancel') }}</t-button>
        <t-button theme="primary" :loading="saving" @click="save">{{
          t(project ? 'projects.save' : 'projects.createSubmit')
        }}</t-button>
      </t-space>
    </template>
  </t-drawer>
</template>
<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  createProject,
  updateProject,
  type ProjectItem,
  type ProjectPayload,
} from '@/api/modules/projects'
import DepartmentTreeSelect from '@/components/DepartmentTreeSelect.vue'
import ProjectPicker from './ProjectPicker.vue'
const props = defineProps<{ visible: boolean; project: ProjectItem | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t } = useI18n()
const router = useRouter()
const saving = ref(false)
const form = reactive<ProjectPayload>({
  name: '',
  description: '',
  department_id: 'd-root',
  admin_ids: [],
  member_ids: [],
  model_ids: [],
})
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    const p = props.project
    Object.assign(
      form,
      p
        ? {
            name: p.name,
            description: p.description,
            department_id: p.department_id,
            admin_ids: [...p.admin_ids],
            member_ids: [...p.member_ids],
            model_ids: [...p.model_ids],
          }
        : {
            name: '',
            description: '',
            department_id: 'd-root',
            admin_ids: [],
            member_ids: [],
            model_ids: [],
          },
    )
  },
  { immediate: true },
)
function budget() {
  if (!props.project?.id) return
  emit('close')
  void router.push({
    path: '/cost/budgets',
    query: { tab: 'projects', projectId: props.project.id },
  })
}
async function save() {
  if (saving.value) return
  if (!form.name.trim() || !form.department_id || !form.admin_ids.length) {
    MessagePlugin.warning(t('projects.required'))
    return
  }
  saving.value = true
  try {
    const data = {
      ...form,
      name: form.name.trim(),
      member_ids: form.member_ids.filter((id) => !form.admin_ids.includes(id)),
    }
    await (props.project ? updateProject(props.project.id, data) : createProject(data))
    MessagePlugin.success(t('projects.success'))
    emit('saved')
    emit('close')
  } catch {
    /* Shared interceptor displays the error. */
  } finally {
    saving.value = false
  }
}
</script>
<style scoped>
.project-form,
.field-stack {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
  width: 100%;
}
.project-form {
  gap: var(--td-comp-margin-l);
}
h3 {
  margin: 0 0 var(--td-comp-margin-l);
  font-size: var(--td-font-size-title-small);
}
.hint {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.member-label {
  display: flex;
  justify-content: space-between;
  gap: var(--td-comp-margin-l);
  width: 100%;
}
</style>
