# GUI Git History Rewrite Docs

本目录记录新项目 `gui-git-history` 的替换计划、迁移约束和执行步骤。新项目目标不是做一个相似插件，而是替换当前已发布到 VS Code Marketplace 的 `GUI Git History` 扩展。

## 核心目标

1. 保持现有功能一致：当前插件中已经可见、可触发、可配置的功能都需要迁移。
2. 保持 UI 一致：布局、密度、VS Code 主题变量、配色和交互习惯都按旧项目复刻。
3. 改善代码结构：前端只负责 UI，后端负责所有 Git、VS Code、状态和业务逻辑。
4. 保持发布身份一致：新项目可以叫 `gui-git-history`，但打包发布时必须继续使用旧扩展的 Marketplace 身份。
5. 使用 TypeScript、WindCSS/Tailwind 风格样式和 pnpm，不引入普通 CSS/JS 业务代码。

## 文档索引

- [migration-requirements.md](./migration-requirements.md)：旧项目能力、配置、Marketplace 和 Git 仓库迁移要求。
- [implementation-plan.md](./implementation-plan.md)：按阶段执行的新项目实现计划。

## Changes 提交流程

右侧面板包含 `Details` 和 `Changes` 两个页签。`Details` 继续显示当前选中提交的详情；`Changes` 用来处理当前仓库的未提交改动。

在 `Changes` 页签中可以：

- 查看当前分支、仓库状态、`Staged Changes`、未暂存 `Changes` 和 `Stash`。
- 对单个文件执行打开、查看差异、暂存、取消暂存和丢弃操作。
- 使用 `Stage All` / `Unstage All` 批量调整暂存区。
- 展开 stash 条目，查看文件差异，并执行 apply、pop、drop。
- 在提交框中手写提交信息，或使用 AI 生成后再编辑。

提交按钮只提交 `Staged Changes`。插件不会在点击提交时自动暂存文件；如果希望提交全部改动，需要先显式点击 `Stage All`。没有暂存文件、提交信息为空、Git 操作进行中或仓库处于冲突/未完成操作状态时，提交按钮不可用。

AI 提交信息支持两类提供方：

- `VS Code Language Model`：默认选项，使用 VS Code 可用的语言模型能力。
- `OpenAI-compatible`：需要配置 `guigit.ai.openAICompatible.baseUrl`、`guigit.ai.openAICompatible.model`，并通过设置菜单的 `Configure AI Provider` 流程录入 API Key。

可以在设置菜单中使用 `Configure AI Provider` 切换和填写提供方信息，使用 `Test AI Provider` 验证当前配置。API Key 通过 VS Code Secret Storage 保存，不进入 Webview。

## 验证命令

常规开发完成后运行：

```sh
pnpm rpc:check
pnpm typecheck
pnpm eslint
pnpm test
pnpm build
pnpm package
```

文档或提交前检查还需要运行：

```sh
git diff --check
```

## 不可变发布约束

为了让新插件能作为旧插件的升级包发布，`package.json` 的发布身份必须保持：

- `publisher`: `Mickls`
- `name`: `vscode-extension-guigit`
- 扩展 ID: `Mickls.vscode-extension-guigit`
- `displayName`: `GUI Git History`
- 主要命令前缀: `guigit.*`
- 设置前缀: `guigit.*`
- Webview view id: `guigit.historyView`
- view container id: `guigit`

项目目录名和 Git 仓库目录名不参与 VS Code Marketplace 扩展 ID 计算，所以本地目录可以使用 `/Users/jiangcheng/code/owner/gui-git-history`。
