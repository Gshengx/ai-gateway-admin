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
    <t-form
      autocomplete="off"
      :disabled="submitting || validating"
      ref="formRef"
      :data="form"
      :rules="rules"
      label-width="96px"
      :show-error-message="true"
    >
      <t-form-item :label="t('users.form.username')" name="username">
        <t-input
          v-model="form.username"
          name="managed-account"
          autocomplete="off"
          :disabled="!isCreate"
          :maxlength="128"
          :placeholder="t('users.form.usernamePlaceholder')"
        />
      </t-form-item>
      <t-form-item :label="t('users.form.displayName')" name="display_name">
        <t-input
          v-model="form.display_name"
          name="managed-display"
          autocomplete="off"
          :maxlength="128"
          :placeholder="t('users.form.displayNamePlaceholder')"
        />
      </t-form-item>
      <t-form-item :label="t('users.form.email')" name="email">
        <t-input
          v-model="form.email"
          name="managed-contact"
          autocomplete="off"
          :placeholder="t('users.form.emailPlaceholder')"
        />
      </t-form-item>
      <t-form-item :label="t('users.form.phone')" name="phone">
        <t-input
          v-model="form.phone"
          name="managed-phone"
          autocomplete="off"
          :placeholder="t('users.form.phonePlaceholder')"
        />
      </t-form-item>
      <t-form-item :label="t('users.form.department')" name="department_id">
        <t-tree-select
          v-model="form.department_id"
          :data="departmentTree"
          :tree-props="departmentTreeProps"
          :filter="() => true"
          :value-display="selectedDepartmentName"
          :loading="departmentLoading"
          :loading-text="t('users.form.departmentLoading')"
          :empty="t('users.form.departmentEmpty')"
          @search="onDepartmentSearch"
          filterable
          :input-props="{ name: 'managed-department-filter', autocomplete: 'off' }"
          :placeholder="t('users.form.departmentPlaceholder')"
        />
      </t-form-item>
      <t-form-item :label="t('users.form.role')" name="role_id">
        <t-select
          v-model="form.role_id"
          :options="roleSelectOptions"
          :placeholder="t('users.form.rolePlaceholder')"
        />
      </t-form-item>
      <t-form-item v-if="isCreate" :label="t('users.form.password')" name="initial_password">
        <t-input
          v-model="form.initial_password"
          name="managed-initial-password"
          type="password"
          autocomplete="new-password"
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
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstanceFunctions, FormRules, TreeProps } from 'tdesign-vue-next'

import { getDepartmentDetailApi, getDepartmentListApi } from '@/api/modules/identity'
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^1[3-9]\d{9}$/
const USERNAME_RE = /^[A-Za-z0-9._-]{2,128}$/

const isCreate = computed(() => props.mode === 'create')

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
const departmentKeyword = ref('')
const departmentLoading = ref(false)
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
  load: async (node) => {
    if (departmentKeyword.value) return []
    const session = departmentSession
    try {
      const result = await getDepartmentListApi({ parent_id: String(node.value) })
      if (session !== departmentSession) return []
      const children = departmentNodes(result.items)
      const attach = (nodes: DepartmentNode[]): boolean => {
        for (const item of nodes) {
          if (item.value === node.value) {
            item.children = children
            return true
          }
          if (Array.isArray(item.children) && attach(item.children)) return true
        }
        return false
      }
      attach(lazyDepartments.value)
      return children
    } catch {
      // Request errors are reported by the request interceptor.
      return []
    }
  },
  expandAll: Boolean(departmentKeyword.value),
}))

function onDepartmentSearch(value: string) {
  clearTimeout(searchTimer)
  const version = ++searchVersion
  const session = departmentSession
  const keyword = value.trim()
  departmentKeyword.value = keyword
  searchDepartments.value = []
  departmentLoading.value = Boolean(keyword)
  if (!keyword) return
  searchTimer = setTimeout(async () => {
    try {
      const result = await getDepartmentListApi({ search: keyword })
      if (version !== searchVersion || session !== departmentSession) return
      const nodes = departmentNodes(result.items)
      const byId = new Map(nodes.map((node) => [node.value, node]))
      const roots: DepartmentNode[] = []
      nodes.forEach((node) => {
        node.children = undefined
      })
      result.items.forEach((item, index) => {
        const node = nodes[index]!
        const parent = item.parent_id ? byId.get(item.parent_id) : undefined
        if (parent) {
          if (!Array.isArray(parent.children)) parent.children = []
          parent.children.push(node)
        } else roots.push(node)
      })
      searchDepartments.value = roots
    } catch {
      // Request errors are reported by the request interceptor.
    } finally {
      if (version === searchVersion && session === departmentSession)
        departmentLoading.value = false
    }
  }, 300)
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

function resetDepartmentRequests() {
  departmentSession++
  searchVersion++
  clearTimeout(searchTimer)
  departmentKeyword.value = ''
  searchDepartments.value = []
  departmentLoading.value = false
}

onBeforeUnmount(resetDepartmentRequests)

function isWeakPassword(password: string): boolean {
  if (password.length < 8 || password.length > 32) return true
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  return classes < 3
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
              : { result: false, message: t('users.form.passwordRule') }
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
    nextTick(() => formRef.value?.clearValidate())
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
    emit('submit', base)
  } finally {
    validating.value = false
  }
}
</script>
