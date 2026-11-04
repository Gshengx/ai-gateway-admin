<template>
  <div class="security-stack">
    <div v-for="(item, index) in model" :key="index" class="security-inline">
      <t-select
        v-model="item.field"
        :options="fields.map((value) => ({ value, label: value }))"
        :placeholder="label('attributeField')"
        creatable
        filterable
      />
      <t-select v-model="item.operator" :options="choices(['EQ', 'IN', 'CONTAINS'])" />
      <t-input v-model="item.value" :placeholder="label('value')" />
      <t-button theme="danger" variant="text" @click="model.splice(index, 1)">{{
        label('remove')
      }}</t-button>
    </div>
    <t-button
      theme="primary"
      variant="outline"
      @click="model.push({ field: fields[0] || '', operator: 'EQ', value: '' })"
      >{{ label('addAttribute') }}</t-button
    >
  </div>
</template>
<script setup lang="ts">
import type { Scope } from '@/api/modules/security'
import { useSecurity } from '../useSecurity'
defineProps<{ fields: string[] }>()
const model = defineModel<Scope['attributes']>({ required: true })
const { label, choices } = useSecurity()
</script>
<style scoped>
@import '@/styles/security.css';
</style>
