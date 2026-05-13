# GUI Git History

[English](./README.md)

已发布的 VS Code 插件名为 **GUI Git History**。你可以在 VS Code Marketplace 中搜索这个名字并安装。

GUI Git History 为 VS Code 提供一个可视化 Git 工作区，用于浏览提交图、查看变更、比较提交、管理工作区改动、执行常用 Git 操作，并在编辑器中使用行内 blame。

## 项目初衷

这个项目来自一个非常真实的使用痛点：JetBrains IDE 的可视化 Git 工作流很顺手，尤其是浏览历史、查看提交详情、比较版本和对提交执行操作。切换到 VS Code 之后，内置 Git 更偏基础源码管理，不太适合这种高频的历史图和提交操作工作流；而一些功能更完整的热门 Git 历史插件，又会把类似能力放到付费功能里。

GUI Git History 想把这种熟悉的可视化 Git 体验带回 VS Code：信息密度高、容易扫描、鼠标键盘都顺手，并且尽量让常用能力留在编辑器内部完成。

## 面向用户的功能

- 在当前工作区的一个或多个 Git 仓库之间浏览提交历史。
- 在全部分支、指定分支、本地分支和远程分支之间切换。
- 按提交信息或哈希搜索，按作者筛选，并快速筛选当前 Git 用户的提交。
- 查看带彩色 lane 的交互式提交图，展示 refs、tag、作者、日期，并与提交列表同步选择。
- 查看提交元信息、提交正文、变更文件、增删行统计和文件级操作。
- 打开文件 diff、工作区文件、历史快照和单文件历史视图。
- 选择两个提交进行比较，并从比较视图打开单文件 diff。
- 管理工作区改动：查看暂存和未暂存文件、stage、unstage、discard、查看 stash，并执行提交。
- 使用 VS Code Language Model 或 OpenAI-compatible provider 生成提交信息。
- 从界面执行常见 Git 操作：pull、高级 pull、push、高级 push、fetch、clone、checkout、cherry-pick、revert、reset、squash、从提交创建分支、推送到指定提交、编辑 HEAD 提交信息和复制哈希。
- 在 Git 操作需要手动解决冲突时，继续或中止被打断的操作。
- 查看、添加、更新和删除 Git remotes。
- 配置 Git 代理，或刷新自动代理检测结果。
- 显示行内 Git blame 标注，并在 hover 中打开对应提交或复制哈希。
- 支持英文、中文、西班牙语、法语、德语、日语和俄语界面。
- 在 **GUI Git History** 输出通道查看诊断日志，并配置日志级别。

Marketplace/VSIX 使用的说明文档在 `packages/extension` 中：

- [packages/extension/README.md](packages/extension/README.md)
- [packages/extension/README.zh-CN.md](packages/extension/README.zh-CN.md)

## 仓库结构

```text
packages/
  shared/
    src/rpc/contract.ts
      typed RPC 请求、响应、通知和 ViewModel 的唯一源文件。
  extension/
    package.json
      VS Code 扩展 manifest、命令、设置、视图、菜单和打包脚本。
    src/extension/
      激活流程、命令注册、Git watcher 和 VS Code 集成。
    src/backend/
      Git 服务、仓库发现、分支/历史/详情加载、图布局、Git 操作、工作区改动、
      stash、AI 提交信息、代理、远程仓库、i18n、RPC、diff、文件历史和 blame。
    src/backend/rpc/contract.ts
      从 `packages/shared` 生成的运行时 contract；不要手动修改。
    src/views/
      Webview provider 外壳，负责 HTML、脚本/样式接入和消息路由。
  webview/
    src/app/
      React app 外壳、UI 状态、i18n lookup 和 typed RPC client。
    src/components/
      Header、提交列表、Git 图、提交详情、文件变更、工作区变更面板、
      比较浮层、设置菜单、远程仓库管理、通知和布局组件。
    src/app/rpcContract.generated.d.ts
      从 `packages/shared` 生成的声明文件；不要手动修改。
```

后端负责 Git、VS Code API、配置、持久化、图布局、筛选/搜索、diff、blame、代理检测、AI 提交信息和操作工作流。Webview 只负责渲染 ViewModel，并发送类型化的用户意图 RPC 消息。

## 环境要求

- Node.js 24.x
- pnpm 11.x
- 通过 workspace dependencies 安装的 VS Code extension toolchain

只使用 pnpm。不要添加 `package-lock.json` 或 npm-only 工作流。

## 安装依赖

```sh
pnpm install
```

在非交互或沙盒 shell 中，需要确认 shell 能找到预期版本的 pnpm 和 Node.js。本机通常可以这样运行：

```sh
PATH=/Users/jiangcheng/.nvm/versions/node/v24.3.0/bin:/opt/homebrew/bin:$PATH pnpm install
```

## 开发

启动常规扩展开发循环：

```sh
pnpm dev
```

这个命令会并行运行 shared RPC generator、extension TypeScript watcher 和 webview Vite build watcher：

- `pnpm dev:shared`：监听 `packages/shared/src/rpc` 并重新生成 RPC 文件。
- `pnpm dev:extension`：将 extension host 输出到 `packages/extension/out`。
- `pnpm dev:webview`：将 webview 资源输出到 `packages/extension/webview-dist`。

只改某个 package 时，也可以使用：

```sh
pnpm dev:shared
pnpm dev:extension
pnpm dev:webview
```

如果只做浏览器内的 webview 开发，可以运行 Vite dev server：

```sh
pnpm --filter @gui-git-history/webview serve
```

VS Code 扩展本身仍然读取 `packages/extension/webview-dist` 中的构建产物。

## VS Code 调试

仓库包含 `.vscode/launch.json` 和 `.vscode/tasks.json`。

- 使用 **Run Extension**：先构建，再打开 Extension Development Host。
- 使用 **Run Extension (watch output)**：适合已经运行 `pnpm dev` 的场景。

诊断日志会写入 **GUI Git History** 输出通道。调试集成问题时可以提高日志级别：

```json
"guigit.logLevel": "debug"
```

## RPC Contract 维护

RPC contract 的源文件只有一个：

```text
packages/shared/src/rpc/contract.ts
```

修改 request 类型、response payload、后端通知或共享 ViewModel 时：

1. 修改 `packages/shared/src/rpc/contract.ts`。
2. 运行 `pnpm rpc:generate`。
3. 提交生成文件：

```text
packages/extension/src/backend/rpc/contract.ts
packages/webview/src/app/rpcContract.generated.d.ts
```

4. 运行 `pnpm rpc:check`。

不要从 webview package import extension backend 代码，也不要手动编辑生成的 RPC 文件。

## 常用命令

```sh
pnpm install
pnpm dev
pnpm dev:extension
pnpm dev:webview
pnpm dev:shared
pnpm rpc:generate
pnpm rpc:check
pnpm typecheck
pnpm eslint
pnpm test
pnpm build
pnpm package
```

`pnpm package` 会构建所有 package，并从 `packages/extension` 创建 VSIX。VSIX 路径为：

```text
packages/extension/vscode-extension-guigit-<version>.vsix
```

## 验证

声明实现完成前运行：

```sh
pnpm install
pnpm rpc:check
pnpm typecheck
pnpm eslint
pnpm test
pnpm build
pnpm package
```

当前测试约定：

- 单元测试放在 `packages/*/test`，或与 package source 相邻的 `*.test.ts(x)`。
- RPC contract 测试需要证明每个 request type 都有后端 handler marker。
- 后端行为测试覆盖 Git、router、state、VS Code service 和操作边界。
- Webview 测试验证 UI 状态和渲染，不测试 Git 行为本身。

## 打包说明

扩展 package root 是 `packages/extension`，不是仓库根目录。`packages/extension/package.json` 中引用的文件必须存在于 `packages/extension` 下。

重要打包文件：

- `packages/extension/package.json`
- `packages/extension/.vscodeignore`
- `packages/extension/assets/gui-git-history-high-resolution-logo-transparent.png`
- `packages/extension/assets/screenshots`
- `packages/extension/webview-dist`
- `packages/extension/README.md`
- `packages/extension/README.zh-CN.md`

生成的构建产物、VSIX 文件和 TypeScript build info 会被 Git 忽略。

## 相关文档

- [docs/README.md](docs/README.md)
- [docs/migration-requirements.md](docs/migration-requirements.md)
- [docs/implementation-plan.md](docs/implementation-plan.md)

修改行为或扩展身份前，请先阅读这些文档。

## 开发规则

- extension 和 webview 业务代码使用 TypeScript。
- webview 样式使用 WindCSS/Tailwind-style utilities。
- 普通 CSS 仅保留在框架入口或生成输出中。
- 保持前后端边界清晰。
- 保留所有 `guigit.*` command/config id 和 `guigit.historyView`。
- 完成实现阶段时更新 [docs/implementation-plan.md](docs/implementation-plan.md) 的 checkbox。
- commit message 使用单行 conventional commit，类型为 `feat`、`fix`、`docs`、`style`、`refactor`、`test` 或 `chore`。
