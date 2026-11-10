<template>
  <div
    class="loading-boundary"
    :class="{
      'loading-boundary--sized': height,
      'loading-boundary--resolved': !loading,
    }"
    :style="{ '--loading-boundary-height': height }"
  >
    <div
      v-if="preserveContent"
      class="loading-region"
      :class="{ 'loading-region--pending': loading || failed }"
      :aria-busy="loading"
    >
      <div
        class="loading-region__content"
        :inert="loading || failed"
        :aria-hidden="loading || failed"
      >
        <slot />
      </div>
      <div v-if="loading || failed" class="loading-region__feedback">
        <div v-if="loading" class="loading-state" role="status" :aria-label="t('common.loading')">
          <t-loading :text="t('common.loading')" />
        </div>
        <t-alert v-else theme="error" :message="t('common.loadFailed')">
          <template v-if="retryable" #operation>
            <t-button variant="text" @click="emit('retry')">{{ t('common.retry') }}</t-button>
          </template>
        </t-alert>
      </div>
    </div>
    <div v-else-if="loading" class="loading-state" role="status" :aria-label="t('common.loading')">
      <t-loading :text="t('common.loading')" />
    </div>
    <t-alert v-else-if="failed" theme="error" :message="t('common.loadFailed')">
      <template v-if="retryable" #operation>
        <t-button variant="text" @click="emit('retry')">{{ t('common.retry') }}</t-button>
      </template>
    </t-alert>
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  loading: boolean
  failed?: boolean
  retryable?: boolean
  height?: string
  preserveContent?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<style scoped>
.loading-boundary {
  display: contents;
}
.loading-boundary--sized {
  height: var(--loading-boundary-height);
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: auto;
  scrollbar-gutter: stable;
  gap: var(--td-comp-margin-l);
}
.loading-boundary--sized > * {
  flex-shrink: 0;
}
.loading-boundary--sized > .loading-state {
  flex-shrink: 1;
  padding: 0;
  min-height: 0;
}

.loading-region,
.loading-region__content {
  display: contents;
}

.loading-region--pending {
  position: relative;
  display: flow-root;
}

.loading-region--pending > .loading-region__content {
  display: flow-root;
  visibility: hidden;
  pointer-events: none;
}

.loading-region__feedback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-state {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--td-comp-paddingTB-xl) var(--td-comp-paddingLR-l);
}
</style>
