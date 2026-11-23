<template>
  <div class="header-bar">
    <div class="header-bar__left">
      <t-button variant="text" shape="square" @click="emit('toggle')">
        <t-icon :name="collapsed ? 'chevron-right-double' : 'chevron-left-double'" />
      </t-button>
      <t-breadcrumb class="header-bar__breadcrumbs">
        <t-breadcrumb-item
          v-for="item in breadcrumbs"
          :key="item.path"
          :title="item.titleKey ? t(item.titleKey) : item.title"
        >
          {{ item.titleKey ? t(item.titleKey) : item.title }}
        </t-breadcrumb-item>
      </t-breadcrumb>
    </div>

    <div class="header-bar__right">
      <t-select
        clearable
        :value="currentLocale"
        :loading="changingLanguage"
        :disabled="changingLanguage || !remoteLocales.length"
        :options="languageOptions"
        class="header-bar__language"
        :placeholder="t('header.language')"
        :aria-label="t('header.language')"
        @change="onLanguageChange"
      />
      <t-dropdown trigger="click" :options="userOptions" @click="onUserAction">
        <t-button variant="text" class="header-bar__user">
          <t-icon name="user-circle" class="header-bar__user-icon" />
          <span
            class="header-bar__username"
            :title="userDisplayName(userStore.userInfo?.name, userStore.userInfo?.username)"
            >{{ userDisplayName(userStore.userInfo?.name, userStore.userInfo?.username) }}</span
          >
          <t-icon name="chevron-down" class="header-bar__user-arrow" />
        </t-button>
      </t-dropdown>
    </div>
    <ProfileDrawer v-if="profileOpen" @close="profileOpen = false" />
    <ChangePasswordDialog v-if="passwordOpen" manual @close="passwordOpen = false" />
  </div>
</template>

<script setup lang="ts">
import ProfileDrawer from '@/views/personal/profile/ProfileDrawer.vue'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import { userDisplayName } from '@/utils/userLabel'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { DropdownProps, SelectProps } from 'tdesign-vue-next'

import { getMyProfileApi, updateMyPreferencesApi } from '@/api/modules/identity'
import { createIdempotencyKey, type NotifiedError } from '@/api/request'
import { MessagePlugin } from 'tdesign-vue-next'
import { getTimeZone } from '@/utils/datetime'
import {
  getCurrentLocale,
  getApiLocale,
  normalizeLocale,
  setApiLocale,
  setDocumentTitle,
  setLocale,
} from '@/locales'
import { menuTrail, usePermissionStore } from '@/stores/modules/permission'
import { useUserStore } from '@/stores/modules/user'
import { useLocaleOptionsStore } from '@/stores/modules/localeOptions'

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
void props // collapsed 在模板中使用

const profileOpen = ref(false)
const passwordOpen = ref(false)
const route = useRoute()
watch(
  () => route.path,
  () => {
    profileOpen.value = false
    passwordOpen.value = false
  },
)
const router = useRouter()
const { t } = useI18n()
const userStore = useUserStore()
const permissionStore = usePermissionStore()

const currentLocale = computed(() => getApiLocale())
const changingLanguage = ref(false)
/** 语言选项值使用后端注册代码。 */
const localeOptionsStore = useLocaleOptionsStore()
const remoteLocales = computed(() => localeOptionsStore.options)

/** 面包屑覆盖全部获准入口，包括 sidebar_hidden 的页面。 */
const breadcrumbs = computed(() => menuTrail(permissionStore.navigationMenus, route.meta.routeId))

/** 语言下拉只使用后端启用且有 UI 语言包的选项。 */
const languageOptions = computed<SelectProps['options']>(() =>
  remoteLocales.value.map(({ label, value }) => ({ label, value })),
)

const userOptions = computed<DropdownProps['options']>(() => [
  ...permissionStore.navigationMenus
    .filter((item) => item.sidebarHidden && item.routeId)
    .map((item) => ({ content: item.title, value: item.routeId! })),
  { content: t('header.logout'), value: 'logout' },
])

async function loadLocales() {
  try {
    if (!localeOptionsStore.attempted) await localeOptionsStore.load()
    const options = remoteLocales.value
    // 记录后端原始语言代码，保证请求 locale 入参与后端注册值一致（如 en 而非 en-US）
    const matched = options.find((option) => option.uiLocale === getCurrentLocale())
    if (matched) setApiLocale(matched.value)
  } catch {
    // 保留当前语言；目录错误由请求层提示，禁止提交未知选项。
  }
}

let preferenceAttempt: { code: string; key: string } | undefined
async function onLanguageChange(value: unknown) {
  const apiCode = String(value ?? '')
  const option = remoteLocales.value.find((item) => item.value === apiCode)
  if (!option || apiCode === currentLocale.value || changingLanguage.value) return
  const session = userStore.context.session
  if (!session) return
  if (preferenceAttempt?.code !== apiCode)
    preferenceAttempt = { code: apiCode, key: createIdempotencyKey() }
  changingLanguage.value = true
  try {
    // Save first: profile and model authorization summaries read the persisted preference.
    const saved = await updateMyPreferencesApi(
      { preferred_locale: apiCode, time_zone: getTimeZone() },
      { idempotencyKey: preferenceAttempt.key, locale: apiCode },
    )
    if (userStore.context.session?.user_id !== session.user_id) return
    session.preferred_locale = saved.preferred_locale ?? ''
    const applied = await userStore.fetchPermissionSnapshot({
      code: apiCode,
      commit: () => {
        setLocale(normalizeLocale(apiCode))
        setApiLocale(apiCode)
      },
    })
    if (!applied) return
    preferenceAttempt = undefined
    setDocumentTitle(breadcrumbs.value[breadcrumbs.value.length - 1]?.title)
    const profile = await getMyProfileApi()
    if (userStore.context.session?.user_id !== profile.id) return
    session.preferred_locale = profile.preferred_locale ?? ''
    session.time_zone = profile.time_zone
    session.display_name = profile.display_name
  } catch (error) {
    if (!(error as NotifiedError).notified) MessagePlugin.error(t('header.languageChangeFailed'))
  } finally {
    changingLanguage.value = false
  }
}

async function onUserAction({ value }: { value: string | number }) {
  const entry = permissionStore.navigationMenus.find(
    (item) => item.sidebarHidden && item.routeId === value,
  )
  if (entry?.routeId === 'profile') {
    profileOpen.value = true
    return
  }
  if (entry?.routeId === 'change_password') {
    passwordOpen.value = true
    return
  }
  if (entry) {
    await router.push(entry.path)
    return
  }
  if (value === 'logout') {
    try {
      // 登录页就绪后再清理会话，避免资源加载期间提前卸载当前业务页面。
      await import('@/views/login/index.vue')
      await userStore.logout()
      await router.replace('/login')
    } catch {
      // 请求错误由拦截器提示；退出失败时保留当前页面和会话。
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
  gap: var(--td-comp-margin-m);
  height: 100%;
  padding: 0 var(--td-comp-paddingLR-xl);
}

.header-bar__left {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--td-comp-margin-xs);
}

.header-bar__breadcrumbs {
  /* 从零宽度参与分配，避免面包屑文本抬高左区的固有最小宽度。 */
  width: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.header-bar__breadcrumbs :deep(.t-breadcrumb__item),
.header-bar__breadcrumbs :deep(.t-breadcrumb__item > *),
.header-bar__breadcrumbs :deep(.t-breadcrumb__inner) {
  min-width: 0;
}

.header-bar__breadcrumbs :deep(.t-breadcrumb__separator) {
  flex-shrink: 0;
}

.header-bar__right {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--td-comp-margin-m);
}

.header-bar__language {
  width: 160px;
  flex-shrink: 0;
}

.header-bar__user {
  min-width: 0;
}

.header-bar__user :deep(.t-button__text) {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.header-bar__username {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-bar__user-icon {
  flex-shrink: 0;
  margin-right: var(--td-comp-margin-xs);
}

.header-bar__user-arrow {
  flex-shrink: 0;
  margin-left: var(--td-comp-margin-xs);
}
</style>
