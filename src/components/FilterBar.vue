<template>
  <t-card :bordered="false" class="filter-bar">
    <slot name="content">
      <t-form label-width="0" colon prevent-submit-default @submit="onSearch">
        <t-row :gutter="[16, 16]">
          <slot />
          <t-col :flex="1">
            <t-space>
              <t-button theme="primary" type="submit">{{ t('common.search') }}</t-button>
              <t-button theme="default" variant="base" @click="onReset">{{
                t('common.reset')
              }}</t-button>
            </t-space>
          </t-col>
        </t-row>
      </t-form>
    </slot>
  </t-card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * 列表页筛选区通用容器。
 * 用法：在默认插槽中放置 <t-col><t-form-item label="用户名"><t-input /></t-form-item></t-col>，
 * 查询/重置通过事件抛出，由页面绑定表单数据后自行请求。
 */
const { t } = useI18n()

const emit = defineEmits<{
  search: []
  reset: []
}>()

// t-form 的 submit 事件参数为 { e, validateResult }，非原生 Event；表单已配置 prevent-submit-default
function onSearch() {
  emit('search')
}

function onReset() {
  emit('reset')
}
</script>

<style scoped>
.filter-bar {
  margin-bottom: var(--td-comp-margin-l);
}
.filter-bar :deep(.t-card__body) {
  padding: 0;
}
</style>
