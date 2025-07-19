/**
 * Git相关工具函数
 */

/**
 * 解析Git引用字符串
 * @param {string} refs - 引用字符串（如分支、标签）
 * @returns {Array} 引用数组
 */
export function parseRefs(refs) {
    if (!refs) return [];
    return refs.split(', ').filter(ref => ref.trim());
}

/**
 * 根据引用类型获取对应的CSS类名
 * @param {string} ref - Git引用字符串
 * @returns {string} CSS类名
 */
export function getRefClass(ref) {
    if (!ref) return '';
    
    // HEAD 指针
    if (ref.includes('HEAD')) {
        return 'ref-head';
    }
    
    // 远程分支 (origin/xxx, upstream/xxx 等)
    if (ref.includes('origin/') || ref.includes('upstream/') || ref.includes('remote/')) {
        return 'ref-remote';
    }
    
    // 标签 (tag: xxx)
    if (ref.startsWith('tag:') || ref.includes('tags/')) {
        return 'ref-tag-label';
    }
    
    // 本地分支 (其他情况)
    return 'ref-local';
}