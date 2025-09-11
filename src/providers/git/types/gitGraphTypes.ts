/**
 * Git Graph 相关的类型定义
 */

/**
 * Git Graph 中的节点（提交）
 */
export interface GitGraphNode {
    /** 提交哈希 */
    hash: string;
    /** 提交信息 */
    message: string;
    /** 作者 */
    author: string;
    /** 提交日期 */
    date: string;
    /** 父提交哈希列表 */
    parents: string[];
    /** 子提交哈希列表 */
    children: string[];
    /** 分支信息 */
    refs: string;
    /** 在图中的列位置 */
    column: number;
    /** 分支颜色索引 */
    colorIndex: number;
}

/**
 * Git Graph 中的连线
 */
export interface GitGraphEdge {
    /** 起始提交哈希 */
    from: string;
    /** 目标提交哈希 */
    to: string;
    /** 起始列 */
    fromColumn: number;
    /** 目标列 */
    toColumn: number;
    /** 连线颜色索引 */
    colorIndex: number;
    /** 连线类型 */
    type: 'normal' | 'merge' | 'branch';
}

/**
 * Git Graph 的布局信息
 */
export interface GitGraphLayout {
    /** 节点列表 */
    nodes: GitGraphNode[];
    /** 连线列表 */
    edges: GitGraphEdge[];
    /** 最大列数 */
    maxColumns: number;
    /** 颜色映射 */
    colorMap: Map<string, number>;
}

/**
 * Git Graph 的渲染配置
 */
export interface GitGraphConfig {
    /** 节点半径 */
    nodeRadius: number;
    /** 列间距 */
    columnSpacing: number;
    /** 行高 */
    rowHeight: number;
    /** 连线宽度 */
    lineWidth: number;
    /** 颜色列表 */
    colors: string[];
}

/**
 * Git Graph 的分支信息
 */
export interface GitGraphBranch {
    /** 分支名称 */
    name: string;
    /** 分支起始提交 */
    startCommit: string;
    /** 分支结束提交 */
    endCommit: string;
    /** 分支列位置 */
    column: number;
    /** 分支颜色索引 */
    colorIndex: number;
}