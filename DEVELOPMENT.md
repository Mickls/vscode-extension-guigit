# 开发和测试指南

## 快速开始

1. **安装依赖**
   ```bash
   npm install
   ```

2. **编译项目**
   ```bash
   npm run compile
   ```

3. **启动调试**
   - 在VSCode中按 `F5` 或使用 "Run Extension" 调试配置
   - 这将打开一个新的VSCode窗口（扩展开发主机）

4. **测试插件**
   - 在新窗口中打开一个包含Git仓库的文件夹
   - 使用 `Ctrl+Shift+P` 打开命令面板
   - 搜索并执行 "Show Git History" 命令
   - 或者在底部面板中查找 "Git History" 标签页

## 功能测试

### 基本功能
- ✅ 查看提交历史列表
- ✅ 切换不同分支查看历史
- ✅ 点击提交查看详细信息
- ✅ 查看文件变更统计

### 右键菜单操作
- ✅ 复制提交哈希值
- ✅ Cherry-pick 提交
- ✅ 撤销(Revert)提交  
- ✅ 重置(Reset)到提交

### 多选功能
- ✅ Ctrl/Cmd + 点击多选提交
- ✅ 比较两个提交的差异
- ✅ 清除选择

## 开发模式

### 监听模式编译
```bash
npm run watch
```

### 项目结构说明
```
src/
├── extension.ts              # 扩展主入口，注册命令和视图
├── gitHistoryProvider.ts     # Git操作封装，提供数据接口
└── gitHistoryViewProvider.ts # WebView视图管理，处理UI交互

media/
├── main.css                  # WebView样式
└── main.js                   # WebView前端逻辑
```

## 调试技巧

1. **查看扩展日志**
   - 在扩展开发主机中打开开发者工具 (`Ctrl+Shift+I`)
   - 查看控制台输出

2. **WebView调试**
   - 右键点击Git History面板
   - 选择 "检查元素" 或 "Inspect Element"
   - 这将打开WebView的开发者工具

3. **重新加载扩展**
   - 在扩展开发主机中按 `Ctrl+R` 重新加载
   - 或使用命令面板中的 "Developer: Reload Window"

## 常见问题

### Q: 插件没有显示在面板中
A: 确保当前工作区包含Git仓库，插件只在Git仓库中激活

### Q: 提交历史为空
A: 检查Git仓库是否有提交记录，确保simple-git库能正确访问仓库

### Q: 右键菜单操作失败
A: 确保有足够的Git权限，某些操作可能需要解决冲突

## 打包发布

```bash
# 安装vsce工具
npm install -g vsce

# 打包扩展
vsce package

# 这将生成 .vsix 文件，可以手动安装
```