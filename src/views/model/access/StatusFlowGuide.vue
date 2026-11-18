<template>
  <div class="status-flow-guide">
    <t-popup v-model:visible="visible" trigger="click" placement="bottom-right">
      <t-button
        class="status-flow-guide__trigger"
        theme="default"
        variant="text"
        :aria-expanded="visible"
        aria-controls="model-status-flow-guide"
        @keydown.esc="visible = false"
      >
        <template #icon><t-icon name="info-circle" /></template>
        {{ t('ma.statusFlowGuide') }}
      </t-button>
      <template #content>
        <section
          id="model-status-flow-guide"
          class="status-flow-guide__content"
          :aria-label="t('ma.statusFlowGuide')"
          @keydown.esc="visible = false"
        >
          <h4 class="status-flow-guide__title">{{ t('ma.statusFlowGuide') }}</h4>
          <div class="status-flow-guide__steps">
            <template v-for="(step, index) in steps" :key="step">
              <t-icon v-if="index" name="chevron-right" aria-hidden="true" />
              <span>{{ t('ma.' + step) }}</span>
            </template>
          </div>
          <dl class="status-flow-guide__states">
            <div v-for="state in states" :key="state.status" class="status-flow-guide__state">
              <dt>{{ t('ma.' + state.status) }}</dt>
              <dd>{{ t('ma.' + state.hint) }}</dd>
            </div>
          </dl>
        </section>
      </template>
    </t-popup>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const visible = ref(false)
const steps = ['DRAFT', 'statusFlowAdmission', 'PENDING_REVIEW', 'ACTIVE']
const states = [
  { status: 'DRAFT', hint: 'draftFlowDescription' },
  { status: 'TESTING', hint: 'testingFlowDescription' },
  { status: 'PENDING_REVIEW', hint: 'pendingReviewFlowDescription' },
  { status: 'ACTIVE', hint: 'activeFlowDescription' },
  { status: 'SUSPENDED', hint: 'suspendedFlowDescription' },
  { status: 'RETIRED', hint: 'retiredFlowDescription' },
]
</script>
<style scoped>
.status-flow-guide {
  margin-inline-start: auto;
  flex-shrink: 0;
}
.status-flow-guide__trigger {
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-small);
}
.status-flow-guide__content {
  max-width: min(var(--model-status-explanation-width), 80vw);
  max-height: var(--model-status-flow-max-height);
  overflow-y: auto;
  padding: var(--td-comp-paddingTB-s) var(--td-comp-paddingLR-s);
  white-space: normal;
  word-break: normal;
  overflow-wrap: anywhere;
  color: var(--td-text-color-secondary);
  font: var(--td-font-body-small);
}
.status-flow-guide__title {
  margin: 0 0 var(--td-comp-margin-s);
  color: var(--td-text-color-primary);
  font: var(--td-font-body-medium);
  font-weight: var(--td-font-weight-600);
}
.status-flow-guide__steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--td-comp-margin-xs);
  color: var(--td-text-color-primary);
}
.status-flow-guide__states {
  margin: var(--td-comp-margin-m) 0 0;
}
.status-flow-guide__state + .status-flow-guide__state {
  margin-top: var(--td-comp-margin-s);
}
.status-flow-guide__state dt {
  color: var(--td-text-color-primary);
  font: var(--td-font-mark-small);
}
.status-flow-guide__state dd {
  margin: var(--td-comp-margin-xs) 0 0;
}
</style>
