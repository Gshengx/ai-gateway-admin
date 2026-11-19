<template>
  <t-drawer
    class="terms-evidence-drawer"
    :visible="visible"
    :header="t('termsAudit.detail')"
    size="var(--terms-evidence-drawer-width)"
    :close-on-overlay-click="false"
    @close="close()"
  >
    <LoadingState :loading="loading" :failed="failed" retryable @retry="load">
      <template v-if="record">
        <t-alert theme="info" :message="t('termsAudit.snapshotNotice')" class="evidence-section" />
        <t-descriptions :column="1" class="evidence-section">
          <t-descriptions-item v-for="item in details" :key="item.label" :label="item.label"
            ><span class="evidence-value">{{ item.value || '—' }}</span></t-descriptions-item
          >
        </t-descriptions>
        <template v-if="record.content">
          <h3>{{ record.content.title }}</h3>
          <div class="evidence-body" v-html="record.content.body" />
        </template>
        <t-empty v-else :description="t('termsAudit.noContent')" />
      </template>
    </LoadingState>
    <template #footer
      ><t-button variant="outline" @click="close()">{{ t('common.close') }}</t-button></template
    >
  </t-drawer>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LoadingState from '@/components/LoadingState.vue'
import { getTermsAcceptanceApi, type TermsAcceptance } from '@/api/modules/terms'
import { useLatestRequest } from '@/utils/useLatestRequest'
import { useDrawerClose } from '@/utils/useDrawerClose'
import { formatDateTime } from '@/utils/datetime'
const props = defineProps<{ id: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { visible, close } = useDrawerClose('.terms-evidence-drawer', () => emit('close'))
const record = ref<TermsAcceptance>()
const loading = ref(true)
const failed = ref(false)
const request = useLatestRequest()
const details = computed(() => {
  const value = record.value
  if (!value) return []
  return [
    { label: t('termsAudit.evidenceId'), value: value.id },
    { label: t('termsAudit.username'), value: value.username_snapshot },
    { label: t('termsAudit.displayName'), value: value.display_name_snapshot },
    { label: t('termsAudit.userId'), value: value.user_id },
    {
      label: t('termsAudit.department'),
      value:
        value.department_snapshot.path.map((node) => node.name).join(' / ') ||
        value.department_snapshot.name,
    },
    { label: t('termsAudit.departmentId'), value: value.department_snapshot.department_id },
    { label: t('termsAudit.termsId'), value: value.terms_id },
    { label: t('termsAudit.version'), value: value.content?.version },
    { label: t('termsAudit.language'), value: value.locale_code },
    { label: t('termsAudit.acceptedAt'), value: formatDateTime(value.accepted_at) },
    { label: t('termsAudit.contentDigest'), value: value.content_digest },
    { label: t('termsAudit.evidenceDigest'), value: value.evidence_digest },
    { label: t('termsAudit.bundleDigest'), value: value.content?.bundle_digest },
  ]
})
async function load() {
  const current = request.begin()
  loading.value = true
  failed.value = false
  try {
    const result = await getTermsAcceptanceApi(props.id, { signal: current.signal })
    if (current.isCurrent()) record.value = result
  } catch {
    if (current.isCurrent()) failed.value = true
  } finally {
    if (current.isCurrent()) loading.value = false
  }
}
onMounted(load)
</script>
<style scoped>
.evidence-section {
  margin-bottom: var(--td-comp-margin-l);
}
.evidence-value {
  overflow-wrap: anywhere;
}
h3 {
  margin: 0 0 var(--td-comp-margin-l);
  font-size: var(--td-font-size-title-medium);
  font-weight: var(--td-font-weight-medium);
}
.evidence-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: var(--td-line-height-body-medium);
}
</style>
