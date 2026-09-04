# vscode-notion

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
