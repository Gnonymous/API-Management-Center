# GEMINI.md - CLI Proxy API Management Center 指令上下文

## 项目概览
本项目是 **CLIProxyAPI** 的官方 Web 管理界面（Management UI）。它是一个单页面应用（SPA），旨在通过 CLIProxyAPI 的管理 API (`/v0/management`) 进行交互，实现对代理服务器的全面配置和监控。

### 核心技术栈
- **框架**: React 19 (TypeScript 5.9)
- **构建工具**: Vite 7 + `vite-plugin-singlefile` (生成单文件 `index.html`)
- **状态管理**: Zustand
- **路由**: React Router v7
- **网络请求**: Axios
- **国际化**: i18next
- **UI 组件**: 自定义 SCSS Modules, Chart.js (图表), CodeMirror 6 (编辑器)

## 目录结构
- `src/pages/`: 路由级页面组件（如 `DashboardPage`, `AiProvidersPage`, `ConfigPage`）。
- `src/components/`: 可复用的 UI 和业务组件。
- `src/services/`: 
    - `api/`: 后端接口集成，包含 `client.ts` (基础配置) 和各模块 API。
    - `storage/`: 本地存储处理，包含加密存储逻辑。
- `src/stores/`: Zustand 状态库（如 `useAuthStore`, `useConfigStore`）。
- `src/router/`: 路由配置 (`MainRoutes.tsx`)。
- `src/types/`: 全局 TypeScript 类型定义。
- `src/utils/`: 工具函数。
- `scripts/`: 运维和同步脚本。

## 开发与构建指令
| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动 Vite 开发服务器 (默认: http://localhost:5173) |
| `npm run build` | 执行类型检查并构建单文件 `dist/index.html` |
| `npm run type-check` | 运行 TypeScript 严格检查 |
| `npm run lint` | 运行 ESLint 检查 |
| `npm run format` | 使用 Prettier 格式化源代码 |
| `npm run preview` | 预览构建后的单文件产物 |

## 开发规范
1. **类型安全**: 必须遵循严格的 TypeScript 规范，避免使用 `any`。
2. **命名约定**:
    - 组件/页面: `PascalCase` (例如 `AuthFilesPage.tsx`)。
    - Hooks: `useXxx` (例如 `useMediaQuery.ts`)。
    - Stores: `useXxxStore` (例如 `useAuthStore.ts`)。
3. **样式**: 使用 SCSS Modules 进行样式隔离。
4. **国际化**: 新增 UI 文本必须通过 `src/i18n/` 进行配置，不要硬编码中英文字符。
5. **提交规范**: 遵循 Conventional Commits (例如 `feat(scope): ...`, `fix(scope): ...`)。

## 关键业务逻辑
- **认证机制**: `useAuthStore` 处理与后端的连接。管理密钥（Management Key）在本地存储中经过轻量混淆 (`enc::v1::...`)。
- **配置编辑**: 支持 YAML 格式的在线配置编辑，集成 CodeMirror 6。
- **单文件部署**: 构建产物被内联到单个 HTML 文件中，便于分发和部署到后端服务器的 `management.html` 路径。

## 冲突最小化原则 (针对 Agent)
- 新增页面应在 `src/pages/` 下创建新文件。
- 路由修改应在 `MainRoutes.tsx` 的 `mainRoutes` 数组中追加。
- 导航修改应在 `MainLayout.tsx` 的 `navItems` 数组中追加。
- 避免修改 `src/services/api/client.ts` 等全局基础逻辑，除非修复 Bug。
