/**
 * DOM操作工具函数
 */
import { rebindCollapseButtons } from '../ui/panel-manager.js';
import { getIcon } from './icons.js';

/**
 * HTML转义函数
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的HTML安全文本
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示错误信息
 * @param {string} message - 错误消息
 * @param {HTMLElement} commitDetails - 提交详情容器
 * @param {HTMLElement} commitList - 提交列表容器
 */
export function showError(message, commitDetails, commitList) {
    // 显示错误信息在右侧面板
    commitDetails.innerHTML = `
        <div class="panel-header">
            <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">${getIcon('collapseRight', { size: 'medium' })}</button>
        </div>
        <div class="placeholder" style="color: var(--vscode-errorForeground);">${escapeHtml(message)}</div>
    `;
    
    // 如果左侧面板正在显示"Loading commits..."，则清除并添加折叠按钮
    if (commitList.innerHTML.includes('Loading commits...')) {
        commitList.innerHTML = `
            <div class="panel-header">
                <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">${getIcon('collapseLeft', { size: 'medium' })}</button>
            </div>
            <div class="placeholder" style="color: var(--vscode-errorForeground);">Failed to load commits</div>
        `;
    }
    
    rebindCollapseButtons();
}