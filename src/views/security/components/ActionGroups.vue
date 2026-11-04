<template>
  <div class="security-stack">
    <div v-for="(item, index) in groups" :key="index" class="security-group">
      <div class="security-toolbar">
        <strong>{{
          t(file ? 'security.fileCondition' : 'security.group', { n: index + 1 })
        }}</strong>
        <span class="security-spacer" />
        <template v-if="security && !file">
          <t-button
            theme="default"
            variant="text"
            :disabled="readOnly || index === 0"
            @click="move(index, -1)"
            >{{ label('up') }}</t-button
          >
          <t-button
            theme="default"
            variant="text"
            :disabled="readOnly || index === groups.length - 1"
            @click="move(index, 1)"
            >{{ label('down') }}</t-button
          >
        </template>
        <t-button theme="danger" variant="text" @click="remove(item)">{{
          label('remove')
        }}</t-button>
      </div>
      <div class="security-grid">
        <t-form-item v-if="file" :label="label('checkCondition')" required>
          <t-select v-model="item.file_checks" multiple :options="fileOptions" />
        </t-form-item>
        <t-form-item v-else :label="label('ruleScope')" required>
          <t-select
            v-model="item.selector"
            :options="
              choices(
                security
                  ? ['ALL', 'TYPES', 'IDS', 'LEVELS']
                  : ['ALL', 'IDS', 'LEVELS', 'ATTRIBUTES'],
              )
            "
            @change="((item.values = []), (item.attributes = []))"
          />
        </t-form-item>
        <t-form-item :label="label('action')" required
          ><t-select
            v-model="item.action"
            :options="choices(file || security ? ['BLOCK', 'ALERT'] : ['BLOCK', 'MASK', 'ALERT'])"
        /></t-form-item>
      </div>
      <template v-if="file">
        <t-form-item
          v-if="item.file_checks.includes('FILE_FORMAT')"
          :label="label('formats')"
          required
          ><t-select
            v-model="item.formats"
            multiple
            :options="
              ['PDF', 'XLSX', 'DOCX', 'TXT', 'CSV'].map((value) => ({ value, label: value }))
            "
        /></t-form-item>
        <div v-if="item.file_checks.includes('FILE_SIZE')" class="security-grid">
          <t-form-item :label="label('minSize')"
            ><t-input-number v-model="item.min_size_mb" :min="0" /></t-form-item
          ><t-form-item :label="label('maxSize')"
            ><t-input-number v-model="item.max_size_mb" :min="0"
          /></t-form-item>
        </div>
      </template>
      <template v-else>
        <t-form-item
          v-if="item.selector === 'LEVELS'"
          :label="label(security ? 'risk' : 'sensitivity')"
          required
          ><t-checkbox-group
            v-model="item.values"
            :options="choices(security ? risks : sensitivities)"
        /></t-form-item>
        <t-form-item v-if="item.selector === 'TYPES'" :label="label('category')" required
          ><t-select v-model="item.values" multiple :options="choices(engines)"
        /></t-form-item>
        <t-form-item v-if="item.selector === 'IDS'" :label="label('detectionRules')" required
          ><t-select
            v-model="item.values"
            multiple
            filterable
            :options="rules.map((r) => ({ value: r.id, label: name(r), disabled: !r.enabled }))"
        /></t-form-item>
        <AttributeConditions
          v-if="item.selector === 'ATTRIBUTES'"
          v-model="item.attributes"
          :fields="['category', 'sub_category', 'sensitivity_level', 'direction']"
        />
        <div v-if="item.action === 'MASK'" class="security-stack">
          <t-checkbox v-model="item.restore_response">{{ label('restore') }}</t-checkbox>
          <p class="security-help">{{ label('restoreHelp') }}</p>
          <t-alert theme="info" :message="label('maskHelp')" />
        </div>
      </template>
    </div>
    <t-button theme="primary" variant="outline" @click="add">{{
      label(file ? 'addFile' : security ? 'addDetection' : 'addGroup')
    }}</t-button>
    <p v-if="!security" class="security-help">{{ label(file ? 'fileHelp' : 'dataHelp') }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { emptyAction, type DetectionAction, type DetectionRule } from '@/api/modules/security'
import { engines, risks, sensitivities, useSecurity } from '../useSecurity'
import AttributeConditions from './AttributeConditions.vue'
const props = defineProps<{
  file?: boolean
  security?: boolean
  rules: DetectionRule[]
  readOnly?: boolean
}>()
const model = defineModel<DetectionAction[]>({ required: true })
const { t, label, choices, name } = useSecurity()
const groups = computed(() => model.value.filter((a) => a.kind === (props.file ? 'FILE' : 'RULE')))
const fileOptions = computed(() =>
  choices([
    'FILE_UPLOAD',
    'FILE_FORMAT',
    'FILE_SIZE',
    'FILE_NAME',
    'FILE_SIGNATURE',
    'FILE_HASH',
  ]).map((o) => ({
    ...o,
    disabled: ['FILE_NAME', 'FILE_SIGNATURE', 'FILE_HASH'].includes(o.value),
  })),
)
function add() {
  model.value.push({
    ...emptyAction(props.file ? 'FILE' : 'RULE'),
    selector: props.security ? 'TYPES' : 'LEVELS',
  })
}
function remove(item: DetectionAction) {
  model.value.splice(model.value.indexOf(item), 1)
}
function move(index: number, delta: number) {
  const a = groups.value[index]!,
    b = groups.value[index + delta]!
  const ai = model.value.indexOf(a),
    bi = model.value.indexOf(b)
  ;[model.value[ai], model.value[bi]] = [b, a]
}
</script>
<style scoped>
@import '@/styles/security.css';
</style>
