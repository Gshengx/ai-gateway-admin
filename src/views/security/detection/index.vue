<template>
  <div class="security-page">
    <t-tabs :value="tab" @change="change"
      ><t-tab-panel value="policies" :label="label('detectionTitle')" /><t-tab-panel
        value="rules"
        :label="label('detectionRules')" /></t-tabs
    ><PolicyList v-if="tab === 'policies'" domain="SECURITY_DETECTION" /><RuleList
      v-else
      security
    />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PolicyList from '../policies/index.vue'
import RuleList from '../rules/index.vue'
import { useSecurity } from '../useSecurity'
const route = useRoute(),
  router = useRouter()
const { label } = useSecurity()
const tab = computed(() => (route.query.tab === 'rules' ? 'rules' : 'policies'))
function change(value: string | number) {
  void router.replace({ query: value === 'rules' ? { tab: 'rules' } : {} })
}
</script>
<style scoped>
@import '@/styles/security.css';
</style>
