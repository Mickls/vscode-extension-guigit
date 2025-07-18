/**
 * Git History View - Main JavaScript Module
 * 处理Git历史记录的前端交互逻辑
 */
(function() {
    'use strict';
    
    // 获取VS Code API
    const vscode = acquireVsCodeApi();
    
    // 全局变量
    let commits = [];           // 提交记录列表
    let branches = [];          // 分支列表
    let selectedCommits = [];   // 选中的提交记录
    let currentCommit = null;   // 当前查看的提交
    let currentBranch = '';     // 当前分支
    let loadedCommits = 0;      // 已加载的提交数量
    let totalCommits = 0;       // 总提交数量
    let isLoading = false;      // 是否正在加载
    let fileViewMode = 'list';  // 文件视图模式: 'tree' 或 'list'
    
    // 性能优化：添加缓存机制
    let commitDetailsCache = new Map(); // 缓存commit详情，避免重复请求
    let pendingRequests = new Map();    // 防止同一commit的重复请求

    // DOM元素引用
    const branchSelect = document.getElementById('branchSelect');         // 分支选择下拉框
    const refreshBtn = document.getElementById('refreshBtn');             // 刷新按钮
    const jumpToHeadBtn = document.getElementById('jumpToHeadBtn');       // 跳转到HEAD按钮
    const commitList = document.getElementById('commitList');             // 提交列表容器
    const commitDetails = document.getElementById('commitDetails');       // 提交详情面板
    const contextMenu = document.getElementById('contextMenu');           // 右键上下文菜单
    const comparePanel = document.getElementById('comparePanel');         // 比较面板
    const compareContent = document.getElementById('compareContent');     // 比较内容容器
    const closeCompare = document.getElementById('closeCompare');         // 关闭比较面板按钮
    
    // 新增的拖拽和折叠相关元素（这些元素是动态创建的，不在初始化时获取）
    const resizer = document.getElementById('resizer');                   // 分割线
    let leftCollapseBtn = null;                                           // 左侧折叠按钮
    let rightCollapseBtn = null;                                          // 右侧折叠按钮
    
    // 拖拽和折叠相关变量
    let isResizing = false;                                               // 是否正在拖拽分割线
    let leftPanelWidth = 50;                                              // 左侧面板宽度百分比
    let leftPanelCollapsed = false;                                       // 左侧面板是否折叠
    let rightPanelCollapsed = false;                                      // 右侧面板是否折叠

    // 事件监听器设置
    // 添加滚动监听器以实现无限滚动加载
    commitList.addEventListener('scroll', () => {
        if (isLoading || loadedCommits >= totalCommits) {
            return;
        }
        
        const scrollTop = commitList.scrollTop;
        const scrollHeight = commitList.scrollHeight;
        const clientHeight = commitList.clientHeight;
        
        // 当滚动到距离底部50px时开始加载更多提交
        if (scrollTop + clientHeight >= scrollHeight - 50) {
            loadCommits(false);
        }
    });

    // 分支选择变更事件
    branchSelect.addEventListener('change', (e) => {
        currentBranch = e.target.value;
        loadedCommits = 0;
        commits = [];
        selectedCommits = [];
        // 注意：不重置currentCommit，让updateCommitHistory函数来处理
        // 性能优化：切换分支时清理缓存
        commitDetailsCache.clear();
        pendingRequests.clear();
        updateMultiSelectInfo();
        loadCommits(true);
    });

    // 刷新按钮点击事件
    refreshBtn.addEventListener('click', () => {
        loadedCommits = 0;
        commits = [];
        selectedCommits = [];
        // 注意：不重置currentCommit，让updateCommitHistory函数来处理
        // 性能优化：刷新时清理缓存
        commitDetailsCache.clear();
        pendingRequests.clear();
        updateMultiSelectInfo();
        vscode.postMessage({ type: 'getBranches' });
        loadCommits(true);
    });

    // 跳转到HEAD提交按钮点击事件
    jumpToHeadBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'jumpToHead' });
    });

    // 关闭比较面板按钮点击事件
    closeCompare.addEventListener('click', () => {
        comparePanel.style.display = 'none';
    });

    // 全局点击事件 - 隐藏右键上下文菜单
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    // ==================== 拖拽和折叠功能事件监听器 ====================
    
    // 分割线拖拽功能
    let mouseMoveHandler = null;
    let mouseUpHandler = null;
    
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 如果面板已折叠，不允许拖拽
        if (leftPanelCollapsed || rightPanelCollapsed) return;
        
        isResizing = true;
        resizer.classList.add('dragging');
        document.body.classList.add('resizing');
        
        // 禁用面板的过渡动画以提高拖拽响应性
        commitList.classList.add('no-transition');
        commitDetails.classList.add('no-transition');
        
        const containerRect = document.querySelector('.content').getBoundingClientRect();
        
        // 创建新的事件处理器
        mouseMoveHandler = (e) => {
            if (!isResizing) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
            
            // 限制最小和最大宽度
            if (newLeftWidth >= 20 && newLeftWidth <= 80) {
                leftPanelWidth = newLeftWidth;
                updatePanelWidths();
            }
        };
        
        mouseUpHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (isResizing) {
                isResizing = false;
                resizer.classList.remove('dragging');
                document.body.classList.remove('resizing');
                
                // 重新启用面板的过渡动画
                commitList.classList.remove('no-transition');
                commitDetails.classList.remove('no-transition');
                
                // 移除事件监听器
                if (mouseMoveHandler) {
                    document.removeEventListener('mousemove', mouseMoveHandler);
                    mouseMoveHandler = null;
                }
                if (mouseUpHandler) {
                    document.removeEventListener('mouseup', mouseUpHandler);
                    mouseUpHandler = null;
                }
            }
        };
        
        // 添加事件监听器
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });

    // 键盘快捷键支持
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case '1':
                    e.preventDefault();
                    toggleLeftPanel();
                    break;
                case '2':
                    e.preventDefault();
                    toggleRightPanel();
                    break;
            }
        }
    });

    /**
     * 处理来自VS Code扩展的消息
     * 监听并响应各种类型的数据更新和用户操作
     */
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'branches':
                updateBranches(message.data);      // 更新分支列表
                break;
            case 'commitHistory':
                updateCommitHistory(message.data); // 更新提交历史记录
                break;
            case 'totalCommitCount':
                totalCommits = message.data;       // 设置总提交数量
                break;
            case 'commitDetails':
                updateCommitDetails(message.data); // 更新提交详情信息
                break;
            case 'compareResult':
                showCompareResult(message.data);   // 显示提交比较结果
                break;
            case 'jumpToHead':
                jumpToHeadCommit(message.data);    // 跳转到HEAD提交
                break;
            case 'jumpToCommit':
                jumpToSpecificCommit(message.data.hash); // 跳转到指定提交
                break;
            case 'commitBranches':
                handleCommitBranchesFound(message.data); // 处理找到提交所在分支的响应
                break;
            case 'error':
                showError(message.message);        // 显示错误信息
                break;
            case 'viewMode':
                fileViewMode = message.data;       // 设置文件视图模式
                break;
        }
    });

    /**
     * 加载提交记录
     * @param {boolean} reset - 是否重置加载状态，true表示重新开始加载
     */
    function loadCommits(reset = false) {
        if (isLoading) return;
        
        isLoading = true;
        
        if (reset) {
            loadedCommits = 0;
            commits = [];
            // 保留折叠按钮，只更新内容
            commitList.innerHTML = `
                <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">‹</button>
                <div class="loading">Loading commits...</div>
            `;
            rebindCollapseButtons();
        }
        
        // 请求获取提交历史记录
        vscode.postMessage({ 
            type: 'getCommitHistory', 
            branch: currentBranch || undefined,
            skip: loadedCommits
        });
        
        // 如果还没有总数，请求获取总提交数量
        if (totalCommits === 0) {
            vscode.postMessage({ 
                type: 'getTotalCommitCount', 
                branch: currentBranch || undefined
            });
        }
    }

    /**
     * 更新分支列表
     * @param {Array} branchData - 分支数据数组
     */
    function updateBranches(branchData) {
        branches = branchData;
        branchSelect.innerHTML = '<option value="all">All branches</option>';
        
        // 遍历分支数据，创建选项元素
        branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.name;
            option.textContent = branch.name + (branch.current ? ' (current)' : '');
            branchSelect.appendChild(option);
        });
        
        // 默认选择"All branches"
        branchSelect.value = 'all';
        currentBranch = 'all';
    }

    /**
     * 更新提交历史记录
     * @param {Object} data - 包含提交数据的对象
     * @param {Array} data.commits - 提交记录数组
     * @param {number} data.skip - 跳过的提交数量
     */
    function updateCommitHistory(data) {
        isLoading = false;
        
        if (data.skip === 0) {
            // 首次加载或刷新
            const previousCurrentCommit = currentCommit; // 保存之前选中的提交
            commits = data.commits;
            selectedCommits = [];
            
            // 检查之前选中的提交是否仍然存在于新的提交列表中
            if (previousCurrentCommit && data.commits.some(commit => commit.hash === previousCurrentCommit)) {
                // 如果之前选中的提交仍然存在，保持选中状态
                currentCommit = previousCurrentCommit;
                const commit = data.commits.find(c => c.hash === previousCurrentCommit);
                selectedCommits = commit ? [commit] : [];
            } else {
                // 只有当之前选中的提交不存在时才重置
                currentCommit = null;
                // 清空右侧详情面板
                commitDetails.innerHTML = `
                    <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
                    <div class="placeholder">Select a commit to view details</div>
                `;
                rebindCollapseButtons();
            }
            
            commitList.innerHTML = '';
            // 立即添加折叠按钮
            commitList.innerHTML = `
                <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">‹</button>
            `;
            rebindCollapseButtons();
            renderCommitList();
            
            // 如果保持了选中状态，需要恢复UI状态和详情显示
            if (currentCommit) {
                setTimeout(() => {
                    // 使用安全的更新函数确保UI状态正确
                    const commit = commits.find(c => c.hash === currentCommit);
                    if (commit) {
                        ensureCommitSelectionUI(currentCommit);
                        // 如果有缓存的详情，直接显示
                        if (commitDetailsCache.has(currentCommit)) {
                            updateCommitDetails(commitDetailsCache.get(currentCommit));
                        } else {
                            // 重新请求详情
                            vscode.postMessage({
                                type: 'getCommitDetails',
                                hash: currentCommit
                            });
                        }
                    }
                }, 50); // 稍微延迟以确保DOM已更新
            }
        } else {
            // 加载更多提交记录
            commits = commits.concat(data.commits);
            appendCommitList(data.commits);
        }
        
        loadedCommits = commits.length;
        
        // 检查是否正在搜索特定提交
        if (window.searchingForCommit) {
            const foundCommit = data.commits.find(commit => commit.hash === window.searchingForCommit);
            if (foundCommit) {
                // 找到了正在搜索的提交，立即跳转
                const targetElement = document.querySelector(`[data-hash="${window.searchingForCommit}"]`);
                if (targetElement) {
                    // 清除搜索标记
                    const searchHash = window.searchingForCommit;
                    window.searchingForCommit = null;
                    
                    // 跳转到找到的提交
                    setTimeout(() => {
                        jumpToSpecificCommit(searchHash);
                    }, 100); // 稍微延迟以确保DOM已更新
                }
            } else if (loadedCommits >= totalCommits) {
                // 已经加载完所有提交但仍未找到，清除搜索标记
                window.searchingForCommit = null;
                console.log('Commit not found after loading all commits');
            }
        }
        
        // 检查是否有待跳转的提交（切换分支后）
        if (window.pendingJumpCommit && data.skip === 0) {
            const foundCommit = data.commits.find(commit => commit.hash === window.pendingJumpCommit);
            if (foundCommit) {
                // 找到了待跳转的提交，立即跳转
                const jumpHash = window.pendingJumpCommit;
                window.pendingJumpCommit = null;
                
                setTimeout(() => {
                    jumpToSpecificCommit(jumpHash);
                }, 100); // 稍微延迟以确保DOM已更新
            } else {
                // 如果在首次加载中没找到，设置为搜索模式继续查找
                window.searchingForCommit = window.pendingJumpCommit;
                window.pendingJumpCommit = null;
            }
        }
        
        // 只在初始加载时显示加载状态指示器
        if (data.skip === 0 && loadedCommits < totalCommits) {
            showLoadingIndicator();
        }
    }

    /**
     * 重新绑定折叠按钮的事件监听器
     * 在动态更新DOM后需要重新绑定事件
     */
    function rebindCollapseButtons() {
        // 重新获取DOM元素引用
        leftCollapseBtn = document.getElementById('leftCollapseBtn');
        rightCollapseBtn = document.getElementById('rightCollapseBtn');
        
        // 重新绑定事件监听器
        if (leftCollapseBtn) {
            leftCollapseBtn.addEventListener('click', toggleLeftPanel);
        }
        if (rightCollapseBtn) {
            rightCollapseBtn.addEventListener('click', toggleRightPanel);
        }
        
        // 更新按钮可见性
        updateCollapseButtonsVisibility();
    }

    /**
     * 渲染提交列表
     * 将所有提交记录渲染到DOM中
     */
    function renderCommitList() {
        if (commits.length === 0) {
            // 如果没有提交，显示"No commits found"
            const existingButtons = commitList.querySelectorAll('.panel-collapse-btn');
            if (existingButtons.length === 0) {
                commitList.innerHTML = `
                    <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">‹</button>
                    <div class="loading">No commits found</div>
                `;
                rebindCollapseButtons();
            } else {
                // 如果按钮已存在，只添加消息
                const existingMessage = commitList.querySelector('.loading');
                if (!existingMessage) {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'loading';
                    messageDiv.textContent = 'No commits found';
                    commitList.appendChild(messageDiv);
                }
            }
            return;
        }

        commits.forEach((commit, index) => {
            const commitElement = createCommitElement(commit, index);
            commitList.appendChild(commitElement);
        });

        updateMultiSelectInfo();
    }

    /**
     * 追加新的提交记录到列表
     * @param {Array} newCommits - 新的提交记录数组
     */
    function appendCommitList(newCommits) {
        // 先移除加载指示器
        hideLoadingIndicator();
        
        newCommits.forEach((commit, index) => {
            const commitElement = createCommitElement(commit, commits.length - newCommits.length + index);
            commitList.appendChild(commitElement);
        });
        
        // 重新检查是否需要显示加载指示器
        if (loadedCommits < totalCommits) {
            showLoadingIndicator();
        }
    }

    /**
     * 显示加载指示器
     * 在提交列表底部显示"正在加载更多提交..."的提示
     */
    function showLoadingIndicator() {
        let indicator = commitList.querySelector('.loading-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'loading-indicator';
            indicator.innerHTML = '<div class="loading">Loading more commits...</div>';
            commitList.appendChild(indicator);
        }
    }

    /**
     * 隐藏加载指示器
     * 移除加载提示元素
     */
    function hideLoadingIndicator() {
        const indicator = commitList.querySelector('.loading-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * 创建提交记录DOM元素（带图形显示）
     * @param {Object} commit - 提交记录对象
     * @param {number} index - 提交记录在列表中的索引
     * @returns {HTMLElement} 提交记录的DOM元素
     */
    function createCommitElement(commit, index) {
        const div = document.createElement('div');
        div.className = 'commit-item';
        div.dataset.hash = commit.hash;
        div.dataset.index = index;

        const refs = commit.refs ? parseRefs(commit.refs) : [];
        const refsHtml = refs.map(ref => {
            const refClass = getRefClass(ref);
            return `<span class="ref-tag ${refClass}">${ref}</span>`;
        }).join('');

        // 创建图形部分
        const graphHtml = createGraphHtml(commit, index);

        div.innerHTML = `
            <div class="commit-graph">${graphHtml}</div>
            <div class="commit-content">
                <div class="commit-hash">${commit.hash.substring(0, 8)}</div>
                <div class="commit-message">${escapeHtml(commit.message)}</div>
                <div class="commit-author">
                    <span>${escapeHtml(commit.author)}</span>
                    <span class="commit-date">${formatDate(commit.date)}</span>
                </div>
                ${refsHtml ? `<div class="commit-refs">${refsHtml}</div>` : ''}
            </div>
        `;

        // 添加点击事件监听器 - 处理提交记录的选择
        div.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                // Ctrl/Cmd + 点击：多选模式
                toggleCommitSelection(commit.hash, div);
            } else {
                // 普通点击：单选模式
                selectSingleCommit(commit.hash, div);
            }
        });

        // 添加右键上下文菜单事件
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, commit.hash);
        });
        
        // 性能优化：添加hover预加载
        let hoverTimeout;
        div.addEventListener('mouseenter', () => {
            // 延迟500ms后预加载，避免鼠标快速移动时的无效请求
            hoverTimeout = setTimeout(() => {
                preloadCommitDetails(commit.hash);
            }, 500);
        });
        
        div.addEventListener('mouseleave', () => {
            // 清除预加载定时器
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
        });

        return div;
    }

    /**
     * 创建图形HTML
     * @param {Object} commit - 提交记录对象
     * @param {number} index - 提交记录在列表中的索引
     * @returns {string} 图形HTML字符串
     */
    function createGraphHtml(commit, index) {
        if (!commit.graphInfo) {
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
            
            // 如果当前列有车道信息，显示垂直线条
            if (lane && (lane.type === 'line' || lane.type === 'commit')) {
                columnHtml += `<div class="graph-vertical-line" style="background-color: ${color};"></div>`;
            } else if (hasActiveBranch(commit, index, col)) {
                // 备用逻辑：如果没有车道信息但检测到活跃分支，也显示线条
                columnHtml += `<div class="graph-vertical-line" style="background-color: ${color};"></div>`;
            }
            
            // 如果是提交所在的列，添加提交节点
            if (isCommitColumn) {
                const isMerge = commit.parents && commit.parents.length > 1;
                const nodeClass = isMerge ? 'merge-node' : 'commit-node';
                columnHtml += `<div class="${nodeClass}" style="background-color: ${color};"></div>`;
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
    function hasActiveBranch(commit, index, col) {
        // 检查当前提交是否在这一列
        if (commit.graphInfo && commit.graphInfo.column === col) {
            return true;
        }
        
        // 检查这一列是否有连续的分支线
        // 向上查找
        let hasAbove = false;
        for (let i = index - 1; i >= 0; i--) {
            const prevCommit = commits[i];
            if (prevCommit && prevCommit.graphInfo) {
                // 如果找到在同一列的提交
                if (prevCommit.graphInfo.column === col) {
                    hasAbove = true;
                    break;
                }
                // 如果找到有连接到这一列的提交
                if (prevCommit.children && prevCommit.children.some(child => {
                    const childCommit = commits.find(c => c.hash === child);
                    return childCommit && childCommit.graphInfo && childCommit.graphInfo.column === col;
                })) {
                    hasAbove = true;
                    break;
                }
            }
        }
        
        // 向下查找
        let hasBelow = false;
        for (let i = index + 1; i < commits.length; i++) {
            const nextCommit = commits[i];
            if (nextCommit && nextCommit.graphInfo) {
                // 如果找到在同一列的提交
                if (nextCommit.graphInfo.column === col) {
                    hasBelow = true;
                    break;
                }
                // 如果找到有连接到这一列的提交
                if (nextCommit.parents && nextCommit.parents.some(parent => {
                    const parentCommit = commits.find(c => c.hash === parent);
                    return parentCommit && parentCommit.graphInfo && parentCommit.graphInfo.column === col;
                })) {
                    hasBelow = true;
                    break;
                }
            }
        }
        
        return hasAbove || hasBelow;
    }
    
    /**
     * 获取水平连接线信息
     * @param {Object} commit - 提交记录对象
     * @param {number} index - 提交记录在列表中的索引
     * @param {number} col - 列号
     * @returns {Array} 水平连接线数组
     */
    function getHorizontalConnections(commit, index, col) {
        const connections = [];
        
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
    function getLineColor(col) {
        const colors = ['#007acc', '#f14c4c', '#00aa00', '#ff8800', '#aa00aa', '#00aaaa'];
        return colors[col % colors.length];
    }

    /**
     * 切换提交记录的选择状态（多选模式）
     * @param {string} hash - 提交哈希值
     * @param {HTMLElement} element - 提交记录的DOM元素
     */
    function toggleCommitSelection(hash, element) {
        const commit = commits.find(c => c.hash === hash);
        if (!commit) return;
        
        const index = selectedCommits.findIndex(c => c.hash === hash);
        if (index > -1) {
            // 取消选择：从数组中移除
            selectedCommits.splice(index, 1);
            
            // 如果这是当前选中的提交，需要更新 currentCommit
            if (currentCommit === hash) {
                if (selectedCommits.length > 0) {
                    // 如果还有其他选中的提交，选择第一个作为当前提交
                    currentCommit = selectedCommits[0].hash;
                } else {
                    // 如果没有选中的提交了，清空当前提交
                    currentCommit = null;
                }
            }
        } else {
            // 添加选择：加入数组
            selectedCommits.push(commit);
            
            // 如果这是第一个选中的提交，设置为当前提交
            if (selectedCommits.length === 1) {
                currentCommit = hash;
            }
        }
        
        // 确保UI状态正确
        if (selectedCommits.length === 0) {
            // 没有选中的提交，清除所有样式
            document.querySelectorAll('.commit-item').forEach(item => {
                item.classList.remove('selected', 'multi-selected');
            });
        } else if (selectedCommits.length === 1) {
            // 单选模式
            ensureCommitSelectionUI(selectedCommits[0].hash);
        } else {
            // 多选模式
            document.querySelectorAll('.commit-item').forEach(item => {
                item.classList.remove('selected', 'multi-selected');
            });
            selectedCommits.forEach(commit => {
                const element = document.querySelector(`[data-hash="${commit.hash}"]`);
                if (element) {
                    element.classList.add('multi-selected');
                }
            });
        }
        
        updateMultiSelectInfo();
    }

    /**
     * 单选提交记录
     * @param {string} hash - 提交哈希值
     * @param {HTMLElement} element - 提交记录的DOM元素
     */
    function selectSingleCommit(hash, element) {
        // 找到对应的提交对象
        const commit = commits.find(c => c.hash === hash);
        if (!commit) return;
        
        // 使用安全的更新函数
        safeUpdateCurrentCommit(hash, commit);
        
        // 性能优化：检查缓存
        if (commitDetailsCache.has(hash)) {
            // 从缓存中获取详情，立即显示
            const cachedDetails = commitDetailsCache.get(hash);
            updateCommitDetails(cachedDetails);
            return;
        }
        
        // 检查是否已有相同请求正在进行
        if (pendingRequests.has(hash)) {
            // 如果已有请求在进行，只显示loading状态
            commitDetails.innerHTML = `
                <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
                <div class="loading">Loading commit details...</div>
            `;
            rebindCollapseButtons();
            return;
        }
        
        // 清除详情区域，显示加载状态
        commitDetails.innerHTML = `
            <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
            <div class="loading">Loading commit details...</div>
        `;
        rebindCollapseButtons();
        
        // 标记请求正在进行
        pendingRequests.set(hash, true);
        
        // 获取提交详情
        vscode.postMessage({
            type: 'getCommitDetails',
            hash: hash
        });
    }
    
    /**
     * 预加载提交详情（用于hover优化）
     * @param {string} hash - 提交哈希值
     */
    function preloadCommitDetails(hash) {
        // 如果已经缓存或正在请求，则跳过
        if (commitDetailsCache.has(hash) || pendingRequests.has(hash)) {
            return;
        }
        
        // 标记请求正在进行
        pendingRequests.set(hash, true);
        
        // 静默请求提交详情
        vscode.postMessage({
            type: 'getCommitDetails',
            hash: hash
        });
    }

    /**
     * 更新多选信息显示
     * 只更新选中状态，不再显示操作面板
     */
    function updateMultiSelectInfo() {
        // 移除现有的多选信息面板（如果存在）
        const existingInfo = document.querySelector('.multi-select-info');
        if (existingInfo) {
            existingInfo.remove();
        }
        
        // 不再创建操作面板，多选操作通过右键菜单处理
    }

    /**
     * 显示右键上下文菜单
     * @param {MouseEvent} event - 鼠标右键事件
     * @param {string} hash - 提交哈希值
     */
    function showContextMenu(event, hash) {
        const menuWidth = 150;
        const menuHeight = 200; // 估算菜单高度
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let x = event.pageX;
        let y = event.pageY;
        
        // 防止菜单超出右边界
        if (x + menuWidth > windowWidth) {
            x = windowWidth - menuWidth - 10;
        }
        
        // 防止菜单超出下边界
        if (y + menuHeight > windowHeight) {
            y = windowHeight - menuHeight - 10;
        }
        
        // 确保菜单不会超出左边界和上边界
        x = Math.max(10, x);
        y = Math.max(10, y);
        
        // 显示菜单并设置位置
        contextMenu.style.display = 'block';
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';

        // 更新Compare菜单项状态
        const compareMenuItem = contextMenu.querySelector('#compareMenuItem');
        const canCompare = selectedCommits.length === 2;
        
        if (canCompare) {
            compareMenuItem.classList.remove('disabled');
            compareMenuItem.textContent = 'Compare Selected (2)';
        } else {
            compareMenuItem.classList.add('disabled');
            compareMenuItem.textContent = `Compare Selected (${selectedCommits.length}/2)`;
        }

        // 更新squash菜单项状态
        const squashMenuItem = contextMenu.querySelector('#squashMenuItem');
        const canSquash = selectedCommits.length > 1;
        
        if (canSquash) {
            squashMenuItem.classList.remove('disabled');
            squashMenuItem.textContent = `Squash ${selectedCommits.length} Commits`;
        } else {
            squashMenuItem.classList.add('disabled');
            squashMenuItem.textContent = 'Squash Commits';
        }

        // 移除之前的事件监听器（通过克隆节点）
        const menuItems = contextMenu.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
        });

        // 添加新的事件监听器
        contextMenu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // 检查是否是禁用的菜单项
                if (item.classList.contains('disabled')) {
                    return;
                }
                
                handleContextMenuAction(item.dataset.action, hash);
                contextMenu.style.display = 'none';
            });
        });
    }

    /**
     * 处理上下文菜单操作
     * @param {string} action - 操作类型
     * @param {string} hash - 提交哈希值
     */
    function handleContextMenuAction(action, hash) {
        switch (action) {
            case 'copyHash':
                // 复制提交哈希值到剪贴板
                vscode.postMessage({ type: 'copyHash', hash });
                break;
            case 'cherryPick':
                // Cherry-pick 提交
                vscode.postMessage({ type: 'cherryPick', hash });
                break;
            case 'revert':
                // 回滚提交
                vscode.postMessage({ type: 'revert', hash });
                break;
            case 'compare':
                // 比较选中的提交（仅在选中2个提交时可用）
                if (selectedCommits.length === 2) {
                    vscode.postMessage({
                        type: 'compareCommits',
                        hashes: selectedCommits.map(c => c.hash)
                    });
                }
                break;
            case 'squash':
                // 压缩多个提交（仅在多选时可用）
                if (selectedCommits.length > 1) {
                    vscode.postMessage({ 
                        type: 'squashCommits', 
                        commits: selectedCommits 
                    });
                }
                break;
            case 'resetSoft':
                // 软重置到指定提交
                vscode.postMessage({ type: 'reset', hash, mode: 'soft' });
                break;
            case 'resetMixed':
                // 混合重置到指定提交
                vscode.postMessage({ type: 'reset', hash, mode: 'mixed' });
                break;
            case 'resetHard':
                // 硬重置到指定提交
                vscode.postMessage({ type: 'reset', hash, mode: 'hard' });
                break;
        }
    }

    /**
     * 确保提交选中状态的UI正确性
     * @param {string} hash - 提交哈希值
     */
    function ensureCommitSelectionUI(hash) {
        console.log(`Ensuring UI state for commit ${hash.substring(0, 8)}, selectedCommits: ${selectedCommits.length}`);
        
        // 清除所有选择状态
        document.querySelectorAll('.commit-item').forEach(item => {
            item.classList.remove('selected', 'multi-selected');
        });
        
        // 确保当前选中的提交有正确的样式
        const currentElement = document.querySelector(`[data-hash="${hash}"]`);
        if (currentElement) {
            if (selectedCommits.length === 1) {
                currentElement.classList.add('selected');
                console.log(`Applied 'selected' class to commit ${hash.substring(0, 8)}`);
            } else if (selectedCommits.length > 1) {
                // 多选模式下，为所有选中的提交添加样式
                selectedCommits.forEach(commit => {
                    const element = document.querySelector(`[data-hash="${commit.hash}"]`);
                    if (element) {
                        element.classList.add('multi-selected');
                        console.log(`Applied 'multi-selected' class to commit ${commit.hash.substring(0, 8)}`);
                    }
                });
            }
        } else {
            console.warn(`Element not found for commit ${hash.substring(0, 8)}`);
        }
    }

    /**
     * 安全地更新当前选中的提交
     * @param {string} hash - 提交哈希值
     * @param {Object} commit - 提交对象
     */
    function safeUpdateCurrentCommit(hash, commit) {
        console.log(`Updating current commit from ${currentCommit ? currentCommit.substring(0, 8) : 'none'} to ${hash.substring(0, 8)}`);
        
        currentCommit = hash;
        selectedCommits = commit ? [commit] : [];
        
        // 立即更新UI状态
        ensureCommitSelectionUI(hash);
        
        // 更新多选信息
        updateMultiSelectInfo();
    }

    /**
     * 更新提交详情显示
     * @param {Object} data - 提交详情数据
     * @param {Object} data.commit - 提交信息
     * @param {Array} data.files - 文件变更列表
     */
    function updateCommitDetails(data) {
        if (!data) {
            commitDetails.innerHTML = `
                <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
                <div class="placeholder">Failed to load commit details</div>
            `;
            rebindCollapseButtons();
            return;
        }

        const { commit, files } = data;
        
        // 性能优化：缓存详情数据
        if (commit && commit.hash) {
            commitDetailsCache.set(commit.hash, data);
            // 清理pending请求标记
            pendingRequests.delete(commit.hash);
            
            // 限制缓存大小，避免内存泄漏
            if (commitDetailsCache.size > 50) {
                const firstKey = commitDetailsCache.keys().next().value;
                commitDetailsCache.delete(firstKey);
            }
        }
        
        // 修复：只有当这个提交是当前选中的提交时，才更新详情页面
        // 这样可以防止预加载或其他异步请求影响当前显示的详情
        if (commit.hash !== currentCommit) {
            // 如果不是当前选中的提交，只缓存数据，不更新UI
            console.log(`Skipping UI update for ${commit.hash.substring(0, 8)} (current: ${currentCommit ? currentCommit.substring(0, 8) : 'none'})`);
            return;
        }
        
        // 确保当前选中的 commit 元素仍然有正确的样式
        ensureCommitSelectionUI(commit.hash);
        
        // 根据视图模式构建文件HTML
        let filesHtml;
        if (fileViewMode === 'tree') {
            // 树形视图：构建文件树结构
            const fileTree = buildFileTree(files);
            filesHtml = renderFileTree(fileTree, commit.hash);
        } else {
            // 列表视图：简单的文件列表
             filesHtml = `<div class="file-list-container">${renderFileList(files, commit.hash)}</div>`;
         }

        // 解析refs信息
        const refs = commit.refs ? parseRefs(commit.refs) : [];
        const refsHtml = refs.map(ref => {
            const refClass = getRefClass(ref);
            return `<span class="ref-tag ${refClass}">${ref}</span>`;
        }).join('');

        // 构建完整的详情HTML
        const detailsHtml = `
            <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
            <div class="details-header">
                <div class="details-hash">${escapeHtml(commit.hash)}</div>
                <div class="details-message">${escapeHtml(commit.message)}</div>
                <div class="details-author">${escapeHtml(commit.author)} &lt;${escapeHtml(commit.email)}&gt;</div>
                <div class="details-date">${formatDate(commit.date)}</div>
                ${refsHtml ? `<div class="details-refs">${refsHtml}</div>` : ''}
                ${commit.body ? `<div class="details-body">${escapeHtml(commit.body)}</div>` : ''}
            </div>
            <div class="file-changes">
                <div class="file-changes-header">
                    <h3>Changed Files (${files.length})</h3>
                    <div class="file-view-controls">
                        <button class="view-toggle-btn" onclick="toggleFileViewMode()" title="${fileViewMode === 'tree' ? 'Switch to List View' : 'Switch to Tree View'}">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/></svg>
                        </button>
                        ${files.length > 10 && fileViewMode === 'tree' ? '<button class="collapse-all-btn" onclick="toggleAllFolders()">Collapse All</button>' : ''}
                    </div>
                </div>
                ${files.length > 0 ? filesHtml : '<div class="no-files">No files changed</div>'}
            </div>
        `;

        // 完全替换内容
        commitDetails.innerHTML = detailsHtml;
        
        // 重新绑定折叠按钮事件监听器
        rebindCollapseButtons();
        
        // 添加事件监听器
        addFileEventListeners(commit.hash);
        
        console.log('Updated commit details for:', commit.hash.substring(0, 8), commit.message);
    }

    /**
     * 构建文件树结构
     * 将扁平的文件列表转换为层次化的树形结构，并压缩单一子目录
     * @param {Array} files - 文件变更列表
     * @returns {Object} 文件树对象
     */
    function buildFileTree(files) {
        const tree = {};
        
        files.forEach(file => {
            const parts = file.file.split('/');
            let current = tree;
            
            // 遍历文件路径的每个部分
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                
                if (i === parts.length - 1) {
                    // 最后一部分是文件
                    current[part] = {
                        type: 'file',
                        data: file
                    };
                } else {
                    // 中间部分是目录
                    if (!current[part]) {
                        current[part] = {
                            type: 'directory',
                            children: {}
                        };
                    }
                    current = current[part].children;
                }
            }
        });
        
        // 压缩单一子目录
        return compressTree(tree);
    }

    /**
     * 压缩文件树中的单一子目录
     * 将只有一个子目录且没有文件的目录合并为 parent/child 的形式
     * @param {Object} tree - 文件树对象
     * @returns {Object} 压缩后的文件树对象
     */
    function compressTree(tree) {
        const compressed = {};
        
        Object.entries(tree).forEach(([name, node]) => {
            if (node.type === 'directory') {
                // 递归压缩子树
                const compressedChildren = compressTree(node.children);
                
                // 检查是否可以压缩：只有一个子项且该子项是目录
                const childEntries = Object.entries(compressedChildren);
                if (childEntries.length === 1) {
                    const [childName, childNode] = childEntries[0];
                    if (childNode.type === 'directory') {
                        // 压缩：将当前目录名与子目录名合并
                        const compressedName = `${name}/${childName}`;
                        compressed[compressedName] = {
                            type: 'directory',
                            children: childNode.children,
                            compressed: true // 标记为压缩目录
                        };
                        return;
                    }
                }
                
                // 不压缩：保持原结构
                compressed[name] = {
                    type: 'directory',
                    children: compressedChildren
                };
            } else {
                // 文件节点直接复制
                compressed[name] = node;
            }
        });
        
        return compressed;
    }

    /**
     * 渲染文件树视图
     * 递归渲染文件树结构为HTML
     * @param {Object} tree - 文件树对象
     * @param {string} commitHash - 提交哈希值
     * @param {number} level - 当前层级深度
     * @returns {string} 渲染后的HTML字符串
     */
    function renderFileTree(tree, commitHash, level = 0) {
        let html = '';
        const entries = Object.entries(tree);
        
        // 排序：目录在前，文件在后，同类型按字母顺序
        entries.sort((a, b) => {
            const [nameA, nodeA] = a;
            const [nameB, nodeB] = b;
            
            if (nodeA.type === 'directory' && nodeB.type === 'file') return -1;
            if (nodeA.type === 'file' && nodeB.type === 'directory') return 1;
            return nameA.localeCompare(nameB);
        });
        
        // 遍历树节点，渲染目录和文件
        entries.forEach(([name, node]) => {
            if (node.type === 'directory') {
                // 渲染目录节点
                const childrenHtml = renderFileTree(node.children, commitHash, level + 1);
                const childCount = Object.keys(node.children).length;
                const isCollapsed = level > 0 && childCount > 5; // 自动折叠包含超过5个子项的目录
                
                // 为压缩目录添加特殊样式类
                const compressedClass = node.compressed ? ' compressed-folder' : '';
                
                html += `
                    <div class="file-tree-folder${compressedClass}" data-level="${level}">
                        <div class="folder-header" onclick="toggleFolder(this)">
                            <span class="folder-icon ${isCollapsed ? 'collapsed' : 'expanded'}">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M6.5 1A1.5 1.5 0 0 0 5 2.5V3H1.5A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 4H9.5a.5.5 0 0 1-.5-.5V2.5A.5.5 0 0 0 8.5 2h-2z"/>
                                </svg>
                            </span>
                            <span class="folder-name">${escapeHtml(name)}</span>
                            <span class="folder-count">(${childCount})</span>
                        </div>
                        <div class="folder-content" ${isCollapsed ? 'style="display: none;"' : ''}>
                            ${childrenHtml}
                        </div>
                    </div>
                `;
            } else {
                const file = node.data;
                // 文件图标 - 使用SVG图标替代emoji
                const fileIcon = level === 0 ? 
                    '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>' :
                    '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"/></svg>';
                html += `
                    <div class="file-tree-item" data-level="${level}" data-file="${escapeHtml(file.file)}" data-hash="${escapeHtml(commitHash)}">
                        <div class="file-info">
                            <span class="file-icon">${fileIcon}</span>
                            <span class="file-name">${escapeHtml(name)}</span>
                            <div class="file-actions">
                                <button class="file-action-btn" title="View Diff" onclick="showFileDiff('${escapeHtml(commitHash)}', '${escapeHtml(file.file)}')">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1.5A.5.5 0 0 1 2 1h4a.5.5 0 0 1 0 1H2v13h12v-6a.5.5 0 0 1 1 0v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a.5.5 0 0 1 .5-.5z"/><path d="M15.854 2.146a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L8.5 8.793l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
                                </button>
                                <button class="file-action-btn" title="Open File" onclick="openFile('${escapeHtml(file.file)}')">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"/></svg>
                                </button>
                                <button class="file-action-btn" title="File History" onclick="showFileHistory('${escapeHtml(file.file)}')">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zM8 6a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1 0-1h1.5V6.5A.5.5 0 0 1 8 6zM1 10.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"/><circle cx="4" cy="6.5" r="1.5"/><circle cx="4" cy="13.5" r="1.5"/></svg>
                                </button>
                                <button class="file-action-btn" title="View Online" onclick="viewFileOnline('${escapeHtml(commitHash)}', '${escapeHtml(file.file)}')">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>
                                </button>
                            </div>
                        </div>
                        <div class="file-stats">
                            ${file.binary ? 'binary' : ''}
                            ${!file.binary ? `<span class="insertions">+${file.insertions}</span> <span class="deletions">-${file.deletions}</span>` : ''}
                        </div>
                    </div>
                `;
            }
        });
        
        return html;
    }

    /**
     * 渲染文件列表视图
     * 将文件数组渲染为简单的列表HTML
     * @param {Array} files - 文件变更列表
     * @param {string} commitHash - 提交哈希值
     * @returns {string} 渲染后的HTML字符串
     */
    function renderFileList(files, commitHash) {
        let html = '';
        
        // 遍历文件列表，为每个文件创建列表项
        files.forEach(file => {
            html += `
                <div class="file-item" data-file="${escapeHtml(file.file)}" data-hash="${escapeHtml(commitHash)}">
                    <div class="file-info">
                        <span class="file-icon"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"/></svg></span>
                        <span class="file-name">${escapeHtml(file.file)}</span>
                        <div class="file-actions">
                            <button class="file-action-btn" title="View Diff" onclick="showFileDiff('${escapeHtml(commitHash)}', '${escapeHtml(file.file)}')">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1.5A.5.5 0 0 1 2 1h4a.5.5 0 0 1 0 1H2v13h12v-6a.5.5 0 0 1 1 0v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a.5.5 0 0 1 .5-.5z"/><path d="M15.854 2.146a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L8.5 8.793l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
                            </button>
                            <button class="file-action-btn" title="Open File" onclick="openFile('${escapeHtml(file.file)}')">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"/></svg>
                            </button>
                            <button class="file-action-btn" title="File History" onclick="showFileHistory('${escapeHtml(file.file)}')">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zM8 6a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1 0-1h1.5V6.5A.5.5 0 0 1 8 6zM1 10.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"/><circle cx="4" cy="6.5" r="1.5"/><circle cx="4" cy="13.5" r="1.5"/></svg>
                            </button>
                            <button class="file-action-btn" title="View Online" onclick="viewFileOnline('${escapeHtml(commitHash)}', '${escapeHtml(file.file)}')">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="file-stats">
                        ${file.binary ? 'binary' : ''}
                        ${!file.binary ? `<span class="insertions">+${file.insertions}</span> <span class="deletions">-${file.deletions}</span>` : ''}
                    </div>
                </div>
            `;
        });
        
        return html;
    }

    /**
     * 为文件元素添加事件监听器
     * @param {string} commitHash - 提交哈希值
     */
    function addFileEventListeners(commitHash) {
        // 文件名点击事件 - 显示文件差异
        const fileItems = commitDetails.querySelectorAll('.file-name');
        fileItems.forEach(fileItem => {
            fileItem.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileElement = fileItem.closest('[data-file]');
                const filePath = fileElement.dataset.file;
                showFileDiff(commitHash, filePath);
            });
        });
    }

    /**
     * 切换文件视图模式（树形/列表）
     * 全局函数，供HTML onclick调用
     */
    window.toggleFileViewMode = function() {
        fileViewMode = fileViewMode === 'tree' ? 'list' : 'tree';
        
        // 保存配置到VS Code设置
        vscode.postMessage({
            type: 'saveViewMode',
            viewMode: fileViewMode
        });
        
        // 重新请求当前提交详情以刷新视图
        if (currentCommit) {
            vscode.postMessage({
                type: 'getCommitDetails',
                hash: currentCommit
            });
        }
    };

    /**
     * 切换文件夹展开/折叠状态
     * 全局函数，供HTML onclick调用
     * @param {HTMLElement} folderHeader - 文件夹头部元素
     */
    window.toggleFolder = function(folderHeader) {
        const folderIcon = folderHeader.querySelector('.folder-icon');
        const folderContent = folderHeader.parentElement.querySelector('.folder-content');
        
        if (folderContent.style.display === 'none') {
            // 展开文件夹
            folderContent.style.display = 'block';
            folderIcon.classList.remove('collapsed');
            folderIcon.classList.add('expanded');
        } else {
            // 折叠文件夹
            folderContent.style.display = 'none';
            folderIcon.classList.remove('expanded');
            folderIcon.classList.add('collapsed');
        }
    };

    /**
     * 切换所有文件夹的展开/折叠状态
     * 全局函数，供HTML onclick调用
     */
    window.toggleAllFolders = function() {
        const folders = commitDetails.querySelectorAll('.file-tree-folder');
        const isAnyExpanded = Array.from(folders).some(folder => 
            folder.querySelector('.folder-content').style.display !== 'none'
        );
        
        folders.forEach(folder => {
            const folderContent = folder.querySelector('.folder-content');
            const folderIcon = folder.querySelector('.folder-icon');
            
            if (isAnyExpanded) {
                // 如果有展开的文件夹，则全部折叠
                folderContent.style.display = 'none';
                folderIcon.classList.remove('expanded');
                folderIcon.classList.add('collapsed');
            } else {
                // 如果全部折叠，则全部展开
                folderContent.style.display = 'block';
                folderIcon.classList.remove('collapsed');
                folderIcon.classList.add('expanded');
            }
        });
    };

    /**
     * 显示文件差异
     * 全局函数，供HTML onclick调用
     * @param {string} commitHash - 提交哈希值
     * @param {string} filePath - 文件路径
     */
    window.showFileDiff = function(commitHash, filePath) {
        vscode.postMessage({
            type: 'showFileDiff',
            hash: commitHash,
            file: filePath
        });
    };

    /**
     * 在编辑器中打开文件
     * 全局函数，供HTML onclick调用
     * @param {string} filePath - 文件路径
     */
    window.openFile = function(filePath) {
        vscode.postMessage({
            type: 'openFile',
            file: filePath
        });
    };

    /**
     * 显示文件历史记录
     * 全局函数，供HTML onclick调用
     * @param {string} filePath - 文件路径
     */
    window.showFileHistory = function(filePath) {
        vscode.postMessage({
            type: 'showFileHistory',
            file: filePath
        });
    };

    /**
     * 在线查看文件
     * 全局函数，供HTML onclick调用
     * @param {string} commitHash - 提交哈希值
     * @param {string} filePath - 文件路径
     */
    window.viewFileOnline = function(commitHash, filePath) {
        vscode.postMessage({
            type: 'viewFileOnline',
            hash: commitHash,
            file: filePath
        });
    };

    /**
     * 显示提交比较结果
     * @param {Object} data - 比较结果数据
     * @param {Array} data.commits - 被比较的提交哈希数组
     * @param {Array} data.changes - 文件变更列表
     */
    function showCompareResult(data) {
        const { commits: compareCommits, changes } = data;
        
        // 使用与commitDetails相同的文件渲染逻辑，提供完整的交互功能
        const changesHtml = renderCompareFileList(changes, compareCommits);

        compareContent.innerHTML = `
            <div class="compare-commits">
                <div class="compare-commit">
                    <h4>From: ${compareCommits[0].substring(0, 8)}</h4>
                    <p class="commit-info">Base commit</p>
                </div>
                <div class="compare-arrow">→</div>
                <div class="compare-commit">
                    <h4>To: ${compareCommits[1].substring(0, 8)}</h4>
                    <p class="commit-info">Target commit</p>
                </div>
            </div>
            <div class="file-changes">
                <div class="file-changes-header">
                    <h3>Changed Files (${changes.length})</h3>
                </div>
                <div class="file-list-container">
                    ${changes.length > 0 ? changesHtml : '<div class="no-files">No files changed</div>'}
                </div>
            </div>
        `;

        comparePanel.style.display = 'block';
        
        // 添加文件交互事件监听器
        addCompareFileEventListeners(compareCommits);
    }

    /**
     * 渲染比较结果的文件列表
     * @param {Array} files - 文件变更列表
     * @param {Array} commits - 比较的提交哈希数组
     * @returns {string} 渲染后的HTML字符串
     */
    function renderCompareFileList(files, commits) {
        let html = '';
        
        // 遍历文件列表，为每个文件创建列表项
        files.forEach(file => {
            // 确定文件状态图标和颜色
            let statusIcon = '';
            let statusClass = '';
            
            if (file.status === 'A') {
                statusIcon = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/></svg>';
                statusClass = 'file-added';
            } else if (file.status === 'D') {
                statusIcon = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 7.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/></svg>';
                statusClass = 'file-deleted';
            } else {
                statusIcon = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854 4.146a.5.5 0 0 0-.708 0L8 8.293 3.854 4.146a.5.5 0 1 0-.708.708L7.293 9l-4.147 4.146a.5.5 0 0 0 .708.708L8 9.707l4.146 4.147a.5.5 0 0 0 .708-.708L8.707 9l4.147-4.146a.5.5 0 0 0 0-.708z"/></svg>';
                statusClass = 'file-modified';
            }
            
            html += `
                <div class="file-item ${statusClass}" data-file="${escapeHtml(file.file)}" data-from-hash="${escapeHtml(commits[0])}" data-to-hash="${escapeHtml(commits[1])}">
                    <div class="file-info">
                        <span class="file-status-icon" title="File ${file.status === 'A' ? 'added' : file.status === 'D' ? 'deleted' : 'modified'}">${statusIcon}</span>
                        <span class="file-icon"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"/></svg></span>
                        <span class="file-name">${escapeHtml(file.file)}</span>
                        <div class="file-actions">
                            <button class="file-action-btn" title="View Diff" onclick="showCompareFileDiff('${escapeHtml(commits[0])}', '${escapeHtml(commits[1])}', '${escapeHtml(file.file)}')">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1.5A.5.5 0 0 1 2 1h4a.5.5 0 0 1 0 1H2v13h12v-6a.5.5 0 0 1 1 0v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a.5.5 0 0 1 .5-.5z"/><path d="M15.854 2.146a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L8.5 8.793l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
                            </button>
                            ${file.status !== 'D' ? `
                                <button class="file-action-btn" title="Open File" onclick="openFile('${escapeHtml(file.file)}')">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"/></svg>
                                </button>
                                <button class="file-action-btn" title="File History" onclick="showFileHistory('${escapeHtml(file.file)}')">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zM8 6a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1 0-1h1.5V6.5A.5.5 0 0 1 8 6zM1 10.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"/><circle cx="4" cy="6.5" r="1.5"/><circle cx="4" cy="13.5" r="1.5"/></svg>
                                </button>
                                <button class="file-action-btn" title="View Online" onclick="viewFileOnline('${escapeHtml(commits[1])}', '${escapeHtml(file.file)}')">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="file-stats">
                        ${file.binary ? 'binary' : ''}
                        ${!file.binary ? `<span class="insertions">+${file.insertions}</span> <span class="deletions">-${file.deletions}</span>` : ''}
                    </div>
                </div>
            `;
        });
        
        return html;
    }

    /**
     * 为比较结果的文件元素添加事件监听器
     * @param {Array} commits - 比较的提交哈希数组
     */
    function addCompareFileEventListeners(commits) {
        // 文件名点击事件 - 显示文件差异
        const fileItems = compareContent.querySelectorAll('.file-name');
        fileItems.forEach(fileItem => {
            fileItem.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileElement = fileItem.closest('[data-file]');
                const filePath = fileElement.dataset.file;
                showCompareFileDiff(commits[0], commits[1], filePath);
            });
        });
    }

    /**
     * 显示比较文件差异
     * 全局函数，供HTML onclick调用
     * @param {string} fromHash - 源提交哈希值
     * @param {string} toHash - 目标提交哈希值
     * @param {string} filePath - 文件路径
     */
    window.showCompareFileDiff = function(fromHash, toHash, filePath) {
        vscode.postMessage({
            type: 'showCompareFileDiff',
            fromHash: fromHash,
            toHash: toHash,
            file: filePath
        });
    };

    /**
     * 关闭比较面板
     * 全局函数，供HTML onclick调用
     */
    window.closeComparePanel = function() {
        comparePanel.style.display = 'none';
    };

    /**
     * 比较选中的提交记录
     * 全局函数，供HTML onclick调用
     * 仅在选中两个提交时有效
     */
    window.compareSelectedCommits = function() {
        if (selectedCommits.length === 2) {
            vscode.postMessage({
                type: 'compareCommits',
                hashes: selectedCommits.map(c => c.hash)
            });
        }
    };

    // ==================== 工具函数 ====================
    
    /**
     * 解析Git引用字符串
     * @param {string} refs - 引用字符串（如分支、标签）
     * @returns {Array} 引用数组
     */
    function parseRefs(refs) {
        if (!refs) return [];
        return refs.split(', ').filter(ref => ref.trim());
    }

    /**
     * 根据引用类型获取对应的CSS类名
     * @param {string} ref - Git引用字符串
     * @returns {string} CSS类名
     */
    function getRefClass(ref) {
        if (!ref) return '';
        
        // HEAD 指针
        if (ref.includes('HEAD')) {
            return 'ref-head';
        }
        
        // 远程分支 (origin/xxx, upstream/xxx 等)
        if (ref.includes('origin/') || ref.includes('upstream/') || ref.includes('remote/')) {
            return 'ref-remote';
        }
        
        // 标签 (tag: xxx)
        if (ref.startsWith('tag:') || ref.includes('tags/')) {
            return 'ref-tag-label';
        }
        
        // 本地分支 (其他情况)
        return 'ref-local';
    }

    /**
     * 格式化日期字符串
     * @param {string} dateString - ISO日期字符串
     * @returns {string} 格式化后的日期时间字符串
     */
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    /**
     * HTML转义函数
     * @param {string} text - 需要转义的文本
     * @returns {string} 转义后的HTML安全文本
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 跳转到HEAD提交
     * @param {Object} headCommit - HEAD提交对象
     */
    function jumpToHeadCommit(headCommit) {
        if (!headCommit) return;
        
        // 清除所有选择状态
        document.querySelectorAll('.commit-item').forEach(item => {
            item.classList.remove('selected', 'multi-selected');
        });
        
        // 找到HEAD提交并选中
        const headElement = document.querySelector(`[data-hash="${headCommit.hash}"]`);
        if (headElement) {
            headElement.classList.add('selected');
            headElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            selectedCommits = [headCommit];
            currentCommit = headCommit.hash;
            
            // 请求获取提交详情
            vscode.postMessage({
                type: 'getCommitDetails',
                hash: headCommit.hash
            });
            
            updateMultiSelectInfo();
        }
    }

    /**
     * 跳转到指定提交
     * @param {string} commitHash - 提交哈希值
     */
    function jumpToSpecificCommit(commitHash) {
        if (!commitHash) return;
        
        // 清除所有选择状态
        document.querySelectorAll('.commit-item').forEach(item => {
            item.classList.remove('selected', 'multi-selected');
        });
        
        // 找到指定提交并选中
        const targetElement = document.querySelector(`[data-hash="${commitHash}"]`);
        if (targetElement) {
            targetElement.classList.add('selected');
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 找到对应的提交对象
            const commit = commits.find(c => c.hash === commitHash);
            selectedCommits = commit ? [commit] : [];
            currentCommit = commitHash;
            
            // 请求获取提交详情
            vscode.postMessage({
                type: 'getCommitDetails',
                hash: commitHash
            });
            
            updateMultiSelectInfo();
        } else {
            // 如果当前页面没有找到该提交，尝试处理
            handleCommitNotFound(commitHash);
        }
    }

    /**
     * 处理找不到指定提交的情况
     * @param {string} commitHash - 提交哈希值
     */
    function handleCommitNotFound(commitHash) {
        console.log('Commit not found in current view:', commitHash);
        
        // 显示提示信息
        showCommitNotFoundMessage(commitHash);
        
        // 如果还有更多提交可以加载，尝试加载更多
        if (loadedCommits < totalCommits && !isLoading) {
            loadMoreCommitsToFind(commitHash);
        } else {
            // 如果已经加载了所有提交但仍未找到，可能在其他分支
            suggestBranchSwitch(commitHash);
        }
    }

    /**
     * 显示找不到提交的提示信息
     * @param {string} commitHash - 提交哈希值
     */
    function showCommitNotFoundMessage(commitHash) {
        // 移除现有的提示信息
        const existingMessage = document.querySelector('.commit-not-found-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // 创建提示信息元素
        const message = document.createElement('div');
        message.className = 'commit-not-found-message';
        message.innerHTML = `
            <div class="message-content">
                <div class="message-icon">⚠️</div>
                <div class="message-text">
                    <strong>Commit not found: ${commitHash.substring(0, 8)}</strong>
                    <p>The commit may be in a different branch or not yet loaded.</p>
                </div>
                <button class="message-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // 添加样式
        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background:rgb(48, 48, 48);
            border: 1px solid #ffeaa7;
            border-radius: 4px;
            padding: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            z-index: 1000;
            max-width: 350px;
            font-size: 14px;
        `;
        
        document.body.appendChild(message);
        
        // 5秒后自动移除
        setTimeout(() => {
            if (message.parentElement) {
                message.remove();
            }
        }, 5000);
    }

    /**
     * 尝试加载更多提交来查找指定提交
     * @param {string} commitHash - 提交哈希值
     */
    function loadMoreCommitsToFind(commitHash) {
        // 设置一个标记，表示正在查找特定提交
        window.searchingForCommit = commitHash;
        
        // 加载更多提交
        loadCommits(false);
        
        // 设置超时，避免无限加载
        setTimeout(() => {
            if (window.searchingForCommit === commitHash) {
                window.searchingForCommit = null;
                console.log('Search timeout for commit:', commitHash);
            }
        }, 10000); // 10秒超时
    }

    /**
      * 建议用户切换分支查找提交
      * @param {string} commitHash - 提交哈希值
      */
     function suggestBranchSwitch(commitHash) {
         // 请求后端查找该提交在哪个分支
         vscode.postMessage({
             type: 'findCommitInBranches',
             hash: commitHash
         });
     }

     /**
      * 处理找到提交所在分支的响应
      * @param {Object} data - 包含提交哈希和分支信息的数据
      * @param {string} data.hash - 提交哈希值
      * @param {Array} data.branches - 包含该提交的分支列表
      */
     function handleCommitBranchesFound(data) {
         const { hash, branches: commitBranches } = data;
         
         if (!commitBranches || commitBranches.length === 0) {
             // 没有找到包含该提交的分支
             showCommitNotFoundInAnyBranch(hash);
             return;
         }
         
         // 显示分支切换建议
         showBranchSwitchSuggestion(hash, commitBranches);
     }

     /**
      * 显示提交在任何分支中都未找到的消息
      * @param {string} commitHash - 提交哈希值
      */
     function showCommitNotFoundInAnyBranch(commitHash) {
         // 移除现有的提示信息
         const existingMessage = document.querySelector('.commit-not-found-message');
         if (existingMessage) {
             existingMessage.remove();
         }

         // 创建提示信息元素
         const message = document.createElement('div');
         message.className = 'commit-not-found-message';
         message.innerHTML = `
             <div class="message-content">
                 <div class="message-icon">❌</div>
                 <div class="message-text">
                     <strong>Commit not found: ${commitHash.substring(0, 8)}</strong>
                     <p>This commit does not exist in any branch of the current repository.</p>
                 </div>
                 <button class="message-close" onclick="this.parentElement.parentElement.remove()">×</button>
             </div>
         `;
         
         // 添加样式
         message.style.cssText = `
             position: fixed;
             top: 20px;
             right: 20px;
             background: #f8d7da;
             border: 1px solid #f5c6cb;
             border-radius: 4px;
             padding: 12px;
             box-shadow: 0 2px 8px rgba(0,0,0,0.1);
             z-index: 1000;
             max-width: 350px;
             font-size: 14px;
         `;
         
         document.body.appendChild(message);
         
         // 8秒后自动移除
         setTimeout(() => {
             if (message.parentElement) {
                 message.remove();
             }
         }, 8000);
     }

     /**
      * 显示分支切换建议
      * @param {string} commitHash - 提交哈希值
      * @param {Array} commitBranches - 包含该提交的分支列表
      */
     function showBranchSwitchSuggestion(commitHash, commitBranches) {
         // 移除现有的提示信息
         const existingMessage = document.querySelector('.commit-not-found-message');
         if (existingMessage) {
             existingMessage.remove();
         }

         // 创建分支选项HTML
         const branchOptions = commitBranches.map(branch => 
             `<button class="branch-option" onclick="switchToBranchAndJump('${branch}', '${commitHash}')">${branch}</button>`
         ).join('');

         // 创建提示信息元素
         const message = document.createElement('div');
         message.className = 'commit-not-found-message';
         message.innerHTML = `
             <div class="message-content">
                 <div class="message-icon">🔍</div>
                 <div class="message-text">
                     <strong>Commit found in other branch${commitBranches.length > 1 ? 'es' : ''}</strong>
                     <p>Commit ${commitHash.substring(0, 8)} is available in:</p>
                     <div class="branch-options">${branchOptions}</div>
                 </div>
                 <button class="message-close" onclick="this.parentElement.parentElement.remove()">×</button>
             </div>
         `;
         
         // 添加样式
         message.style.cssText = `
             position: fixed;
             top: 20px;
             right: 20px;
             background: #d1ecf1;
             border: 1px solid #bee5eb;
             border-radius: 4px;
             padding: 12px;
             box-shadow: 0 2px 8px rgba(0,0,0,0.1);
             z-index: 1000;
             max-width: 350px;
             font-size: 14px;
         `;
         
         // 添加分支选项按钮样式
         const style = document.createElement('style');
         style.textContent = `
             .branch-options {
                 margin-top: 8px;
                 display: flex;
                 flex-direction: column;
                 gap: 4px;
             }
             .branch-option {
                 background: #007acc;
                 color: white;
                 border: none;
                 padding: 6px 12px;
                 border-radius: 3px;
                 cursor: pointer;
                 font-size: 12px;
                 transition: background-color 0.2s;
             }
             .branch-option:hover {
                 background: #005a9e;
             }
         `;
         document.head.appendChild(style);
         
         document.body.appendChild(message);
         
         // 10秒后自动移除
         setTimeout(() => {
             if (message.parentElement) {
                 message.remove();
             }
         }, 10000);
     }

     /**
      * 切换到指定分支并跳转到提交
      * 全局函数，供HTML onclick调用
      * @param {string} branchName - 分支名称
      * @param {string} commitHash - 提交哈希值
      */
     window.switchToBranchAndJump = function(branchName, commitHash) {
         // 移除提示消息
         const message = document.querySelector('.commit-not-found-message');
         if (message) {
             message.remove();
         }
         
         // 设置要跳转的提交
         window.pendingJumpCommit = commitHash;
         
         // 切换分支
         currentBranch = branchName;
         branchSelect.value = branchName;
         
         // 重新加载提交历史
         loadedCommits = 0;
         commits = [];
         selectedCommits = [];
         updateMultiSelectInfo();
         loadCommits(true);
     };

    /**
     * 显示错误信息
     * @param {string} message - 错误消息
     */
    function showError(message) {
        // 重置加载状态
        isLoading = false;
        
        // 显示错误信息在右侧面板
        commitDetails.innerHTML = `
            <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
            <div class="placeholder" style="color: var(--vscode-errorForeground);">${escapeHtml(message)}</div>
        `;
        
        // 如果左侧面板正在显示"Loading commits..."，则清除并添加折叠按钮
        if (commitList.innerHTML.includes('Loading commits...')) {
            commitList.innerHTML = `
                <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">‹</button>
                <div class="placeholder" style="color: var(--vscode-errorForeground);">Failed to load commits</div>
            `;
        }
        
        rebindCollapseButtons();
    }

    // ==================== 拖拽和折叠功能实现 ====================
    
    /**
     * 更新面板宽度
     * 根据当前的leftPanelWidth变量更新左右面板的宽度
     */
    function updatePanelWidths() {
        if (leftPanelCollapsed && rightPanelCollapsed) {
            // 两个面板都折叠时，各占一半（实际上都是40px）
            commitList.style.width = '50%';
            commitDetails.style.width = '50%';
        } else if (leftPanelCollapsed) {
            // 左侧折叠，右侧占据剩余空间（减去40px的左侧最小宽度）
            commitList.style.width = '40px';
            commitDetails.style.width = 'calc(100% - 44px)'; // 减去40px + 4px分割线
        } else if (rightPanelCollapsed) {
            // 右侧折叠，左侧占据剩余空间（减去40px的右侧最小宽度）
            commitList.style.width = 'calc(100% - 44px)'; // 减去40px + 4px分割线
            commitDetails.style.width = '40px';
        } else {
            // 两个面板都展开，按比例分配
            commitList.style.width = leftPanelWidth + '%';
            commitDetails.style.width = (100 - leftPanelWidth) + '%';
        }
    }
    
    /**
     * 切换左侧面板的折叠状态
     */
    function toggleLeftPanel() {
        leftPanelCollapsed = !leftPanelCollapsed;
        
        if (leftPanelCollapsed) {
            // 折叠左侧面板
            commitList.classList.add('collapsed');
            // 不再隐藏分割线，让它保持可见
            // resizer.classList.add('hidden');
            
            // 如果右侧面板也折叠了，则展开右侧面板
            if (rightPanelCollapsed) {
                rightPanelCollapsed = false;
                commitDetails.classList.remove('collapsed');
            }
        } else {
            // 展开左侧面板
            commitList.classList.remove('collapsed');
            resizer.classList.remove('hidden');
        }
        
        updatePanelWidths();
        updateCollapseButtonsVisibility();
    }
    
    /**
     * 切换右侧面板的折叠状态
     */
    function toggleRightPanel() {
        rightPanelCollapsed = !rightPanelCollapsed;
        
        if (rightPanelCollapsed) {
            // 折叠右侧面板
            commitDetails.classList.add('collapsed');
            // 不再隐藏分割线，让它保持可见
            // resizer.classList.add('hidden');
            
            // 如果左侧面板也折叠了，则展开左侧面板
            if (leftPanelCollapsed) {
                leftPanelCollapsed = false;
                commitList.classList.remove('collapsed');
            }
        } else {
            // 展开右侧面板
            commitDetails.classList.remove('collapsed');
            resizer.classList.remove('hidden');
        }
        
        updatePanelWidths();
        updateCollapseButtonsVisibility();
    }
    
    /**
     * 更新折叠按钮的可见性
     */
    function updateCollapseButtonsVisibility() {
        // 折叠按钮始终显示，只是在折叠状态下会旋转180度（通过CSS处理）
        if (leftCollapseBtn) {
            leftCollapseBtn.style.display = 'block';
        }
        
        if (rightCollapseBtn) {
            rightCollapseBtn.style.display = 'block';
        }
        
        // 分割线在两个面板都展开时显示
        if (leftPanelCollapsed || rightPanelCollapsed) {
            // 当有面板折叠时，分割线仍然显示，但位置会调整
            resizer.classList.remove('hidden');
        } else {
            resizer.classList.remove('hidden');
        }
    }
    
    /**
     * 重置面板布局到默认状态
     */
    function resetPanelLayout() {
        leftPanelCollapsed = false;
        rightPanelCollapsed = false;
        leftPanelWidth = 50;
        
        commitList.classList.remove('collapsed');
        commitDetails.classList.remove('collapsed');
        resizer.classList.remove('hidden');
        
        updatePanelWidths();
        updateCollapseButtonsVisibility();
    }
    
    /**
     * 保存面板布局状态到localStorage
     */
    function savePanelLayout() {
        const layoutState = {
            leftPanelWidth: leftPanelWidth,
            leftPanelCollapsed: leftPanelCollapsed,
            rightPanelCollapsed: rightPanelCollapsed
        };
        localStorage.setItem('gitHistoryPanelLayout', JSON.stringify(layoutState));
    }
    
    /**
     * 从localStorage恢复面板布局状态
     */
    function restorePanelLayout() {
        try {
            const savedLayout = localStorage.getItem('gitHistoryPanelLayout');
            if (savedLayout) {
                const layoutState = JSON.parse(savedLayout);
                leftPanelWidth = layoutState.leftPanelWidth || 50;
                leftPanelCollapsed = layoutState.leftPanelCollapsed || false;
                rightPanelCollapsed = layoutState.rightPanelCollapsed || false;
                
                if (leftPanelCollapsed) {
                    commitList.classList.add('collapsed');
                }
                if (rightPanelCollapsed) {
                    commitDetails.classList.add('collapsed');
                }
                
                updatePanelWidths();
                updateCollapseButtonsVisibility();
            }
        } catch (error) {
            console.warn('Failed to restore panel layout:', error);
            resetPanelLayout();
        }
    }
    
    // 监听窗口大小变化，保存布局状态
    window.addEventListener('beforeunload', savePanelLayout);
    
    // 监听窗口大小变化，调整面板宽度
    window.addEventListener('resize', () => {
        updatePanelWidths();
    });

    // ==================== 初始化 ====================
    
    /**
     * 应用初始化
     * 请求分支列表和初始提交记录
     */
    
    // 获取初始的折叠按钮引用并绑定事件监听器
    function initializeCollapseButtons() {
        leftCollapseBtn = document.getElementById('leftCollapseBtn');
        rightCollapseBtn = document.getElementById('rightCollapseBtn');
        
        // 绑定事件监听器
        if (leftCollapseBtn) {
            leftCollapseBtn.addEventListener('click', toggleLeftPanel);
        }
        if (rightCollapseBtn) {
            rightCollapseBtn.addEventListener('click', toggleRightPanel);
        }
    }
    
    // 初始化折叠按钮
    initializeCollapseButtons();
    
    // 恢复面板布局状态
    restorePanelLayout();
    
    // 请求数据
    vscode.postMessage({ type: 'getBranches' });
    loadCommits(true);
    
    /**
     * 定期检查并修复选中状态
     * 防止由于异步操作或DOM更新导致的状态丢失
     */
    function checkAndFixSelectionState() {
        if (currentCommit && selectedCommits.length > 0) {
            const currentElement = document.querySelector(`[data-hash="${currentCommit}"]`);
            if (currentElement && !currentElement.classList.contains('selected') && !currentElement.classList.contains('multi-selected')) {
                console.log(`Fixing lost selection state for commit ${currentCommit.substring(0, 8)}`);
                ensureCommitSelectionUI(currentCommit);
            }
        }
    }

    // 初始化定期检查
    setInterval(checkAndFixSelectionState, 2000); // 每2秒检查一次

    // 页面加载完成后的初始化
    document.addEventListener('DOMContentLoaded', function() {
        // 确保初始状态正确
        if (currentCommit) {
            ensureCommitSelectionUI(currentCommit);
        }
    });

})(); // 立即执行函数表达式结束