/**
 * HTML模板系统
 * 提供统一的HTML模板生成功能
 */

import { getIcon, createIconButton } from './icons.js';
import { formatDate } from './date-utils.js';
import { getRefClass } from './git-utils.js';

/**
 * HTML模板对象
 * 包含各种常用的HTML模板函数
 */
export const Templates = {
    /**
     * 面板折叠按钮
     * @param {string} direction - 方向 ('left' | 'right')
     * @param {string} id - 按钮ID
     * @param {string} title - 按钮标题
     * @returns {string} HTML字符串
     */
    panelCollapseButton(direction = 'left', id = '', title = 'Collapse panel') {
        const arrow = direction === 'left' ? '‹' : '›';
        return `<button class="panel-collapse-btn" ${id ? `id="${id}"` : ''} title="${title}">${arrow}</button>`;
    },

    /**
     * Git操作按钮
     * @param {string} id - 按钮ID
     * @param {string} iconName - 图标名称
     * @param {string} text - 按钮文本
     * @param {string} title - 按钮标题
     * @returns {string} HTML字符串
     */
    gitOperationButton(id, iconName, text, title) {
        return `<button id="${id}" class="git-btn" title="${title}">
            ${getIcon(iconName)}
            ${text}
        </button>`;
    },

    /**
     * 头部控制按钮
     * @param {string} id - 按钮ID
     * @param {string} iconName - 图标名称
     * @param {string} title - 按钮标题
     * @returns {string} HTML字符串
     */
    headerControlButton(id, iconName, title) {
        return `<button id="${id}" class="icon-btn" title="${title}">
            ${getIcon(iconName)}
        </button>`;
    },

    /**
     * Git历史视图的完整HTML结构
     * @param {string} styleUri - 样式文件URI
     * @param {string} scriptUri - 脚本文件URI
     * @returns {string} HTML字符串
     */
    gitHistoryView(styleUri, scriptUri) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Git History</title>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="header-left">
                            <select id="branchSelect" class="branch-select">
                                <option value="">All branches</option>
                            </select>
                        </div>
                        <div class="header-right">
                            <div class="git-operations">
                                ${this.gitOperationButton('pullBtn', 'pull', 'Pull', 'Pull (Ctrl+Click for advanced options)')}
                                ${this.gitOperationButton('pushBtn', 'push', 'Push', 'Push (Ctrl+Click for advanced options)')}
                                ${this.gitOperationButton('fetchBtn', 'fetch', 'Fetch', 'Fetch')}
                                ${this.gitOperationButton('cloneBtn', 'clone', 'Clone', 'Clone')}
                                ${this.gitOperationButton('checkoutBtn', 'checkout', 'Checkout', 'Checkout')}
                            </div>
                            <div class="header-controls">
                                ${this.headerControlButton('jumpToHeadBtn', 'jumpToHead', 'Jump to HEAD')}
                                ${this.headerControlButton('refreshBtn', 'refresh', 'Refresh')}
                            </div>
                        </div>
                    </div>
                    
                    <div class="content">
                        <div class="commit-list" id="commitList">
                            <div class="panel-header">
                                <div class="commit-list-headers">
                                    <div class="header-hash">Hash</div>
                                    <div class="header-message">Message</div>
                                    <div class="header-refs">Tags</div>
                                    <div class="header-author">Author</div>
                                    <div class="header-date">Date</div>
                                </div>
                                ${this.panelCollapseButton('left', 'leftCollapseBtn', 'Collapse panel')}
                            </div>
                            <div class="loading">Loading commits...</div>
                        </div>
                        
                        <div class="resizer" id="resizer"></div>
                        
                        <div class="commit-details" id="commitDetails">
                            <div class="panel-header">
                                ${this.panelCollapseButton('right', 'rightCollapseBtn', 'Collapse panel')}
                            </div>
                            <div class="placeholder">Select a commit to view details</div>
                        </div>
                    </div>
                    
                    <div class="compare-panel" id="comparePanel" style="display: none;">
                        <div class="compare-header">
                            <h3>Compare Commits</h3>
                            <button id="closeCompare">×</button>
                        </div>
                        <div class="compare-content" id="compareContent"></div>
                    </div>
                </div>

                ${this.contextMenu()}

                <script type="module" src="${scriptUri}"></script>
            </body>
            </html>`;
    },

    /**
     * 上下文菜单
     * @returns {string} HTML字符串
     */
    contextMenu() {
        return `<div id="contextMenu" class="context-menu" style="display: none;">
            <div class="menu-item" data-action="copyHash">Copy Hash</div>
            <div class="menu-item" data-action="cherryPick">Cherry Pick</div>
            <div class="menu-item" data-action="revert">Revert</div>
            <div class="menu-separator"></div>
            <div class="menu-item" data-action="editCommitMessage" id="editCommitMessageMenuItem">Edit Commit Message</div>
            <div class="menu-separator"></div>
            <div class="menu-item" data-action="compare" id="compareMenuItem">Compare Selected</div>
            <div class="menu-item" data-action="squash" id="squashMenuItem">Squash Commits</div>
            <div class="menu-separator"></div>
            <div class="menu-item" data-action="createBranch">Create Branch from Here</div>
            <div class="menu-item" data-action="pushToCommit">Push All Commits to Here</div>
            <div class="menu-separator"></div>
            <div class="menu-item" data-action="resetSoft">Reset (Soft)</div>
            <div class="menu-item" data-action="resetMixed">Reset (Mixed)</div>
            <div class="menu-item" data-action="resetHard">Reset (Hard)</div>
        </div>`;
    },

    /**
     * 提交详情面板头部
     * @param {string} hash - 提交哈希
     * @param {string} message - 提交消息
     * @param {string} author - 作者
     * @param {string} email - 邮箱
     * @param {string} date - 日期
     * @param {string} refsHtml - 引用HTML
     * @param {string} body - 提交正文
     * @returns {string} HTML字符串
     */
    commitDetailsHeader(hash, message, author, email, date, refsHtml = '', body = '') {
        return `<div class="panel-header">
            ${this.panelCollapseButton('right', 'rightCollapseBtn', 'Collapse panel')}
        </div>
        <div class="details-header">
            <div class="details-hash">${hash}</div>
            <div class="details-message">${message}</div>
            <div class="details-author">${author} &lt;${email}&gt;</div>
            <div class="details-date">${date}</div>
            ${refsHtml ? `<div class="details-refs">${refsHtml}</div>` : ''}
            ${body ? `<div class="details-body">${body}</div>` : ''}
        </div>`;
    },

    /**
     * 文件变更区域
     * @param {number} fileCount - 文件数量
     * @param {string} fileViewMode - 文件视图模式
     * @param {string} filesHtml - 文件HTML内容
     * @returns {string} HTML字符串
     */
    fileChangesSection(fileCount, fileViewMode, filesHtml) {
        return `<div class="file-changes">
            <div class="file-changes-header">
                <h3>Changed Files (${fileCount})</h3>
                <div class="file-view-controls">
                    ${this.viewToggleButton(fileViewMode)}
                    ${fileCount > 10 && fileViewMode === 'tree' ? this.collapseAllButton() : ''}
                </div>
            </div>
            ${fileCount > 0 ? filesHtml : '<div class="no-files">No files changed</div>'}
        </div>`;
    },

    /**
     * 加载状态面板
     * @param {string} message - 加载消息
     * @returns {string} HTML字符串
     */
    loadingPanel(message = 'Loading commit details...') {
        return `<div class="panel-header">
            ${this.panelCollapseButton('right', 'rightCollapseBtn', 'Collapse panel')}
        </div>
        <div class="loading">${message}</div>`;
    },

    /**
     * 错误状态面板
     * @param {string} message - 错误消息
     * @returns {string} HTML字符串
     */
    errorPanel(message = 'Failed to load commit details') {
        return `<div class="panel-header">
            ${this.panelCollapseButton('right', 'rightCollapseBtn', 'Collapse panel')}
        </div>
        <div class="placeholder">${message}</div>`;
    },

    /**
     * 折叠所有按钮
     * @returns {string} HTML字符串
     */
    collapseAllButton() {
        return `<button class="collapse-all-btn" onclick="collapseAllFolders()" title="Collapse All Folders">
            ${getIcon('collapseAll')}
        </button>`;
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
    },

    /**
     * 创建消息通知模板
     * @param {Object} options - 消息选项
     * @param {string} options.type - 消息类型 (warning, error, info, success)
     * @param {string} options.icon - 消息图标
     * @param {string} options.title - 消息标题
     * @param {string} options.content - 消息内容
     * @param {string} [options.actions] - 可选的操作按钮HTML
     * @returns {string} 消息通知HTML
     */
    messageNotification({ type, icon, title, content, actions = '' }) {
        const typeColors = {
            warning: { bg: 'rgb(48, 48, 48)', border: '#ffeaa7' },
            error: { bg: '#f8d7da', border: '#f5c6cb' },
            info: { bg: '#d1ecf1', border: '#bee5eb' },
            success: { bg: '#d4edda', border: '#c3e6cb' }
        };
        
        const colors = typeColors[type] || typeColors.info;
        
        return `
            <div class="message-notification message-${type}" style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${colors.bg};
                border: 1px solid ${colors.border};
                border-radius: 4px;
                padding: 12px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                z-index: 1000;
                max-width: 350px;
                font-size: 14px;
            ">
                <div class="message-content">
                    <div class="message-icon">${icon}</div>
                    <div class="message-text">
                        <strong>${escapeHtml(title)}</strong>
                        <p>${escapeHtml(content)}</p>
                        ${actions}
                    </div>
                    <button class="message-close" onclick="this.parentElement.parentElement.remove()">×</button>
                </div>
            </div>
        `;
    },

    /**
     * 创建分支选项按钮
     * @param {string} branchName - 分支名称
     * @param {string} commitHash - 提交哈希值
     * @returns {string} 分支选项按钮HTML
     */
    branchOptionButton(branchName, commitHash) {
        return `<button class="branch-option" onclick="switchToBranchAndJump('${escapeHtml(branchName)}', '${escapeHtml(commitHash)}')">${escapeHtml(branchName)}</button>`;
    },

    /**
     * 创建分支选项容器
     * @param {Array} branches - 分支列表
     * @param {string} commitHash - 提交哈希值
     * @returns {string} 分支选项容器HTML
     */
    branchOptionsContainer(branches, commitHash) {
        const branchButtons = branches.map(branch => this.branchOptionButton(branch, commitHash)).join('');
        return `
            <div class="branch-options" style="
                margin-top: 8px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            ">
                ${branchButtons}
            </div>
            <style>
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
            </style>
        `;
    },

    /**
     * 创建提交元素模板
     * @param {Object} commit - 提交对象
     * @param {string} graphHtml - 图形HTML
     * @param {Array} refs - 引用列表
     * @returns {string} 提交元素HTML
     */
    commitElement(commit, graphHtml, refs = []) {
        const refsHtml = refs.map(ref => {
            const refClass = getRefClass(ref);
            return `<span class="ref-tag ${refClass}">${ref}</span>`;
        }).join('');

        return `
            <div class="commit-graph">${graphHtml}</div>
            <div class="commit-content">
                <div class="commit-hash" title="${commit.hash}">${commit.hash.substring(0, 8)}</div>
                <div class="commit-message" title="${escapeHtml(commit.message)}">${escapeHtml(commit.message)}</div>
                ${refsHtml ? `<div class="commit-refs">${refsHtml}</div>` : '<div class="commit-refs"></div>'}
                <div class="commit-author" title="${escapeHtml(commit.author)}">${escapeHtml(commit.author)}</div>
                <div class="commit-date" title="${formatDate(commit.date)}">${formatDate(commit.date)}</div>
            </div>
        `;
    },

    /**
     * 创建加载指示器模板
     * @param {string} message - 加载消息
     * @returns {string} 加载指示器HTML
     */
    loadingIndicator(message = 'Loading more commits...') {
        return `<div class="loading">${escapeHtml(message)}</div>`;
    },

    /**
     * 创建分支选择的默认选项
     * @returns {string} 默认选项HTML
     */
    defaultBranchOption() {
        return '<option value="all">All branches</option>';
    },

    /**
     * 创建筛选加载状态
     * @param {string} message - 加载消息
     * @returns {string} 筛选加载状态HTML
     */
    filterLoadingState(message = 'Loading...') {
        return `<span class="filter-loading">${escapeHtml(message)}</span>`;
    },

    /**
     * 创建文件列表容器
     * @param {string} content - 文件列表内容
     * @returns {string} 文件列表容器HTML
     */
    fileListContainer(content) {
        return `<div class="file-list-container">${content}</div>`;
    },

    /**
     * 创建引用标签
     * @param {string} ref - 引用名称
     * @param {string} refClass - 引用CSS类
     * @returns {string} 引用标签HTML
     */
    refTag(ref, refClass) {
        return `<span class="ref-tag ${refClass}">${ref}</span>`;
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