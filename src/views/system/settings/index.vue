<template>
  <div class="settings-page">
    <div class="settings-page__tabs">
      <t-tabs v-model="activeTab" :bordered="false">
        <t-tab-panel value="notice" :label="t('terms.tabs.notice')" />
        <t-tab-panel value="password" :label="t('passwordPolicy.tab')" />
      </t-tabs>
    </div>
    <div class="settings-page__content">
      <div class="settings-page__container">
        <terms-notice-panel v-if="activeTab === 'notice'" />
        <password-policy-panel v-else-if="activeTab === 'password'" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TermsNoticePanel from './components/TermsNoticePanel.vue'
import PasswordPolicyPanel from './components/PasswordPolicyPanel.vue'
const { t } = useI18n()
const activeTab = ref('notice')
</script>
<style scoped>
.settings-page {
  height: 100%;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.settings-page__tabs {
  flex-shrink: 0;
  overflow-y: hidden;
  scrollbar-gutter: stable;
  background: var(--td-bg-color-container);
  padding: 0 var(--td-comp-paddingLR-xl);
  border-bottom: 1px solid var(--td-component-border);
}
.settings-page__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  background: var(--td-bg-color-page);
}
.settings-page__container {
  width: 100%;
  min-width: 0;
}
</style>
