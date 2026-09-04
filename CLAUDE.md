# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 开发命令

仓库包含 `bun.lockb`，CI 固定使用 Bun `1.0.33`；本地应优先使用相同版本。安装依赖使用：

```text
bun install
```

常用脚本：

```text
bun run typecheck          # 严格 TypeScript 类型检查，不生成文件
bun test                   # Bun 内置单元测试
bun run build              # 生产构建 extension 和 webview bundle
bun run watch              # 开发模式持续构建
bun run package-extension  # 构建并用 vsce 打包 VSIX
bun run publish-extension  # 构建并发布扩展
```

当前 `package.json` 提供 `typecheck`、`test`、`build`、`watch`、`package-extension` 和 `publish-extension` 脚本。测试使用 Bun 内置 `bun:test`，测试文件位于 `test/`；当前没有独立 lint 脚本。Biome 是默认格式化器，保存时会整理 import；具体格式规则位于 `biome.jsonc` 和 `.vscode/settings.json`。调试扩展时先单独运行 `bun run watch` 或 `bun run build`，再使用 `.vscode/launch.json` 的 “Run Extension” 配置启动 Extension Development Host；该配置没有 `preLaunchTask`。

## CI 与发布

推送到 `main` 会触发 `.github/workflows/release.yml`：CI 使用 Bun `1.0.33` 和冻结锁文件安装依赖，执行构建、VSIX 打包及 Changesets 版本/发布流程。发布任务需要 GitHub Actions 的 `GITHUB_TOKEN` 和 `VSCE_PAT`。

`flake.nix` 提供包含 Bun、Biome 和语言服务器的默认开发 shell。

## 架构概览

这是一个将公开 Notion 页面嵌入 VS Code、并通过官方 Integration 支持私有页读取和基础编辑的扩展。`src/extension.ts` 是宿主侧入口，激活时组装依赖注入服务，包括公开/官方 API facade、SecretStorage 认证、页面序列化器、打开页面命令，以及保存和展示最近页面的 provider/tree view。

打开页面命令接收 Notion URL 或页面 ID，解析 ID 后由 `NotionApiClient` 按认证状态选择官方 API 或匿名公开页 API。官方页面转换为扩展自己的 `NotionDocument`，由消息桥和 `BasicEditor` 提供段落、标题、列表和待办的基础编辑；公开页面继续使用 `react-notion-x` 只读渲染。序列化器缓存 webview panel/state，通过 VS Code GlobalState 记录最近访问；webview HTML 使用 CSP，并加载打包后的资源。

`src/webview/index.tsx` 是独立的浏览器侧 React 入口，通过 `acquireVsCodeApi` 接收宿主传入的页面状态，使用 `react-notion-x` 渲染 Notion 内容；页面内部链接转换为可重新打开页面的 VS Code command URI。宿主侧和 webview 侧分别由 `webpack.config.ts` 构建为 `dist/extension.js`（CommonJS、外置 `vscode`）与 `dist/webview.js`，并生成 source map。

CSS、字体、图标和其他 webview 资源位于 `resources/`，构建或调整 webview 时要确保它们仍被扩展打包。官方 Integration token 只存储在 VS Code SecretStorage，不进入 Webview 或 VSIX；Integration 必须显式 Share 到目标页面。项目要求 VS Code `^1.91.0`；公开页无 token 时保持只读，私有页仅支持 README 所列的基础块编辑。嵌入内容受 `notion.allowedEmbeds` 和 webview CSP 限制，受信来源包括 YouTube 与 OpenStreetMap。

## 维护配置（sync-notion-git 自动收尾）

- 自动分步 git 提交：开启
- 维护 Notion 文档：开启
  - page_id: 3d10b588-b02e-8000-98be-c57008544117
- 非常规修改保存 Agent Note：开启

规则：本小节存在且至少一项开启 → 我完成一个完整改动单元、即将结束回合时，自动调用 sync-notion-git skill 执行收尾，不以文字提醒代替；git 开关关闭时不产本地文档。
