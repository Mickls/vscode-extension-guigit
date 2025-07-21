/**
 * 图标管理系统
 * 统一管理所有SVG图标，避免重复定义
 */

export const Icons = {
    // 文件和文件夹图标
    file: '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"/></svg>',
    
    folder: '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1A1.5 1.5 0 0 0 5 2.5V3H1.5A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 4H9.5a.5.5 0 0 1-.5-.5V2.5A.5.5 0 0 0 8.5 2h-2z"/></svg>',
    
    // 文件状态图标
    fileAdded: '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>',
    
    fileModified: '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/></svg>',
    
    fileDeleted: '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 7.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/></svg>',
    
    fileChanged: '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854 4.146a.5.5 0 0 0-.708 0L8 8.293 3.854 4.146a.5.5 0 1 0-.708.708L7.293 9l-4.147 4.146a.5.5 0 0 0 .708.708L8 9.707l4.146 4.147a.5.5 0 0 0 .708-.708L8.707 9l4.147-4.146a.5.5 0 0 0 0-.708z"/></svg>',
    
    // 操作图标
    diff: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1.5A.5.5 0 0 1 2 1h4a.5.5 0 0 1 0 1H2v13h12v-6a.5.5 0 0 1 1 0v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a.5.5 0 0 1 .5-.5z"/><path d="M15.854 2.146a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L8.5 8.793l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>',
    
    open: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"/></svg>',
    
    history: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zM8 6a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1 0-1h1.5V6.5A.5.5 0 0 1 8 6zM1 10.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"/><circle cx="4" cy="6.5" r="1.5"/><circle cx="4" cy="13.5" r="1.5"/></svg>',
    
    viewOnline: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>',
    
    // 面板控制图标
    collapseLeft: '‹',
    collapseRight: '›',
    
    // Git操作图标
    pull: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 6.5V1h1v5.5l1.5-1.5.707.707L8 8.414 5.293 5.707 6 5l1.5 1.5z"/><path d="M2 10v3h12v-3h1v4H1v-4h1z"/></svg>',
    
    push: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 9.5V15h-1V9.5L6 11l-.707-.707L8 7.586l2.707 2.707L10 11l-1.5-1.5z"/><path d="M14 6V3H2v3H1V2h14v4h-1z"/></svg>',
    
    fetch: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM7 3v6L5.5 7.5 4.793 8.207 8 11.414l3.207-3.207L10.5 7.5 9 9V3H7z"/></svg>',
    
    clone: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1 0v10h10V3H3z"/><path d="M5 5h6v1H5V5zm0 2h6v1H5V7zm0 2h4v1H5V9z"/></svg>',
    
    checkout: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM4.5 7.5a.5.5 0 0 0 0 1h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5H4.5z"/></svg>',
    
    jumpToHead: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l3 3-3 3V5H3v2h5v2L5 6l3-3V1z"/><path d="M13 8v5H3V8h2v3h6V8h2z"/></svg>',
    
    refresh: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>',
    
    // 视图切换图标
    listView: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/></svg>'
};

/**
 * 获取图标HTML
 * @param {string} iconName - 图标名称
 * @param {Object} options - 选项
 * @param {string} options.size - 图标大小 (small, medium, large)
 * @param {string} options.className - 额外的CSS类名
 * @returns {string} 图标HTML字符串
 */
export function getIcon(iconName, options = {}) {
    const icon = Icons[iconName];
    if (!icon) {
        console.warn(`Icon "${iconName}" not found`);
        return '';
    }
    
    // 如果需要自定义大小或类名，可以在这里处理
    if (options.className) {
        return icon.replace('<svg', `<svg class="${options.className}"`);
    }
    
    return icon;
}

/**
 * 创建带图标的按钮HTML
 * @param {string} iconName - 图标名称
 * @param {string} title - 按钮标题
 * @param {string} onClick - 点击事件处理函数
 * @param {string} className - 按钮CSS类名
 * @returns {string} 按钮HTML字符串
 */
export function createIconButton(iconName, title, onClick, className = 'file-action-btn') {
    const icon = getIcon(iconName);
    return `<button class="${className}" title="${title}" onclick="${onClick}">${icon}</button>`;
}