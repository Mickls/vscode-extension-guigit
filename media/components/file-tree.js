/**
 * 文件树组件模块
 * 处理文件树的构建、压缩、渲染等逻辑
 */

// 导入工具函数
import { escapeHtml } from '../utils/dom-utils.js';
import { getIcon } from '../utils/icons.js';
import { Templates } from '../utils/templates.js';

// 文件夹状态缓存，用于保持折叠状态
const folderStateCache = new Map();

// 防抖定时器
let scrollDebounceTimer = null;
let resizeDebounceTimer = null;

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
 * 生成文件夹的唯一标识符
 * @param {string} name - 文件夹名称
 * @param {number} level - 层级
 * @param {string} commitHash - 提交哈希
 * @returns {string} 唯一标识符
 */
function generateFolderId(name, level, commitHash) {
    return `${commitHash}-${level}-${name}`;
}

/**
 * 获取文件夹的折叠状态
 * @param {string} folderId - 文件夹ID
 * @param {number} level - 层级
 * @param {number} childCount - 子项数量
 * @returns {boolean} 是否折叠
 */
function getFolderState(folderId, level, childCount) {
    // 优先从缓存获取状态
    if (folderStateCache.has(folderId)) {
        return folderStateCache.get(folderId);
    }
    
    // 默认折叠策略：深层级且子项较多的文件夹自动折叠
    const defaultCollapsed = level > 0 && childCount > 5;
    folderStateCache.set(folderId, defaultCollapsed);
    return defaultCollapsed;
}

/**
 * 设置文件夹的折叠状态
 * @param {string} folderId - 文件夹ID
 * @param {boolean} isCollapsed - 是否折叠
 */
function setFolderState(folderId, isCollapsed) {
    folderStateCache.set(folderId, isCollapsed);
    
    // 限制缓存大小，避免内存泄漏
    if (folderStateCache.size > 1000) {
        const firstKey = folderStateCache.keys().next().value;
        folderStateCache.delete(firstKey);
    }
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
            
            // 使用持久化的折叠状态
            const folderId = generateFolderId(name, level, commitHash);
            const isCollapsed = getFolderState(folderId, level, childCount);
            
            html += Templates.folderItem(name, childrenHtml, childCount, level, isCollapsed, node.compressed, folderId);
        } else {
            const file = node.data;
            // 使用模板系统渲染文件项
            const fileIcon = level === 0 ? getIcon('fileAdded') : getIcon('file');
            
            html += `
                <div class="file-tree-item" data-level="${level}" data-file="${escapeHtml(file.file)}" data-hash="${escapeHtml(commitHash)}">
                    <div class="file-info">
                        <span class="file-icon">${fileIcon}</span>
                        <span class="file-name">${escapeHtml(name)}</span>
                        ${Templates.fileActionButtons(commitHash, file.file)}
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
        html += Templates.fileItem(file, commitHash);
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
        const statusIcon = Templates.fileStatusIcon(file.status);
        const statusClass = file.status === 'A' ? 'file-added' : 
                           file.status === 'D' ? 'file-deleted' : 'file-modified';
        
        html += `
            <div class="file-item ${statusClass}" data-file="${escapeHtml(file.file)}" data-from-hash="${escapeHtml(commits[0])}" data-to-hash="${escapeHtml(commits[1])}">
                <div class="file-info">
                    ${statusIcon}
                    <span class="file-icon">${getIcon('file')}</span>
                    <span class="file-name">${escapeHtml(file.file)}</span>
                    ${Templates.fileActionButtons(commits[0], file.file, { 
                        isCompareMode: true, 
                        showViewOnline: file.status !== 'D' 
                    })}
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
 * 切换文件夹的展开/折叠状态（优化版本）
 * @param {HTMLElement} folderHeader - 文件夹头部元素
 */
export function toggleFolder(folderHeader) {
    // 防抖处理，避免快速点击导致状态混乱
    if (folderHeader.dataset.toggling === 'true') {
        return;
    }
    
    folderHeader.dataset.toggling = 'true';
    
    const folderContent = folderHeader.nextElementSibling;
    const folderIcon = folderHeader.querySelector('.folder-icon');
    const folderId = folderHeader.dataset.folderId;
    
    // 使用 requestAnimationFrame 确保 DOM 操作的流畅性
    requestAnimationFrame(() => {
        const isCurrentlyCollapsed = folderContent.style.display === 'none';
        
        if (isCurrentlyCollapsed) {
            // 展开文件夹
            folderContent.style.display = '';
            folderIcon.classList.remove('collapsed');
            folderIcon.classList.add('expanded');
            
            // 保存展开状态
            if (folderId) {
                setFolderState(folderId, false);
            }
        } else {
            // 折叠文件夹
            folderContent.style.display = 'none';
            folderIcon.classList.remove('expanded');
            folderIcon.classList.add('collapsed');
            
            // 保存折叠状态
            if (folderId) {
                setFolderState(folderId, true);
            }
        }
        
        // 重置防抖标记
        setTimeout(() => {
            folderHeader.dataset.toggling = 'false';
        }, 100);
    });
}

/**
 * 批量切换所有文件夹的展开/折叠状态（优化版本）
 * @param {HTMLElement} container - 容器元素
 */
export function toggleAllFolders(container) {
    const folders = container.querySelectorAll('.file-tree-folder');
    
    // 防抖处理
    if (toggleAllFolders.debouncing) {
        return;
    }
    toggleAllFolders.debouncing = true;
    
    const isAnyExpanded = Array.from(folders).some(folder => {
        const folderContent = folder.querySelector('.folder-content');
        return folderContent && folderContent.style.display !== 'none';
    });
    
    // 使用 requestAnimationFrame 批量处理 DOM 操作
    requestAnimationFrame(() => {
        folders.forEach(folder => {
            const folderContent = folder.querySelector('.folder-content');
            const folderIcon = folder.querySelector('.folder-icon');
            const folderHeader = folder.querySelector('.folder-header');
            const folderId = folderHeader?.dataset.folderId;
            
            if (!folderContent || !folderIcon) return;
            
            if (isAnyExpanded) {
                // 如果有展开的文件夹，则全部折叠
                folderContent.style.display = 'none';
                folderIcon.classList.remove('expanded');
                folderIcon.classList.add('collapsed');
                
                if (folderId) {
                    setFolderState(folderId, true);
                }
            } else {
                // 如果全部折叠，则全部展开
                folderContent.style.display = '';
                folderIcon.classList.remove('collapsed');
                folderIcon.classList.add('expanded');
                
                if (folderId) {
                    setFolderState(folderId, false);
                }
            }
        });
        
        // 重置防抖标记
        setTimeout(() => {
            toggleAllFolders.debouncing = false;
        }, 200);
    });
}

/**
 * 清理指定提交的文件夹状态缓存
 * @param {string} commitHash - 提交哈希
 */
export function clearFolderStateCache(commitHash) {
    if (commitHash) {
        // 清理特定提交的缓存
        for (const [key] of folderStateCache) {
            if (key.startsWith(commitHash + '-')) {
                folderStateCache.delete(key);
            }
        }
    } else {
        // 清理所有缓存
        folderStateCache.clear();
    }
}

/**
 * 初始化滚动优化
 * @param {HTMLElement} scrollContainer - 滚动容器
 */
export function initializeScrollOptimization(scrollContainer) {
    if (!scrollContainer) return;
    
    // 防抖滚动事件处理
    const handleScroll = () => {
        if (scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
        }
        
        scrollDebounceTimer = setTimeout(() => {
            // 滚动结束后的处理逻辑
            // 可以在这里添加虚拟滚动或其他优化
        }, 100);
    };
    
    // 防抖窗口大小变化事件处理
    const handleResize = () => {
        if (resizeDebounceTimer) {
            clearTimeout(resizeDebounceTimer);
        }
        
        resizeDebounceTimer = setTimeout(() => {
            // 窗口大小变化后的处理逻辑
        }, 150);
    };
    
    // 添加事件监听器
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    
    // 返回清理函数
    return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
        
        if (scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
        }
        if (resizeDebounceTimer) {
            clearTimeout(resizeDebounceTimer);
        }
    };
}

/**
 * 恢复文件夹状态
 * @param {string} commitHash - 提交哈希值
 */
export function restoreFolderStates(commitHash) {
    if (!commitHash) return;

    const folders = document.querySelectorAll('.file-tree-folder[data-folder-id]');
    folders.forEach(folder => {
        const folderId = folder.dataset.folderId;
        if (!folderId) return;

        const savedState = folderStateCache.get(folderId);
        
        if (savedState !== undefined) {
            const folderContent = folder.querySelector('.folder-content');
            const folderIcon = folder.querySelector('.folder-icon');
            
            if (folderContent && folderIcon) {
                if (!savedState) {
                    // 展开状态
                    folderContent.style.display = '';
                    folderIcon.classList.remove('collapsed');
                    folderIcon.classList.add('expanded');
                } else {
                    // 折叠状态
                    folderContent.style.display = 'none';
                    folderIcon.classList.remove('expanded');
                    folderIcon.classList.add('collapsed');
                }
            }
        }
    });
}

// 将toggleFolder函数暴露到全局作用域，以便HTML中的onclick可以调用
if (typeof window !== 'undefined') {
    window.toggleFolder = toggleFolder;
    window.toggleAllFolders = (container) => toggleAllFolders(container || document.getElementById('commitDetails'));
}