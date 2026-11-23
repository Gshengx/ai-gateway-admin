<template>
  <t-drawer
    :visible="visible"
    :header="isCreate ? t('users.form.createTitle') : t('users.form.editTitle')"
    size="520px"
    :close-on-overlay-click="false"
    destroy-on-close
    :close-on-esc-keydown="!submitting && !validating"
    @close="onClose"
  >
    <DrawerSaving :loading="submitting" />
    <t-form
      autocomplete="off"
      ref="formRef"
      :data="form"
      :rules="rules"
      label-width="96px"
      :show-error-message="true"
    >
      <t-form-item :label="t('users.form.username')" name="username">
        <t-input
          clearable
          v-model="form.username"
          name="managed-account"
          autocomplete="section-managed-user username"
          :readonly="focusedTextField !== 'username'"
          @focus="focusedTextField = 'username'"
          @blur="focusedTextField = ''"
          :disabled="!isCreate"
          :maxlength="128"
          :placeholder="t('users.form.usernamePlaceholder')"
        />
      </t-form-item>
      <t-form-item :label="t('users.form.displayName')" name="display_name">
        <t-input
          clearable
          v-model="form.display_name"
          name="managed-display"
          autocomplete="off"
          :readonly="focusedTextField !== 'display_name'"
          @focus="focusedTextField = 'display_name'"
          @blur="focusedTextField = ''"
          :maxlength="128"
          :placeholder="t('users.form.displayNamePlaceholder')"
        />
      </t-form-item>
      <t-form-item :label="t('users.form.email')" name="email">
        <t-input
          clearable
          v-model="form.email"
          name="managed-contact"
          autocomplete="off"
          :readonly="focusedTextField !== 'email'"
          @focus="focusedTextField = 'email'"
          @blur="focusedTextField = ''"
          :placeholder="t('users.form.emailPlaceholder')"
        />
      </t-form-item>
      <t-form-item :label="t('users.form.phone')" name="phone">
        <t-input
          clearable
          v-model="form.phone"
          name="managed-phone"
          autocomplete="off"
          :readonly="focusedTextField !== 'phone'"
          @focus="focusedTextField = 'phone'"
          @blur="focusedTextField = ''"
          :placeholder="t('users.form.phonePlaceholder')"
        />
      </t-form-item>
      <t-form-item :label="t('users.form.department')" name="department_id">
        <div class="department-select-controls">
          <t-tree-select
            clearable
            @clear="clearDepartment"
            v-model="form.department_id"
            :disabled="isInitialAdmin"
            :input-value="departmentPopupVisible ? departmentKeyword : ''"
            :data="departmentTree"
            :tree-props="departmentTreeProps"
            :popup-props="{ overlayInnerClassName: 'department-tree-popup' }"
            :filter="() => true"
            :value-display="() => selectedDepartmentName"
            :title="selectedDepartmentName"
            :loading="departmentLoading"
            :loading-text="t('users.form.departmentLoading')"
            :empty="t('users.form.departmentEmpty')"
            @search="onDepartmentSearch"
            @input-change="onDepartmentSearch"
            @popup-visible-change="onDepartmentPopupChange"
            filterable
            :input-props="{
              name: 'managed-department-filter',
              autocomplete: 'off',
            }"
            :placeholder="t('users.form.departmentPlaceholder')"
          />
        </div>
      </t-form-item>
      <t-form-item :label="t('users.form.role')" name="role_id">
        <t-select
          clearable
          v-model="form.role_id"
          :disabled="isInitialAdmin"
          :options="roleSelectOptions"
          :placeholder="t('users.form.rolePlaceholder')"
        />
      </t-form-item>
      <t-form-item
        v-if="isCreate"
        class="password-form-item"
        :label="t('users.form.password')"
        name="initial_password"
      >
        <t-input
          clearable
          v-model="form.initial_password"
          name="managed-initial-password"
          type="password"
          autocomplete="section-managed-user new-password"
          :placeholder="t('users.form.passwordPlaceholder')"
        />
      </t-form-item>
    </t-form>

    <template #footer>
      <t-space>
        <t-button variant="outline" :disabled="submitting || validating" @click="onClose">{{
          t('common.cancel')
        }}</t-button>
        <t-button theme="primary" :loading="submitting || validating" @click="handleSubmit">
          {{ t('common.save') }}
        </t-button>
      </t-space>
    </template>
  </t-drawer>
</template>

<script setup lang="ts">
import DrawerSaving from '@/components/DrawerSaving.vue'
import { useTreeBranches } from '@/utils/useTreeBranches'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores/modules/user'
import type { FormInstanceFunctions, FormRules, TreeProps } from 'tdesign-vue-next'

import { getDepartmentDetailApi, getDepartmentListApi } from '@/api/modules/identity'
import { useDepartmentScope } from '@/utils/useDepartmentScope'
import type {
  DepartmentItem,
  CreateUserPayload,
  RoleOption,
  UpdateUserPayload,
  UserItem,
} from '@/api/modules/identity'

interface UserForm {
  username: string
  display_name: string
  email: string
  phone: string
  department_id: string
  role_id: string
  initial_password: string
}

const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  user: UserItem | null
  roleOptions: RoleOption[]
  defaultDepartmentId: string
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [payload: CreateUserPayload | UpdateUserPayload]
}>()

const { t, locale } = useI18n()
useDepartmentScope(() => {
  resetDepartmentRequests()
  lazyDepartments.value = []
  departmentNames.clear()
  if (props.visible) void initializeDepartments()
})
const userStore = useUserStore()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^1[3-9]\d{9}$/
const USERNAME_RE = /^[A-Za-z0-9._-]{2,128}$/

const isCreate = computed(() => props.mode === 'create')
const isInitialAdmin = computed(() => !isCreate.value && props.user?.is_initial_admin === true)

const validating = ref(false)
const formRef = ref<FormInstanceFunctions | null>(null)

function emptyForm(): UserForm {
  return {
    username: '',
    display_name: '',
    email: '',
    phone: '',
    department_id: '',
    role_id: '',
    initial_password: '',
  }
}

const form = reactive<UserForm>(emptyForm())

interface DepartmentNode {
  value: string
  label: string
  children?: true | DepartmentNode[]
}

const lazyDepartments = ref<DepartmentNode[]>([])
const searchDepartments = ref<DepartmentNode[]>([])
const searchExpanded = ref<Array<string | number>>([])
const browseExpanded = ref<Array<string | number>>([])
const departmentPopupVisible = ref(false)
const departmentKeyword = ref('')
const departmentLoading = ref(false)
const focusedTextField = ref('')
const departmentNames = reactive(new Map<string, string>())
let departmentSession = 0
let searchVersion = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
const departmentTree = computed(() =>
  departmentKeyword.value ? searchDepartments.value : lazyDepartments.value,
)
const selectedDepartmentName = computed(() => departmentNames.get(form.department_id) ?? '')

function departmentNodes(items: DepartmentItem[]): DepartmentNode[] {
  return items.map((item) => {
    const label = item.display_name || item.name
    departmentNames.set(item.id, label)
    return { value: item.id, label, children: item.has_children ? true : undefined }
  })
}

const departmentBranches = useTreeBranches(lazyDepartments, async (id, signal) => {
  const result = await getDepartmentListApi({ parent_id: id })
  return signal.aborted ? [] : departmentNodes(result.items)
})
const searchBranches = useTreeBranches(searchDepartments, async (id, signal) => {
  const result = await getDepartmentListApi({ parent_id: id })
  return signal.aborted ? [] : departmentNodes(result.items)
})

const departmentTreeProps = computed<TreeProps>(() => ({
  lazy: true,
  label: (h, nodeModel) => {
    const text = String(nodeModel.data.label ?? nodeModel.label ?? '')
    const keyword = departmentKeyword.value
    if (!keyword) return text
    const index = text.toLowerCase().indexOf(keyword.toLowerCase())
    if (index < 0) return text
    const end = index + keyword.length
    return h('span', [
      text.slice(0, index),
      h(
        'mark',
        {
          class: 'user-dept-hit',
          // 下拉弹层 teleport 到 body，scoped CSS 无法作用于此处，因此使用内联样式。
          style: {
            color: 'var(--td-brand-color)',
            background: 'var(--td-brand-color-light)',
            borderRadius: 'var(--td-radius-small)',
            padding: '0 1px',
          },
        },
        text.slice(index, end),
      ),
      text.slice(end),
    ])
  },
  expanded: departmentKeyword.value ? searchExpanded.value : browseExpanded.value,
  onExpand: (values, context) => {
    if (departmentKeyword.value) {
      searchExpanded.value = values
      searchBranches.onExpand(values, context)
    } else {
      browseExpanded.value = values
      departmentBranches.onExpand(values, context)
    }
  },
  icon: departmentKeyword.value ? searchBranches.icon : departmentBranches.icon,
}))

function onDepartmentSearch(value: string) {
  if (value.trim() === departmentKeyword.value) return
  searchBranches.invalidate()
  clearTimeout(searchTimer)
  const version = ++searchVersion
  const session = departmentSession
  const keyword = value.trim()
  departmentKeyword.value = keyword
  searchDepartments.value = []
  departmentLoading.value = Boolean(keyword)
  if (!keyword) {
    if (departmentPopupVisible.value && !lazyDepartments.value.length)
      void restoreDepartmentRoots(version, session)
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const result = await getDepartmentListApi({ search: keyword })
      if (version !== searchVersion || session !== departmentSession) return
      const nodes = departmentNodes(result.items)
      const byId = new Map(nodes.map((node) => [node.value, node]))
      const roots: DepartmentNode[] = []
      result.items.forEach((item, index) => {
        const node = nodes[index]!
        const parent = item.parent_id ? byId.get(item.parent_id) : undefined
        if (parent) {
          if (!Array.isArray(parent.children)) parent.children = []
          parent.children.push(node)
        } else roots.push(node)
      })
      searchDepartments.value = roots
      searchExpanded.value = nodes
        .filter((node) => Array.isArray(node.children))
        .map((node) => node.value)
    } catch {
      // Request errors are reported by the request interceptor.
    } finally {
      if (version === searchVersion && session === departmentSession)
        departmentLoading.value = false
    }
  }, 300)
}

async function restoreDepartmentRoots(version: number, session: number) {
  departmentLoading.value = true
  try {
    const result = await getDepartmentListApi()
    if (version !== searchVersion || session !== departmentSession) return
    lazyDepartments.value = departmentNodes(result.items)
  } catch {
    // Request errors are reported by the request interceptor.
  } finally {
    if (version === searchVersion && session === departmentSession) departmentLoading.value = false
  }
}

async function onDepartmentPopupChange(visible: boolean) {
  departmentPopupVisible.value = visible
  if (!visible) {
    onDepartmentSearch('')
    await nextTick()
    if (!departmentPopupVisible.value) {
      const selected = form.department_id
      const name = departmentNames.get(selected)
      resetDepartmentRequests(true)
      lazyDepartments.value = []
      departmentNames.clear()
      if (name) departmentNames.set(selected, name)
    }
    return
  }
  await nextTick()
  if (!departmentPopupVisible.value) return
  const session = departmentSession
  const selected = form.department_id
  const isCurrent = () =>
    session === departmentSession && selected === form.department_id && !departmentKeyword.value
  if (selected) {
    const name = departmentNames.get(selected)
    if (name) onDepartmentSearch(name)
    else {
      try {
        const detail = await getDepartmentDetailApi(selected)
        if (!isCurrent()) return
        const label = detail.translations[locale.value]?.name || detail.name
        departmentNames.set(selected, label)
        onDepartmentSearch(label)
      } catch {
        // Request errors are reported by the request interceptor.
      }
    }
    return
  }
  if (!lazyDepartments.value.length) {
    try {
      const result = await getDepartmentListApi()
      if (!isCurrent()) return
      lazyDepartments.value = departmentNodes(result.items)
    } catch {
      return
    }
  }
}

function clearDepartment() {
  if (isInitialAdmin.value || props.submitting || validating.value) return
  form.department_id = ''
  onDepartmentSearch('')
}

async function initializeDepartments() {
  const session = departmentSession
  const selectedId = form.department_id
  const selected = props.user?.department
  if (!isCreate.value && selected) {
    departmentNames.set(selected.id, selected.display_name || selected.name)
  }
  const rootRequest = async () => {
    try {
      const result = await getDepartmentListApi()
      if (session === departmentSession) lazyDepartments.value = departmentNodes(result.items)
    } catch {
      // Request errors are reported by the request interceptor.
    }
  }
  const nameRequest = async () => {
    if (!selectedId || departmentNames.has(selectedId)) return
    try {
      const detail = await getDepartmentDetailApi(selectedId)
      if (session !== departmentSession) return
      const translation = detail.translations[locale.value]
      departmentNames.set(selectedId, translation?.name || detail.name)
    } catch {
      // Request errors are reported by the request interceptor.
    }
  }
  await Promise.all([rootRequest(), nameRequest()])
}

function resetDepartmentRequests(keepFieldFocus = false) {
  browseExpanded.value = []
  departmentPopupVisible.value = false
  searchBranches.invalidate()
  searchExpanded.value = []
  departmentBranches.invalidate()
  if (!keepFieldFocus) focusedTextField.value = ''
  departmentSession++
  searchVersion++
  clearTimeout(searchTimer)
  departmentKeyword.value = ''
  searchDepartments.value = []
  departmentLoading.value = false
}

onBeforeUnmount(resetDepartmentRequests)

function isWeakPassword(password: string): boolean {
  const policy = userStore.context.password_rules
  if (!policy || password.length < policy.min_length || password.length > policy.max_length)
    return true
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  return classes < policy.complexity_categories
}

const rules = computed<FormRules<UserForm>>(() => ({
  username: isCreate.value
    ? [
        { required: true, message: t('users.form.usernameRequired') },
        { pattern: USERNAME_RE, message: t('users.form.usernameRule') },
      ]
    : [],
  display_name: [{ required: true, message: t('users.form.displayNameRequired') }],
  email: [
    {
      validator: (value) => {
        const text = String(value ?? '').trim()
        return !text || EMAIL_RE.test(text)
          ? true
          : { result: false, message: t('users.form.emailRule') }
      },
    },
  ],
  phone: [
    {
      validator: (value) => {
        const text = String(value ?? '').trim()
        return !text || PHONE_RE.test(text)
          ? true
          : { result: false, message: t('users.form.phoneRule') }
      },
    },
  ],
  department_id: [{ required: true, message: t('users.form.departmentRequired') }],
  role_id: [{ required: true, message: t('users.form.roleRequired') }],
  initial_password: isCreate.value
    ? [
        { required: true, message: t('users.form.passwordRequired') },
        {
          validator: (value) => {
            const text = String(value ?? '')
            return !text || !isWeakPassword(text)
              ? true
              : {
                  result: false,
                  message: userStore.context.password_rules
                    ? t('users.form.passwordRule', { ...userStore.context.password_rules })
                    : t('common.loadFailed'),
                }
          },
        },
      ]
    : [],
}))

const roleSelectOptions = computed(() =>
  props.roleOptions.map((role) => ({ label: role.display_name, value: role.id })),
)

watch(
  () => props.visible,
  (visible) => {
    resetDepartmentRequests()
    if (!visible) return
    lazyDepartments.value = []
    departmentNames.clear()
    Object.assign(form, emptyForm())
    if (!isCreate.value && props.user) {
      Object.assign(form, {
        username: props.user.username,
        display_name: props.user.display_name,
        email: props.user.email ?? '',
        phone: props.user.phone ?? '',
        department_id: props.user.department?.id ?? '',
        role_id: props.user.role?.id ?? '',
      })
    } else {
      form.department_id = props.defaultDepartmentId
    }
    void initializeDepartments()
  },
  { immediate: true },
)

function onClose() {
  if (props.submitting || validating.value) return
  emit('update:visible', false)
}

async function handleSubmit() {
  if (validating.value || props.submitting) return
  validating.value = true
  try {
    const result = await formRef.value?.validate()
    if (result !== true) return

    const base = {
      display_name: form.display_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      department_id: form.department_id,
      role_id: form.role_id,
    }

    if (isCreate.value) {
      emit('submit', {
        username: form.username.trim(),
        initial_password: form.initial_password,
        ...base,
      })
      return
    }
    emit(
      'submit',
      isInitialAdmin.value
        ? { display_name: base.display_name, email: base.email, phone: base.phone }
        : base,
    )
  } finally {
    validating.value = false
  }
}
</script>

<style scoped>
.password-form-item :deep(.t-input__extra) {
  position: static;
  overflow: visible;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
