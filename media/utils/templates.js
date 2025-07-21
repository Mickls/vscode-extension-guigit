/**
 * HTML模板系统
 * 统一管理重复的HTML结构模板
 */

import { getIcon, createIconButton } from './icons.js';

/**
 * HTML模板集合
 */
export const Templates = {
    /**
     * 面板折叠按钮模板
     * @param {string} direction - 方向 ('left' | 'right')
     * @param {string} id - 按钮ID
     * @returns {string} 按钮HTML
     */
    panelCollapseButton(direction, id) {
        const icon = direction === 'left' ? getIcon('collapseLeft') : getIcon('collapseRight');
        return `<button class="panel-collapse-btn" id="${id}" title="Collapse panel">${icon}</button>`;
    },

    /**
     * 文件操作按钮组模板
     * @param {string} commitHash - 提交哈希
     * @param {string} filePath - 文件路径
     * @param {Object} options - 选项
     * @param {boolean} options.showViewOnline - 是否显示在线查看按钮
     * @param {boolean} options.isCompareMode - 是否为比较模式
     * @returns {string} 按钮组HTML
     */
    fileActionButtons(commitHash, filePath, options = {}) {
        const { showViewOnline = true, isCompareMode = false } = options;
        const escapedHash = escapeHtml(commitHash);
        const escapedFile = escapeHtml(filePath);
        
        let buttons = [];
        
        if (isCompareMode) {
            // 比较模式下的按钮
            buttons.push(createIconButton('diff', 'View Diff', 
                `showCompareFileDiff('${escapedHash}', '${escapedFile}', '${escapedFile}')`));
        } else {
            // 普通模式下的按钮
            buttons.push(createIconButton('diff', 'View Diff', 
                `showFileDiff('${escapedHash}', '${escapedFile}')`));
        }
        
        buttons.push(createIconButton('open', 'Open File', 
            `openFile('${escapedFile}')`));
        
        buttons.push(createIconButton('history', 'File History', 
            `showFileHistory('${escapedFile}')`));
        
        if (showViewOnline) {
            buttons.push(createIconButton('viewOnline', 'View Online', 
                `viewFileOnline('${escapedHash}', '${escapedFile}')`));
        }
        
        return `<div class="file-actions">${buttons.join('')}</div>`;
    },

    /**
     * 文件项模板
     * @param {Object} file - 文件对象
     * @param {string} commitHash - 提交哈希
     * @param {Object} options - 选项
     * @returns {string} 文件项HTML
     */
    fileItem(file, commitHash, options = {}) {
        const { isCompareMode = false, level = 0 } = options;
        const escapedFile = escapeHtml(file.file);
        const escapedHash = escapeHtml(commitHash);
        const fileName = file.file.split('/').pop();
        
        const fileIcon = getIcon('file');
        const actionButtons = this.fileActionButtons(commitHash, file.file, options);
        
        return `
            <div class="file-item" data-level="${level}" data-file="${escapedFile}" data-hash="${escapedHash}">
                <div class="file-info">
                    <span class="file-icon">${fileIcon}</span>
                    <span class="file-name">${escapeHtml(fileName)}</span>
                    ${actionButtons}
                </div>
                <div class="file-stats">
                    ${file.binary ? 'binary' : ''}
                    ${!file.binary ? `<span class="insertions">+${file.insertions}</span> <span class="deletions">-${file.deletions}</span>` : ''}
                </div>
            </div>
        `;
    },

    /**
     * 文件夹项模板
     * @param {string} name - 文件夹名称
     * @param {string} childrenHtml - 子项HTML
     * @param {number} childCount - 子项数量
     * @param {number} level - 层级
     * @param {boolean} isCollapsed - 是否折叠
     * @param {boolean} isCompressed - 是否为压缩文件夹
     * @returns {string} 文件夹HTML
     */
    folderItem(name, childrenHtml, childCount, level, isCollapsed = false, isCompressed = false) {
        const folderIcon = getIcon('folder');
        const compressedClass = isCompressed ? ' compressed-folder' : '';
        const iconClass = isCollapsed ? 'collapsed' : 'expanded';
        const displayStyle = isCollapsed ? 'style="display: none;"' : '';
        
        return `
            <div class="file-tree-folder${compressedClass}" data-level="${level}">
                <div class="folder-header" onclick="toggleFolder(this)">
                    <span class="folder-icon ${iconClass}">
                        ${folderIcon}
                    </span>
                    <span class="folder-name">${escapeHtml(name)}</span>
                    <span class="folder-count">(${childCount})</span>
                </div>
                <div class="folder-content" ${displayStyle}>
                    ${childrenHtml}
                </div>
            </div>
        `;
    },

    /**
     * Git操作按钮模板
     * @param {string} action - 操作类型
     * @param {string} label - 按钮标签
     * @param {string} title - 按钮标题
     * @returns {string} 按钮HTML
     */
    gitButton(action, label, title) {
        const icon = getIcon(action);
        return `
            <button id="${action}Btn" class="git-btn" title="${title}">
                ${icon}
                ${label}
            </button>
        `;
    },

    /**
     * 图标按钮模板
     * @param {string} id - 按钮ID
     * @param {string} iconName - 图标名称
     * @param {string} title - 按钮标题
     * @returns {string} 按钮HTML
     */
    iconButton(id, iconName, title) {
        const icon = getIcon(iconName);
        return `
            <button id="${id}" class="icon-btn" title="${title}">
                ${icon}
            </button>
        `;
    },

    /**
     * 文件状态图标模板
     * @param {string} status - 文件状态 ('A', 'D', 'M')
     * @returns {string} 状态图标HTML
     */
    fileStatusIcon(status) {
        let iconName, statusText;
        
        switch (status) {
            case 'A':
                iconName = 'fileAdded';
                statusText = 'added';
                break;
            case 'D':
                iconName = 'fileDeleted';
                statusText = 'deleted';
                break;
            case 'M':
            default:
                iconName = 'fileChanged';
                statusText = 'modified';
                break;
        }
        
        const icon = getIcon(iconName);
        return `<span class="file-status-icon" title="File ${statusText}">${icon}</span>`;
    },

    /**
     * 视图切换按钮模板
     * @param {string} currentMode - 当前视图模式
     * @returns {string} 按钮HTML
     */
    viewToggleButton(currentMode) {
        const icon = getIcon('listView');
        const title = currentMode === 'tree' ? 'Switch to List View' : 'Switch to Tree View';
        
        return `
            <button class="view-toggle-btn" onclick="toggleFileViewMode()" title="${title}">
                ${icon}
            </button>
        `;
    }
};

/**
 * 转义HTML特殊字符
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 如果在浏览器环境中，将escapeHtml函数暴露到全局
if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
}