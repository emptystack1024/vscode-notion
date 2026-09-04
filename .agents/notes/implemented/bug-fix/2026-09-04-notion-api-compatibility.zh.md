# Agent Note: 更新 Notion 公开页面客户端
Status: implemented

## Problem
项目锁定的 Notion 生态依赖为 6.16.0，匿名客户端仍使用旧接口；用户打开公开页面时收到 `Response code 403 (Forbidden)`。此外，非法依赖版本和不自动构建的打包脚本会阻断新环境生成插件。

## Decision
现在将 `notion-client`、`notion-utils`、`react-notion-x` 和 `notion-types` 一起升级到 8.0.8，保持 record map 到 React renderer 的版本一致。客户端继续只访问公开页面，不在 VSIX 中加入用户凭据。构建脚本移除 Windows 不兼容的环境变量前缀，打包和发布前自动执行生产构建；输入命令统一解析并校验页面 ID。

## Alternatives considered
### Why not add private-page authentication?
用户确认目标是公开页面。私有页面需要 SecretStorage、权限说明和不同的凭据生命周期，超出本次公开页面兼容性修复范围。

### Why not replace the unofficial API with the official Notion API?
当前 `react-notion-x` 直接消费 unofficial API 的 record map；官方 API 返回的数据模型不同，需要单独的转换层和权限模型，不能作为本次最小修复直接替换。

## Consequences
新版客户端默认使用 `app.notion.com/api/v3`，已用已知公开页面验证请求成功。`package-extension` 现在会生成包含 `dist` 和 Webview 资源的可安装 VSIX，同时排除开发文件。版本更新为 2.0.2；当前未在真实 VS Code Extension Development Host 中验证用户目标页面，CI 仍使用 Bun 1.0.33。

## Testing
宿主 `bun run typecheck`、Webview 独立 TypeScript 检查、`bun run build`、`bun run package-extension` 和新版客户端公开页请求均通过。Webpack 仅报告 Webview bundle 体积警告。
