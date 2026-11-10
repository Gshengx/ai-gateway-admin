<template>
  <t-dialog
    :visible="visible"
    :header="isEdit ? t('groups.editTitle') : t('groups.createTitle')"
    width="560px"
    :close-on-overlay-click="false"
    :confirm-btn="{
      content: t('common.save'),
      loading: submitting || validating,
      disabled: loading || submitting || validating,
    }"
    :cancel-btn="{ content: t('common.cancel'), disabled: submitting || validating }"
    :close-btn="!submitting && !validating"
    :close-on-esc-keydown="!submitting && !validating"
    @confirm="handleSubmit"
    @close="onClose"
  >
    <LoadingState :loading="loading" preserve-content>
      <t-form
        :disabled="submitting || validating"
        ref="formRef"
        :data="form"
        :rules="rules"
        label-width="96px"
      >
        <t-form-item :label="t('groups.form.name')" name="name">
          <t-input
            v-model="form.name"
            :maxlength="128"
            :placeholder="t('groups.form.namePlaceholder')"
          />
        </t-form-item>
        <t-form-item :label="t('groups.form.description')" name="description">
          <t-textarea
            v-model="form.description"
            :maxlength="2048"
            :autosize="{ minRows: 3, maxRows: 5 }"
            :tips="`${form.description.length}/2048`"
            :placeholder="t('groups.form.descriptionPlaceholder')"
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
  getGroupApi,
  type CreateUserGroupPayload,
  type UpdateUserGroupPayload,
  type UserGroupItem,
} from '@/api/modules/identity'

interface GroupForm {
  name: string
  description: string
}

const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  /** 编辑目标用户组 */
  group: UserGroupItem | null
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [payload: CreateUserGroupPayload | UpdateUserGroupPayload]
}>()

const { t } = useI18n()

const isEdit = computed(() => props.mode === 'edit')

const validating = ref(false)
const formRef = ref<FormInstanceFunctions | null>(null)
const loading = ref(false)

const form = reactive<GroupForm>({ name: '', description: '' })

const rules = computed<FormRules<GroupForm>>(() => ({
  name: [{ required: true, message: t('groups.form.nameRequired') }],
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
    if (isEdit.value && props.group) {
      loading.value = true
      try {
        const { group } = await getGroupApi(props.group.id)
        if (!active || !props.visible || props.group?.id !== group.id) return
        form.name = group.name
        form.description = group.description
      } catch {
        if (active) onClose()
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
    if (loading.value) return
    const result = await formRef.value?.validate()
    if (result !== true) return

    const name = form.name.trim()
    const description = form.description.trim()

    if (isEdit.value) {
      emit('submit', { name, description })
      return
    }

    emit('submit', { name, description })
  } finally {
    validating.value = false
  }
}
</script>
