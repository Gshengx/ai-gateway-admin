<template>
  <main class="access-state-page">
    <section class="access-state-content" :aria-labelledby="titleId">
      <t-icon :name="icon" size="var(--td-comp-size-xxxxl)" class="access-state-icon" />
      <p v-if="code" class="access-state-code" aria-hidden="true">{{ code }}</p>
      <h1 :id="titleId">{{ title }}</h1>
      <p class="access-state-description">{{ description }}</p>
      <slot />
    </section>
  </main>
</template>

<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{ title: string; description: string; code?: string; icon?: string }>(), {
  icon: 'lock-on',
})
const titleId = useId()
</script>

<style scoped>
.access-state-page {
  min-height: 100dvh;
  width: 100%;
  display: grid;
  place-items: center;
  padding: var(--td-comp-paddingTB-xxl) var(--td-comp-paddingLR-xl);
  background: var(--td-bg-color-page);
}
.access-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--td-comp-margin-l);
  min-width: 0;
  max-width: 100%;
  text-align: center;
  overflow-wrap: anywhere;
}
.access-state-icon {
  color: var(--td-brand-color);
}
.access-state-code {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font-size: var(--td-font-size-headline-large);
  font-weight: var(--td-font-weight-600);
}
.access-state-content h1 {
  margin: 0;
  color: var(--td-text-color-primary);
  font-size: var(--td-font-size-title-large);
}
.access-state-description {
  margin: 0;
  color: var(--td-text-color-secondary);
  font-size: var(--td-font-size-body-medium);
}
</style>
