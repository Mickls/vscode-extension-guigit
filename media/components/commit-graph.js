/**
 * Git提交图谱绘制模块
 * 负责生成和渲染Git提交历史的可视化图形
 */

/**
 * 创建提交图谱的HTML结构
 * @param {Object} commit - 提交记录对象
 * @param {number} index - 提交记录在列表中的索引
 * @returns {string} 图谱的HTML字符串
 */
export function createGraphHtml(commit, index) {
    // 添加调试信息
    if (index < 3) {
        console.log(`createGraphHtml called for commit ${index}:`, {
            hash: commit.hash?.substring(0, 7),
            message: commit.message,
            graphInfo: commit.graphInfo,
            hasGraphInfo: !!commit.graphInfo
        });
    }
    
    if (!commit.graphInfo) {
        console.log(`No graphInfo for commit ${index}, returning placeholder`);
        return '<div class="graph-placeholder"></div>';
    }

    const { column, lanes } = commit.graphInfo;
    // 计算最大列数，确保包含所有活跃的车道
    const maxColumns = Math.max(...lanes.map(l => l.column), column) + 1;
    
    let graphHtml = '';
    
    // 为每一列创建图形元素
    for (let col = 0; col < maxColumns; col++) {
        // 查找当前列的车道信息
        const lane = lanes.find(l => l.column === col);
        const color = lane ? lane.color : getLineColor(col);
        const isCommitColumn = col === column;
        
        let columnHtml = '<div class="graph-column">';
        
        // 根据车道类型渲染不同的图形元素
        if (lane) {
            if (lane.type === 'line' || lane.type === 'commit') {
                columnHtml += `<div class="graph-vertical-line" style="background-color: ${color};"></div>`;
            } else if (lane.type === 'merge' && lane.char === '\\') {
                // 渲染合并线（\）
                columnHtml += `<div class="graph-curve bottom-left" style="border-color: ${color};"></div>`;
            } else if (lane.type === 'fork' && lane.char === '/') {
                // 渲染分叉线（/）
                columnHtml += `<div class="graph-curve bottom-right" style="border-color: ${color};"></div>`;
            }
        } else if (hasActiveBranch(commit, index, col)) {
            // 备用逻辑：如果没有车道信息但检测到活跃分支，也显示线条
            columnHtml += `<div class="graph-vertical-line" style="background-color: ${color};"></div>`;
        }
        
        // 如果是提交所在的列，添加提交节点
        if (isCommitColumn) {
            const isMerge = commit.parents && commit.parents.length > 1;
            const nodeClass = isMerge ? 'merge-node' : 'commit-node';
            columnHtml += `<div class="${nodeClass}" style="background-color: ${color};"></div>`;
            
            // 检查是否需要添加分支分叉连接线
            const forkConnections = getForkConnections(commit, index, col);
            // 调试信息
            if (forkConnections.length > 0) {
                // 发送调试信息到VS Code
                if (typeof vscode !== 'undefined') {
                    vscode.postMessage({
                        type: 'debug',
                        message: 'Fork connections found:',
                        data: {
                            commit: commit.hash.substring(0, 7),
                            message: commit.message,
                            index,
                            col,
                            connections: forkConnections
                        }
                    });
                }
            }
            forkConnections.forEach(connection => {
                const { targetCol, color: lineColor, type } = connection;
                const distance = Math.abs(targetCol - col);
                if (type === 'fork-right') {
                    // 从当前提交节点向右分叉的弯曲连接线
                    columnHtml += `<div class="graph-fork-curve right" style="--target-distance: ${distance}; border-bottom-color: ${lineColor}; border-right-color: ${lineColor};"></div>`;
                } else if (type === 'fork-left') {
                    // 从当前提交节点向左分叉的弯曲连接线
                    columnHtml += `<div class="graph-fork-curve left" style="--target-distance: ${distance}; border-bottom-color: ${lineColor}; border-left-color: ${lineColor};"></div>`;
                }
            });
        }
        
        // 添加分支合并的水平连接线
        const horizontalConnections = getHorizontalConnections(commit, index, col);
        horizontalConnections.forEach(connection => {
            const { direction, targetCol, color: lineColor } = connection;
            const width = Math.abs(targetCol - col) * 16; // 16px per column
            const left = direction === 'right' ? '50%' : `${-width + 8}px`;
            columnHtml += `<div class="graph-horizontal-line" style="background-color: ${lineColor}; width: ${width}px; left: ${left};"></div>`;
        });
        
        columnHtml += '</div>';
        graphHtml += columnHtml;
    }
    
    return graphHtml;
}

/**
 * 判断指定列是否有活跃的分支线
 * @param {Object} commit - 提交记录对象
 * @param {number} index - 提交记录在列表中的索引
 * @param {number} col - 列号
 * @returns {boolean} 是否有活跃的分支线
 */
export function hasActiveBranch(commit, index, col) {
    // 检查当前提交是否在这一列
    if (commit.graphInfo && commit.graphInfo.column === col) {
        return true;
    }
    
    // 检查当前提交的lanes中是否有这一列的信息
    if (commit.graphInfo && commit.graphInfo.lanes) {
        const hasLaneInColumn = commit.graphInfo.lanes.some(lane => lane.column === col);
        if (hasLaneInColumn) {
            return false; // 如果已经有lane信息，不需要额外的线条
        }
    }
    
    // 获取全局commits数组的引用
    const commits = window.commits || [];
    
    // 检查这一列是否有连续的分支线
    // 向上查找
    let hasAbove = false;
    for (let i = index - 1; i >= 0 && i >= index - 3; i--) { // 限制查找范围
        const prevCommit = commits[i];
        if (prevCommit && prevCommit.graphInfo) {
            // 检查是否有lane在这一列
            if (prevCommit.graphInfo.lanes && prevCommit.graphInfo.lanes.some(lane => lane.column === col)) {
                hasAbove = true;
                break;
            }
            // 如果找到在同一列的提交
            if (prevCommit.graphInfo.column === col) {
                hasAbove = true;
                break;
            }
        }
    }
    
    // 向下查找
    let hasBelow = false;
    for (let i = index + 1; i < commits.length && i <= index + 3; i++) { // 限制查找范围
        const nextCommit = commits[i];
        if (nextCommit && nextCommit.graphInfo) {
            // 检查是否有lane在这一列
            if (nextCommit.graphInfo.lanes && nextCommit.graphInfo.lanes.some(lane => lane.column === col)) {
                hasBelow = true;
                break;
            }
            // 如果找到在同一列的提交
            if (nextCommit.graphInfo.column === col) {
                hasBelow = true;
                break;
            }
        }
    }
    
    return hasAbove && hasBelow; // 只有上下都有连接时才显示线条
}

/**
 * 获取分支连接线信息（从当前提交连接到下一个提交的不同分支）
 * @param {Object} commit - 提交记录对象
 * @param {number} index - 提交记录在列表中的索引
 * @param {number} col - 列号
 * @returns {Array} 分支连接线数组
 */
export function getBranchConnections(commit, index, col) {
    const connections = [];
    
    // 暂时返回空数组，先解决基本的分支线显示问题
    // 后续可以根据实际的Git图形数据来实现分支连接逻辑
    
    return connections;
}

/**
 * 获取分支分叉连接线信息
 * @param {Object} commit - 提交记录对象
 * @param {number} index - 提交记录在列表中的索引
 * @param {number} col - 列号
 * @returns {Array} 分叉连接线数组
 */
export function getForkConnections(commit, index, col) {
    const connections = [];
    
    // 添加详细的调试信息
    if (index < 5) { // 只对前几个提交输出调试信息
        console.log(`Debug getForkConnections - commit ${index}:`, {
            hash: commit.hash?.substring(0, 7),
            message: commit.message,
            col: col,
            graphInfo: commit.graphInfo,
            parents: commit.parents
        });
    }
    
    // 检查当前提交是否有子提交在不同的列（分叉检测）
    // 分叉应该发生在一个提交有多个子提交，且这些子提交在不同列的情况
    if (commit.hash && commit.graphInfo) {
        // 获取全局commits数组的引用
        const commits = window.commits || [];
        
        // 查找所有以当前提交为父提交的子提交
        const childCommits = [];
        for (let i = 0; i < commits.length; i++) {
            const otherCommit = commits[i];
            if (otherCommit && otherCommit.parents && otherCommit.parents.includes(commit.hash)) {
                childCommits.push({
                    commit: otherCommit,
                    index: i
                });
            }
        }
        
        if (index < 5) {
            if (typeof vscode !== 'undefined') {
                vscode.postMessage({
                    type: 'debug',
                    message: `Found ${childCommits.length} child commits for ${commit.hash?.substring(0, 7)}`,
                    data: childCommits.map(c => ({
                        hash: c.commit.hash?.substring(0, 7),
                        column: c.commit.graphInfo?.column,
                        index: c.index
                    }))
                });
            }
        }
        
        // 如果有多个子提交，或者子提交在不同的列，说明这里有分叉
        if (childCommits.length > 0) {
            const currentCol = commit.graphInfo.column;
            const uniqueChildColumns = [...new Set(childCommits.map(c => c.commit.graphInfo?.column).filter(c => c !== undefined))];
            
            uniqueChildColumns.forEach(childCol => {
                if (childCol !== currentCol && col === currentCol) {
                    const targetColor = getLineColor(childCol);
                    const type = childCol > currentCol ? 'fork-right' : 'fork-left';
                    
                    // 避免重复添加
                    const exists = connections.some(c => c.targetCol === childCol && c.type === type);
                    if (!exists) {
                        connections.push({
                            targetCol: childCol,
                            color: targetColor,
                            type: type
                        });
                        
                        if (index < 5) {
                            if (typeof vscode !== 'undefined') {
                                vscode.postMessage({
                                    type: 'debug',
                                    message: `Added fork connection from ${currentCol} to ${childCol}`,
                                    data: { currentCol, childCol, col, type, targetColor }
                                });
                            }
                        }
                    }
                }
            });
        }
    }
    
    return connections;
}

/**
 * 获取水平连接线信息
 * @param {Object} commit - 提交记录对象
 * @param {number} index - 提交记录在列表中的索引
 * @param {number} col - 列号
 * @returns {Array} 水平连接线数组
 */
export function getHorizontalConnections(commit, index, col) {
    const connections = [];
    
    // 获取全局commits数组的引用
        const commits = window.commits || [];
        
        // 如果是合并提交，需要绘制从父提交到当前提交的连接线
        if (commit.parents && commit.parents.length > 1 && commit.graphInfo && commit.graphInfo.column === col) {
            commit.parents.forEach(parentHash => {
                const parentCommit = commits.find(c => c.hash === parentHash);
                if (parentCommit && parentCommit.graphInfo && parentCommit.graphInfo.column !== col) {
                    const targetCol = parentCommit.graphInfo.column;
                    const direction = targetCol < col ? 'left' : 'right';
                    const color = getLineColor(targetCol);
                    connections.push({ direction, targetCol, color });
                }
            });
        }
        
        // 如果当前列不是提交列，检查是否有合并线经过
        if (commit.graphInfo && commit.graphInfo.column !== col) {
            // 检查是否有其他提交的合并线经过这一列
            if (commit.parents && commit.parents.length > 1) {
                const commitCol = commit.graphInfo.column;
                commit.parents.forEach(parentHash => {
                    const parentCommit = commits.find(c => c.hash === parentHash);
                    if (parentCommit && parentCommit.graphInfo) {
                        const parentCol = parentCommit.graphInfo.column;
                        // 如果合并线经过当前列
                        if ((commitCol < col && col < parentCol) || (parentCol < col && col < commitCol)) {
                            const color = getLineColor(parentCol);
                            connections.push({ direction: 'through', targetCol: parentCol, color });
                        }
                    }
                });
            }
        }
    
    return connections;
}

/**
 * 获取连接线颜色
 * @param {number} col - 列号
 * @returns {string} 颜色值
 */
export function getLineColor(col) {
    const colors = ['#007acc', '#f14c4c', '#00aa00', '#ff8800', '#aa00aa', '#00aaaa'];
    return colors[col % colors.length];
}