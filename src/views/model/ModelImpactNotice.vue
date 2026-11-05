<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getModelImpactApi, type ModelImpact } from '@/api/modules/modelImpact'

const props = defineProps<{ resource: 'providers' | 'models' | 'logical-models'; id: string }>()
const emit = defineEmits<{ blocked: [value: boolean] }>()
const { t } = useI18n()
const impact = ref<ModelImpact>()
watch(
  () => [props.resource, props.id] as const,
  async ([resource, id], _previous, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    emit('blocked', true)
    impact.value = undefined
    try {
      const result = await getModelImpactApi(resource, id)
      if (!active) return
      impact.value = result
      emit('blocked', result.blocking_codes.length > 0)
    } catch {
      /* 请求层提示；读取失败不允许盲删。 */
    }
  },
  { immediate: true },
)
</script>

<template>
  <t-alert
    v-if="impact"
    :theme="impact.blocking_codes.length ? 'warning' : 'info'"
    :message="
      t('models.impactSummary', {
        mounts: impact.mount_count,
        grants: impact.grant_count,
        jobs: impact.active_job_count,
        remote: impact.remote_obligation_count,
      })
    "
  >
    <template v-if="impact.blocking_codes.length" #description>{{
      t('models.impactBlocked', { codes: impact.blocking_codes.join(', ') })
    }}</template>
  </t-alert>
</template>
