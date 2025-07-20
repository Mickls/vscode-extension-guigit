/**
 * Git History View - Main JavaScript Module
 * 处理Git历史记录的前端交互逻辑
 */
import { parseRefs, getRefClass } from './utils/git-utils.js';
import { formatDate } from './utils/date-utils.js';
import { escapeHtml, showError } from './utils/dom-utils.js';
// 导入Git图谱绘制模块
import { createGraphHtml } from './components/commit-graph.js';
// 导入文件树组件模块
import { buildFileTree, renderFileTree, renderFileList } from './components/file-tree.js';
// 导入面板管理模块
import { initializePanelManager, rebindCollapseButtons } from './ui/panel-manager.js';
// 导入右键菜单组件
import { showContextMenu as showContextMenuComponent, initializeContextMenu } from './components/context-menu.js';
// 导入提交操作功能
import { handleContextMenuAction as handleContextMenuActionComponent } from './features/commit-operations.js';
// 导入提交比较功能
import { showCompareResult as showCompareResultComponent, initializeCompareFeature } from './features/commit-compare.js';
// 导入状态管理模块
import {
    initializeStateManager, getState, setState, setStates,
    updateSelectedCommits, setCurrentCommit, setCurrentBranch, setLoading, setFileViewMode,
    resetCommitState, clearAllCache, getCachedCommitDetails, setCachedCommitDetails,
    hasPendingRequest, setPendingRequest, setSearchingForCommit, setPendingJumpCommit
} from './core/state-manager.js';

(function () {
    'use strict';

    // 获取VS Code API
    const vscode = acquireVsCodeApi();

    // 初始化状态管理器
    initializeStateManager();

    // 状态管理已迁移至 core/state-manager.js
    // 使用 getState() 和 setState() 函数访问和修改状态

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

    // Git操作按钮引用
    const pullBtn = document.getElementById('pullBtn');                   // 拉取按钮
    const pushBtn = document.getElementById('pushBtn');                   // 推送按钮
    const fetchBtn = document.getElementById('fetchBtn');                 // 抓取按钮
    const cloneBtn = document.getElementById('cloneBtn');                 // 克隆按钮
    const checkoutBtn = document.getElementById('checkoutBtn');           // 签出按钮

    // 新增的拖拽和折叠相关元素（这些元素是动态创建的，不在初始化时获取）
    const resizer = document.getElementById('resizer');                   // 分割线
    // 折叠按钮现在在panel-manager.js中管理

    // 事件监听器设置
    // 添加滚动监听器以实现无限滚动加载
    commitList.addEventListener('scroll', () => {
        if (getState('isLoading') || getState('loadedCommits') >= getState('totalCommits')) {
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
        setCurrentBranch(e.target.value);
        resetCommitState();
        // 注意：不重置currentCommit，让updateCommitHistory函数来处理
        // 性能优化：切换分支时清理缓存
        clearAllCache();
        updateMultiSelectInfo();
        loadCommits(true);
    });

    // 刷新按钮点击事件
    refreshBtn.addEventListener('click', () => {
        resetCommitState();
        // 注意：不重置currentCommit，让updateCommitHistory函数来处理
        // 性能优化：刷新时清理缓存
        clearAllCache();
        updateMultiSelectInfo();
        vscode.postMessage({ type: 'getBranches' });
        loadCommits(true);
    });

    // 跳转到HEAD提交按钮点击事件
    jumpToHeadBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'jumpToHead' });
    });

    // Git操作按钮事件监听器
    pullBtn.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey) {
            // 按住Ctrl/Cmd键显示高级选项
            vscode.postMessage({ type: 'gitPullAdvanced' });
        } else {
            // 直接pull
            vscode.postMessage({ type: 'gitPull' });
        }
    });

    pushBtn.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey) {
            // 按住Ctrl/Cmd键显示高级选项
            vscode.postMessage({ type: 'gitPushAdvanced' });
        } else {
            // 直接push
            vscode.postMessage({ type: 'gitPush' });
        }
    });

    fetchBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'gitFetch' });
    });

    cloneBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'gitClone' });
    });

    checkoutBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'gitCheckout' });
    });

    // 关闭比较面板事件监听器已迁移至 features/commit-compare.js

    // ==================== 面板管理器初始化 ====================

    // 初始化面板管理器
    initializePanelManager({
        commitList,
        commitDetails,
        resizer
    });

    // 初始化右键菜单
    initializeContextMenu(contextMenu);

    // 初始化提交比较功能
    initializeCompareFeature(comparePanel, closeCompare, (message) => vscode.postMessage(message));

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
                console.log('Received commitHistory message:', {
                    dataType: typeof message.data,
                    hasCommits: !!message.data?.commits,
                    commitsLength: message.data?.commits?.length,
                    firstCommit: message.data?.commits?.[0] ? {
                        hash: message.data.commits[0].hash?.substring(0, 7),
                        message: message.data.commits[0].message,
                        hasGraphInfo: !!message.data.commits[0].graphInfo,
                        graphInfo: message.data.commits[0].graphInfo
                    } : null
                });
                updateCommitHistory(message.data); // 更新提交历史记录
                break;
            case 'totalCommitCount':
                setState('totalCommits', message.data);       // 设置总提交数量
                break;
            case 'commitDetails':
                updateCommitDetails(message.data); // 更新提交详情信息
                break;
            case 'compareResult':
                showCompareResultComponent(message.data, comparePanel, compareContent);   // 显示提交比较结果
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
                // 重置加载状态
                setLoading(false);
                showError(message.message, commitDetails, commitList);        // 显示错误信息
                break;
            case 'viewMode':
                setFileViewMode(message.data);       // 设置文件视图模式
                break;
            // 删除了commitEditableStatus处理，现在直接使用预计算的canEditMessage值
        }
    });

    /**
     * 加载提交记录
     * @param {boolean} reset - 是否重置加载状态，true表示重新开始加载
     */
    function loadCommits(reset = false) {
        if (getState('isLoading')) return;

        setLoading(true);

        if (reset) {
            setState('loadedCommits', 0);
            setState('commits', []);
            // 保留折叠按钮和headers，只更新内容
            commitList.innerHTML = `
                <div class="panel-header">
                    <div class="commit-list-headers">
                        <div class="header-hash">Hash</div>
                        <div class="header-message">Message</div>
                        <div class="header-refs">Tags</div>
                        <div class="header-author">Author</div>
                        <div class="header-date">Date</div>
                    </div>
                    <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">‹</button>
                </div>
                <div class="loading">Loading commits...</div>
            `;
            rebindCollapseButtons();
        }

        // 请求获取提交历史记录
        vscode.postMessage({
            type: 'getCommitHistory',
            branch: getState('currentBranch') || undefined,
            skip: getState('loadedCommits')
        });

        // 如果还没有总数，请求获取总提交数量
        if (getState('totalCommits') === 0) {
            vscode.postMessage({
                type: 'getTotalCommitCount',
                branch: getState('currentBranch') || undefined
            });
        }
    }

    /**
     * 更新分支列表
     * @param {Array} branchData - 分支数据数组
     */
    function updateBranches(branchData) {
        setState('branches', branchData);
        branchSelect.innerHTML = '<option value="all">All branches</option>';

        // 遍历分支数据，创建选项元素
        branchData.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.name;
            option.textContent = branch.name + (branch.current ? ' (current)' : '');
            branchSelect.appendChild(option);
        });

        // 默认选择"All branches"
        branchSelect.value = 'all';
        setCurrentBranch('all');
    }

    /**
     * 更新提交历史记录
     * @param {Object} data - 包含提交数据的对象
     * @param {Array} data.commits - 提交记录数组
     * @param {number} data.skip - 跳过的提交数量
     */
    function updateCommitHistory(data) {
        setLoading(false);

        if (data.skip === 0) {
            // 首次加载或刷新
            const previousCurrentCommit = getState('currentCommit'); // 保存之前选中的提交
            setState('commits', data.commits);
            updateSelectedCommits([]);

            // 检查之前选中的提交是否仍然存在于新的提交列表中
            if (previousCurrentCommit && data.commits.some(commit => commit.hash === previousCurrentCommit)) {
                // 如果之前选中的提交仍然存在，保持选中状态
                setCurrentCommit(previousCurrentCommit);
                const commit = data.commits.find(c => c.hash === previousCurrentCommit);
                updateSelectedCommits(commit ? [commit] : []);
            } else {
                // 只有当之前选中的提交不存在时才重置
                setCurrentCommit(null);
                // 清空右侧详情面板
                commitDetails.innerHTML = `
                    <div class="panel-header">
                        <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
                    </div>
                    <div class="placeholder">Select a commit to view details</div>
                `;
                rebindCollapseButtons();
            }

            // 清空提交列表，但保留panel-header
            const panelHeader = commitList.querySelector('.panel-header');
            commitList.innerHTML = '';
            if (panelHeader) {
                commitList.appendChild(panelHeader);
            } else {
                // 如果没有panel-header，创建一个包含headers的
                commitList.innerHTML = `
                    <div class="panel-header">
                        <div class="commit-list-headers">
                            <div class="header-hash">Hash</div>
                            <div class="header-message">Message</div>
                            <div class="header-refs">Tags</div>
                            <div class="header-author">Author</div>
                            <div class="header-date">Date</div>
                        </div>
                        <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">‹</button>
                    </div>
                `;
            }
            rebindCollapseButtons();
            renderCommitList();

            // 如果保持了选中状态，需要恢复UI状态和详情显示
            const currentCommit = getState('currentCommit');
            if (currentCommit) {
                setTimeout(() => {
                    // 使用安全的更新函数确保UI状态正确
                    const commits = getState('commits');
                    const commit = commits.find(c => c.hash === currentCommit);
                    if (commit) {
                        ensureCommitSelectionUI(currentCommit);
                        // 如果有缓存的详情，直接显示
                        if (getCachedCommitDetails(currentCommit)) {
                            updateCommitDetails(getCachedCommitDetails(currentCommit));
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
            const currentCommits = getState('commits');
            setState('commits', currentCommits.concat(data.commits));
            appendCommitList(data.commits);
        }

        setState('loadedCommits', getState('commits').length);

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
     * 渲染提交列表
     * 将所有提交记录渲染到DOM中
     */
    function renderCommitList() {
        const commits = getState('commits');

        if (commits.length === 0) {
            // 如果没有提交，显示"No commits found"
            const existingHeaders = commitList.querySelectorAll('.panel-header');
            if (existingHeaders.length === 0) {
                commitList.innerHTML = `
                    <div class="panel-header">
                        <div class="commit-list-headers">
                            <div class="header-hash">Hash</div>
                            <div class="header-message">Message</div>
                            <div class="header-refs">Tags</div>
                            <div class="header-author">Author</div>
                            <div class="header-date">Date</div>
                        </div>
                        <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">‹</button>
                    </div>
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

        const commits = getState('commits');
        const loadedCommits = getState('loadedCommits');
        const totalCommits = getState('totalCommits');

        newCommits.forEach((commit, index) => {
            const commitElement = createCommitElement(commit, commits.length - newCommits.length + index);
            commitList.appendChild(commitElement);
        });

        // 重新检查是否需要显示加载指示器
        if (loadedCommits < totalCommits) {
            showLoadingIndicator();
        }

        // 检查新添加元素的宽度显示
        if (checkCommitListWidth) {
            setTimeout(checkCommitListWidth, 0);
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
                <div class="commit-hash" title="${commit.hash}">${commit.hash.substring(0, 8)}</div>
                <div class="commit-message" title="${escapeHtml(commit.message)}">${escapeHtml(commit.message)}</div>
                ${refsHtml ? `<div class="commit-refs">${refsHtml}</div>` : '<div class="commit-refs"></div>'}
                <div class="commit-author" title="${escapeHtml(commit.author)}">${escapeHtml(commit.author)}</div>
                <div class="commit-date" title="${formatDate(commit.date)}">${formatDate(commit.date)}</div>
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
            const selectedCommits = getState('selectedCommits');
            showContextMenuComponent(e, commit.hash, selectedCommits, contextMenu, (action, hash) => {
                handleContextMenuActionComponent(action, hash, selectedCommits, (message) => vscode.postMessage(message));
            }, vscode);
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

    /**
     * 切换提交记录的选择状态（多选模式）
     * @param {string} hash - 提交哈希值
     * @param {HTMLElement} element - 提交记录的DOM元素
     */
    function toggleCommitSelection(hash, element) {
        const commits = getState('commits');
        const commit = commits.find(c => c.hash === hash);
        if (!commit) return;

        const selectedCommits = getState('selectedCommits');
        const index = selectedCommits.findIndex(c => c.hash === hash);
        if (index > -1) {
            // 取消选择：从数组中移除
            const newSelected = [...selectedCommits];
            newSelected.splice(index, 1);
            updateSelectedCommits(newSelected);

            // 如果这是当前选中的提交，需要更新 currentCommit
            if (getState('currentCommit') === hash) {
                if (newSelected.length > 0) {
                    // 如果还有其他选中的提交，选择第一个作为当前提交
                    setCurrentCommit(newSelected[0].hash);
                } else {
                    // 如果没有选中的提交了，清空当前提交
                    setCurrentCommit(null);
                }
            }
        } else {
            // 添加选择：加入数组
            const newSelected = [...selectedCommits, commit];
            updateSelectedCommits(newSelected);

            // 如果这是第一个选中的提交，设置为当前提交
            if (newSelected.length === 1) {
                setCurrentCommit(hash);
            }
        }

        // 确保UI状态正确
        const updatedSelected = getState('selectedCommits');
        if (updatedSelected.length === 0) {
            // 没有选中的提交，清除所有样式
            document.querySelectorAll('.commit-item').forEach(item => {
                item.classList.remove('selected', 'multi-selected');
            });
        } else if (updatedSelected.length === 1) {
            // 单选模式
            ensureCommitSelectionUI(updatedSelected[0].hash);
        } else {
            // 多选模式
            document.querySelectorAll('.commit-item').forEach(item => {
                item.classList.remove('selected', 'multi-selected');
            });
            updatedSelected.forEach(commit => {
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
        const commits = getState('commits');
        const commit = commits.find(c => c.hash === hash);
        if (!commit) return;

        // 使用安全的更新函数
        safeUpdateCurrentCommit(hash, commit);

        // 性能优化：检查缓存
        if (getCachedCommitDetails(hash)) {
            // 从缓存中获取详情，立即显示
            const cachedDetails = getCachedCommitDetails(hash);
            updateCommitDetails(cachedDetails);
            return;
        }

        // 检查是否已有相同请求正在进行
        if (hasPendingRequest(hash)) {
            // 如果已有请求在进行，只显示loading状态
            commitDetails.innerHTML = `
                <div class="panel-header">
                    <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
                </div>
                <div class="loading">Loading commit details...</div>
            `;
            rebindCollapseButtons();
            return;
        }

        // 清除详情区域，显示加载状态
        commitDetails.innerHTML = `
            <div class="panel-header">
                <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
            </div>
            <div class="loading">Loading commit details...</div>
        `;
        rebindCollapseButtons();

        // 标记请求正在进行
        setPendingRequest(hash, true);

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
        if (getCachedCommitDetails(hash) || hasPendingRequest(hash)) {
            return;
        }

        // 标记请求正在进行
        setPendingRequest(hash, true);

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
     * 确保提交选中状态的UI正确性
     * @param {string} hash - 提交哈希值
     */
    function ensureCommitSelectionUI(hash) {
        const selectedCommits = getState('selectedCommits');
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
        const currentCommit = getState('currentCommit');
        console.log(`Updating current commit from ${currentCommit ? currentCommit.substring(0, 8) : 'none'} to ${hash.substring(0, 8)}`);

        setCurrentCommit(hash);
        updateSelectedCommits(commit ? [commit] : []);

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
                <div class="panel-header">
                    <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
                </div>
                <div class="placeholder">Failed to load commit details</div>
            `;
            rebindCollapseButtons();
            return;
        }

        const { commit, files } = data;

        // 性能优化：缓存详情数据
        if (commit && commit.hash) {
            setCachedCommitDetails(commit.hash, data);
            // 清理pending请求标记
            setPendingRequest(commit.hash, false);
        }

        // 修复：只有当这个提交是当前选中的提交时，才更新详情页面
        // 这样可以防止预加载或其他异步请求影响当前显示的详情
        const currentCommit = getState('currentCommit');
        if (commit.hash !== currentCommit) {
            // 如果不是当前选中的提交，只缓存数据，不更新UI
            console.log(`Skipping UI update for ${commit.hash.substring(0, 8)} (current: ${currentCommit ? currentCommit.substring(0, 8) : 'none'})`);
            return;
        }

        // 确保当前选中的 commit 元素仍然有正确的样式
        ensureCommitSelectionUI(commit.hash);

        // 根据视图模式构建文件HTML
        let filesHtml;
        const fileViewMode = getState('fileViewMode');
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
            <div class="panel-header">
                <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
            </div>
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
    window.toggleFileViewMode = function () {
        const currentMode = getState('fileViewMode');
        const newMode = currentMode === 'tree' ? 'list' : 'tree';
        setFileViewMode(newMode);

        // 保存配置到VS Code设置
        vscode.postMessage({
            type: 'saveViewMode',
            viewMode: newMode
        });

        // 重新请求当前提交详情以刷新视图
        const currentCommit = getState('currentCommit');
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
    window.toggleFolder = function (folderHeader) {
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
    window.toggleAllFolders = function () {
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
    window.showFileDiff = function (commitHash, filePath) {
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
    window.openFile = function (filePath) {
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
    window.showFileHistory = function (filePath) {
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
    window.viewFileOnline = function (commitHash, filePath) {
        vscode.postMessage({
            type: 'viewFileOnline',
            hash: commitHash,
            file: filePath
        });
    };

    // 提交比较功能已迁移至 features/commit-compare.js

    // 比较文件事件监听器和全局函数已迁移至 features/commit-compare.js

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

            updateSelectedCommits([headCommit]);
            setCurrentCommit(headCommit.hash);

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
            const commits = getState('commits');
            const commit = commits.find(c => c.hash === commitHash);
            updateSelectedCommits(commit ? [commit] : []);
            setCurrentCommit(commitHash);

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
        const loadedCommits = getState('loadedCommits');
        const totalCommits = getState('totalCommits');
        const isLoading = getState('isLoading');
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
        setSearchingForCommit(commitHash);

        // 加载更多提交
        loadCommits(false);

        // 设置超时，避免无限加载
        setTimeout(() => {
            if (getState('searchingForCommit') === commitHash) {
                setSearchingForCommit(null);
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
    window.switchToBranchAndJump = function (branchName, commitHash) {
        // 移除提示消息
        const message = document.querySelector('.commit-not-found-message');
        if (message) {
            message.remove();
        }

        // 设置要跳转的提交
        setPendingJumpCommit(commitHash);

        // 切换分支
        setCurrentBranch(branchName);
        branchSelect.value = branchName;

        // 重新加载提交历史
        setStates({
            loadedCommits: 0,
            commits: []
        });
        updateSelectedCommits([]);
        updateMultiSelectInfo();
        loadCommits(true);
    };

    // ==================== 初始化 ====================

    // 请求数据
    vscode.postMessage({ type: 'getBranches' });
    loadCommits(true);

    /**
     * 定期检查并修复选中状态
     * 防止由于异步操作或DOM更新导致的状态丢失
     */
    function checkAndFixSelectionState() {
        const currentCommit = getState('currentCommit');
        const selectedCommits = getState('selectedCommits');
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
    document.addEventListener('DOMContentLoaded', function () {
        // 确保初始状态正确
        const currentCommit = getState('currentCommit');
        if (currentCommit) {
            ensureCommitSelectionUI(currentCommit);
        }
    });

    // 全局宽度检查函数
    let checkCommitListWidth;

    /**
     * 初始化宽度监控功能
     * 监控commit-list的宽度变化，动态控制tags的显示
     */
    function initializeWidthMonitoring() {
        let lastWidth = 0;

        checkCommitListWidth = function () {
            const commitListWidth = commitList.clientWidth;

            // 只有当宽度发生变化时才处理
            if (commitListWidth !== lastWidth) {
                lastWidth = commitListWidth;

                // 获取所有commit-refs元素
                const allRefs = document.querySelectorAll('.commit-refs');

                // 根据宽度调整遮罩效果的强度
                // 当commit-list宽度小于800px时增强遮罩效果
                const shouldEnhanceMask = commitListWidth < 800;

                allRefs.forEach(refs => {
                    if (shouldEnhanceMask) {
                        // 增强遮罩效果，让渐变更明显
                        refs.style.setProperty('--mask-opacity', '1');
                    } else {
                        // 减弱遮罩效果
                        refs.style.setProperty('--mask-opacity', '0');
                    }
                });
            }
        };

        // 使用ResizeObserver监控宽度变化
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(checkCommitListWidth);
            resizeObserver.observe(commitList);
        } else {
            // 降级方案：使用定时器
            setInterval(checkCommitListWidth, 100);
        }

        // 初始检查
        checkCommitListWidth();
    }

    // 初始化宽度监控
    initializeWidthMonitoring();

})(); // 立即执行函数表达式结束