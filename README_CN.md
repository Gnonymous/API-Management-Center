# CLI Proxy API 管理中心

用于管理与故障排查 **CLI Proxy API** 的单文件 Web UI（React + TypeScript），通过 **Management API** 完成配置、凭据与日志等管理操作。

[English](README.md)

## 项目定位

- 本仓库只包含 Web 管理 UI。
- 通过 `/v0/management` 读写后端管理接口。
- 不承担代理转发职责，不直接处理业务流量。

## 版本与访问

- 上游主项目: https://github.com/router-for-me/CLIProxyAPI
- 本仓库（Fork）: https://github.com/Gnonymous/API-Management-Center
- 示例地址: https://remote.router-for.me/
- 后端最低版本: `>= 7.1.0`（推荐最新）
- 从 CLIProxyAPI `6.0.19` 起，可直接访问:
  - `http://<host>:<api_port>/management.html`

## 快速开始

### 方式 A：使用后端自带页面（推荐）

1. 启动 CLIProxyAPI。
2. 打开 `http://<host>:<api_port>/management.html`。
3. 输入管理密钥并连接。

### 方式 B：本地开发运行

```bash
npm ci
npm run dev
```

浏览器访问 `http://localhost:5173`，再连接你的后端服务。

### 方式 C：构建单文件产物

```bash
npm ci
npm run build
```

- 产物: `dist/index.html`（全部资源已内联）
- 可在发布流程重命名为 `management.html`
- 本地预览: `npm run preview`

## 连接说明

当你从非 localhost 的浏览器访问时，服务端通常需要开启远程管理（例如 `allow-remote-management: true`）。完整鉴权规则、服务端限制与边界情况请参考 CLI Proxy API 服务端文档或配置注释。

## 功能概览

### 核心管理页面

- 仪表盘
- 配置面板
- AI 提供商（Gemini / Codex / Claude / Vertex / OpenAI 兼容 / Ampcode）
- 认证文件
- OAuth
- 配额管理
- 使用统计
- 日志
- 系统信息
- API 端点
- Agent 设置

### 功能一览

- **仪表盘**：连接状态、服务版本/构建时间、关键数量概览、可用模型概览。
- **配置面板**：可视化编辑常用 `config.yaml` 字段、基础设置与代理 `api-keys`；也支持源码编辑、YAML 高亮/搜索与保存前差异预览。
- **AI 提供商**：
  - Gemini/Codex/Claude/Vertex 配置（Base URL、Headers、代理、模型别名、排除模型、Prefix）。
  - OpenAI 兼容提供商（多 Key、Header、自助从 `/v1/models` 拉取并导入模型别名、可选浏览器侧 `chat/completions` 测试）。
  - Ampcode 集成（上游地址/密钥、强制映射、模型映射表）。
- **认证文件**：上传/下载/删除 JSON 凭据，筛选/搜索/分页，标记 runtime-only；查看单个凭据可用模型（依赖后端支持）；管理 OAuth 排除模型（支持 `*` 通配符）；配置 OAuth 模型别名映射。
- **OAuth**：对 Codex、Anthropic/Claude、Antigravity、Gemini CLI、Kimi、xAI/Grok 发起 OAuth/设备码流程并轮询状态；支持提交回调 URL 或 xAI/Grok 页面显示的 code；包含 Vertex JSON 凭据导入与 iFlow Cookie 导入。
- **配额管理**：管理 Claude、Antigravity、Codex、Gemini CLI 等提供商的配额上限与使用情况。
- **日志**：增量拉取日志、自动刷新、搜索、隐藏管理端流量、清空日志；下载请求错误日志文件。
- **系统信息**：快捷链接、版本检查、请求日志开关、本地登录信息清理，以及拉取 `/v1/models` 并分组展示（需要至少一个代理 API Key 才能查询模型）。

### API 端点页面（API Endpoints）

面向端点诊断与模型验证，支持：

- 将两类 Provider 合并展示：
  - Auth File Proxy Provider
  - Configured API Provider
- 模型加载并应用别名映射、排除规则过滤。
- 按 Provider 展示 Base URL、可用 Key、模型列表。
- 一键生成并复制 `curl` / Python / Node（OpenAI SDK 风格）调用示例。
- 在浏览器侧执行 `chat/completions` 连通性测试。

### 本地 Agent 配置页面（Agent Settings）

面向本地 Claude Code `settings.json` 快速模型切换，支持：

- 使用 File System Access API 或后端辅助文件访问读写 `~/.claude/settings.json`。
- 首次选择文件后保存文件句柄，刷新后自动尝试恢复（并校验权限）。
- 编辑 4 个模型槽位：
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- 先选 Provider，再进入该 Provider 的模型列表选模型。
- 每个槽位支持模型连通性测试。
- 保存前可查看 JSON 预览。
- 仅 Codex 模型显示并支持思考量：
  - `low` / `medium` / `high` / `xhigh`

## 相关项目与参考文档

- CLIProxyAPI（上游）: https://github.com/router-for-me/CLIProxyAPI
- 本仓库 Fork: https://github.com/Gnonymous/API-Management-Center
- Claude Code 文档（settings 行为参考）: https://docs.anthropic.com/en/docs/claude-code
- Router-for-me 思考量配置说明: https://help.router-for.me/cn/configuration/thinking.html
- OpenAI Chat Completions 文档: https://platform.openai.com/docs/api-reference/chat
- OpenAI Python SDK: https://github.com/openai/openai-python
- OpenAI Node SDK: https://github.com/openai/openai-node

## 技术栈

- React 19 + TypeScript 6.0
- Vite 8（单文件构建）
- Zustand
- Axios
- react-router-dom v7
- Motion
- CodeMirror 6
- SCSS Modules
- i18next

## 多语言支持

目前支持四种语言：

- 英文 (en)
- 简体中文 (zh-CN)
- 繁体中文 (zh-TW)
- 俄文 (ru)

界面语言会根据浏览器设置自动切换，也可在登录页或顶部语言菜单手动切换。

## 浏览器兼容性

- 构建目标：`ES2020`
- 支持 Chrome、Firefox、Safari、Edge 等现代浏览器
- 支持移动端响应式布局，可通过手机/平板访问

## 构建与发布说明

- 使用 Vite 输出 **单文件 HTML**（`dist/index.html`），资源全部内联（`vite-plugin-singlefile`）。
- 打 `vX.Y.Z` 标签会触发 `.github/workflows/release.yml`，发布 `dist/management.html`。
- 系统信息页显示的 UI 版本在构建期注入（优先使用环境变量 `VERSION`，否则使用 git tag / `package.json`）。

## 开发命令

```bash
npm run dev        # 启动开发服务器
npm run build      # tsc + Vite 构建
npm run preview    # 本地预览 dist
npm run lint       # ESLint
npm run format     # Prettier
npm run type-check # tsc --noEmit
```

## 安全说明

- 管理密钥会存入浏览器 `localStorage`，并使用轻量混淆格式（`enc::v1::...`）避免明文；仍应视为敏感信息。
- 远程管理请配合网络访问控制，最小化暴露面。
- 本地 Agent 配置文件可能包含敏感信息，请谨慎处理。

## 常见问题

- **无法连接 / 401/403**：确认 API 地址与管理密钥；远程访问可能需要服务端开启远程管理。
- **反复输错密钥**：服务端可能对远程 IP 进行临时封禁。
- **日志页面不显示**：需要在“配置面板”里开启“写入日志文件”，导航项才会出现。
- **功能提示不支持**：多为后端版本较旧或接口未启用/不存在。
- **API 端点连通性测试失败**：可能是浏览器网络/CORS 环境导致，不一定等同后端不可用。
- **刷新后未恢复本地 Agent 文件**：一般是浏览器权限未授予或被重置。

## 贡献

欢迎提 Issue 与 PR。建议附上：

- 复现步骤（服务端版本 + UI 版本）
- UI 改动截图
- 验证记录（`npm run lint`、`npm run type-check`、`npm run build`）

## 许可证

MIT
