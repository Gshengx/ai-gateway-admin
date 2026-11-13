import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteMockServe } from 'vite-plugin-mock'
import { localMockPlugin } from './mock/_hybridPlugin'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd())
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [
      vue(),
      localMockPlugin(proxyTarget, env.VITE_USE_MOCK !== 'true'),
      // Mock 模式：npm run dev:mock；默认 dev 直连真实后端（走代理）
      viteMockServe({
        mockPath: 'mock',
        // 多实例或编译失败时，目录可能残留 bundle-require 的临时模块。
        ignore: /\.bundled_.*\.(mjs|cjs)$/,
        enable: command === 'serve' && env.VITE_USE_MOCK === 'true',
        watchFiles: true,
        logger: true,
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // 依赖预构建：避免开发过程中发现新依赖触发重新优化（整页刷新、卡顿）
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
        'axios',
        'dayjs',
        'vue-i18n',
        'tdesign-vue-next',
        'tdesign-icons-vue-next',
        'echarts/core',
        'echarts/charts',
        'echarts/components',
        'echarts/renderers',
      ],
    },
    server: {
      port: 5173,
      host: true,
      // 启动即预热关键页面，消除登录后首次导航的按需编译等待
      warmup: {
        clientFiles: [
          './src/main.ts',
          './src/App.vue',
          './src/layouts/**/*.vue',
          './src/views/login/index.vue',
          './src/views/dashboard/index.vue',
          './src/views/common/*.vue',
          './src/views/error/*.vue',
          './src/components/*.vue',
        ],
      },
      proxy: {
        [env.VITE_API_PREFIX || '/api']: {
          target: proxyTarget,
          changeOrigin: true,
          // 后端校验 Origin 必须与其自身同源，代理转发时重写为后端地址
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Origin', proxyTarget)
            })
          },
        },
      },
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            tdesign: ['tdesign-vue-next'],
            echarts: ['echarts'],
            vendor: ['vue', 'vue-router', 'pinia', 'axios', 'vue-i18n'],
          },
        },
      },
    },
  }
})
