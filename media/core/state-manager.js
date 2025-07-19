/**
 * 状态管理模块
 * 集中管理应用的全局状态，包括提交记录、分支信息、选中状态等
 */

/**
 * 应用状态对象
 * 包含所有全局状态变量
 */
const state = {
    // 数据状态
    commits: [],           // 提交记录列表
    branches: [],          // 分支列表
    selectedCommits: [],   // 选中的提交记录
    currentCommit: null,   // 当前查看的提交
    currentBranch: '',     // 当前分支
    
    // 加载状态
    loadedCommits: 0,      // 已加载的提交数量
    totalCommits: 0,       // 总提交数量
    isLoading: false,      // 是否正在加载
    
    // UI状态
    fileViewMode: 'list',  // 文件视图模式: 'tree' 或 'list'
    
    // 缓存和性能优化
    commitDetailsCache: new Map(), // 缓存commit详情，避免重复请求
    pendingRequests: new Map(),    // 防止同一commit的重复请求
    
    // 搜索和导航状态
    searchingForCommit: null,      // 正在搜索的提交哈希
    pendingJumpCommit: null        // 待跳转的提交哈希
};

/**
 * 状态变更监听器
 */
const listeners = {
    commits: [],
    selectedCommits: [],
    currentCommit: [],
    currentBranch: [],
    isLoading: []
};

/**
 * 添加状态变更监听器
 * @param {string} key - 状态键名
 * @param {Function} callback - 回调函数
 */
export function addStateListener(key, callback) {
    if (listeners[key]) {
        listeners[key].push(callback);
    }
}

/**
 * 移除状态变更监听器
 * @param {string} key - 状态键名
 * @param {Function} callback - 回调函数
 */
export function removeStateListener(key, callback) {
    if (listeners[key]) {
        const index = listeners[key].indexOf(callback);
        if (index > -1) {
            listeners[key].splice(index, 1);
        }
    }
}

/**
 * 触发状态变更监听器
 * @param {string} key - 状态键名
 * @param {*} newValue - 新值
 * @param {*} oldValue - 旧值
 */
function notifyListeners(key, newValue, oldValue) {
    if (listeners[key]) {
        listeners[key].forEach(callback => {
            try {
                callback(newValue, oldValue);
            } catch (error) {
                console.error(`Error in state listener for ${key}:`, error);
            }
        });
    }
}

/**
 * 获取状态值
 * @param {string} key - 状态键名
 * @returns {*} 状态值
 */
export function getState(key) {
    return state[key];
}

/**
 * 设置状态值
 * @param {string} key - 状态键名
 * @param {*} value - 新值
 */
export function setState(key, value) {
    const oldValue = state[key];
    state[key] = value;
    
    // 同步到window对象（为了向后兼容）
    if (key === 'commits' || key === 'selectedCommits') {
        window[key] = value;
    }
    
    // 触发监听器
    notifyListeners(key, value, oldValue);
}

/**
 * 批量设置状态
 * @param {Object} updates - 状态更新对象
 */
export function setStates(updates) {
    Object.keys(updates).forEach(key => {
        setState(key, updates[key]);
    });
}

/**
 * 更新选中的提交记录
 * @param {Array} newSelectedCommits - 新的选中提交数组
 */
export function updateSelectedCommits(newSelectedCommits) {
    setState('selectedCommits', newSelectedCommits);
}

/**
 * 添加提交到选中列表
 * @param {Object} commit - 提交对象
 */
export function addSelectedCommit(commit) {
    const currentSelected = getState('selectedCommits');
    if (!currentSelected.find(c => c.hash === commit.hash)) {
        setState('selectedCommits', [...currentSelected, commit]);
    }
}

/**
 * 从选中列表移除提交
 * @param {string} commitHash - 提交哈希
 */
export function removeSelectedCommit(commitHash) {
    const currentSelected = getState('selectedCommits');
    setState('selectedCommits', currentSelected.filter(c => c.hash !== commitHash));
}

/**
 * 清空选中的提交
 */
export function clearSelectedCommits() {
    setState('selectedCommits', []);
}

/**
 * 设置当前提交
 * @param {string} commitHash - 提交哈希
 */
export function setCurrentCommit(commitHash) {
    setState('currentCommit', commitHash);
}

/**
 * 设置当前分支
 * @param {string} branchName - 分支名称
 */
export function setCurrentBranch(branchName) {
    setState('currentBranch', branchName);
}

/**
 * 设置加载状态
 * @param {boolean} loading - 是否正在加载
 */
export function setLoading(loading) {
    setState('isLoading', loading);
}

/**
 * 设置文件视图模式
 * @param {string} mode - 视图模式 ('tree' 或 'list')
 */
export function setFileViewMode(mode) {
    setState('fileViewMode', mode);
}

/**
 * 重置提交相关状态
 */
export function resetCommitState() {
    setStates({
        commits: [],
        selectedCommits: [],
        currentCommit: null,
        loadedCommits: 0
    });
}

/**
 * 重置所有状态
 */
export function resetAllState() {
    setStates({
        commits: [],
        branches: [],
        selectedCommits: [],
        currentCommit: null,
        currentBranch: '',
        loadedCommits: 0,
        totalCommits: 0,
        isLoading: false,
        fileViewMode: 'list',
        searchingForCommit: null,
        pendingJumpCommit: null
    });
    
    // 清空缓存
    state.commitDetailsCache.clear();
    state.pendingRequests.clear();
}

/**
 * 获取提交详情缓存
 * @param {string} commitHash - 提交哈希
 * @returns {Object|undefined} 缓存的提交详情
 */
export function getCachedCommitDetails(commitHash) {
    return state.commitDetailsCache.get(commitHash);
}

/**
 * 设置提交详情缓存
 * @param {string} commitHash - 提交哈希
 * @param {Object} details - 提交详情
 */
export function setCachedCommitDetails(commitHash, details) {
    state.commitDetailsCache.set(commitHash, details);
    
    // 限制缓存大小，避免内存泄漏
    if (state.commitDetailsCache.size > 50) {
        const firstKey = state.commitDetailsCache.keys().next().value;
        state.commitDetailsCache.delete(firstKey);
    }
}

/**
 * 检查是否有待处理的请求
 * @param {string} commitHash - 提交哈希
 * @returns {boolean} 是否有待处理的请求
 */
export function hasPendingRequest(commitHash) {
    return state.pendingRequests.has(commitHash);
}

/**
 * 设置待处理的请求
 * @param {string} commitHash - 提交哈希
 * @param {boolean} pending - 是否待处理
 */
export function setPendingRequest(commitHash, pending) {
    if (pending) {
        state.pendingRequests.set(commitHash, true);
    } else {
        state.pendingRequests.delete(commitHash);
    }
}

/**
 * 清空所有缓存
 */
export function clearAllCache() {
    state.commitDetailsCache.clear();
    state.pendingRequests.clear();
}

/**
 * 设置搜索状态
 * @param {string|null} commitHash - 正在搜索的提交哈希
 */
export function setSearchingForCommit(commitHash) {
    setState('searchingForCommit', commitHash);
}

/**
 * 设置待跳转提交
 * @param {string|null} commitHash - 待跳转的提交哈希
 */
export function setPendingJumpCommit(commitHash) {
    setState('pendingJumpCommit', commitHash);
}

/**
 * 初始化状态管理器
 * 设置初始状态并暴露到window对象（为了向后兼容）
 */
export function initializeStateManager() {
    // 暴露到window对象供其他模块访问
    window.commits = state.commits;
    window.selectedCommits = state.selectedCommits;
    
    // 暴露状态管理函数到window对象
    window.getState = getState;
    window.setState = setState;
    window.updateSelectedCommits = updateSelectedCommits;
    
    console.log('State manager initialized');
}

// 导出状态对象（只读）
export const stateReadonly = new Proxy(state, {
    set() {
        throw new Error('State should be modified through setState() function');
    },
    get(target, prop) {
        return target[prop];
    }
});