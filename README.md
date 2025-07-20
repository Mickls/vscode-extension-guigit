# GUI Git History - VSCode Extension

一个功能强大的可视化Git历史记录查看器，为VSCode提供专业级的Git操作界面和丰富的交互功能。

## ✨ 核心功能

### 📊 可视化提交历史
- **图形化分支展示** - 使用ASCII图形显示分支合并和分叉关系
- **智能布局算法** - 自动计算提交节点位置和连接线
- **多分支视图** - 同时显示所有分支的提交历史
- **无限滚动加载** - 支持大型仓库的性能优化

### 🎯 丰富的Git操作
- **基础操作工具栏**：Pull、Push、Fetch、Clone、Checkout
- **高级操作支持**：Ctrl+Click 显示高级选项
- **右键上下文菜单**：
  - 复制提交哈希值
  - Cherry-pick 提交
  - Revert 提交
  - 编辑提交消息
  - 创建分支
  - Reset (Soft/Mixed/Hard)
  - Squash 提交
  - 推送所有提交到指定位置

### 🔍 提交详情与比较
- **详细文件变更视图** - 支持列表和树形两种显示模式
- **多提交比较** - Ctrl+Click 多选提交进行对比
- **文件差异查看** - 集成VSCode差异编辑器
- **文件历史追踪** - 查看单个文件的提交历史
- **在线文件查看** - 支持查看特定提交的文件内容

### 🎨 用户界面特性
- **响应式布局** - 可调整的分割面板
- **面板折叠** - 支持左右面板的展开/折叠
- **主题适配** - 完美适配VSCode的明暗主题
- **状态管理** - 智能的前端状态缓存和管理
- **实时更新** - 自动检测Git仓库变化并刷新显示

## 🚀 快速开始

### 开发环境安装

1. **克隆仓库**
   ```bash
   git clone https://github.com/Mickls/vscode-extension-guigit.git
   cd vscode-extension-guigit
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **编译项目**
   ```bash
   npm run compile
   ```

4. **启动调试**
   - 在VSCode中按 `F5` 或使用 "Run Extension" 调试配置
   - 这将打开一个新的VSCode窗口（扩展开发主机）

5. **测试扩展**
   - 在新窗口中打开一个包含Git仓库的文件夹
   - 扩展会自动激活并在底部面板显示 "Git History" 标签页

### 📖 使用指南

1. **打开Git历史视图**
   - 自动激活：打开Git仓库后扩展自动显示
   - 手动打开：使用命令面板 (`Ctrl+Shift+P`) 搜索 "Show Git History"
   - 面板位置：底部面板的 "Git History" 标签页

2. **基本操作**
   - **查看提交历史**：在左侧面板浏览提交列表
   - **切换分支**：使用顶部的分支选择器
   - **查看详情**：点击任意提交查看右侧详情面板
   - **Git操作**：使用顶部工具栏的 Pull、Push、Fetch 等按钮

3. **高级功能**
   - **多选比较**：按住 `Ctrl/Cmd` 点击多个提交，右键选择 "Compare Selected"
   - **右键菜单**：右键点击提交访问完整的Git操作菜单
   - **面板调整**：拖拽中间分割线调整面板大小
   - **面板折叠**：点击面板标题栏的折叠按钮

## 🛠️ 开发指南

### 项目架构

```
├── src/                          # TypeScript 源码
│   ├── extension.ts              # 扩展主入口，注册命令和视图
│   ├── gitHistoryProvider.ts     # Git操作封装，提供数据接口
│   └── gitHistoryViewProvider.ts # WebView视图管理，处理UI交互
├── media/                        # 前端资源文件
│   ├── components/               # UI组件模块
│   │   ├── commit-graph.js       # Git图谱绘制组件
│   │   ├── context-menu.js       # 右键菜单组件
│   │   └── file-tree.js          # 文件树组件
│   ├── core/                     # 核心功能模块
│   │   └── state-manager.js      # 状态管理器
│   ├── features/                 # 功能特性模块
│   │   ├── commit-compare.js     # 提交比较功能
│   │   └── commit-operations.js  # 提交操作功能
│   ├── ui/                       # UI管理模块
│   │   └── panel-manager.js      # 面板管理器
│   ├── utils/                    # 工具函数
│   │   ├── date-utils.js         # 日期处理工具
│   │   ├── dom-utils.js          # DOM操作工具
│   │   ├── git-utils.js          # Git工具函数
│   │   └── storage-utils.js      # 存储工具
│   ├── main.css                  # 主样式文件
│   └── main.js                   # 前端主入口
├── package.json                  # 扩展配置和依赖
├── tsconfig.json                 # TypeScript配置
├── start.sh                      # 快速启动脚本
└── DEVELOPMENT.md                # 详细开发文档
```

### 🔧 开发命令

```bash
# 安装依赖
npm install

# 编译TypeScript
npm run compile

# 监听模式编译
npm run watch

# 快速启动（Linux/Mac）
./start.sh
```

### 🐛 调试技巧

1. **扩展调试**
   - 按 `F5` 启动扩展开发主机
   - 在扩展开发主机中打开开发者工具 (`Ctrl+Shift+I`)

2. **WebView调试**
   - 右键点击Git History面板
   - 选择 "检查元素" 打开WebView开发者工具

3. **重新加载**
   - 在扩展开发主机中按 `Ctrl+R` 重新加载
   - 或使用命令面板中的 "Developer: Reload Window"

## 📦 技术栈

### 后端依赖
- **[simple-git](https://github.com/steveukx/git-js)** `^3.19.1` - 强大的Git操作库
- **VSCode API** `^1.74.0` - VSCode扩展开发接口

### 开发依赖
- **TypeScript** `^4.9.4` - 类型安全的JavaScript超集
- **@types/vscode** `^1.74.0` - VSCode API类型定义
- **@types/node** `16.x` - Node.js类型定义

### 前端技术
- **ES6 Modules** - 模块化JavaScript架构
- **CSS3** - 现代样式设计，支持VSCode主题
- **WebView API** - VSCode WebView集成

## 🎯 特性亮点

- ✅ **零配置启动** - 打开Git仓库即可使用
- ✅ **性能优化** - 智能缓存和懒加载
- ✅ **主题适配** - 完美支持VSCode明暗主题
- ✅ **模块化架构** - 清晰的代码组织结构
- ✅ **类型安全** - 完整的TypeScript类型支持

## 🤝 贡献指南

欢迎提交Issue和Pull Request！请查看 [DEVELOPMENT.md](./DEVELOPMENT.md) 了解详细的开发指南。

## 📄 许可证

本项目采用 [MIT License](./LICENSE) 开源协议。

## 🔗 相关链接

- [GitHub仓库](https://github.com/Mickls/vscode-extension-guigit)
- [问题反馈](https://github.com/Mickls/vscode-extension-guigit/issues)
- [开发文档](./DEVELOPMENT.md)