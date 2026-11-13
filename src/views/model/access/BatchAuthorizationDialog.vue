<template>
  <t-dialog
    dialog-class-name="model-access-dialog"
    :visible="true"
    :header="t('ma.batchGrant')"
    width="var(--physical-model-dialog-width)"
    :close-btn="!saving"
    :close-on-esc-keydown="!saving"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('ma.addGrant'), loading: saving }"
    :cancel-btn="{ content: t('ma.cancel'), disabled: saving }"
    @close="!saving && emit('close')"
    @confirm="save"
  >
    <div class="ma-stack" :inert="saving">
      <div class="ma-stack">
        <strong>{{ t('ma.selectedModels') }}</strong>
        <div>{{ models.map((model) => model.model_id_at_gateway).join('、') }}</div>
      </div>
      <t-form label-align="top" required-mark-position="right">
        <t-form-item v-for="kind in kinds" :key="kind" :label="t('ma.' + kind)">
          <SubjectSelect v-model="subjects[kind]" :type="kind" />
        </t-form-item>
      </t-form>
      <p v-if="error" class="ma-error" role="alert">{{ error }}</p>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { accessApi, type Subject } from '@/api/modules/modelAccess'
import type { ModelListItem } from '@/api/modules/modelAccessContract'
import SubjectSelect from './SubjectSelect.vue'

const props = defineProps<{ models: Pick<ModelListItem, 'id' | 'model_id_at_gateway'>[] }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t } = useI18n()
const kinds: Subject[] = ['DEPARTMENT', 'USER_GROUP', 'USER']
const subjects = reactive<Record<Subject, string[]>>({ DEPARTMENT: [], USER_GROUP: [], USER: [] })
const saving = ref(false)
const error = ref('')
async function save() {
  if (saving.value) return
  error.value = ''
  const grants = kinds.flatMap((subject_type) =>
    subjects[subject_type].map((subject_id) => ({ subject_type, subject_id })),
  )
  if (!grants.length) {
    error.value = t('ma.batchGrantSubjectsRequired')
    return
  }
  if (!props.models.length || props.models.length > 100) {
    error.value = t('ma.batchGrantModelLimit')
    return
  }
  saving.value = true
  try {
    await accessApi.batchGrant(
      props.models.map((model) => model.id),
      grants,
    )
    MessagePlugin.success(t('ma.success'))
    emit('saved')
    emit('close')
  } catch {
    // Keep selected subjects for retry; the shared request layer reports the error.
  } finally {
    saving.value = false
  }
}
</script>
<style scoped src="./access.css"></style>
