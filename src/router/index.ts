import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import { setupRouterGuard } from './guard'

/** 布局路由：业务页面动态注册为其 children */
export const LAYOUT_ROUTE_NAME = 'Layout'

/**
 * 静态路由：启动即注册（含布局壳与错误页）。
 * 布局路由静态存在可消除首次导航的 "No match" 警告；业务子路由登录后按权限动态挂载，
 * 通配路由按匹配得分兜底，不影响后续 addRoute 的子路由。
 */
const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/change-password',
    alias: '/onboarding/password',
    name: 'ChangePassword',
    redirect: '/login',
    meta: { title: 'route.changePassword' },
  },
  {
    path: '/onboarding/terms',
    name: 'OnboardingTerms',
    redirect: '/login',
    meta: { title: 'route.acceptTerms' },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: 'route.login' },
  },
  {
    path: '/',
    name: LAYOUT_ROUTE_NAME,
    component: () => import('@/layouts/BasicLayout.vue'),
    children: [],
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: 'route.forbidden' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: { title: 'route.notFound' },
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes: staticRoutes,
})

setupRouterGuard(router)
