import { createApp } from 'vue'
import TDesign from 'tdesign-vue-next'

import App from './App.vue'
import { i18n } from '@/locales'
import { router } from '@/router'
import { pinia } from '@/stores'
import { permissionDirective } from '@/directives/permission'

import 'tdesign-vue-next/es/style/index.css'
import '@/styles/index.css'

const app = createApp(App)

app.use(pinia)
app.use(i18n)
app.use(router)
app.use(TDesign)
app.directive('permission', permissionDirective)

app.mount('#app')
