import { SimpleGit } from "simple-git";
import { GitCommit } from "../types/gitTypes";
import { GitGraphNode, GitGraphEdge, GitGraphLayout, GitGraphBranch } from "../types/gitGraphTypes";

/**
 * Git Graph 操作类
 * 负责生成和管理 Git 提交图的布局算法
 */
export class GitGraphOperations {
    private git: SimpleGit;
    private colorIndex = 0;
    private branchColors = new Map<number, number>();

    constructor(git: SimpleGit) {
        this.git = git;
    }

    /**
     * 生成 Git Graph 布局
     * @param commits 提交列表
     * @returns Git Graph 布局信息
     */
    public async generateGraphLayout(commits: GitCommit[]): Promise<GitGraphLayout> {
        if (!commits || commits.length === 0) {
            return {
                nodes: [],
                edges: [],
                maxColumns: 0,
                colorMap: new Map()
            };
        }

        // 构建提交映射和父子关系
        const commitMap = new Map<string, GitCommit>();
        const childrenMap = new Map<string, string[]>();
        
        commits.forEach(commit => {
            commitMap.set(commit.hash, commit);
            childrenMap.set(commit.hash, []);
        });

        // 建立父子关系
        commits.forEach(commit => {
            commit.parents.forEach(parentHash => {
                const children = childrenMap.get(parentHash) || [];
                children.push(commit.hash);
                childrenMap.set(parentHash, children);
            });
        });

        // 生成图布局
        const layout = this.calculateLayout(commits, commitMap, childrenMap);
        
        return layout;
    }

    /**
     * 计算图布局
     */
    private calculateLayout(
        commits: GitCommit[], 
        commitMap: Map<string, GitCommit>,
        childrenMap: Map<string, string[]>
    ): GitGraphLayout {
        const nodes: GitGraphNode[] = [];
        const edges: GitGraphEdge[] = [];
        const commitColumns = new Map<string, number>(); // 每个提交的列位置
        const commitColors = new Map<string, number>(); // 每个提交的颜色
        const activeBranches = new Map<number, string>(); // 每列当前活跃的分支头

        // 重置颜色索引
        this.resetColorIndex();

        // 第一步：识别主分支路径
        const mainBranchPath = this.identifyMainBranchPath(commits, commitMap, childrenMap);
        
        // 调试信息：主分支路径识别结果
        if (mainBranchPath.size > 0) {
            console.debug(`Git Graph: 识别到主分支路径包含 ${mainBranchPath.size} 个提交`);
        }

        // 第二步：为所有提交分配列位置
        for (let i = 0; i < commits.length; i++) {
            const commit = commits[i];
            const children = childrenMap.get(commit.hash) || [];
            
            let column = 0;
            let colorIndex = 0;

            if (i === 0) {
                // 第一个提交（最新），如果在主分支路径上，分配到第0列
                column = 0;
                colorIndex = this.getNextColorIndex();
                activeBranches.set(0, commit.hash);
            } else {
                // 查找合适的列位置，优先考虑主分支连续性
                const result = this.assignCommitColumnWithMainBranch(
                    commit, 
                    children, 
                    commitColumns, 
                    activeBranches, 
                    mainBranchPath
                );
                column = result.column;
                colorIndex = result.colorIndex;
            }

            // 记录提交的列和颜色
            commitColumns.set(commit.hash, column);
            commitColors.set(commit.hash, colorIndex);

            // 更新活跃分支
            this.updateActiveBranches(commit, column, activeBranches, commitColumns);

            // 创建节点
            const node: GitGraphNode = {
                hash: commit.hash,
                message: commit.message,
                author: commit.author,
                date: commit.date,
                parents: commit.parents,
                children: children,
                refs: commit.refs || '',
                column: column,
                colorIndex: colorIndex
            };
            nodes.push(node);
        }

        // 第二步：创建连线
        for (let i = 0; i < commits.length; i++) {
            const commit = commits[i];
            const fromColumn = commitColumns.get(commit.hash)!;
            const fromColorIndex = commitColors.get(commit.hash)!;

            commit.parents.forEach((parentHash, parentIndex) => {
                const parentCommit = commitMap.get(parentHash);
                if (parentCommit) {
                    const toColumn = commitColumns.get(parentHash);
                    if (toColumn !== undefined) {
                        const edge: GitGraphEdge = {
                            from: commit.hash,
                            to: parentHash,
                            fromColumn: fromColumn,
                            toColumn: toColumn,
                            colorIndex: fromColorIndex,
                            type: commit.parents.length > 1 && parentIndex > 0 ? 'merge' : 'normal'
                        };
                        edges.push(edge);
                    }
                }
            });
        }

        return {
            nodes,
            edges,
            maxColumns: Math.max(...Array.from(commitColumns.values())) + 1,
            colorMap: commitColors
        };
    }

    /**
     * 识别主分支路径
     */
    private identifyMainBranchPath(
        commits: GitCommit[], 
        commitMap: Map<string, GitCommit>,
        childrenMap: Map<string, string[]>
    ): Set<string> {
        const mainBranchPath = new Set<string>();
        
        if (commits.length === 0) {
            return mainBranchPath;
        }

        // 首先尝试通过refs信息找到主分支的起点
        let mainBranchStart = this.findMainBranchStart(commits);
        
        if (!mainBranchStart) {
            // 如果没有找到明确的主分支标记，使用第一个提交
            mainBranchStart = commits[0];
        }

        // 从主分支起点开始，沿着第一个父提交回溯，构建主分支路径
        let currentCommit = mainBranchStart;
        mainBranchPath.add(currentCommit.hash);

        while (currentCommit.parents.length > 0) {
            // 总是选择第一个父提交作为主分支路径
            const firstParentHash = currentCommit.parents[0];
            const parentCommit = commitMap.get(firstParentHash);
            
            if (parentCommit) {
                mainBranchPath.add(parentCommit.hash);
                currentCommit = parentCommit;
            } else {
                break;
            }
        }

        return mainBranchPath;
    }

    /**
     * 通过refs信息找到主分支的起点
     */
    private findMainBranchStart(commits: GitCommit[]): GitCommit | null {
        // 常见的主分支名称
        const mainBranchNames = ['main', 'master', 'HEAD'];
        
        for (const commit of commits) {
            if (commit.refs) {
                const refs = commit.refs.toLowerCase();
                for (const branchName of mainBranchNames) {
                    if (refs.includes(`origin/${branchName}`) || 
                        refs.includes(`refs/heads/${branchName}`) ||
                        refs.includes(branchName)) {
                        return commit;
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * 考虑主分支连续性的列分配
     */
    private assignCommitColumnWithMainBranch(
        commit: GitCommit,
        children: string[],
        commitColumns: Map<string, number>,
        activeBranches: Map<number, string>,
        mainBranchPath: Set<string>
    ): { column: number; colorIndex: number } {
        // 1. 如果当前提交在主分支路径上，优先分配到第0列
        if (mainBranchPath.has(commit.hash)) {
            // 检查第0列是否可用或者是否应该被当前提交占用
            const column0Branch = activeBranches.get(0);
            if (!column0Branch || this.shouldMainBranchTakeColumn(commit, column0Branch, commitColumns, mainBranchPath)) {
                const colorIndex = this.branchColors.get(0) || this.getNextColorIndex();
                this.branchColors.set(0, colorIndex);
                return { column: 0, colorIndex };
            }
        }

        // 2. 如果有子提交，优先继承子提交的列（保持分支连续性）
        for (const childHash of children) {
            const childColumn = commitColumns.get(childHash);
            if (childColumn !== undefined) {
                // 检查该列是否仍然活跃且指向该子提交
                if (activeBranches.get(childColumn) === childHash) {
                    const colorIndex = this.branchColors.get(childColumn) || this.getNextColorIndex();
                    this.branchColors.set(childColumn, colorIndex);
                    return { column: childColumn, colorIndex };
                }
            }
        }

        // 3. 如果是合并提交，特殊处理以保持主分支连续性
        if (commit.parents.length > 1) {
            // 如果当前提交在主分支路径上，优先使用第0列
            if (mainBranchPath.has(commit.hash)) {
                const colorIndex = this.branchColors.get(0) || this.getNextColorIndex();
                this.branchColors.set(0, colorIndex);
                return { column: 0, colorIndex };
            }
            
            // 否则查找第一个父提交（主分支）的列
            for (const [column, branchHead] of activeBranches.entries()) {
                if (this.isAncestor(commit.parents[0], branchHead, commitColumns)) {
                    const colorIndex = this.branchColors.get(column) || this.getNextColorIndex();
                    this.branchColors.set(column, colorIndex);
                    return { column, colorIndex };
                }
            }
        }

        // 4. 如果是普通提交（单个父提交），优先考虑主分支连续性
        if (commit.parents.length === 1) {
            // 如果当前提交在主分支路径上，优先使用第0列
            if (mainBranchPath.has(commit.hash)) {
                // 检查第0列是否可用或者应该被主分支占用
                const column0Branch = activeBranches.get(0);
                if (!column0Branch || mainBranchPath.has(column0Branch) || 
                    this.isAncestor(commit.parents[0], column0Branch, commitColumns)) {
                    const colorIndex = this.branchColors.get(0) || this.getNextColorIndex();
                    this.branchColors.set(0, colorIndex);
                    return { column: 0, colorIndex };
                }
            }
            
            // 否则查找父提交可能所在的列
            for (const [column, branchHead] of activeBranches.entries()) {
                if (this.isAncestor(commit.parents[0], branchHead, commitColumns)) {
                    const colorIndex = this.branchColors.get(column) || this.getNextColorIndex();
                    this.branchColors.set(column, colorIndex);
                    return { column, colorIndex };
                }
            }
        }

        // 5. 如果找不到合适的列，分配新列
        const newColumn = this.findAvailableColumn(Array.from(activeBranches.keys()));
        const colorIndex = this.getNextColorIndex();
        this.branchColors.set(newColumn, colorIndex);
        
        return { column: newColumn, colorIndex };
    }

    /**
     * 判断主分支是否应该占用指定列
     */
    private shouldMainBranchTakeColumn(
        commit: GitCommit,
        currentBranchHead: string,
        commitColumns: Map<string, number>,
        mainBranchPath: Set<string>
    ): boolean {
        // 如果当前列头不在主分支路径上，主分支应该占用这个列
        if (!mainBranchPath.has(currentBranchHead)) {
            return true;
        }
        
        // 如果当前提交是当前列头的父提交，应该继续占用
        return commit.parents.includes(currentBranchHead);
    }



    /**
     * 检查一个提交是否是另一个提交的祖先
     */
    private isAncestor(ancestorHash: string, descendantHash: string, commitColumns: Map<string, number>): boolean {
        // 简化版本：如果祖先提交已经有列分配，则认为是祖先关系
        // 在更复杂的实现中，这里可以进行真正的祖先检查
        return commitColumns.has(ancestorHash);
    }

    /**
     * 更新活跃分支状态
     */
    private updateActiveBranches(
        commit: GitCommit,
        column: number,
        activeBranches: Map<number, string>,
        commitColumns: Map<string, number>
    ): void {
        // 设置当前列的活跃分支头为当前提交
        activeBranches.set(column, commit.hash);

        // 如果是合并提交，需要清理被合并的分支
        if (commit.parents.length > 1) {
            // 保留主分支（第一个父提交），清理其他被合并的分支
            commit.parents.slice(1).forEach(parentHash => {
                for (const [col, branchHead] of activeBranches.entries()) {
                    if (col !== column && this.isAncestorInActiveTree(parentHash, branchHead, commitColumns)) {
                        activeBranches.delete(col);
                    }
                }
            });
        }

        // 清理不再活跃的分支（没有子提交指向它们的分支）
        this.cleanupInactiveBranches(activeBranches, commitColumns);
    }

    /**
     * 清理不活跃的分支
     */
    private cleanupInactiveBranches(
        activeBranches: Map<number, string>,
        commitColumns: Map<string, number>
    ): void {
        const branchesToRemove: number[] = [];
        
        for (const [column, branchHead] of activeBranches.entries()) {
            // 检查这个分支头是否还有未处理的子提交
            let hasActiveChildren = false;
            
            for (const [commitHash, commitColumn] of commitColumns.entries()) {
                if (commitColumn === column && commitHash !== branchHead) {
                    hasActiveChildren = true;
                    break;
                }
            }
            
            // 如果没有活跃的子提交，标记为删除
            if (!hasActiveChildren && column !== 0) { // 保护主分支列
                branchesToRemove.push(column);
            }
        }
        
        branchesToRemove.forEach(column => activeBranches.delete(column));
    }

    /**
     * 检查一个提交是否是另一个提交在活跃树中的祖先
     */
    private isAncestorInActiveTree(ancestorHash: string, descendantHash: string, commitColumns: Map<string, number>): boolean {
        // 简化版本：如果祖先提交已经有列分配，则认为是祖先关系
        return commitColumns.has(ancestorHash);
    }

    /**
     * 查找可用的列（重写以支持数字数组）
     */
    private findAvailableColumn(usedColumns: number[], startFrom: number = 0): number {
        for (let i = startFrom; i < 50; i++) { // 支持更多列，最多50列
            if (!usedColumns.includes(i)) {
                return i;
            }
        }
        return usedColumns.length;
    }

    /**
     * 查找可用的列（支持字符串数组）
     */
    private findAvailableColumnInStringArray(columns: string[], startFrom: number = 0): number {
        for (let i = startFrom; i < columns.length; i++) {
            if (!columns[i]) {
                return i;
            }
        }
        return columns.length;
    }

    /**
     * 为提交查找最佳列位置
     */
    private findBestColumn(
        commit: GitCommit,
        children: string[],
        commitColumns: Map<string, number>,
        activeColumns: string[]
    ): number {
        // 如果有子提交，尝试使用子提交的列
        for (const childHash of children) {
            const childColumn = commitColumns.get(childHash);
            if (childColumn !== undefined && activeColumns[childColumn] === childHash) {
                return childColumn;
            }
        }

        // 如果是普通提交（单个父提交），尝试使用父提交的列
        if (commit.parents.length === 1) {
            const parentColumn = commitColumns.get(commit.parents[0]);
            if (parentColumn !== undefined) {
                return parentColumn;
            }
        }

        // 查找可用的列
        return this.findAvailableColumnInStringArray(activeColumns);
    }

    /**
     * 为提交分配列和颜色
     */
    private assignColumnAndColor(
        commit: GitCommit,
        children: string[],
        columns: string[],
        colorMap: Map<string, number>,
        isFirst: boolean
    ): { column: number; colorIndex: number } {
        // 如果是第一个提交，分配到第0列
        if (isFirst) {
            const colorIndex = this.getNextColorIndex();
            colorMap.set(commit.hash, colorIndex);
            return { column: 0, colorIndex };
        }

        // 查找是否有子提交已经占用了某列
        for (let i = 0; i < columns.length; i++) {
            if (children.includes(columns[i])) {
                const colorIndex = colorMap.get(columns[i]) || this.getNextColorIndex();
                colorMap.set(commit.hash, colorIndex);
                return { column: i, colorIndex };
            }
        }

        // 如果是合并提交，尝试使用主分支列（第一个父提交的列）
        if (commit.parents.length > 1) {
            // 查找第一个父提交的列
            for (let i = 0; i < columns.length; i++) {
                if (columns[i] === commit.parents[0]) {
                    const colorIndex = colorMap.get(commit.parents[0]) || this.getNextColorIndex();
                    colorMap.set(commit.hash, colorIndex);
                    return { column: i, colorIndex };
                }
            }
        }

        // 如果没有找到合适的列，分配新列
        const column = this.findAvailableColumnInStringArray(columns);
        const colorIndex = this.getNextColorIndex();
        colorMap.set(commit.hash, colorIndex);
        
        return { column, colorIndex };
    }

    /**
     * 预测父提交的列位置
     */
    private predictParentColumn(
        parentHash: string,
        parentIndex: number,
        currentColumn: number,
        columns: string[],
        isMerge: boolean
    ): number {
        if (parentIndex === 0) {
            // 主要父提交，通常保持在同一列
            return currentColumn;
        } else {
            // 合并的父提交，分配到右侧的列
            return this.findAvailableColumnInStringArray(columns, currentColumn + 1);
        }
    }

    /**
     * 更新列状态
     */
    private updateColumns(commit: GitCommit, column: number, columns: string[]) {
        // 确保数组足够大
        while (columns.length <= column) {
            columns.push('');
        }
        
        // 设置当前列的提交
        columns[column] = commit.hash;
        
        // 如果是合并提交，可能需要清理其他列
        if (commit.parents.length > 1) {
            // 合并提交会结束其他分支，清理相应的列
            for (let i = column + 1; i < columns.length; i++) {
                if (commit.parents.includes(columns[i])) {
                    columns[i] = '';
                }
            }
        }
    }



    /**
     * 获取下一个颜色索引
     */
    private getNextColorIndex(): number {
        const index = this.colorIndex;
        this.colorIndex = (this.colorIndex + 1) % 8; // 循环使用8种颜色
        return index;
    }

    /**
     * 重置颜色索引
     */
    public resetColorIndex(): void {
        this.colorIndex = 0;
        this.branchColors.clear();
    }

    /**
     * 获取分支信息
     */
    public async getBranchInfo(commits: GitCommit[]): Promise<GitGraphBranch[]> {
        const branches: GitGraphBranch[] = [];
        
        // 这里可以根据需要实现分支信息的提取
        // 目前先返回空数组，后续可以扩展
        
        return branches;
    }

    /**
     * 优化图布局（可选的后处理步骤）
     */
    public optimizeLayout(layout: GitGraphLayout): GitGraphLayout {
        // 可以在这里实现布局优化算法
        // 比如减少交叉线、优化列分配等
        
        return layout;
    }
}