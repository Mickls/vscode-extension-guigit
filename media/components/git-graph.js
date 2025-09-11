/**
 * Git Graph 可视化组件
 * 负责渲染 Git 提交图形
 */

/**
 * Git Graph 渲染器类
 */
export class GitGraphRenderer {
    constructor(container, commitListContent) {
        this.container = container;
        this.commitListContent = commitListContent; // 提交列表内容区域，用于同步滚动
        this.canvas = null;
        this.ctx = null;
        this.config = {
            nodeRadius: 4,
            columnSpacing: 16,
            rowHeight: 36, // 必须与提交列表的行高一致
            lineWidth: 2,
            colors: [
                '#007acc', // 蓝色
                '#28a745', // 绿色
                '#dc3545', // 红色
                '#ffc107', // 黄色
                '#6f42c1', // 紫色
                '#fd7e14', // 橙色
                '#20c997', // 青色
                '#e83e8c', // 粉色
                '#17a2b8', // 信息蓝
                '#6c757d', // 灰色
                '#343a40', // 深灰
                '#495057', // 中灰
                '#f8f9fa', // 浅灰
                '#e9ecef', // 更浅灰
                '#dee2e6', // 边框灰
                '#ced4da', // 输入灰
                '#adb5bd', // 次要灰
                '#868e96', // 静音灰
                '#6c757d'  // 文本静音
            ]
        };
        this.layout = null;
        this.hoveredNode = null;
        this.selectedNode = null;
        this.scrollTop = 0;
        this.scrollHandler = null;
        
        this.initCanvas();
        this.bindEvents();
    }

    /**
     * 初始化画布
     */
    initCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'git-graph-canvas';
        this.ctx = this.canvas.getContext('2d');
        
        // 设置高DPI支持
        const devicePixelRatio = window.devicePixelRatio || 1;
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        
        this.container.appendChild(this.canvas);
        
        // 监听容器大小变化
        this.resizeObserver = new ResizeObserver(() => {
            this.updateCanvasSize();
            this.render();
        });
        this.resizeObserver.observe(this.container);
        
        this.updateCanvasSize();
    }

    /**
     * 更新画布尺寸
     */
    updateCanvasSize() {
        const rect = this.container.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * devicePixelRatio;
        this.canvas.height = rect.height * devicePixelRatio;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.scale(devicePixelRatio, devicePixelRatio);
        this.ctx.imageSmoothingEnabled = true;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        this.canvas.addEventListener('mousemove', (e) => {
            this.handleMouseMove(e);
        });
        
        this.canvas.addEventListener('click', (e) => {
            this.handleClick(e);
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.hoveredNode = null;
            this.render();
        });
    }

    /**
     * 绑定滚动同步
     */
    bindScrollSync(commitListContent) {
        // 移除之前的滚动监听器
        if (this.commitListContent && this.scrollHandler) {
            this.commitListContent.removeEventListener('scroll', this.scrollHandler);
        }
        
        if (commitListContent) {
            this.commitListContent = commitListContent;
            // 保存处理器引用以便后续移除
            this.scrollHandler = () => {
                this.scrollTop = this.commitListContent.scrollTop;
                this.render();
            };
            this.commitListContent.addEventListener('scroll', this.scrollHandler);
        }
    }

    /**
     * 处理鼠标移动
     */
    handleMouseMove(e) {
        if (!this.layout) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const hoveredNode = this.getNodeAt(x, y);
        
        if (hoveredNode !== this.hoveredNode) {
            this.hoveredNode = hoveredNode;
            this.render();
            
            // 更新鼠标样式
            this.canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
            
            // 触发悬停事件
            if (hoveredNode) {
                this.onNodeHover?.(hoveredNode);
            }
        }
    }

    /**
     * 处理点击
     */
    handleClick(e) {
        if (!this.layout) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const clickedNode = this.getNodeAt(x, y);
        
        if (clickedNode) {
            this.selectedNode = clickedNode;
            this.render();
            
            // 触发点击事件
            this.onNodeClick?.(clickedNode, e);
        }
    }

    /**
     * 获取指定位置的节点
     */
    getNodeAt(x, y) {
        if (!this.layout) return null;
        
        for (let i = 0; i < this.layout.nodes.length; i++) {
            const node = this.layout.nodes[i];
            const nodeX = this.getNodeX(node.column);
            const nodeY = this.getNodeY(i);
            
            const distance = Math.sqrt(
                Math.pow(x - nodeX, 2) + Math.pow(y - nodeY, 2)
            );
            
            if (distance <= this.config.nodeRadius + 2) {
                return node;
            }
        }
        
        return null;
    }

    /**
     * 获取节点X坐标
     */
    getNodeX(column) {
        return 20 + column * this.config.columnSpacing;
    }

    /**
     * 获取节点Y坐标（考虑滚动偏移和面板头部）
     */
    getNodeY(row) {
        // 尝试从实际的提交元素获取位置
        if (this.commitListContent) {
            const commitItems = this.commitListContent.querySelectorAll('.commit-item');
            if (commitItems[row]) {
                // 计算相对于容器的位置，考虑滚动偏移
                const itemOffsetTop = commitItems[row].offsetTop;
                const panelHeaderHeight = 40; // 面板头部高度
                return panelHeaderHeight + itemOffsetTop + commitItems[row].offsetHeight / 2 - this.scrollTop;
            }
        }
        
        // 回退到计算位置
        const panelHeaderHeight = 40; // 面板头部高度
        return panelHeaderHeight + row * this.config.rowHeight + this.config.rowHeight / 2 - this.scrollTop;
    }

    /**
     * 设置布局数据
     */
    setLayout(layout) {
        this.layout = layout;
        this.adjustContainerWidth();
        this.render();
    }

    /**
     * 根据分支数量调整容器宽度
     */
    adjustContainerWidth() {
        if (!this.layout) return;
        
        const requiredWidth = this.getGraphWidth();
        this.container.style.width = `${requiredWidth}px`;
        
        // 如果分支数量很多，在控制台提供信息
        if (this.layout.maxColumns > 20) {
            console.info(`Git Graph: 检测到 ${this.layout.maxColumns} 个分支，容器宽度已调整为 ${requiredWidth}px`);
        }
        
        // 触发容器大小更新
        setTimeout(() => {
            this.updateCanvasSize();
            this.render();
        }, 100); // 等待CSS过渡完成
    }

    /**
     * 渲染图形
     */
    render() {
        if (!this.layout || !this.ctx) return;
        
        const rect = this.container.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
        
        // 只渲染可见区域的内容
        const visibleNodes = this.getVisibleNodes();
        const visibleEdges = this.getVisibleEdges(visibleNodes);
        
        // 渲染连线
        this.renderEdges(visibleEdges);
        
        // 渲染节点
        this.renderNodes(visibleNodes);
    }

    /**
     * 获取可见的节点
     */
    getVisibleNodes() {
        if (!this.layout) return [];
        
        const containerHeight = this.container.getBoundingClientRect().height;
        const visibleNodes = [];
        
        this.layout.nodes.forEach((node, index) => {
            const y = this.getNodeY(index);
            if (y >= -this.config.nodeRadius && y <= containerHeight + this.config.nodeRadius) {
                visibleNodes.push({ node, index });
            }
        });
        
        return visibleNodes;
    }

    /**
     * 获取可见的连线
     */
    getVisibleEdges(visibleNodes) {
        if (!this.layout) return [];
        
        const visibleHashes = new Set(visibleNodes.map(vn => vn.node.hash));
        return this.layout.edges.filter(edge => 
            visibleHashes.has(edge.from) || visibleHashes.has(edge.to)
        );
    }

    /**
     * 渲染连线
     */
    renderEdges(visibleEdges = null) {
        const edges = visibleEdges || this.layout.edges;
        
        this.ctx.lineWidth = this.config.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        edges.forEach(edge => {
            const fromNode = this.layout.nodes.find(n => n.hash === edge.from);
            const toNode = this.layout.nodes.find(n => n.hash === edge.to);
            
            if (!fromNode || !toNode) return;
            
            const fromIndex = this.layout.nodes.indexOf(fromNode);
            const toIndex = this.layout.nodes.indexOf(toNode);
            
            const fromX = this.getNodeX(edge.fromColumn);
            const fromY = this.getNodeY(fromIndex);
            const toX = this.getNodeX(edge.toColumn);
            const toY = this.getNodeY(toIndex);
            
            // 检查连线是否在可见区域内
            const containerHeight = this.container.getBoundingClientRect().height;
            if (Math.max(fromY, toY) < -20 || Math.min(fromY, toY) > containerHeight + 20) {
                return;
            }
            
            // 检查连线是否在水平可见区域内（防止超出容器宽度的分支线被裁剪）
            const containerWidth = this.container.getBoundingClientRect().width;
            if (Math.max(fromX, toX) < -10 || Math.min(fromX, toX) > containerWidth + 10) {
                return;
            }
            
            const color = this.config.colors[edge.colorIndex % this.config.colors.length];
            this.ctx.strokeStyle = color;
            
            this.ctx.beginPath();
            
            if (edge.fromColumn === edge.toColumn) {
                // 直线
                this.ctx.moveTo(fromX, fromY);
                this.ctx.lineTo(toX, toY);
            } else {
                // 曲线（用于分支和合并）
                this.drawCurvedLine(fromX, fromY, toX, toY);
            }
            
            this.ctx.stroke();
        });
    }

    /**
     * 绘制曲线
     */
    drawCurvedLine(fromX, fromY, toX, toY) {
        const midY = (fromY + toY) / 2;
        
        this.ctx.moveTo(fromX, fromY);
        this.ctx.bezierCurveTo(
            fromX, midY,
            toX, midY,
            toX, toY
        );
    }

    /**
     * 渲染节点
     */
    renderNodes(visibleNodes = null) {
        const nodes = visibleNodes || this.layout.nodes.map((node, index) => ({ node, index }));
        
        nodes.forEach(({ node, index }) => {
            const x = this.getNodeX(node.column);
            const y = this.getNodeY(index);
            
            // 检查节点是否在可见区域内
            const containerHeight = this.container.getBoundingClientRect().height;
            const containerWidth = this.container.getBoundingClientRect().width;
            if (y < -this.config.nodeRadius || y > containerHeight + this.config.nodeRadius ||
                x < -this.config.nodeRadius || x > containerWidth + this.config.nodeRadius) {
                return;
            }
            
            const color = this.config.colors[node.colorIndex % this.config.colors.length];
            
            // 绘制节点背景（白色圆圈）
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.config.nodeRadius + 1, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 绘制节点
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.config.nodeRadius, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 如果是悬停或选中状态，添加高亮效果
            if (node === this.hoveredNode || node === this.selectedNode) {
                this.ctx.strokeStyle = node === this.selectedNode ? '#007acc' : '#666666';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(x, y, this.config.nodeRadius + 3, 0, 2 * Math.PI);
                this.ctx.stroke();
            }
        });
    }

    /**
     * 获取图形宽度
     */
    getGraphWidth() {
        if (!this.layout) return 120; // 默认最小宽度
        // 计算所需宽度：左边距 + 最大列数 * 列间距 + 右边距
        const requiredWidth = 20 + this.layout.maxColumns * this.config.columnSpacing + 20;
        return Math.max(120, Math.min(500, requiredWidth));
    }

    /**
     * 获取图形高度
     */
    getGraphHeight() {
        if (!this.layout) return 0;
        return 40 + this.layout.nodes.length * this.config.rowHeight;
    }

    /**
     * 滚动到指定节点
     */
    scrollToNode(nodeHash) {
        if (!this.layout) return;
        
        const node = this.layout.nodes.find(n => n.hash === nodeHash);
        if (!node) return;
        
        const nodeIndex = this.layout.nodes.indexOf(node);
        const y = this.getNodeY(nodeIndex);
        
        // 滚动容器到指定位置
        const containerRect = this.container.getBoundingClientRect();
        const scrollTop = y - containerRect.height / 2;
        
        if (this.container.scrollTo) {
            this.container.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
            });
        }
    }

    /**
     * 设置选中节点
     */
    setSelectedNode(nodeHash) {
        if (!this.layout) return;
        
        this.selectedNode = this.layout.nodes.find(n => n.hash === nodeHash) || null;
        this.render();
    }

    /**
     * 更新图表数据
     */
    updateGraph(gitGraphData, commits) {
        this.layout = gitGraphData;
        this.commits = commits;
        this.adjustContainerWidth();
        this.render();
    }

    /**
     * 销毁组件
     */
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}

/**
 * 创建 Git Graph 组件
 */
export function createGitGraph(container, commitListContent, options = {}) {
    const renderer = new GitGraphRenderer(container, commitListContent);
    
    // 设置配置选项
    if (options.config) {
        Object.assign(renderer.config, options.config);
    }
    
    // 设置事件回调
    if (options.onNodeClick) {
        renderer.onNodeClick = options.onNodeClick;
    }
    
    if (options.onNodeHover) {
        renderer.onNodeHover = options.onNodeHover;
    }
    
    return renderer;
}