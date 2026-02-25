# CLI Proxy API 管理中心

这是一个基于 React + TypeScript 的单文件 Web 管理界面，用于通过 Management API 管理 **CLIProxyAPI**。

[English](README.md)

## 项目定位

- 本仓库只包含 Web 管理 UI。
- 通过 `/v0/management` 读写后端管理接口。
- 不承担代理转发职责，不直接处理业务流量。

## 版本与访问

- 上游主项目: https://github.com/router-for-me/CLIProxyAPI
- 本仓库（Fork）: https://github.com/Gnonymous/API-Management-Center
- 后端最低建议版本: `>= 6.8.0`（推荐 `>= 6.8.15`）
- 从 CLIProxyAPI `6.0.19` 起，可直接访问:
  - `http://<host>:<api_port>/management.html`

## 快速开始

### 方式 A：使用后端自带页面（推荐）

1. 启动 CLIProxyAPI。
2. 打开 `http://<host>:<api_port>/management.html`。
3. 输入管理密钥并连接。

### 方式 B：本地开发运行

```bash
npm install
npm run dev
```

浏览器访问 `http://localhost:5173`，再连接你的后端服务。

### 方式 C：构建单文件产物

```bash
npm run build
```

- 产物: `dist/index.html`（全部资源已内联）
- 可在发布流程重命名为 `management.html`
- 本地预览: `npm run preview`

## 功能概览

### 核心管理页面

- 仪表盘
- 基础设置
- API Keys
- AI 提供商（Gemini / Codex / Claude / Vertex / OpenAI 兼容 / Ampcode）
- 认证文件
- OAuth
- 配额管理
- 使用统计
- 配置编辑（`/config.yaml`）
- 日志
- 系统信息

### 新增：API 端点页面（API Endpoints）

面向端点诊断与模型验证，支持：

- 将两类 Provider 合并展示：
  - Auth File Proxy Provider
  - Configured API Provider
- 模型加载并应用别名映射、排除规则过滤。
- 按 Provider 展示 Base URL、可用 Key、模型列表。
- 一键生成并复制 `curl` / Python / Node（OpenAI SDK 风格）调用示例。
- 在浏览器侧执行 `chat/completions` 连通性测试。

### 新增：本地 Agent 配置页面（Agent Settings）

面向本地 Claude Code `settings.json` 快速模型切换，支持：

- 使用 File System Access API 读写 `~/.claude/settings.json`。
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

- React 19
- TypeScript 5.9
- Vite 7 + `vite-plugin-singlefile`
- Zustand
- Axios
- react-router-dom v7
- Chart.js
- CodeMirror 6
- SCSS Modules
- i18next

## 开发命令

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run format
npm run type-check
```

## 安全说明

- 管理密钥保存在浏览器本地存储，采用轻量混淆格式（`enc::v1::...`）而非明文。
- 远程管理请配合网络访问控制，最小化暴露面。
- 本地 Agent 配置文件可能包含敏感信息，请谨慎处理。

## 常见问题

- 登录 `401/403`: 优先检查 API 地址与管理密钥。
- 页面提示不支持: 常见于后端版本偏旧或对应管理接口未启用。
- API 端点连通性测试失败: 可能是浏览器网络/CORS 环境导致，不一定等同后端不可用。
- 刷新后未恢复本地 Agent 文件: 一般是浏览器权限未授予或被重置。

## 许可证

MIT
