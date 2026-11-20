<template>
  <div class="dialog-notice" :class="`dialog-notice--${theme}`" role="status">
    <span class="dialog-notice__icon" aria-hidden="true">
      <ErrorCircleFilledIcon v-if="theme === 'warning' || theme === 'error'" />
      <CheckCircleFilledIcon v-else-if="theme === 'success'" />
      <InfoCircleFilledIcon v-else />
    </span>
    <p class="dialog-notice__message">{{ message }}</p>
  </div>
</template>
<script setup lang="ts">
import {
  CheckCircleFilledIcon,
  ErrorCircleFilledIcon,
  InfoCircleFilledIcon,
} from 'tdesign-icons-vue-next'

withDefaults(
  defineProps<{
    message: string
    theme?: 'info' | 'success' | 'warning' | 'error'
  }>(),
  { theme: 'info' },
)
</script>
<style scoped>
.dialog-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--td-comp-margin-m);
  color: var(--td-brand-color);
}
.dialog-notice--warning {
  color: var(--td-warning-color);
}
.dialog-notice--error {
  color: var(--td-error-color);
}
.dialog-notice--success {
  color: var(--td-success-color);
}
.dialog-notice__icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--td-comp-size-xs);
  height: var(--td-comp-size-xs);
  font-size: var(--td-font-size-title-large);
}
.dialog-notice__message {
  min-width: 0;
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--td-font-body-medium);
  overflow-wrap: anywhere;
  white-space: pre-line;
}
</style>
