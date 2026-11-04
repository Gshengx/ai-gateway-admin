<template>
  <div class="security-stack">
    <div class="security-grid">
      <t-form-item :label="label('accessTime')"
        ><div class="security-time-range">
          <t-time-picker v-model="model.time_start" format="HH:mm" allow-input clearable /><span>{{
            label('to')
          }}</span
          ><t-time-picker v-model="model.time_end" format="HH:mm" allow-input clearable /></div
      ></t-form-item>
      <t-form-item :label="label('sourceIps')"
        ><div class="security-stack">
          <t-textarea
            :value="model.source_ips.join('\n')"
            :placeholder="label('eachLine')"
            @change="model.source_ips = lines($event)"
          /><t-checkbox v-if="!allowlist" v-model="model.exclude_ips">{{
            label('excludeIps')
          }}</t-checkbox>
        </div></t-form-item
      >
      <template v-if="model.time_start || model.time_end">
        <t-form-item :label="label('days')"
          ><t-checkbox-group v-model="model.days" :options="days"
        /></t-form-item>
        <t-form-item :label="label('timeZone')"><t-input v-model="model.time_zone" /></t-form-item>
      </template>
      <t-form-item :label="label('clients')"
        ><t-textarea
          :value="model.clients.join('\n')"
          :placeholder="label('eachLine')"
          @change="model.clients = lines($event)"
      /></t-form-item>
      <t-form-item v-if="allowlist" :label="label('terminalIds')"
        ><t-textarea
          :value="model.terminal_ids.join('\n')"
          :placeholder="label('eachLine')"
          @change="model.terminal_ids = lines($event)"
      /></t-form-item>
      <t-form-item v-else :label="label('terminals')"
        ><div class="security-stack">
          <t-select
            v-model="model.terminal_type"
            :options="choices(['ALL', 'MANAGED', 'UNMANAGED', 'SPECIFIED'])"
          /><t-textarea
            v-if="model.terminal_type === 'SPECIFIED'"
            :value="model.terminal_ids.join('\n')"
            :placeholder="label('terminalIds')"
            @change="model.terminal_ids = lines($event)"
          /><t-alert
            v-if="model.terminal_type !== 'ALL'"
            theme="warning"
            :message="label('terminalHelp')"
          /></div
      ></t-form-item>
    </div>
    <p v-if="!allowlist" class="security-help">{{ label('environmentHelp') }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { Environment } from '@/api/modules/security'
import { useSecurity } from '../useSecurity'
defineProps<{ allowlist?: boolean }>()
const model = defineModel<Environment>({ required: true })
const { label, choices } = useSecurity()
const days = computed(() =>
  [1, 2, 3, 4, 5, 6, 7].map((value) => ({ value, label: label(`day${value}`) })),
)
const lines = (value: string) =>
  value
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
</script>
<style scoped>
@import '@/styles/security.css';
</style>
