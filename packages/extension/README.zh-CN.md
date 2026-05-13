# GUI Git History

[English](./README.md)

GUI Git History 是一个面向 VS Code 的可视化 Git 历史工作区。它把提交图、提交详情、工作区变更、提交比较、常用 Git 操作、远程仓库管理、代理配置和行内 blame 放在一个贴近编辑器的界面里。

## 项目初衷

这个扩展来自一个很常见的工作流落差。JetBrains IDE 的可视化 Git 体验很适合长期使用：左侧看图，中间看提交，旁边看详情和变更文件，常用操作也离得很近。切换到 VS Code 之后，内置 Git 更偏基础源码管理，不太适合重度浏览历史和处理提交的工作流；而一些功能更完整的热门 Git 历史插件，又会把类似能力放在付费功能里。

GUI Git History 的目标，是把这种实用的、接近 JetBrains 风格的可视化 Git 工作流带进 VS Code，让日常 Git 工具留在编辑器里，而且不把常用能力藏起来。

## 截图说明

### 历史、提交图与提交详情

![历史概览](./assets/screenshots/history-overview.png)

在紧凑的历史视图中浏览仓库、分支、refs、tag、作者、日期和变更文件。选择提交时，提交图、列表和详情面板会保持同步。

### 工作区变更

![工作区变更](./assets/screenshots/working-tree.png)

在 **Changes** 标签页中查看暂存和未暂存文件，执行 stage、unstage、discard，查看 stash，生成提交信息并提交。

### 提交比较

![提交比较](./assets/screenshots/compare-commits.png)

选择两个提交后比较它们的变更文件，并可以从比较视图直接打开单文件 diff。

### 远程仓库管理

![远程仓库管理](./assets/screenshots/remote-manager.png)

从设置菜单中查看、添加、编辑和删除 Git remotes，不需要离开 Git 历史工作区。

### 行内 Blame

![行内 blame](./assets/screenshots/inline-blame.png)

在编辑器中开启行内 blame，在 hover 中查看对应提交，打开它的 Git History 详情，或复制提交哈希。

## 亮点功能

- **交互式提交历史**：切换工作区内的 Git 仓库，按一个或多个分支筛选，搜索提交信息或哈希，按作者筛选，并在滚动时继续加载更多提交。
- **提交图与提交详情**：查看 refs、tag、父提交、作者信息、提交正文、变更文件、增删行统计，以及可点击选择的 Git graph。
- **文件变更工作流**：在树形视图和列表视图之间切换，打开提交文件 diff，打开工作区文件或历史快照，也可以从资源管理器、编辑器和提交详情打开单文件历史面板。
- **工作区变更工作流**：查看暂存、未暂存和 stash；执行 stage、unstage、discard、打开 diff、打开文件、生成提交信息和提交。
- **提交比较**：选择两个提交后比较变更文件，并从比较视图打开单文件 diff。
- **提交右键操作**：复制哈希、cherry-pick、revert、soft/mixed/hard reset、压缩多个提交、从提交创建分支、推送提交到指定位置，以及编辑当前 HEAD 提交信息。
- **顶部工具栏 Git 操作**：在 Webview 内执行 pull、push、fetch、clone 和 checkout。按住 Command/Ctrl 点击 pull 或 push 可打开高级拉取/推送流程。
- **冲突感知操作**：当 Git 操作进入需要手动处理的状态时，可从冲突提示条继续或中止操作。
- **远程仓库管理**：展示 remotes，添加远程，修改 URL，并通过 VS Code 确认后删除远程。
- **代理支持**：可配置自定义 Git 代理，也可刷新自动检测结果。自动检测会参考 VS Code 代理、环境变量、系统代理和常见本地代理端口。
- **AI 提交信息**：可通过 VS Code language model provider 或 OpenAI-compatible chat completions endpoint 生成提交信息。
- **行内 blame**：显示当前行 Git blame 标注，并在 hover 中查看作者、提交摘要、日期、哈希，或直接打开该提交和复制哈希。
- **多语言界面**：支持跟随 VS Code 语言自动切换，也可手动选择英文、中文、西班牙语、法语、德语、日语或俄语。
- **诊断日志**：通过 **GUI Git History** 输出通道查看运行日志，并用 `guigit.logLevel` 控制详细程度。

## 快速开始

1. 打开包含 Git 仓库的文件夹或工作区。
2. 在底部面板打开 **Git History**，或从命令面板运行 **GUI Git History: Show Git History**。
3. 如果当前工作区包含多个仓库，先在顶部仓库选择器中选择目标仓库。
4. 使用分支选择器、搜索框和作者筛选缩小提交范围。
5. 选择提交以查看详情、打开文件 diff、比较提交，或从右键菜单执行提交操作。
6. 打开 **Changes** 标签页，管理暂存、未暂存和 stashed work。

## 常见工作流

### 浏览历史

- 从顶部选择当前仓库。
- 使用 **All branches** 查看全部分支，或勾选一个或多个具体分支。
- 按提交信息或哈希前缀搜索。
- 按作者筛选，或点击 **Me** 查看当前 Git 用户的提交。
- 需要更多横向空间时，可以隐藏 Git graph。

### 查看文件变更

- 选择一个提交，打开右侧提交详情。
- 在 **Tree** 和 **List** 之间切换变更文件展示方式。
- 点击文件路径打开 diff。
- 使用文件操作按钮打开工作区文件或该文件的历史记录。

### 管理工作区变更

- 打开 **Changes** 标签页。
- 对单个文件执行 stage 或 unstage，也可以使用 **Stage All** 和 **Unstage All**。
- 从文件操作中打开 working tree diff 和工作区文件。
- 展开 stash 查看其中的文件，然后 apply、pop 或 drop。
- 手动输入提交信息，或点击 **Generate** 使用已配置的 AI provider 生成建议。

### 比较提交

- 使用 Ctrl/Cmd 点击选择两个提交。
- 打开提交右键菜单并选择 **Compare Selected**。
- 查看变更文件列表，并按需打开单文件 diff。

### 执行 Git 操作

- 使用顶部按钮执行 **Pull**、**Push**、**Fetch**、**Checkout** 和 **Clone**。
- Command/Ctrl 点击 **Pull**，选择 merge/rebase 和远程分支。
- Command/Ctrl 点击 **Push**，选择远程分支以及普通推送或 force-with-lease。
- 右键提交可执行 cherry-pick、revert、reset、squash、创建分支、推送到此提交、复制哈希和编辑 HEAD 提交信息。

### 管理远程与代理

- 从顶部设置按钮打开设置菜单。
- 选择 **Manage Remotes** 添加、编辑或删除远程 URL。
- 选择 **Configure Proxy** 启用或禁用自定义 Git 代理。
- 选择 **Refresh Proxy** 刷新并查看当前代理来源。

### 使用行内 Blame

- 从命令面板运行 **GUI Git History: Toggle Git Blame**。
- 将鼠标悬停在行内 blame 标注上，查看作者、提交摘要、日期、哈希和快捷操作。
- 使用 hover 中的操作打开对应提交，或复制提交哈希。

## 设置项

| 设置                                 | 可选值                                           | 说明                                                      |
| ------------------------------------ | ------------------------------------------------ | --------------------------------------------------------- |
| `guigit.fileViewMode`                | `tree`, `list`                                   | 提交详情和工作区变更面板中文件变更的默认展示方式。        |
| `guigit.language`                    | `auto`, `en`, `zh`, `es`, `fr`, `de`, `ja`, `ru` | 界面语言偏好。`auto` 会在支持时跟随 VS Code 界面语言。    |
| `guigit.autoStashOnPull`             | `ask`, `always`, `never`                         | pull 和带安全检查的操作遇到本地未提交变更时的处理方式。   |
| `guigit.proxy.enabled`               | boolean                                          | 启用自定义 Git 代理配置。                                 |
| `guigit.proxy.http`                  | string                                           | HTTP 代理地址，例如 `http://127.0.0.1:7890`。             |
| `guigit.proxy.https`                 | string                                           | HTTPS 代理地址，例如 `http://127.0.0.1:7890`。            |
| `guigit.proxy.noProxy`               | string                                           | 不走代理的主机，使用逗号分隔。                            |
| `guigit.ai.provider`                 | `vscodeLanguageModel`, `openAICompatible`        | 提交信息输入框中 **Generate** 使用的 provider。           |
| `guigit.ai.commitMessagePrompt.mode` | `default`, `custom`                              | 生成提交消息时使用的提示词规则模式。                      |
| `guigit.ai.commitMessagePrompt.customRules` | string                                    | `custom` 模式下使用的自定义提示词规则。                   |
| `guigit.ai.openAICompatible.baseUrl` | string                                           | OpenAI-compatible chat completions endpoint 的 base URL。 |
| `guigit.ai.openAICompatible.model`   | string                                           | OpenAI-compatible provider 使用的模型名。                 |
| `guigit.blame.enabled`               | boolean                                          | 启用行内 Git blame 标注。                                 |
| `guigit.blame.showOnlyCurrentLine`   | boolean                                          | 仅在当前编辑器行显示 blame 标注。                         |
| `guigit.blame.format`                | string                                           | blame 标注文案格式设置。                                  |
| `guigit.logLevel`                    | `error`, `info`, `debug`, `off`                  | **GUI Git History** 输出通道的诊断日志级别。              |

## 命令与菜单

| 命令                                     | 使用位置                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| **GUI Git History: Show Git History**    | 命令面板；打开 Git History 面板。                                      |
| **GUI Git History: Refresh**             | 命令面板和视图标题栏；重新加载历史。                                   |
| **GUI Git History: Toggle Git Blame**    | 命令面板；开关行内 blame 标注。                                        |
| **GUI Git History: View File History**   | 命令面板、资源管理器右键、编辑器右键和文件操作按钮。                   |
| **GUI Git History: Show Commit Details** | 内部命令和 command URI 工作流；用于从 blame 或文件历史跳转到提交详情。 |

Webview 内还提供 pull、push、fetch、clone、checkout、compare、squash、reset、cherry-pick、revert、创建分支、远程管理、代理配置、AI 提交信息生成和复制哈希等工具栏或右键菜单操作。

## 运行要求

- VS Code `1.75.0` 或更高版本。
- VS Code 内置 Git 扩展。
- 当前工作区需要包含 Git 仓库，才能浏览历史。

## 排障建议

- 如果没有显示仓库，请确认当前文件夹是 Git 仓库，并且 VS Code 内置 Git 扩展已启用。
- 如果 Git 网络操作失败，可从设置菜单选择 **Refresh Proxy** 或 **Configure Proxy**。
- 如果历史、工作区状态或操作结果看起来不是最新的，请运行 **GUI Git History: Refresh**。
- 如果提交信息生成失败，请从设置菜单配置 AI provider，并查看 **GUI Git History** 输出通道。
- 反馈问题时，建议先将 `guigit.logLevel` 设置为 `debug`，复现问题后附上 **GUI Git History** 输出通道中的相关日志。
