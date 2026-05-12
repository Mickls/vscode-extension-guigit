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
