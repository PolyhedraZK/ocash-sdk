# AGENTS

本仓库为单包结构，根目录的 `package.json` 是唯一的依赖与脚本入口。

约定：

- SDK 源码：`src/`
- 构建产物：`dist/`（发布仅包含 `dist/` 与 `assets/`）
- Demo：`demos/`（仅用于展示与调试，不随 SDK 发布）
- 资产构建：`pnpm run build:assets` 输出到 `assets/`
- 浏览器 demo：`pnpm run dev`
- Node demo：`pnpm run demo:node -- <command>`
