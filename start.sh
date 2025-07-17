#!/bin/bash

echo "🚀 启动 VSCode Git 插件开发环境"
echo "================================"

# 检查是否安装了依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 编译项目
echo "🔨 编译项目..."
npm run compile

if [ $? -eq 0 ]; then
    echo "✅ 编译成功！"
    echo ""
    echo "🎯 下一步操作："
    echo "1. 在 VSCode 中按 F5 启动调试模式"
    echo "2. 在新窗口中打开一个 Git 仓库"
    echo "3. 在底部面板查找 'Git History' 标签页"
    echo ""
    echo "📚 更多信息请查看 DEVELOPMENT.md"
else
    echo "❌ 编译失败，请检查错误信息"
    exit 1
fi