/**
 * Git提交图谱绘制模块
 * 负责生成和渲染Git提交历史的可视化图形
 */

/**
 * 创建提交图形的HTML
 * @param {Object} commit - 提交记录对象
 * @param {number} index - 提交记录在列表中的索引
 * @param {number} maxColumns - 最大列数
 * @returns {string} 图形HTML
 */
export function createGraphHtml(commit, index, maxColumns) {
    if (!commit.graphInfo) {
        return '<div class="commit-graph"></div>';
    }
    
    const { column, lanes } = commit.graphInfo;
    const columnWidth = 10; // 每列宽度
    
    // 获取全局commits数组的引用，用于查找父子提交关系
    const commits = window.getState ? window.getState('commits') : (window.commits || []);
    
    // 预处理所有连接信息
    const connections = processConnections(commit, commits, index);
    
    let html = `<div class="commit-graph" style="width: ${maxColumns * columnWidth}px;">`;
    
    // 为每一列创建一个容器
    for (let col = 0; col < maxColumns; col++) {
        const lane = lanes.find(l => l.column === col);
        const laneColor = lane ? lane.color : getLineColor(col);
        
        html += `<div class="graph-column" data-column="${col}">`;
        
        // 1. 绘制垂直线
        if (shouldDrawVerticalLine(lane, commit, connections, col)) {
            html += `<div class="graph-vertical-line" style="background-color: ${laneColor};"></div>`;
        }
        
        // 2. 绘制曲线连接
        const curves = getCurveConnections(lane, connections, col);
        curves.forEach(curve => {
            html += `<div class="graph-curve ${curve.position}" style="border-color: ${curve.color};"></div>`;
        });
        
        // 3. 绘制提交节点
        if (col === column) {
            const nodeClass = commit.parents && commit.parents.length > 1 ? 'merge-node' : 'commit-node';
            html += `<div class="${nodeClass}" style="background-color: ${laneColor};"></div>`;
        }
        
        // 4. 绘制分叉连接线
        connections.forks.forEach(fork => {
            if (fork.sourceCol === col) {
                const type = fork.targetCol > col ? 'fork-right' : 'fork-left';
                const colDistance = Math.abs(fork.targetCol - fork.sourceCol);
                const width = colDistance * 16; // 16px是每列的宽度
                html += `<div class="graph-fork-curve ${type}" style="border-color: ${fork.color}; --fork-width: ${width}px;"></div>`;
            }
        });
        
        // 5. 绘制水平连接线
        connections.horizontals.forEach(conn => {
            // 如果是当前列是源列或目标列，或者是中间经过的列
            const isSource = conn.sourceCol === col;
            const isTarget = conn.targetCol === col;
            const isBetween = (Math.min(conn.sourceCol, conn.targetCol) < col && 
                              col < Math.max(conn.sourceCol, conn.targetCol));
            
            if (isSource || isTarget) {
                // 源列或目标列绘制带方向的水平线
                const direction = isSource ? 
                    (conn.targetCol < col ? 'left' : 'right') : 
                    (conn.sourceCol < col ? 'left' : 'right');
                html += `<div class="graph-horizontal-line ${direction}" style="background-color: ${conn.color};"></div>`;
            } else if (isBetween) {
                // 中间列绘制穿过的水平线
                html += `<div class="graph-horizontal-line" style="background-color: ${conn.color};"></div>`;
            }
        });
        
        html += '</div>'; // 结束graph-column
    }
    
    html += '</div>'; // 结束commit-graph
    return html;
}

/**
 * 预处理提交的所有连接信息
 * @param {Object} commit - 提交记录对象
 * @param {Array} commits - 所有提交记录数组
 * @param {number} index - 提交记录在列表中的索引
 * @returns {Object} 包含各种连接信息的对象
 */
function processConnections(commit, commits, index) {
    // 初始化连接信息对象
    const connections = {
        verticals: [], // 垂直线信息
        curves: [],    // 曲线连接信息
        forks: [],     // 分叉连接信息
        horizontals: [], // 水平连接信息
        activeColumns: new Set() // 活跃列集合
    };
    
    if (!commit.graphInfo) {
        return connections;
    }
    
    const { column, lanes } = commit.graphInfo;
    
    // 1. 处理垂直线信息 - 所有车道都可能有垂直线
    lanes.forEach(lane => {
        if (lane.type === 'line' || lane.type === 'commit') {
            connections.verticals.push({
                column: lane.column,
                color: lane.color
            });
            connections.activeColumns.add(lane.column);
        }
    });
    
    // 2. 处理曲线连接
    lanes.forEach(lane => {
        if (lane.type === 'merge' && lane.char === '\\') {
            connections.curves.push({
                column: lane.column,
                color: lane.color,
                position: 'bottom-left'
            });
        } else if (lane.type === 'fork' && lane.char === '/') {
            connections.curves.push({
                column: lane.column,
                color: lane.color,
                position: 'bottom-right'
            });
        }
    });
    
    // 3. 处理分叉连接 - 当前提交到子提交的连接
    if (commit.hash && commit.children && commit.children.length > 0) {
        // 查找所有子提交
        const childCommits = [];
        commit.children.forEach(childHash => {
            const childCommit = commits.find(c => c.hash === childHash);
            if (childCommit && childCommit.graphInfo) {
                childCommits.push({
                    commit: childCommit,
                    index: commits.findIndex(c => c.hash === childHash)
                });
            }
        });
        
        // 如果有子提交，检查是否有分叉
        if (childCommits.length > 0) {
            const currentCol = column;
            const uniqueChildColumns = [...new Set(childCommits.map(c => c.commit.graphInfo?.column).filter(c => c !== undefined))];
            
            uniqueChildColumns.forEach(childCol => {
                if (childCol !== currentCol) {
                    const color = getLineColor(childCol);
                    connections.forks.push({
                        sourceCol: currentCol,
                        targetCol: childCol,
                        color: color
                    });
                }
            });
        }
    }
    
    // 4. 处理水平连接 - 合并提交的连接线
    if (commit.parents && commit.parents.length > 1) {
        const currentCol = column;
        
        // 对于合并提交，添加从父提交到当前提交的连接线
        commit.parents.forEach(parentHash => {
            const parentCommit = commits.find(c => c.hash === parentHash);
            if (parentCommit && parentCommit.graphInfo && parentCommit.graphInfo.column !== currentCol) {
                const parentCol = parentCommit.graphInfo.column;
                const direction = parentCol < currentCol ? 'left' : 'right';
                const color = getLineColor(parentCol);
                
                connections.horizontals.push({
                    sourceCol: currentCol,
                    targetCol: parentCol,
                    direction: direction,
                    color: color
                });
                
                // 标记这些列为活跃列
                connections.activeColumns.add(currentCol);
                connections.activeColumns.add(parentCol);
                
                // 标记中间的列也为活跃列（用于绘制穿过的水平线）
                const minCol = Math.min(currentCol, parentCol);
                const maxCol = Math.max(currentCol, parentCol);
                for (let col = minCol + 1; col < maxCol; col++) {
                    connections.activeColumns.add(col);
                }
            }
        });
    }
    
    // 5. 检查相邻提交中的活跃列 - 仅检查直接相邻的提交，减少不必要的连接线
    const checkRange = 1; // 减少检查范围，只检查前后1个提交
    
    // 向上查找 - 只检查直接相关的列
    for (let i = Math.max(0, index - checkRange); i < index; i++) {
        const prevCommit = commits[i];
        if (prevCommit && prevCommit.graphInfo) {
            // 只添加当前提交直接相关的列
            if (prevCommit.hash && commit.parents && commit.parents.includes(prevCommit.hash)) {
                connections.activeColumns.add(prevCommit.graphInfo.column);
                
                // 只添加与当前提交直接相关的车道列
                prevCommit.graphInfo.lanes.forEach(lane => {
                    if (lane.type === 'commit' || lane.type === 'line') {
                        connections.activeColumns.add(lane.column);
                    }
                });
            }
        }
    }
    
    // 向下查找 - 只检查直接相关的列
    for (let i = index + 1; i < Math.min(commits.length, index + checkRange + 1); i++) {
        const nextCommit = commits[i];
        if (nextCommit && nextCommit.graphInfo) {
            // 只添加当前提交直接相关的列
            if (nextCommit.hash && commit.children && commit.children.includes(nextCommit.hash)) {
                connections.activeColumns.add(nextCommit.graphInfo.column);
                
                // 只添加与当前提交直接相关的车道列
                nextCommit.graphInfo.lanes.forEach(lane => {
                    if (lane.type === 'commit' || lane.type === 'line') {
                        connections.activeColumns.add(lane.column);
                    }
                });
            }
        }
    }
    
    return connections;
}

/**
 * 判断是否应该在指定列绘制垂直线
 * @param {Object|null} lane - 当前列的车道信息
 * @param {Object} commit - 提交记录对象
 * @param {Object} connections - 连接信息对象
 * @param {number} col - 列号
 * @returns {boolean} 是否应该绘制垂直线
 */
function shouldDrawVerticalLine(lane, commit, connections, col) {
    // 如果有车道信息且类型是line或commit，则绘制垂直线
    if (lane && (lane.type === 'line' || lane.type === 'commit')) {
        return true;
    }
    
    // 检查是否有分叉连接使用此列
    const hasForkConnection = connections.forks.some(fork => 
        fork.sourceCol === col
    ) && lane;
    
    if (hasForkConnection) {
        return true;
    }
    
    // 检查是否有水平连接使用此列作为源或目标
    const hasHorizontalConnection = connections.horizontals.some(h => 
        h.sourceCol === col || h.targetCol === col
    );
    
    if (hasHorizontalConnection) {
        return true;
    }
    
    // 如果该列是活跃列，但不是仅因为水平线经过
    if (connections.activeColumns.has(col)) {
        // 排除只有水平线经过的情况
        const isOnlyHorizontalPassThrough = connections.horizontals.some(h => 
            (h.sourceCol !== col && h.targetCol !== col) && 
            (Math.min(h.sourceCol, h.targetCol) < col && col < Math.max(h.sourceCol, h.targetCol))
        ) && !hasForkConnection && !hasHorizontalConnection;
        
        if (!isOnlyHorizontalPassThrough) {
            return true;
        }
    }
    
    return false;
}

/**
 * 获取曲线连接信息
 * @param {Object|null} lane - 当前列的车道信息
 * @param {Object} connections - 连接信息对象
 * @param {number} col - 列号
 * @returns {Array} 曲线连接信息数组
 */
function getCurveConnections(lane, connections, col) {
    const curves = [];
    
    // 如果有车道信息且类型是merge或fork，则添加曲线
    if (lane) {
        if (lane.type === 'merge' && lane.char === '\\') {
            curves.push({
                position: 'bottom-left',
                color: lane.color
            });
        } else if (lane.type === 'fork' && lane.char === '/') {
            curves.push({
                position: 'bottom-right',
                color: lane.color
            });
        }
    }
    
    // 从预处理的连接信息中查找与当前列相关的曲线
    connections.curves.forEach(curve => {
        if (curve.column === col) {
            // 避免重复添加
            if (!curves.some(c => c.position === curve.position)) {
                curves.push({
                    position: curve.position,
                    color: curve.color
                });
            }
        }
    });
    
    return curves;
}

/**
 * 获取连接线颜色
 * @param {number} col - 列号
 * @returns {string} 颜色值
 */
export function getLineColor(col) {
    // 使用更多对比度高的颜色，确保分支线条易于区分
    const colors = [
        '#e74c3c', // 红色
        '#3498db', // 蓝色
        '#2ecc71', // 绿色
        '#f39c12', // 橙色
        '#9b59b6', // 紫色
        '#1abc9c', // 青绿色
        '#e67e22', // 橙红色
        '#34495e', // 深蓝灰色
        '#16a085', // 深青色
        '#d35400', // 深橙色
        '#8e44ad', // 深紫色
        '#27ae60', // 深绿色
        '#2980b9', // 深蓝色
        '#c0392b', // 深红色
        '#7f8c8d'  // 灰色
    ];
    
    // 确保相同的列号始终获得相同的颜色
    return colors[Math.abs(col) % colors.length];
}