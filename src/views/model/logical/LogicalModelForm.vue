<template>
  <t-dialog
    :visible="visible"
    :header="t(model ? 'logicalModels.editTitle' : 'logicalModels.create')"
    :confirm-btn="{
      content: t('logicalModels.save'),
      loading: busy,
      disabled: !name.trim() || busy,
    }"
    :cancel-btn="t('logicalModels.cancel')"
    :close-on-overlay-click="false"
    @close="close"
    @confirm="submit"
  >
    <t-form label-align="top">
      <t-form-item :label="t('logicalModels.name')" required>
        <t-input
          v-model="name"
          :disabled="(!!model && !supportsLogicalRename) || !!createdId"
          :maxlength="
            model && name === model.logical_name ? Math.max(80, Array.from(name).length) : 80
          "
          :placeholder="t('logicalModels.namePlaceholder')"
        />
      </t-form-item>
      <p>{{ t('logicalModels.nameHint') }}</p>
      <t-form-item :label="t('logicalModels.description')">
        <t-textarea
          v-model="description"
          :disabled="!!createdId"
          :maxlength="240"
          :placeholder="t('logicalModels.descriptionPlaceholder')"
          indicator
        />
      </t-form-item>
      <template v-if="!model">
        <t-form-item :label="t('logicalModels.initialMounts')">
          <t-loading :loading="loading">
            <t-checkbox-group v-model="selection" class="mount-list">
              <t-checkbox v-for="item in physical" :key="item.id" :value="item.id">
                {{ item.model_id_at_provider }} ·
                {{ t(`logicalModels.physicalStatuses.${item.status}`) }} ·
                {{ providerNames[item.provider_id] || item.provider_id }}
              </t-checkbox>
            </t-checkbox-group>
          </t-loading>
        </t-form-item>
        <p>{{ t('logicalModels.initialMountsHint') }}</p>
      </template>
    </t-form>
  </t-dialog>
  <t-dialog
    v-model:visible="renameVisible"
    :header="t('logicalModels.renameTitle')"
    :confirm-btn="{ content: t('logicalModels.confirm'), loading: busy }"
    :cancel-btn="t('logicalModels.cancel')"
    @confirm="save"
  >
    {{ t('logicalModels.renameConfirm', { old: model?.logical_name, name: name.trim() }) }}
  </t-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  createLogicalModelApi,
  updateLogicalModelApi,
  renameLogicalModelApi,
  supportsLogicalRename,
  mountLogicalModelApi,
  type LogicalModel,
} from '@/api/modules/logicalModels'
import { getModelsApi, type PhysicalModelItem } from '@/api/modules/models'
import { getProvidersApi } from '@/api/modules/providers'
import { canReadResource, useUserStore } from '@/stores/modules/user'
const props = defineProps<{ visible: boolean; model: LogicalModel | null }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; saved: [] }>()
const { t } = useI18n()
const user = useUserStore()
const name = ref('')
const description = ref('')
const selection = ref<string[]>([])
const physical = ref<PhysicalModelItem[]>([])
const providerNames = ref<Record<string, string>>({})
const busy = ref(false)
const loading = ref(false)
const renameVisible = ref(false)
const createdId = ref('')
watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    name.value = props.model?.logical_name || ''
    description.value = props.model?.description || ''
    selection.value = []
    physical.value = []
    createdId.value = ''
    if (props.model) return
    loading.value = true
    try {
      let page = 1
      let total = 1
      while (page <= total && canReadResource(user.permissions, 'model.models')) {
        const result = await getModelsApi({ page, page_size: 100 })
        physical.value.push(...result.items)
        total = result.total_pages
        page++
      }
      page = 1
      total = 1
      while (page <= total && canReadResource(user.permissions, 'model.providers')) {
        const result = await getProvidersApi({ page, page_size: 100 })
        Object.assign(
          providerNames.value,
          Object.fromEntries(result.items.map((x) => [x.id, x.name])),
        )
        total = result.total_pages
        page++
      }
    } catch {
      /* 拦截器统一提示。 */
    } finally {
      loading.value = false
    }
  },
)
function close() {
  if (!busy.value) emit('update:visible', false)
}
function submit() {
  if (props.model && name.value.trim() !== props.model.logical_name) renameVisible.value = true
  else void save()
}
async function save() {
  if (busy.value || !name.value.trim()) return
  busy.value = true
  try {
    if (props.model) {
      if (name.value.trim() !== props.model.logical_name)
        await renameLogicalModelApi(
          props.model.id,
          name.value.trim(),
          description.value,
          props.model.logical_name,
        )
      else
        await updateLogicalModelApi(props.model.id, {
          description: description.value,
          reason: 'admin-console',
        })
    } else {
      if (!createdId.value)
        createdId.value = (
          await createLogicalModelApi({
            logical_name: name.value.trim(),
            display_name: name.value.trim(),
            description: description.value,
            translations: [],
            reason: 'admin-console',
          })
        ).resource_id
      // 创建成功后保留 ID；挂载失败重试不会重复创建，也不会重复挂载已成功项。
      for (const id of [...selection.value]) {
        await mountLogicalModelApi(createdId.value, {
          physical_model_id: id,
          confirm_existing_grant_impact: true,
          reason: 'admin-console',
        })
        selection.value = selection.value.filter((x) => x !== id)
      }
    }
    renameVisible.value = false
    emit('update:visible', false)
    emit('saved')
    MessagePlugin.success(t('logicalModels.savedToast'))
  } catch {
    /* 保留表单以便重试，拦截器已提示。 */
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>
.mount-list {
  display: flex;
  flex-direction: column;
  gap: var(--td-comp-margin-s);
}
p {
  color: var(--td-text-color-secondary);
  margin: var(--td-comp-margin-s) 0 var(--td-comp-margin-l);
}
</style>
