/**
 * 样式管理系统
 * 统一管理重复的CSS样式，避免内联样式
 */

/**
 * 常用样式类集合
 */
export const StyleClasses = {
    // 布局相关
    flexRow: 'flex-row',
    flexColumn: 'flex-column',
    flexCenter: 'flex-center',
    flexBetween: 'flex-between',
    
    // 间距相关
    marginSmall: 'margin-sm',
    marginMedium: 'margin-md',
    marginLarge: 'margin-lg',
    paddingSmall: 'padding-sm',
    paddingMedium: 'padding-md',
    paddingLarge: 'padding-lg',
    
    // 文本相关
    textSmall: 'text-sm',
    textMedium: 'text-md',
    textLarge: 'text-lg',
    textBold: 'text-bold',
    textMuted: 'text-muted',
    
    // 状态相关
    hidden: 'hidden',
    visible: 'visible',
    disabled: 'disabled',
    active: 'active',
    selected: 'selected',
    
    // 文件状态
    fileAdded: 'file-added',
    fileModified: 'file-modified',
    fileDeleted: 'file-deleted',
    
    // 按钮相关
    button: 'btn',
    buttonPrimary: 'btn-primary',
    buttonSecondary: 'btn-secondary',
    buttonIcon: 'btn-icon',
    buttonSmall: 'btn-sm',
    buttonLarge: 'btn-lg'
};

/**
 * 常用内联样式对象
 */
export const InlineStyles = {
    // 显示/隐藏
    hidden: { display: 'none' },
    visible: { display: 'block' },
    flex: { display: 'flex' },
    
    // 定位
    relative: { position: 'relative' },
    absolute: { position: 'absolute' },
    fixed: { position: 'fixed' },
    
    // 尺寸
    fullWidth: { width: '100%' },
    fullHeight: { height: '100%' },
    
    // 边距
    noMargin: { margin: '0' },
    noPadding: { padding: '0' },
    
    // 文本
    textCenter: { textAlign: 'center' },
    textLeft: { textAlign: 'left' },
    textRight: { textAlign: 'right' },
    
    // 颜色
    transparent: { backgroundColor: 'transparent' },
    
    // 边框
    noBorder: { border: 'none' },
    
    // 光标
    pointer: { cursor: 'pointer' },
    default: { cursor: 'default' }
};

/**
 * 生成样式字符串
 * @param {Object} styles - 样式对象
 * @returns {string} 样式字符串
 */
export function generateStyleString(styles) {
    return Object.entries(styles)
        .map(([property, value]) => {
            // 将驼峰命名转换为连字符命名
            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
            return `${cssProperty}: ${value}`;
        })
        .join('; ');
}

/**
 * 应用样式到元素
 * @param {HTMLElement} element - 目标元素
 * @param {Object} styles - 样式对象
 */
export function applyStyles(element, styles) {
    Object.entries(styles).forEach(([property, value]) => {
        element.style[property] = value;
    });
}

/**
 * 切换CSS类
 * @param {HTMLElement} element - 目标元素
 * @param {string} className - 类名
 * @param {boolean} force - 强制添加或移除
 */
export function toggleClass(element, className, force) {
    if (force !== undefined) {
        element.classList.toggle(className, force);
    } else {
        element.classList.toggle(className);
    }
}

/**
 * 批量添加CSS类
 * @param {HTMLElement} element - 目标元素
 * @param {string[]} classNames - 类名数组
 */
export function addClasses(element, classNames) {
    element.classList.add(...classNames);
}

/**
 * 批量移除CSS类
 * @param {HTMLElement} element - 目标元素
 * @param {string[]} classNames - 类名数组
 */
export function removeClasses(element, classNames) {
    element.classList.remove(...classNames);
}

/**
 * 创建带样式的元素
 * @param {string} tagName - 标签名
 * @param {Object} options - 选项
 * @param {string[]} options.classes - CSS类名数组
 * @param {Object} options.styles - 内联样式对象
 * @param {Object} options.attributes - 属性对象
 * @param {string} options.textContent - 文本内容
 * @param {string} options.innerHTML - HTML内容
 * @returns {HTMLElement} 创建的元素
 */
export function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    
    if (options.classes) {
        addClasses(element, options.classes);
    }
    
    if (options.styles) {
        applyStyles(element, options.styles);
    }
    
    if (options.attributes) {
        Object.entries(options.attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
    }
    
    if (options.textContent) {
        element.textContent = options.textContent;
    }
    
    if (options.innerHTML) {
        element.innerHTML = options.innerHTML;
    }
    
    return element;
}

/**
 * 常用动画效果
 */
export const Animations = {
    /**
     * 淡入效果
     * @param {HTMLElement} element - 目标元素
     * @param {number} duration - 动画时长（毫秒）
     */
    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.transition = `opacity ${duration}ms ease-in-out`;
        
        requestAnimationFrame(() => {
            element.style.opacity = '1';
        });
    },
    
    /**
     * 淡出效果
     * @param {HTMLElement} element - 目标元素
     * @param {number} duration - 动画时长（毫秒）
     */
    fadeOut(element, duration = 300) {
        element.style.transition = `opacity ${duration}ms ease-in-out`;
        element.style.opacity = '0';
        
        setTimeout(() => {
            element.style.display = 'none';
        }, duration);
    },
    
    /**
     * 滑动展开效果
     * @param {HTMLElement} element - 目标元素
     * @param {number} duration - 动画时长（毫秒）
     */
    slideDown(element, duration = 300) {
        element.style.height = '0';
        element.style.overflow = 'hidden';
        element.style.transition = `height ${duration}ms ease-in-out`;
        
        const targetHeight = element.scrollHeight + 'px';
        
        requestAnimationFrame(() => {
            element.style.height = targetHeight;
        });
        
        setTimeout(() => {
            element.style.height = '';
            element.style.overflow = '';
            element.style.transition = '';
        }, duration);
    },
    
    /**
     * 滑动收起效果
     * @param {HTMLElement} element - 目标元素
     * @param {number} duration - 动画时长（毫秒）
     */
    slideUp(element, duration = 300) {
        element.style.height = element.scrollHeight + 'px';
        element.style.overflow = 'hidden';
        element.style.transition = `height ${duration}ms ease-in-out`;
        
        requestAnimationFrame(() => {
            element.style.height = '0';
        });
        
        setTimeout(() => {
            element.style.display = 'none';
            element.style.height = '';
            element.style.overflow = '';
            element.style.transition = '';
        }, duration);
    }
};