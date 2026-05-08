# Migration Requirements

本文档定义旧项目到新项目的迁移边界。后续实现必须逐项对照，避免新代码结构更好但功能或发布身份丢失。

## 1. Marketplace 身份迁移

新项目打包后需要替换当前 Marketplace 上的旧扩展，因此以下字段必须保持兼容：

| 项目 | 旧值 | 新项目要求 |
| --- | --- | --- |
| `publisher` | `Mickls` | 保持 `Mickls` |
| `name` | `vscode-extension-guigit` | 保持 `vscode-extension-guigit` |
| Extension ID | `Mickls.vscode-extension-guigit` | 保持不变 |
| `displayName` | `GUI Git History` | 保持不变 |
| `main` | `./out/extension.js` | 可以调整构建产物路径，但发布前需确认 VSIX 正确加载 |
| `icon` | `gui-git-history-high-resolution-logo-transparent.png` | 复用或迁移同名图标 |
| categories | `SCM Providers` | 保持 |
| extensionDependencies | `vscode.git` | 保持 |

版本号策略：

- 新项目首个可替换版本必须高于旧项目 `0.0.50`。
- 建议第一个迁移版本使用 `0.1.0`。
- 发布前用 `vsce package` 生成 VSIX，并在 Extension Development Host 中验证升级路径。

## 2. VS Code contribution 迁移

必须保持的 commands：

- `guigit.showHistory`
- `guigit.refresh`
- `guigit.toggleBlame`
- `guigit.viewFileHistory`
- `guigit.showCommitDetails`

必须保持的 views：

- views container: `guigit`
- webview view: `guigit.historyView`
- view name: `Commit History`

必须保持的 menus：

- view title 中的 refresh
- explorer/context 中的 view file history
- editor/context 中的 view file history

必须保持的 activation events：

- `onCommand:guigit.showHistory`
- `onView:guigit.historyView`
- `onStartupFinished`

## 3. 设置项迁移

旧项目中已贡献或代码中实际读取的设置都需要兼容：

- `guigit.proxy.enabled`
- `guigit.proxy.http`
- `guigit.proxy.https`
- `guigit.proxy.noProxy`
- `guigit.autoStashOnPull`
- `guigit.blame.enabled`
- `guigit.language`
- `guigit.fileViewMode`

旧 README 提到但当前 `package.json` 未贡献的设置，在新项目中需要补齐或明确废弃。为了保持用户预期，新项目应补齐：

- `guigit.blame.showOnlyCurrentLine`
- `guigit.blame.format`

配置迁移规则：

- 不更改已有 key 名称。
- 不改变已有 enum 值：`autoStashOnPull` 继续使用 `ask | always | never`。
- 不改变语言值：`auto | en | zh | es | fr | de | ja | ru`。
- Workspace 配置与 Global 配置的使用语义保持旧行为。

## 4. Git 仓库代码替换策略

开发阶段：

- 新代码在 `/Users/jiangcheng/code/owner/gui-git-history` 中实现。
- 旧项目 `/Users/jiangcheng/code/owner/vscode-extension-guigit` 只作为功能和 UI 参考，不直接改动。

替换阶段：

1. 在新项目中完成所有验收。
2. 在旧仓库中新建替换分支，例如 `codex/rewrite-gui-git-history`。
3. 删除旧实现文件，但保留 `.git`、发布历史和远端 `origin`。
4. 将新项目源码复制到旧仓库根目录。
5. 确认 `package.json.name`、`publisher`、命令、配置和 view id 未变化。
6. 用 pnpm 安装、编译、打包、启动 Extension Development Host 验证。
7. 合并或推送旧仓库替换分支，让 GitHub 仓库代码完成替换。

## 5. 功能迁移范围

### Git 历史主视图

- 多仓库发现与切换
- 本地分支、远程分支、所有分支、最近分支
- 提交搜索：message 和 hash 前缀
- 作者筛选：输入作者、我的提交、清除筛选
- 无限滚动加载
- 提交列：hash、message、refs/tags、author、date
- 单选提交查看详情
- Ctrl/Cmd 多选提交
- Git graph 显示、隐藏、hover、点击同步

### 提交详情

- hash、message、author、email、date、refs、body
- 文件变更列表
- 文件树和文件列表视图
- 文件夹折叠状态
- diff、open file、file history、view online

### Git 操作

- pull、advanced pull、push、advanced push、fetch、clone、checkout
- cherry-pick、revert、reset soft/mixed/hard
- compare selected commits
- squash commits
- create branch from commit
- push all commits to here
- edit commit message

### VS Code 辅助能力

- 文件历史 Webview panel
- readonly virtual document diff
- Git blame decoration
- show commit details command 跳转
- Git repository state watcher
- active editor repository switching

### 设置菜单

- reset auto stash preference
- configure proxy
- view proxy status
- remote manager
- change language

### Remote manager

- 展示 remote name、fetch URL、push URL
- 添加 remote
- 修改 remote URL
- 删除 remote，并用 VS Code modal 确认

### Proxy

- 自定义代理
- VS Code 代理
- 环境变量代理
- macOS、Windows、Linux 系统代理
- 常见代理工具端口检测
- 网络错误后刷新代理并重试 Git 命令

### i18n

- 迁移 `en/zh/es/fr/de/ja/ru`
- Webview 与 Extension Host 使用同一套 key
- 语言切换后重建 Webview 并恢复当前数据状态

## 6. UI 迁移范围

新 UI 必须保留当前视觉特征：

- 顶部紧凑工具栏
- 左侧 Git graph + commit list
- 右侧 commit details
- 中间 resizer
- 左右 panel collapse
- VS Code theme variables
- 36px 左右的 commit row 密度
- 低圆角、低装饰、高信息密度
- context menu 和 settings menu 的 VS Code 原生感
- remote manager modal 的表格布局

保留当前关键颜色：

- HEAD: `#f56565`
- remote ref: `#4299e1`
- tag: `#48bb78`
- local ref: `#9f7aea`
- insertions: `#28a745`
- deletions: `#dc3545`
- modified: `#ffc107`

## 7. 前后端分离规则

前端允许：

- 渲染 ViewModel
- 发送用户意图事件
- 维护 UI 瞬态状态：菜单开关、hover、输入框当前值、scroll 位置
- 使用 WindCSS/Tailwind class 组织样式

前端禁止：

- 直接拼 Git 命令
- 计算 Git graph layout
- 判断提交是否可编辑
- 计算搜索结果
- 持久化业务偏好
- 直接决定高级 Git 操作流程

后端负责：

- Git 操作
- VS Code QuickPick/InputBox/Warning modal
- 配置读写
- Workspace state
- Git graph layout
- 搜索、筛选、分页
- 缓存
- diff 和 virtual document
- blame decoration
- remote URL 到在线文件/PR URL 的转换

## 8. 验收标准

每个阶段完成时必须验证：

- `pnpm install` 成功
- `pnpm typecheck` 成功
- `pnpm eslint` 成功
- `pnpm test` 成功
- `pnpm package` 或等价 VSIX 打包命令成功
- Extension Development Host 能打开 `GUI Git History`
- 当前旧项目截图中的主 UI 布局能被新项目复刻

发布替换前必须额外验证：

- VSIX 的 extension id 仍是 `Mickls.vscode-extension-guigit`
- 所有 `guigit.*` commands 可调用
- 老用户配置项仍被读取
- `package-lock.json` 不再生成，仓库只保留 `pnpm-lock.yaml`
