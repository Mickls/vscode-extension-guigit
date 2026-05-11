# GUI Git History

[English](./README.md)

GUI Git History 是一款用于 VS Code 的可视化 Git 历史查看插件。它提供交互式提交图、提交详情、文件变更视图、提交对比、远程仓库管理、代理配置和行内 blame 标注，让你可以在编辑器内完成常见 Git 历史浏览工作。

## 功能

- 在独立的 Git History 面板中浏览仓库提交历史。
- 查看提交元信息、refs、作者信息和变更文件。
- 在树形视图和列表视图之间切换变更文件展示方式。
- 对比提交，并从对比视图打开文件 diff。
- 从资源管理器或编辑器右键菜单打开单文件历史。
- 在插件界面中管理远程仓库。
- 在 VS Code 内配置 Git 代理。
- 显示行内 Git blame 标注，并支持快速打开提交和复制提交哈希。
- 选择插件界面语言，也可以跟随 VS Code 语言自动切换。

## 快速开始

1. 打开包含 Git 仓库的文件夹或工作区。
2. 在命令面板运行 **GUI Git History: Show Git History**，或打开 **Git History** 面板。
3. 如果工作区包含多个仓库，先选择要查看的仓库。
4. 浏览提交、查看文件变更、对比提交，或从编辑器和资源管理器打开文件历史。

## 设置

GUI Git History 提供以下 VS Code 设置：

- `guigit.fileViewMode`：默认变更文件视图，可选 `tree` 或 `list`。
- `guigit.language`：界面语言偏好。
- `guigit.autoStashOnPull`：执行 pull 时如何处理本地未提交变更。
- `guigit.proxy.enabled`：启用自定义 Git 代理配置。
- `guigit.proxy.http`：HTTP 代理地址。
- `guigit.proxy.https`：HTTPS 代理地址。
- `guigit.proxy.noProxy`：不走代理的主机，使用逗号分隔。
- `guigit.blame.enabled`：启用行内 Git blame 标注。
- `guigit.blame.showOnlyCurrentLine`：仅在当前编辑器行显示 blame。
- `guigit.blame.format`：行内 blame 文本格式。
- `guigit.logLevel`：诊断日志级别。

## 命令

- **GUI Git History: Show Git History**
- **GUI Git History: Refresh**
- **GUI Git History: Toggle Git Blame**
- **GUI Git History: View File History**
- **GUI Git History: Show Commit Details**
- **GUI Git History: Copy Commit Hash**

## 要求

GUI Git History 依赖 VS Code 内置 Git 扩展，并要求当前工作区包含 Git 仓库。

## 支持

反馈问题时请打开 **GUI Git History** 输出通道。建议先将 `guigit.logLevel` 设置为 `debug`，复现问题后附上相关日志。
