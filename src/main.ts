import { createApp } from 'vue'
import TDesign from 'tdesign-vue-next'

import App from './App.vue'
import { i18n } from '@/locales'
import { router } from '@/router'
import { pinia } from '@/stores'
import { permissionDirective } from '@/directives/permission'
import { nonnegativeNumberDirective } from '@/directives/nonnegativeNumber'
import { installOverlayStack } from '@/utils/overlayStack'

import 'tdesign-vue-next/es/style/index.css'
import '@/styles/index.css'
import '@/styles/security.css'

const app = createApp(App)
const disposeOverlayStack = installOverlayStack()
if (import.meta.hot) import.meta.hot.dispose(disposeOverlayStack)

app.use(pinia)
app.use(i18n)
app.use(router)
app.use(TDesign)
app.directive('permission', permissionDirective)
app.directive('nonnegative-number', nonnegativeNumberDirective)

app.mount('#app')
