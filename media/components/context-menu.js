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
 */
export function showContextMenu(event, hash, selectedCommits, contextMenu, handleContextMenuAction) {
    const menuWidth = 150;
    const menuHeight = 200; // 估算菜单高度
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let x = event.pageX;
    let y = event.pageY;
    
    // 防止菜单超出右边界
    if (x + menuWidth > windowWidth) {
        x = windowWidth - menuWidth - 10;
    }
    
    // 防止菜单超出下边界
    if (y + menuHeight > windowHeight) {
        y = windowHeight - menuHeight - 10;
    }
    
    // 确保菜单不会超出左边界和上边界
    x = Math.max(10, x);
    y = Math.max(10, y);
    
    // 显示菜单并设置位置
    contextMenu.style.display = 'block';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';

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