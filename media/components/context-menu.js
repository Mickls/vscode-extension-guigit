/**
 * 右键上下文菜单组件
 * 处理提交记录的右键菜单显示和交互
 */

/**
 * 显示右键上下文菜单
 * @param {Event} event - 鼠标右键事件
 * @param {string} hash - 提交哈希值
 * @param {Array} selectedCommits - 当前选中的提交列表
 * @param {HTMLElement} contextMenu - 上下文菜单DOM元素
 * @param {Function} handleContextMenuAction - 处理菜单操作的回调函数
 * @param {Object} vscodeApi - VS Code API对象
 */
export function showContextMenu(event, hash, selectedCommits, contextMenu, handleContextMenuAction, vscodeApi) {
    const menuWidth = 150;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let x = event.pageX;
    let y = event.pageY;

    // 防止菜单超出右边界
    if (x + menuWidth > windowWidth) {
        x = windowWidth - menuWidth - 10;
    }

    // 确保菜单不会超出左边界
    x = Math.max(10, x);

    // 显示菜单以获取实际高度
    contextMenu.style.display = 'block';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';

    // 获取菜单实际高度
    const menuHeight = contextMenu.offsetHeight;

    // 如果菜单超出下边界，调整位置让底部贴近屏幕底部
    if (y + menuHeight > windowHeight) {
        y = windowHeight - menuHeight - 10;
        // 确保菜单顶部不会超出屏幕上边界
        y = Math.max(10, y);
        contextMenu.style.top = y + 'px';
    }

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

    // 更新Edit Commit Message菜单项状态 - 使用预计算的值
    updateEditCommitMessageStatusFromCache(contextMenu, hash);

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
 * 隐藏右键上下文菜单
 * @param {HTMLElement} contextMenu - 上下文菜单DOM元素
 */
export function hideContextMenu(contextMenu) {
    contextMenu.style.display = 'none';
}

/**
 * 初始化右键菜单事件监听器
 * @param {HTMLElement} contextMenu - 上下文菜单DOM元素
 */
export function initializeContextMenu(contextMenu) {
    // 全局点击事件 - 隐藏右键上下文菜单
    document.addEventListener('click', () => {
        hideContextMenu(contextMenu);
    });
}

/**
 * 从缓存中更新Edit Commit Message菜单项状态
 * @param {HTMLElement} contextMenu - 上下文菜单DOM元素
 * @param {string} hash - 提交哈希值
 */
function updateEditCommitMessageStatusFromCache(contextMenu, hash) {
    const editCommitMessageMenuItem = contextMenu.querySelector('#editCommitMessageMenuItem');
    if (!editCommitMessageMenuItem) {
        return;
    }

    // 从全局状态中获取提交信息
    const commits = window.getState ? window.getState('commits') : [];
    const commit = commits.find(c => c.hash === hash);

    if (commit && commit.canEditMessage !== undefined) {
        // 使用预计算的canEditMessage值
        setEditCommitMessageStatus(contextMenu, commit.canEditMessage);
    } else {
        // 如果没有缓存信息，设置为默认状态
        editCommitMessageMenuItem.classList.add('disabled');
        editCommitMessageMenuItem.classList.remove('highlighted');
        editCommitMessageMenuItem.textContent = 'Edit Commit Message';
    }
}

/**
 * 设置Edit Commit Message菜单项的状态
 * @param {HTMLElement} contextMenu - 上下文菜单DOM元素
 * @param {boolean} canEdit - 是否可以编辑
 */
export function setEditCommitMessageStatus(contextMenu, canEdit) {
    const editCommitMessageMenuItem = contextMenu.querySelector('#editCommitMessageMenuItem');
    if (!editCommitMessageMenuItem) {
        return;
    }

    if (canEdit) {
        editCommitMessageMenuItem.classList.remove('disabled');
        editCommitMessageMenuItem.classList.add('highlighted');
        editCommitMessageMenuItem.textContent = 'Edit Commit Message';
    } else {
        editCommitMessageMenuItem.classList.add('disabled');
        editCommitMessageMenuItem.classList.remove('highlighted');
        editCommitMessageMenuItem.textContent = 'Edit Commit Message (Not Latest)';
    }
}