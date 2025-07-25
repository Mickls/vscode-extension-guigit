/**
 * 图标管理系统
 * 使用 VSCode Codicons 图标库，提供统一的图标风格
 */

// VSCode Codicons 图标映射表
export const CodiconMap = {
    // 文件和文件夹图标
    file: 'file',
    folder: 'folder',
    folderOpened: 'folder-opened',
    
    // 文件状态图标
    fileAdded: 'diff-added',
    fileModified: 'diff-modified', 
    fileDeleted: 'diff-removed',
    fileChanged: 'diff-modified',
    fileRenamed: 'diff-renamed',
    
    // 操作图标
    diff: 'diff',
    open: 'go-to-file',
    history: 'history',
    viewOnline: 'link-external',
    
    // 面板控制图标
    collapseLeft: 'chevron-left',
    collapseRight: 'chevron-right',
    
    // Git操作图标
    pull: 'repo-pull',
    push: 'repo-push',
    fetch: 'git-fetch',
    clone: 'repo-clone',
    checkout: 'git-branch',
    resetStash: 'settings-gear',
    jumpToHead: 'target',
    refresh: 'refresh',
    
    // 视图切换图标
    listView: 'list-unordered',
    treeView: 'list-tree',
    
    // 分支和提交图标
    branch: 'git-branch',
    commit: 'git-commit',
    tag: 'tag',
    
    // 时间和日期图标
    clock: 'clock',
    calendar: 'calendar',
    
    // 通知和状态图标
    warning: 'warning',
    error: 'error',
    info: 'info',
    success: 'check',
    search: 'search',
    
    // 用户和权限图标
    person: 'person',
    people: 'organization',
    
    // 其他常用图标
    settings: 'settings-gear',
    close: 'close',
    add: 'add',
    remove: 'remove',
    edit: 'edit',
    copy: 'copy',
    save: 'save',
    undo: 'undo',
    redo: 'redo'
};

/**
 * 获取 Codicon 图标的 HTML
 * @param {string} iconName - 图标名称
 * @param {Object} options - 选项
 * @param {string} options.size - 图标大小 (small: 12px, medium: 16px, large: 20px)
 * @param {string} options.className - 额外的CSS类名
 * @returns {string} 图标HTML字符串
 */
export function getIcon(iconName, options = {}) {
    const codiconName = CodiconMap[iconName];
    if (!codiconName) {
        console.warn(`Icon "${iconName}" not found in CodiconMap`);
        return '';
    }
    
    const { size = 'medium', className = '' } = options;
    
    // 根据大小设置样式
    const sizeStyles = {
        small: 'font-size: 12px;',
        medium: 'font-size: 16px;',
        large: 'font-size: 20px;'
    };
    
    const style = sizeStyles[size] || sizeStyles.medium;
    const classes = `codicon codicon-${codiconName} ${className}`.trim();
    
    return `<i class="${classes}" style="${style}"></i>`;
}

/**
 * 创建带图标的按钮HTML
 * @param {string} iconName - 图标名称
 * @param {string} title - 按钮标题
 * @param {string} onClick - 点击事件处理函数
 * @param {string} className - 按钮CSS类名
 * @param {Object} iconOptions - 图标选项
 * @returns {string} 按钮HTML字符串
 */
export function createIconButton(iconName, title, onClick, className = 'file-action-btn', iconOptions = {}) {
    const icon = getIcon(iconName, iconOptions);
    return `<button class="${className}" title="${title}" onclick="${onClick}">${icon}</button>`;
}

/**
 * 获取纯 Codicon 类名（用于CSS类）
 * @param {string} iconName - 图标名称
 * @returns {string} Codicon 类名
 */
export function getCodiconClass(iconName) {
    const codiconName = CodiconMap[iconName];
    if (!codiconName) {
        console.warn(`Icon "${iconName}" not found in CodiconMap`);
        return '';
    }
    return `codicon codicon-${codiconName}`;
}

// 向后兼容：保留旧的 Icons 对象，但使用新的 Codicon 系统
export const Icons = new Proxy({}, {
    get(target, prop) {
        console.warn(`Direct access to Icons.${prop} is deprecated. Use getIcon('${prop}') instead.`);
        return getIcon(prop);
    }
});