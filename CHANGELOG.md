# vscode-notion

## 2026-09-04 — 修复公开 Notion 页面 403

### Problem
旧版 `notion-client` 固定使用过时的匿名 Notion 接口，打开公开页面时可能返回 `Response code 403 (Forbidden)`；同时新鲜 checkout 无法可靠安装依赖或直接打包可用 VSIX。

### Changes
- 将 `notion-client`、`notion-utils`、`react-notion-x` 和 `notion-types` 升级到兼容的 `8.0.8`，使用新版匿名接口。
- 修正非法的 `@types/bun` 版本范围，补充直接声明的 `terser-webpack-plugin`，并更新 `bun.lockb`。
- 校验命令参数和输入的 Notion URL/ID，给出明确的无效输入提示。
- 修正 `notion.allowedEmbeds` 配置键，并让根类型检查排除由独立配置编译的 Webview；限制 Webview 类型自动加载，避免 Bun 类型污染。
- 让构建脚本适配 Windows shell，且 `package-extension`/`publish-extension` 自动先构建。
- 版本更新至 `2.0.2`，收紧 `.vscodeignore`，避免将开发文件打入 VSIX。

### Consequences
已用 Node 24、Bun CLI 1.4.0 验证宿主和 Webview 类型检查、生产构建、VSIX 打包，并用新版客户端成功请求已知公开页面。构建仍有 Webview bundle 体积警告；未在真实 VS Code Extension Development Host 中运行，也未用用户目标页面复测。CI 仍固定 Bun 1.0.33，建议安装后在 CI 或目标环境再验证锁文件兼容性。

### Alternatives considered
不增加私有页面登录流程：用户确认目标页面为公开页面；私有页面仍不在本扩展支持范围内，也不应把凭据写入 VSIX。

## 2026-09-04 — 初始化仓库协作说明

### Problem
仓库原本没有 Claude Code 协作说明，也没有本地 Git 基线，后续开发缺少统一的命令、架构入口和维护约定。

### Changes
- 新增 `CLAUDE.md`，记录 Bun 开发命令、双 bundle 架构、调试方式、CI 约束和公开页面限制。
- 初始化本地 Git 仓库并建立初始基线提交。
- 启用自动分步提交、Notion 文档维护和非常规修改 Agent Note，并配置项目 Notion page_id。

### Consequences
后续 Claude Code 实例可直接按 `CLAUDE.md` 开发；项目当前没有测试或 lint 脚本。Notion 快速入门页已按确认稿同步，未进行扩展运行或构建验证。

### Alternatives considered
None

## 2.0.1

### Patch Changes

- 35d75e2: Fix broken open page command

## 2.0.0

### Major Changes

- b892d6d: Remove bookmarks, authentication for private pages to keep things only minimally usable.
