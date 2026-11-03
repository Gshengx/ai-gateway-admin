<template>
  <div class="header-bar">
    <div class="header-bar__left">
      <t-button variant="text" shape="square" @click="emit('toggle')">
        <t-icon :name="collapsed ? 'chevron-right-double' : 'chevron-left-double'" />
      </t-button>
      <t-breadcrumb>
        <t-breadcrumb-item v-for="item in breadcrumbs" :key="item.path">
          {{ translateRouteTitle(item.title) }}
        </t-breadcrumb-item>
      </t-breadcrumb>
    </div>

    <div class="header-bar__right">
      <t-select
        :value="currentLocale"
        :options="languageOptions"
        class="header-bar__language"
        :placeholder="t('header.language')"
        :aria-label="t('header.language')"
        @change="onLanguageChange"
      />
      <t-dropdown trigger="click" :options="userOptions" @click="onUserAction">
        <t-button variant="text">
          <t-icon name="user-circle" class="header-bar__user-icon" />
          {{ userStore.userInfo?.name ?? '-' }}
          <t-icon name="chevron-down" class="header-bar__user-arrow" />
        </t-button>
      </t-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { DropdownProps, SelectProps } from 'tdesign-vue-next'

import { getLocaleOptionsApi, updateMyPreferencesApi } from '@/api/modules/identity'
import { getTimeZone } from '@/utils/datetime'
import {
  getCurrentLocale,
  normalizeLocale,
  setApiLocale,
  setDocumentTitle,
  setLocale,
  translateRouteTitle,
  SUPPORTED_LOCALES,
  type AppLocale,
} from '@/locales'
import { usePermissionStore } from '@/stores/modules/permission'
import { useUserStore } from '@/stores/modules/user'

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
void props // collapsed 在模板中使用

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const userStore = useUserStore()
const permissionStore = usePermissionStore()

const currentLocale = ref<AppLocale>(getCurrentLocale())
/** 语言选项：value 为前端语言包代码，code 为后端注册的原始语言代码 */
const remoteLocales = ref<Array<{ label: string; value: AppLocale; code: string }>>([])

/** 面包屑：由菜单树解析当前路由路径 */
const breadcrumbs = computed(() => {
  for (const menu of permissionStore.menus) {
    if (menu.path === route.path) return [menu]
    const child = menu.children?.find((c) => c.path === route.path)
    if (child) return [menu, child]
    const parent = menu.children?.find((c) => route.path.startsWith(`${c.path}/`))
    if (parent && route.meta.title) {
      return [menu, parent, { path: route.path, title: String(route.meta.title) }]
    }
  }
  return []
})

/** 语言下拉：优先使用后端启用的语言，失败时回退本地内置语言 */
const languageOptions = computed<SelectProps['options']>(() =>
  remoteLocales.value.length
    ? remoteLocales.value.map(({ label, value }) => ({ label, value }))
    : SUPPORTED_LOCALES.map((item) => ({ label: item.label, value: item.value })),
)

const userOptions = computed<DropdownProps['options']>(() => [
  { content: t('header.profile'), value: 'profile' },
  { content: t('header.logout'), value: 'logout' },
])

async function loadLocales() {
  try {
    const result = await getLocaleOptionsApi()
    const options: Array<{ label: string; value: AppLocale; code: string }> = []
    result.items
      .filter((item) => item.status === 'ACTIVE')
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((item) => {
        // 后端可能注册 en / zh 等简写，统一归一化为前端语言包代码
        const value = normalizeLocale(item.locale_code)
        if (options.some((option) => option.value === value)) return
        options.push({ label: item.native_name, value, code: item.locale_code })
      })
    remoteLocales.value = options
    // 记录后端原始语言代码，保证请求 locale 入参与后端注册值一致（如 en 而非 en-US）
    const matched = options.find((option) => option.value === getCurrentLocale())
    if (matched) setApiLocale(matched.code)
  } catch {
    // 后端不可用时使用本地语言列表
  }
}

async function onLanguageChange(value: unknown) {
  const locale = normalizeLocale(String(value ?? ''))
  const apiCode = remoteLocales.value.find((option) => option.value === locale)?.code ?? locale
  currentLocale.value = locale
  setLocale(locale)
  setApiLocale(apiCode)
  // 标签页标题缓存于 document.title，切换语言后需同步刷新
  setDocumentTitle(translateRouteTitle(route.meta.title))
  try {
    await updateMyPreferencesApi({ preferred_locale: apiCode, time_zone: getTimeZone() })
  } catch {
    // 偏好同步失败不影响本次切换
  }
  // 后端返回的部门/角色等名称随 locale 变化，重新加载以当前语言重新拉取
  window.location.reload()
}

async function onUserAction({ value }: { value: string | number }) {
  if (value === 'profile') {
    await router.push('/personal/keys')
    return
  }
  if (value === 'logout') {
    try {
      await userStore.logout()
    } catch {
      // Local cleanup is completed by logout.
    } finally {
      window.location.hash = '#/login'
      window.location.reload()
    }
  }
}

onMounted(loadLocales)
</script>

<style scoped>
.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 var(--td-comp-paddingLR-xl);
}

.header-bar__left {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-m);
}

.header-bar__right {
  display: flex;
  align-items: center;
  gap: var(--td-comp-margin-m);
}

.header-bar__language {
  width: 160px;
}

.header-bar__user-icon {
  margin-right: var(--td-comp-margin-xs);
}

.header-bar__user-arrow {
  margin-left: var(--td-comp-margin-xs);
}
</style>
