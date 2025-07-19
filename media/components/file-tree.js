/**
 * 文件树组件模块
 * 处理文件树的构建、压缩、渲染等逻辑
 */

// 导入工具函数
import { escapeHtml } from '../utils/dom-utils.js';

/**
 * 构建文件树结构
 * 将文件列表转换为树形结构
 * @param {Array} files - 文件变更列表
 * @returns {Object} 文件树对象
 */
export function buildFileTree(files) {
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
export function compressTree(tree) {
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
export function renderFileTree(tree, commitHash, level = 0) {
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
export function renderFileList(files, commitHash) {
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
 * 渲染比较文件列表
 * @param {Array} files - 文件变更列表
 * @param {Array} commits - 比较的提交哈希数组
 * @returns {string} 渲染的HTML字符串
 */
export function renderCompareFileList(files, commits) {
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
 * 切换文件夹的展开/折叠状态
 * @param {HTMLElement} folderHeader - 文件夹头部元素
 */
export function toggleFolder(folderHeader) {
    const folderContent = folderHeader.nextElementSibling;
    const folderIcon = folderHeader.querySelector('.folder-icon');
    
    if (folderContent.style.display === 'none') {
        // 展开文件夹
        folderContent.style.display = '';
        folderIcon.classList.remove('collapsed');
        folderIcon.classList.add('expanded');
    } else {
        // 折叠文件夹
        folderContent.style.display = 'none';
        folderIcon.classList.remove('expanded');
        folderIcon.classList.add('collapsed');
    }
}

// 将toggleFolder函数暴露到全局作用域，以便HTML中的onclick可以调用
if (typeof window !== 'undefined') {
    window.toggleFolder = toggleFolder;
}