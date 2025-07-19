/**
 * 提交操作功能模块
 * 处理各种Git操作：cherry-pick, revert, reset, squash等
 */

/**
 * 处理右键菜单操作
 * @param {string} action - 操作类型
 * @param {string} hash - 提交哈希值
 * @param {Array} selectedCommits - 当前选中的提交列表
 * @param {Function} vscodePostMessage - VS Code消息发送函数
 */
export function handleContextMenuAction(action, hash, selectedCommits, vscodePostMessage) {
    switch (action) {
        case 'copyHash':
            copyCommitHash(hash, vscodePostMessage);
            break;
        case 'cherryPick':
            cherryPickCommit(hash, vscodePostMessage);
            break;
        case 'revert':
            revertCommit(hash, vscodePostMessage);
            break;
        case 'compare':
            compareSelectedCommits(selectedCommits, vscodePostMessage);
            break;
        case 'squash':
            squashSelectedCommits(selectedCommits, vscodePostMessage);
            break;
        case 'resetSoft':
            resetToCommit(hash, vscodePostMessage, 'soft');
            break;
        case 'resetMixed':
            resetToCommit(hash, vscodePostMessage, 'mixed');
            break;
        case 'resetHard':
            resetToCommit(hash, vscodePostMessage, 'hard');
            break;
        default:
            console.warn('Unknown context menu action:', action);
    }
}

/**
 * 复制提交哈希值到剪贴板
 * @param {string} hash - 提交哈希值
 * @param {Function} vscodePostMessage - VS Code消息发送函数
 */
function copyCommitHash(hash, vscodePostMessage) {
    // 发送消息给VS Code处理复制操作
    vscodePostMessage({
        type: 'copyHash',
        hash: hash
    });
}

/**
 * 备用的复制文本到剪贴板方法
 * @param {string} text - 要复制的文本
 */
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            console.log('Commit hash copied to clipboard (fallback):', text);
        } else {
            console.error('Failed to copy commit hash (fallback)');
        }
    } catch (err) {
        console.error('Failed to copy commit hash (fallback):', err);
    }
    
    document.body.removeChild(textArea);
}

/**
 * Cherry-pick提交
 * @param {string} hash - 提交哈希值
 * @param {Function} vscodePostMessage - VS Code消息发送函数
 */
function cherryPickCommit(hash, vscodePostMessage) {
    vscodePostMessage({
        type: 'cherryPick',
        hash: hash
    });
}

/**
 * Revert提交
 * @param {string} hash - 提交哈希值
 * @param {Function} vscodePostMessage - VS Code消息发送函数
 */
function revertCommit(hash, vscodePostMessage) {
    vscodePostMessage({
        type: 'revert',
        hash: hash
    });
}

/**
 * 比较选中的提交
 * @param {Array} selectedCommits - 选中的提交列表
 * @param {Function} vscodePostMessage - VS Code消息发送函数
 */
function compareSelectedCommits(selectedCommits, vscodePostMessage) {
    if (selectedCommits.length !== 2) {
        console.warn('Exactly 2 commits must be selected for comparison');
        return;
    }
    
    vscodePostMessage({
        type: 'compareCommits',
        hashes: selectedCommits.map(c => c.hash)
    });
}

/**
 * Squash选中的提交
 * @param {Array} selectedCommits - 选中的提交列表
 * @param {Function} vscodePostMessage - VS Code消息发送函数
 */
function squashSelectedCommits(selectedCommits, vscodePostMessage) {
    if (selectedCommits.length < 2) {
        console.warn('At least 2 commits must be selected for squashing');
        return;
    }
    
    vscodePostMessage({
        type: 'squashCommits',
        commits: selectedCommits
    });
}

/**
 * Reset到指定提交
 * @param {string} hash - 提交哈希值
 * @param {Function} vscodePostMessage - VS Code消息发送函数
 * @param {string} mode - Reset模式：'soft', 'mixed', 'hard'
 */
function resetToCommit(hash, vscodePostMessage, mode = 'mixed') {
    vscodePostMessage({
        type: 'reset',
        hash: hash,
        mode: mode
    });
}