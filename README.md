# AI 安全网关管理端

`ais-gateway-admin` 是 AI 安全网关的 Web 管理端，提供模型与供应商接入、身份与权限管理、费用明细、系统管理及个人中心等入口。

菜单和业务路由由后端 navigation 与 capabilities 动态决定；部分入口仍为占位页。功能是否可用，应以当前后端契约、账号权限和页面实现为准。

## 技术栈

| 分类       | 技术                                                 |
| ---------- | ---------------------------------------------------- |
| 框架与语言 | Vue 3.5、Composition API、TypeScript 5.6（strict）   |
| 构建       | Vite 6                                               |
| UI         | TDesign Vue Next、TDesign Icons                      |
| 路由与状态 | Vue Router 4（History 模式）、Pinia 2                |
| 请求       | Axios                                                |
| 国际化     | vue-i18n 11，中英文语言包                            |
| 图表与日期 | ECharts 5、Day.js                                    |
| 开发工具   | ESLint 9、Prettier 3、Husky、lint-staged、Commitlint |
| Mock       | vite-plugin-mock、开发服务共享 Mock 中间件           |

具体版本以 [package.json](package.json) 和 `package-lock.json` 为准。

## 快速开始

### 环境准备

- Node.js：项目声明 `>=18`；Vite 6 的 Node.js 支持范围为 18、20、22 及以上，建议使用 Node.js 22 LTS。
- npm：使用 npm 与仓库内的 `package-lock.json` 安装依赖。
- 默认开发模式需要能够访问内网后端；登录账号向项目维护人员获取，本文不保存凭据。

在项目根目录执行：

```bash
npm ci
npm run dev
```

默认访问 [http://localhost:5173](http://localhost:5173)，登录页为 [http://localhost:5173/login](http://localhost:5173/login)。默认端口被占用时 Vite 可能选择其他端口，以终端实际输出为准；项目验收优先使用 5173。

### 开发模式

| 命令               | 数据来源                 | 说明                                                         |
| ------------------ | ------------------------ | ------------------------------------------------------------ |
| `npm run dev`      | 真实后端 + 部分业务 Mock | 认证、权限及已接入接口走代理；消费明细本地业务由开发服务处理 |
| `npm run dev:mock` | 完整 Mock                | 使用 `mock/` 中的模拟认证及业务处理器                        |

默认模式不会在后端失败后回退到 Mock，也不会为本地业务追加权限。菜单和读写能力仍由真实后端授权。本地业务响应可通过 `X-AIS-Local-Mock: true` 识别。

混合模式的共享业务数据保存在开发服务进程内，刷新页面和跨页读取保持一致，重启开发服务会恢复样例。具体范围、鉴权和数据隔离见 [本地混合 Mock 模式](docs/本地混合Mock模式.md)。完整 Mock 的账号说明见 [Mock 账号配置](docs/Mock账号配置.md)。

## 常用命令

| 命令                 | 用途                                       |
| -------------------- | ------------------------------------------ |
| `npm ci`             | 按锁文件安装依赖                           |
| `npm run dev`        | 启动默认开发服务                           |
| `npm run dev:mock`   | 启动完整 Mock 服务                         |
| `npm run type-check` | 使用 `vue-tsc --noEmit` 检查类型           |
| `npm run check:i18n` | 检查语言包键、插值参数、静态调用及消息编译 |
| `npm run lint`       | 执行 ESLint，包含自动修复，会修改文件      |
| `npm run format`     | 使用 Prettier 格式化整个项目，会修改文件   |
| `npm run build`      | 先检查类型，再构建生产产物到 `dist/`       |
| `npm run preview`    | 本地预览构建产物；需先执行构建             |

## 环境配置

| 文件               | 生效场景           |
| ------------------ | ------------------ |
| `.env`             | 所有模式共享配置   |
| `.env.development` | `npm run dev`      |
| `.env.mock`        | `npm run dev:mock` |
| `.env.production`  | `npm run build`    |

如需本地覆盖，可使用对应的 `.env.local` 或 `.env.<mode>.local`，修改后重启开发服务。

| 变量                | 说明                                                            |
| ------------------- | --------------------------------------------------------------- |
| `VITE_APP_TITLE`    | 浏览器标签页应用名称                                            |
| `VITE_API_PREFIX`   | API 前缀，当前为 `/api`；请求基础地址为 `${VITE_API_PREFIX}/v1` |
| `VITE_USE_MOCK`     | `true` 时启用完整 Mock                                          |
| `VITE_PROXY_TARGET` | 开发代理目标，默认开发配置指向内网后端                          |

所有 `VITE_` 变量均可能进入客户端产物，不得存放密码、密钥等敏感信息。新增变量须同步维护 `src/env.d.ts`。

开发代理在 `vite.config.ts` 中配置，转发时会重写 `Origin` 以适配后端同源校验。生产环境使用相对 API 路径，由部署层提供反向代理；`VITE_PROXY_TARGET` 不会为静态产物提供运行时代理。

## 目录结构

```text
ais-gateway-admin/
├── deploy/                 # Nginx、HTTPS、Jenkins、K3s 部署配置与脚本
├── docs/                   # 开发规范、接口契约、业务 PRD 与联调说明
├── mock/                   # 按业务域划分的 Mock 与共享运行状态
├── public/                 # 原样复制的静态资源
├── scripts/                # 国际化等工程检查脚本
├── src/
│   ├── api/
│   │   ├── modules/        # 按业务域封装的 API
│   │   ├── request.ts      # 统一 Axios 实例及请求、响应拦截器
│   │   └── types.ts        # 通用响应与分页类型
│   ├── components/         # 跨业务通用组件
│   ├── directives/         # 权限等全局指令
│   ├── layouts/            # 页面布局
│   ├── locales/            # 公共及业务中英文语言包
│   ├── router/             # 静态路由、动态业务路由映射、守卫
│   ├── stores/             # Pinia 状态
│   ├── styles/             # 全局基础样式与公共尺寸
│   ├── utils/              # 日期、弹层等公共工具
│   └── views/              # 业务页面
├── AGENTS.md               # 项目级任务与验收规范
├── Jenkinsfile             # CI/CD 流水线
├── package.json
└── vite.config.ts
```

## 主要业务入口

浏览器访问时将路径接在站点地址后，例如 `http://localhost:5173/model/models`。入口可见性取决于当前账号的后端导航与权限。

| 业务                             | 主要路径                                                        |
| -------------------------------- | --------------------------------------------------------------- |
| 概览                             | `/`、`/dashboard`                                               |
| 供应商、模型                     | `/model/providers`、`/model/models`                             |
| 用户、用户组、角色               | `/identity/users`、`/identity/groups`、`/identity/roles`        |
| 托管密钥                         | `/identity/keys`                                                |
| 账单和预算（占位页）、消费明细   | `/cost/bills`、`/cost/expenses`、`/cost/budgets`                |
| 系统配置、管理审计、条款同意记录 | `/system/settings`、`/system/logs`、`/system/terms-acceptances` |
| 个人资料、个人密钥               | `/account`、`/account/keys`                                     |

## 开发约定

开始修改前先阅读 [AGENTS.md](AGENTS.md) 和 [前端开发规范](docs/前端开发规范.md)。以下仅列出关键约束，详细要求以原文为准：

- 使用 Vue 3 `<script setup lang="ts">`、TDesign 组件及 `--td-*` 样式变量，复用全局基础样式。
- 请求统一经 `src/api/modules` 和 `src/api/request.ts`；响应拦截器拆壳后，业务层直接使用 `data`。
- 真实会话使用 HttpOnly Cookie；CSRF、幂等键及统一错误提示由请求层处理。
- 权限来自后端 capabilities：`can_read` 控制页面，`can_write` 控制写操作，不设置前端超管旁路。
- 分页使用 `page` 与 `page_size`，依据后端 `total`、`total_pages` 展示，不以当前页本地切片代替服务端分页。
- 用户可见文案同时维护中英文；日期时间统一经 `src/utils/datetime.ts` 按个人时区转换。
- 模型管理与供应商引导复用 `src/views/model/access/InvocationEditor.vue`；协议、路径、保存映射及验收遵循 `AGENTS.md` 第 4.3 节。
- Mock 必须复用共享状态，遵循真实接口契约，并覆盖跨页面写入、读回、重复操作和历史分页。
- 提交信息遵循 Conventional Commits；提交钩子使用 Husky、lint-staged 和 Commitlint。

变更后执行相应检查：

```bash
npm run type-check
npm run check:i18n
npm run lint
npm run build
```

浏览器验收优先使用 Playwright，在 5173 端口验证相关页面与跨页面流程。检查命令通过不替代浏览器端验收，具体清单见项目规范。

## 构建与部署

```bash
npm ci
npm run build
```

构建产物位于 `dist/`。部署层需托管静态文件，并将 `/api` 转发到后端。完整 Mock 与本地混合 Mock 的服务中间件不作为生产后端发布。

History 模式要求部署服务器将前端页面路径回退到 `index.html`，以支持直接访问和刷新子页面。仓库的 `deploy/k8s/ais-gateway.yaml` 已配置 `try_files $uri $uri/ /index.html`；外层 Nginx 分别代理 API 和前端页面。更换静态托管方式时须保留此回退，API 与静态资源仍按各自规则处理，不应回退为页面。开发服务与 `npm run preview` 支持页面回退。

仓库提供 Nginx HTTPS、Jenkins 与 K3s 的部署方案，以及 Windows 手动更新脚本。环境准备、证书、发布及自检步骤见 [部署说明](deploy/README.md) 和 [HTTPS 配置说明](deploy/HTTPS.md)。执行部署脚本前应确认目标环境与发布权限。

## 相关文档

- [前端技术选型](docs/前端技术选型文档.md)
- [API 接口与字段字典](docs/04B-API接口与字段字典.md)
- [前端协同对接指南](docs/07-前端协同对接指南.md)
- [模型接入接口与功能时序](docs/模型接入模块-前端接口与功能时序-V2.6.0.md)
- [前端完整导航对接清单](docs/前端完整导航对接清单.md)
- [权限接入说明](docs/GET-me-permissions-前端接入说明-V1.1.0.md)
- [多语言前端对接](docs/多语言前端对接.md)
- [登录条款快照接口与调用流程](docs/登录条款快照接口与调用流程.md)

原型与后端联调地址见 `AGENTS.md`；账号仅用于授权的本地访问与联调，不应复制到 README、代码或日志中。
