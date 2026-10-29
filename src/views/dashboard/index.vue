<template>
  <div class="page-container">
    <t-row :gutter="[16, 16]">
      <t-col v-for="card in kpiCards" :key="card.title" :span="3">
        <t-card :bordered="false">
          <div class="kpi">
            <div class="kpi__title">{{ card.title }}</div>
            <div class="kpi__value">{{ card.value }}</div>
            <div class="kpi__desc">{{ card.desc }}</div>
          </div>
        </t-card>
      </t-col>
    </t-row>

    <chart-card class="dashboard__chart" :title="t('dashboard.trend')" :option="trendOption" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChartCard, { type ChartOption } from '@/components/ChartCard.vue'

const { t } = useI18n()

// TODO: 接入仪表盘统计接口（原型对应：月活用户/受治理请求/Token 用量/上架模型）
const kpiCards = computed(() => [
  { title: t('dashboard.kpi.mau'), value: '14', desc: t('dashboard.kpi.mauDesc') },
  { title: t('dashboard.kpi.governed'), value: '263', desc: t('dashboard.kpi.governedDesc') },
  { title: t('dashboard.kpi.tokens'), value: '1.2M', desc: t('dashboard.kpi.tokensDesc') },
  { title: t('dashboard.kpi.models'), value: '5', desc: t('dashboard.kpi.modelsDesc') },
])

const dates = ['09/19', '09/20', '09/21', '09/22', '09/23', '09/24', '09/25']
const values = [4.88, 9.55, 6.08, 8.96, 7.26, 6.87, 2.17]

const trendOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 48, right: 24, top: 32, bottom: 32 },
  xAxis: { type: 'category', data: dates },
  yAxis: { type: 'value', name: '¥' },
  series: [{ type: 'line', smooth: true, areaStyle: {}, data: values }],
}))
</script>

<style scoped>
.kpi__title {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.kpi__value {
  margin: 8px 0;
  font-size: 28px;
  font-weight: 600;
}

.kpi__desc {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.dashboard__chart {
  margin-top: 16px;
}
</style>
