<template>
  <div class="security-page">
    <t-tabs :value="tab" @change="change"
      ><t-tab-panel value="policies" :label="label('dataTitle')" /><t-tab-panel
        value="rules"
        :label="label('rulesTitle')" /><t-tab-panel
        value="discovery"
        :label="label('discoveryTitle')" /></t-tabs
    ><PolicyList v-if="tab === 'policies'" domain="DATA_CONTROL" /><RuleList
      v-else-if="tab === 'rules'"
    /><Discovery v-else />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PolicyList from '../policies/index.vue'
import RuleList from '../rules/index.vue'
import Discovery from '../discovery/index.vue'
import { useSecurity } from '../useSecurity'
const route = useRoute(),
  router = useRouter()
const { label } = useSecurity()
const tab = computed(() =>
  ['rules', 'discovery'].includes(String(route.query.tab)) ? String(route.query.tab) : 'policies',
)
function change(value: string | number) {
  void router.replace({ query: value === 'policies' ? {} : { tab: value } })
}
</script>
<style scoped>
@import '@/styles/security.css';
</style>
