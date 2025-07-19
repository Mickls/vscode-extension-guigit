/**
 * 提交比较功能模块
 * 处理提交比较的显示、交互和文件差异查看
 */

// 导入文件树组件中的渲染函数
import { renderCompareFileList } from '../components/file-tree.js';

/**
 * 显示提交比较结果
 * @param {Object} data - 比较结果数据
 * @param {Array} data.commits - 比较的提交哈希数组
 * @param {Array} data.changes - 文件变更列表
 * @param {HTMLElement} comparePanel - 比较面板元素
 * @param {HTMLElement} compareContent - 比较内容容器元素
 */
export function showCompareResult(data, comparePanel, compareContent) {
    const { commits: compareCommits, changes } = data;
    
    // 使用与commitDetails相同的文件渲染逻辑，提供完整的交互功能
    const changesHtml = renderCompareFileList(changes, compareCommits);

    compareContent.innerHTML = `
        <div class="compare-commits">
            <div class="compare-commit">
                <h4>From: ${compareCommits[0].substring(0, 8)}</h4>
                <p class="commit-info">Base commit</p>
            </div>
            <div class="compare-arrow">→</div>
            <div class="compare-commit">
                <h4>To: ${compareCommits[1].substring(0, 8)}</h4>
                <p class="commit-info">Target commit</p>
            </div>
        </div>
        <div class="file-changes">
            <div class="file-changes-header">
                <h3>Changed Files (${changes.length})</h3>
            </div>
            <div class="file-list-container">
                ${changes.length > 0 ? changesHtml : '<div class="no-files">No files changed</div>'}
            </div>
        </div>
    `;

    comparePanel.style.display = 'block';
    
    // 添加文件交互事件监听器
    addCompareFileEventListeners(compareCommits, compareContent);
}

/**
 * 为比较结果的文件元素添加事件监听器
 * @param {Array} commits - 比较的提交哈希数组
 * @param {HTMLElement} compareContent - 比较内容容器元素
 */
export function addCompareFileEventListeners(commits, compareContent) {
    // 文件名点击事件 - 显示文件差异
    const fileItems = compareContent.querySelectorAll('.file-name');
    fileItems.forEach(fileItem => {
        fileItem.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileElement = fileItem.closest('[data-file]');
            const filePath = fileElement.dataset.file;
            showCompareFileDiff(commits[0], commits[1], filePath);
        });
    });
}

/**
 * 显示比较文件差异
 * @param {string} fromHash - 源提交哈希值
 * @param {string} toHash - 目标提交哈希值
 * @param {string} filePath - 文件路径
 * @param {Function} vscodePostMessage - VS Code消息发送函数
 */
export function showCompareFileDiff(fromHash, toHash, filePath, vscodePostMessage) {
    if (vscodePostMessage) {
        vscodePostMessage({
            type: 'showCompareFileDiff',
            fromHash: fromHash,
            toHash: toHash,
            file: filePath
        });
    }
}

/**
 * 关闭比较面板
 * @param {HTMLElement} comparePanel - 比较面板元素
 */
export function closeComparePanel(comparePanel) {
    comparePanel.style.display = 'none';
}

/**
 * 初始化比较功能
 * 设置全局函数和事件监听器
 * @param {HTMLElement} comparePanel - 比较面板元素
 * @param {HTMLElement} closeCompare - 关闭比较面板按钮
 * @param {Function} vscodePostMessage - VS Code消息发送函数
 */
export function initializeCompareFeature(comparePanel, closeCompare, vscodePostMessage) {
    // 设置全局函数，供HTML onclick调用
    window.showCompareFileDiff = function(fromHash, toHash, filePath) {
        showCompareFileDiff(fromHash, toHash, filePath, vscodePostMessage);
    };

    window.closeComparePanel = function() {
        closeComparePanel(comparePanel);
    };

    // 比较选中的提交记录，供HTML onclick调用
    window.compareSelectedCommits = function() {
        // 需要从全局获取selectedCommits
        const selectedCommits = window.selectedCommits || [];
        if (selectedCommits.length === 2) {
            vscodePostMessage({
                type: 'compareCommits',
                hashes: selectedCommits.map(c => c.hash)
            });
        }
    };

    // 关闭比较面板按钮点击事件
    if (closeCompare) {
        closeCompare.addEventListener('click', () => {
            closeComparePanel(comparePanel);
        });
    }

    // 初始化时隐藏比较面板
    comparePanel.style.display = 'none';
}