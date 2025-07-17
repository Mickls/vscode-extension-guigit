# GUI Git History - VSCode Extension

一个可视化的Git历史记录查看器，为VSCode提供强大的Git操作界面。

## 功能特性

- 📊 **可视化提交历史** - 在侧边面板中显示清晰的提交历史记录
- 🌿 **分支切换** - 轻松查看不同分支的提交历史
- 📝 **详细信息查看** - 点击提交查看详细的文件更改信息
- 🎯 **右键操作菜单** - 支持多种Git操作：
  - 复制提交哈希值
  - Cherry-pick 提交到当前分支
  - 撤销(Revert)提交
  - 重置(Reset)到指定提交
- 🔄 **多选比较** - 选择多个提交进行比较
- ⚡ **实时更新** - 自动检测Git仓库变化并更新显示

## 安装

1. 克隆此仓库
2. 运行 `npm install` 安装依赖
3. 按 `F5` 启动调试模式
4. 在新的VSCode窗口中打开一个Git仓库

## 使用方法

1. 打开包含Git仓库的文件夹
2. 在活动栏中点击"Git History"图标，或使用命令面板搜索"Show Git History"
3. 在底部面板中查看提交历史
4. 点击提交查看详细信息
5. 右键点击提交使用高级操作
6. 按住Ctrl/Cmd多选提交进行比较

## 开发

### 项目结构

```
├── src/
│   ├── extension.ts              # 主扩展文件
│   ├── gitHistoryProvider.ts     # Git数据提供者
│   └── gitHistoryViewProvider.ts # 视图提供者
├── media/
│   ├── main.css                  # 样式文件
│   └── main.js                   # 前端逻辑
├── package.json                  # 扩展配置
└── tsconfig.json                # TypeScript配置
```

### 构建

```bash
npm run compile
```

### 调试

按 `F5` 启动扩展开发主机进行调试。

## 依赖

- [simple-git](https://github.com/steveukx/git-js) - Git操作库
- VSCode API 1.74.0+

## 许可证

MIT License