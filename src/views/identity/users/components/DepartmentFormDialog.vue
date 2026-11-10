<template>
  <t-dialog
    :visible="visible"
    :header="
      isEdit ? t('users.departments.form.editTitle') : t('users.departments.form.createTitle')
    "
    width="480px"
    :close-on-overlay-click="false"
    :confirm-btn="{
      content: t('common.save'),
      loading: submitting || validating,
      disabled: loading || loadFailed || submitting || validating || !!limitMessage,
    }"
    :cancel-btn="{ content: t('common.cancel'), disabled: submitting || validating }"
    :close-btn="!submitting && !validating"
    :close-on-esc-keydown="!submitting && !validating"
    @confirm="handleSubmit"
    @close="onClose"
  >
    <LoadingState :loading="loading" preserve-content :failed="loadFailed">
      <t-alert v-if="limitMessage" class="dept-limit" theme="warning" :message="limitMessage" />
      <t-form
        :disabled="submitting || validating"
        ref="formRef"
        :data="form"
        :rules="rules"
        label-width="88px"
      >
        <t-form-item :label="t('users.departments.form.parent')">
          <t-input :value="parentLabel" disabled />
        </t-form-item>
        <t-form-item :label="t('users.departments.form.name')" name="name">
          <t-input
            v-model="form.name"
            :maxlength="128"
            :placeholder="t('users.departments.form.namePlaceholder')"
          />
        </t-form-item>
        <t-form-item :label="t('users.departments.form.description')" name="description">
          <t-textarea
            v-model="form.description"
            :maxlength="2048"
            :autosize="{ minRows: 3, maxRows: 5 }"
            :tips="`${form.description.length}/2048`"
            :placeholder="t('users.departments.form.descriptionPlaceholder')"
          />
        </t-form-item>
      </t-form>
    </LoadingState>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingState from '@/components/LoadingState.vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-vue-next'

import {
  getDepartmentDetailApi,
  type CreateDepartmentPayload,
  type DepartmentItem,
  type DepartmentTranslation,
  type UpdateDepartmentPayload,
} from '@/api/modules/identity'

interface DepartmentForm {
  name: string
  description: string
}

const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  /** 编辑目标部门 */
  department: DepartmentItem | null
  /** 新建时的上级部门 */
  parent: DepartmentItem | null
  /** 上级部门完整路径（只读展示） */
  parentLabel: string
  /** 同级部门（编辑时已排除自身），用于同级重名校验与 sort_order 计算 */
  siblings: DepartmentItem[]
  /** 新建时父级所在层级（根节点为 1 级） */
  parentLevel: number
  /** 当前部门总数，用于 1 万上限提示 */
  totalCount: number
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [payload: CreateDepartmentPayload | UpdateDepartmentPayload]
}>()

const { t } = useI18n()

const isEdit = computed(() => props.mode === 'edit')

const validating = ref(false)
const formRef = ref<FormInstanceFunctions | null>(null)
const loading = ref(false)
const loadFailed = ref(false)
const translations = ref<Record<string, DepartmentTranslation>>({})
const sortOrder = ref(0)

const form = reactive<DepartmentForm>({ name: '', description: '' })

/** 部门层级上限（含根节点）与部门总数上限 */
const MAX_DEPARTMENT_LEVEL = 10
const MAX_DEPARTMENTS = 10000

const nextLevel = computed(() => props.parentLevel + 1)

/** 新建时校验层级与总数限制（编辑不改变层级） */
const limitMessage = computed(() => {
  if (isEdit.value) return ''
  if (nextLevel.value > MAX_DEPARTMENT_LEVEL) {
    return t('users.departments.form.levelLimit', { max: MAX_DEPARTMENT_LEVEL })
  }
  if (props.totalCount >= MAX_DEPARTMENTS) {
    return t('users.departments.form.totalLimit', { max: MAX_DEPARTMENTS })
  }
  return ''
})

/** 同级部门名称不可重复（同时比较原始名称与当前语言展示名） */
function isDuplicateName(value: string): boolean {
  const name = (value ?? '').trim().toLowerCase()
  if (!name) return false
  return props.siblings.some(
    (item) =>
      item.name.trim().toLowerCase() === name || item.display_name.trim().toLowerCase() === name,
  )
}

const rules = computed<FormRules<DepartmentForm>>(() => ({
  name: [
    { required: true, message: t('users.departments.form.nameRequired') },
    {
      validator: (value: string) => !isDuplicateName(value),
      message: t('users.departments.form.nameDuplicate'),
    },
  ],
}))

watch(
  () => props.visible,
  async (visible, _previous, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    if (!visible) return
    loading.value = false
    form.name = ''
    form.description = ''
    loadFailed.value = false
    translations.value = {}
    sortOrder.value = 0
    loading.value = false

    if (isEdit.value && props.department) {
      loading.value = true
      try {
        // 编辑时拉取详情以带上多语言翻译，避免提交时丢失其它语言名称
        const detail = await getDepartmentDetailApi(props.department.id)
        if (!active) return
        form.name = detail.name
        form.description = detail.description
        translations.value = detail.translations ?? {}
        sortOrder.value = detail.sort_order
      } catch {
        if (active) loadFailed.value = true
      } finally {
        if (active) loading.value = false
      }
    }
    nextTick(() => formRef.value?.clearValidate())
  },
  { immediate: true },
)

function onClose() {
  if (props.submitting || validating.value) return
  emit('update:visible', false)
}

async function handleSubmit() {
  if (validating.value || props.submitting) return
  validating.value = true
  try {
    if (loading.value || loadFailed.value) return
    const result = await formRef.value?.validate()
    if (result !== true) return

    const name = form.name.trim()
    const description = form.description.trim()

    if (isEdit.value) {
      emit('submit', {
        name,
        description,
        sort_order: sortOrder.value,
        translations: translations.value,
      })
      return
    }

    emit('submit', {
      name,
      description,
      parent_id: props.parent?.id ?? '',
      sort_order: props.siblings.length + 1,
      translations: {},
    })
  } finally {
    validating.value = false
  }
}
</script>

<style scoped>
.dept-limit {
  margin-bottom: var(--td-comp-margin-l);
}
</style>
