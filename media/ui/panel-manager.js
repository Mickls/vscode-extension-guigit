/**
 * 面板管理模块
 * 处理拖拽分割线和折叠面板的UI交互逻辑
 */

import { savePanelLayout, restorePanelLayout } from '../utils/storage-utils.js';

// 面板状态变量
let isResizing = false;                    // 是否正在拖拽分割线
let leftPanelWidth = 50;                   // 左侧面板宽度百分比
let leftPanelCollapsed = false;            // 左侧面板是否折叠
let rightPanelCollapsed = false;           // 右侧面板是否折叠

// DOM元素引用
let commitList = null;
let commitDetails = null;
let resizer = null;
let leftCollapseBtn = null;
let rightCollapseBtn = null;

// 事件处理器
let mouseMoveHandler = null;
let mouseUpHandler = null;

/**
 * 初始化面板管理器
 * @param {Object} elements - DOM元素对象
 * @param {HTMLElement} elements.commitList - 提交列表元素
 * @param {HTMLElement} elements.commitDetails - 提交详情元素
 * @param {HTMLElement} elements.resizer - 分割线元素
 */
export function initializePanelManager(elements) {
    commitList = elements.commitList;
    commitDetails = elements.commitDetails;
    resizer = elements.resizer;
    
    // 初始化拖拽功能
    initializeDragResize();
    
    // 初始化键盘快捷键
    initializeKeyboardShortcuts();
    
    // 初始化折叠按钮
    initializeCollapseButtons();
    
    // 恢复面板布局状态
    restorePanelState();
    
    // 监听窗口事件
    initializeWindowEvents();
}

/**
 * 初始化拖拽分割线功能
 */
function initializeDragResize() {
    if (!resizer) return;
    
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
}

/**
 * 初始化键盘快捷键
 */
function initializeKeyboardShortcuts() {
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
}

/**
 * 初始化窗口事件监听
 */
function initializeWindowEvents() {
    // 监听窗口大小变化，保存布局状态
    window.addEventListener('beforeunload', () => {
        savePanelLayout(leftPanelWidth, leftPanelCollapsed, rightPanelCollapsed);
    });
    
    // 监听窗口大小变化，调整面板宽度
    window.addEventListener('resize', () => {
        updatePanelWidths();
    });
}

/**
 * 更新面板宽度
 * 根据当前的leftPanelWidth变量更新左右面板的宽度
 */
export function updatePanelWidths() {
    if (!commitList || !commitDetails) return;
    
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
export function toggleLeftPanel() {
    leftPanelCollapsed = !leftPanelCollapsed;
    
    if (leftPanelCollapsed) {
        // 折叠左侧面板
        commitList.classList.add('collapsed');
        
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
export function toggleRightPanel() {
    rightPanelCollapsed = !rightPanelCollapsed;
    
    if (rightPanelCollapsed) {
        // 折叠右侧面板
        commitDetails.classList.add('collapsed');
        
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
export function updateCollapseButtonsVisibility() {
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
export function resetPanelLayout() {
    leftPanelCollapsed = false;
    rightPanelCollapsed = false;
    leftPanelWidth = 50;
    
    if (commitList && commitDetails && resizer) {
        commitList.classList.remove('collapsed');
        commitDetails.classList.remove('collapsed');
        resizer.classList.remove('hidden');
    }
    
    updatePanelWidths();
    updateCollapseButtonsVisibility();
}

/**
 * 获取初始的折叠按钮引用并绑定事件监听器
 */
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

/**
 * 重新绑定折叠按钮的事件监听器
 * 在动态更新DOM后需要重新绑定事件
 */
export function rebindCollapseButtons() {
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
 * 恢复面板布局状态
 */
function restorePanelState() {
    const layoutState = restorePanelLayout();
    leftPanelWidth = layoutState.leftPanelWidth;
    leftPanelCollapsed = layoutState.leftPanelCollapsed;
    rightPanelCollapsed = layoutState.rightPanelCollapsed;
    
    if (leftPanelCollapsed && commitList) {
        commitList.classList.add('collapsed');
    }
    if (rightPanelCollapsed && commitDetails) {
        commitDetails.classList.add('collapsed');
    }
    
    updatePanelWidths();
    updateCollapseButtonsVisibility();
}

/**
 * 获取当前面板状态
 * @returns {Object} 面板状态对象
 */
export function getPanelState() {
    return {
        leftPanelWidth,
        leftPanelCollapsed,
        rightPanelCollapsed,
        isResizing
    };
}

/**
 * 设置面板状态
 * @param {Object} state - 面板状态对象
 */
export function setPanelState(state) {
    if (state.leftPanelWidth !== undefined) {
        leftPanelWidth = state.leftPanelWidth;
    }
    if (state.leftPanelCollapsed !== undefined) {
        leftPanelCollapsed = state.leftPanelCollapsed;
    }
    if (state.rightPanelCollapsed !== undefined) {
        rightPanelCollapsed = state.rightPanelCollapsed;
    }
    
    updatePanelWidths();
    updateCollapseButtonsVisibility();
}

// 暴露toggleLeftPanel和toggleRightPanel到window对象，供HTML中的onclick使用
window.toggleLeftPanel = toggleLeftPanel;
window.toggleRightPanel = toggleRightPanel;