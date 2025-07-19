/**
 * 本地存储工具函数
 */

/**
 * 保存面板布局状态到localStorage
 * @param {number} leftPanelWidth - 左侧面板宽度百分比
 * @param {boolean} leftPanelCollapsed - 左侧面板是否折叠
 * @param {boolean} rightPanelCollapsed - 右侧面板是否折叠
 */
export function savePanelLayout(leftPanelWidth, leftPanelCollapsed, rightPanelCollapsed) {
    const layoutState = {
        leftPanelWidth: leftPanelWidth,
        leftPanelCollapsed: leftPanelCollapsed,
        rightPanelCollapsed: rightPanelCollapsed
    };
    localStorage.setItem('gitHistoryPanelLayout', JSON.stringify(layoutState));
}

/**
 * 从localStorage恢复面板布局状态
 * @returns {Object} 布局状态对象
 */
export function restorePanelLayout() {
    try {
        const savedLayout = localStorage.getItem('gitHistoryPanelLayout');
        if (savedLayout) {
            const layoutState = JSON.parse(savedLayout);
            return {
                leftPanelWidth: layoutState.leftPanelWidth || 50,
                leftPanelCollapsed: layoutState.leftPanelCollapsed || false,
                rightPanelCollapsed: layoutState.rightPanelCollapsed || false
            };
        }
    } catch (error) {
        console.error('Failed to restore panel layout:', error);
    }
    
    // 返回默认值 - commit list占满宽度，commit details占最小宽度
    return {
        leftPanelWidth: 80,
        leftPanelCollapsed: false,
        rightPanelCollapsed: false
    };
}