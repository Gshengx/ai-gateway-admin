<template>
  <t-button @click="open = true">{{
    t(password ? 'changePassword.title' : 'profile.title')
  }}</t-button>
  <ChangePasswordDialog v-if="open && password" manual @close="open = false" />
  <ProfileDrawer v-if="open && !password" @close="open = false" />
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ProfileDrawer from './ProfileDrawer.vue'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
const { t } = useI18n()
const route = useRoute()
const open = ref(true)
const password = computed(() => route.meta.routeId === 'change_password')
watch(
  () => route.path,
  () => {
    open.value = true
  },
)
</script>
