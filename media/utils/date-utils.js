/**
 * 日期处理工具函数
 */

/**
 * 格式化日期字符串
 * @param {string} dateString - ISO日期字符串
 * @returns {string} 格式化后的日期时间字符串
 */
export function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}