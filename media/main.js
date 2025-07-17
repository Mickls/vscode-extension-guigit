(function() {
    const vscode = acquireVsCodeApi();
    
    let commits = [];
    let branches = [];
    let selectedCommits = [];
    let currentCommit = null;
    let currentBranch = '';
    let loadedCommits = 0;
    let totalCommits = 0;
    let isLoading = false;
    let fileViewMode = 'tree'; // 'tree' or 'list'

    // DOM元素
    const branchSelect = document.getElementById('branchSelect');
    const refreshBtn = document.getElementById('refreshBtn');
    const jumpToHeadBtn = document.getElementById('jumpToHeadBtn');
    const commitList = document.getElementById('commitList');
    const commitDetails = document.getElementById('commitDetails');
    const contextMenu = document.getElementById('contextMenu');
    const comparePanel = document.getElementById('comparePanel');
    const compareContent = document.getElementById('compareContent');
    const closeCompare = document.getElementById('closeCompare');

    // 事件监听器
    // 添加滚动监听器以实现无限滚动
    commitList.addEventListener('scroll', () => {
        if (isLoading || loadedCommits >= totalCommits) {
            return;
        }
        
        const scrollTop = commitList.scrollTop;
        const scrollHeight = commitList.scrollHeight;
        const clientHeight = commitList.clientHeight;
        
        // 当滚动到距离底部50px时开始加载
        if (scrollTop + clientHeight >= scrollHeight - 50) {
            loadCommits(false);
        }
    });

    branchSelect.addEventListener('change', (e) => {
        currentBranch = e.target.value;
        loadedCommits = 0;
        commits = [];
        selectedCommits = [];
        updateMultiSelectInfo();
        loadCommits(true);
    });

    refreshBtn.addEventListener('click', () => {
        loadedCommits = 0;
        commits = [];
        selectedCommits = [];
        updateMultiSelectInfo();
        vscode.postMessage({ type: 'getBranches' });
        loadCommits(true);
    });

    jumpToHeadBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'jumpToHead' });
    });

    closeCompare.addEventListener('click', () => {
        comparePanel.style.display = 'none';
    });

    // 隐藏右键菜单
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    // 处理来自扩展的消息
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'branches':
                updateBranches(message.data);
                break;
            case 'commitHistory':
                updateCommitHistory(message.data);
                break;
            case 'totalCommitCount':
                totalCommits = message.data;
                break;
            case 'commitDetails':
                updateCommitDetails(message.data);
                break;
            case 'compareResult':
                showCompareResult(message.data);
                break;
            case 'jumpToHead':
                jumpToHeadCommit(message.data);
                break;
            case 'error':
                showError(message.message);
                break;
        }
    });

    function loadCommits(reset = false) {
        if (isLoading) return;
        
        isLoading = true;
        
        if (reset) {
            loadedCommits = 0;
            commits = [];
            commitList.innerHTML = '<div class="loading">Loading commits...</div>';
        }
        
        vscode.postMessage({ 
            type: 'getCommitHistory', 
            branch: currentBranch || undefined,
            skip: loadedCommits
        });
        
        // Get total count if we don't have it
        if (totalCommits === 0) {
            vscode.postMessage({ 
                type: 'getTotalCommitCount', 
                branch: currentBranch || undefined
            });
        }
    }

    function updateBranches(branchData) {
        branches = branchData;
        branchSelect.innerHTML = '<option value="">All branches</option>';
        
        branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.name;
            option.textContent = branch.name + (branch.current ? ' (current)' : '');
            if (branch.current) {
                option.selected = true;
                currentBranch = branch.name;
            }
            branchSelect.appendChild(option);
        });
    }

    function updateCommitHistory(data) {
        isLoading = false;
        
        if (data.skip === 0) {
            // First load or refresh
            commits = data.commits;
            selectedCommits = [];
            commitList.innerHTML = '';
            renderCommitList();
        } else {
            // Loading more commits
            commits = commits.concat(data.commits);
            appendCommitList(data.commits);
        }
        
        loadedCommits = commits.length;
        
        // 只在初始加载时显示加载状态
        if (data.skip === 0 && loadedCommits < totalCommits) {
            showLoadingIndicator();
        }
    }

    function renderCommitList() {
        if (commits.length === 0) {
            commitList.innerHTML = '<div class="loading">No commits found</div>';
            return;
        }

        commits.forEach((commit, index) => {
            const commitElement = createCommitElement(commit, index);
            commitList.appendChild(commitElement);
        });

        updateMultiSelectInfo();
    }

    function appendCommitList(newCommits) {
        // 先移除加载指示器
        hideLoadingIndicator();
        
        newCommits.forEach((commit, index) => {
            const commitElement = createCommitElement(commit, commits.length - newCommits.length + index);
            commitList.appendChild(commitElement);
        });
        
        // 重新检查是否需要显示加载指示器
        if (loadedCommits < totalCommits) {
            showLoadingIndicator();
        }
    }

    function showLoadingIndicator() {
        let indicator = commitList.querySelector('.loading-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'loading-indicator';
            indicator.innerHTML = '<div class="loading">Loading more commits...</div>';
            commitList.appendChild(indicator);
        }
    }

    function hideLoadingIndicator() {
        const indicator = commitList.querySelector('.loading-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    function createCommitElement(commit, index) {
        const div = document.createElement('div');
        div.className = 'commit-item';
        div.dataset.hash = commit.hash;
        div.dataset.index = index;

        const refs = commit.refs ? parseRefs(commit.refs) : [];
        const refsHtml = refs.map(ref => `<span class="ref-tag">${ref}</span>`).join('');

        div.innerHTML = `
            <div class="commit-hash">${commit.hash.substring(0, 8)}</div>
            <div class="commit-message">${escapeHtml(commit.message)}</div>
            <div class="commit-author">
                <span>${escapeHtml(commit.author)}</span>
                <span class="commit-date">${formatDate(commit.date)}</span>
            </div>
            ${refsHtml ? `<div class="commit-refs">${refsHtml}</div>` : ''}
        `;

        // 单击选择
        div.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                // 多选模式
                toggleCommitSelection(commit.hash, div);
            } else {
                // 单选模式
                selectSingleCommit(commit.hash, div);
            }
        });

        // 右键菜单
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, commit.hash);
        });

        return div;
    }

    function toggleCommitSelection(hash, element) {
        const index = selectedCommits.indexOf(hash);
        if (index > -1) {
            selectedCommits.splice(index, 1);
            element.classList.remove('multi-selected');
        } else {
            selectedCommits.push(hash);
            element.classList.add('multi-selected');
        }
        updateMultiSelectInfo();
    }

    function selectSingleCommit(hash, element) {
        // 清除所有选择状态
        document.querySelectorAll('.commit-item').forEach(item => {
            item.classList.remove('selected', 'multi-selected');
        });
        
        // 重置选择数组
        selectedCommits = [hash];
        currentCommit = hash;
        
        // 设置当前选中状态
        element.classList.add('selected');
        
        // 清除详情区域，显示加载状态
        commitDetails.innerHTML = '<div class="loading">Loading commit details...</div>';
        
        // 获取提交详情
        vscode.postMessage({
            type: 'getCommitDetails',
            hash: hash
        });

        updateMultiSelectInfo();
    }

    function updateMultiSelectInfo() {
        const existingInfo = document.querySelector('.multi-select-info');
        if (existingInfo) {
            existingInfo.remove();
        }

        if (selectedCommits.length > 1) {
            const info = document.createElement('div');
            info.className = 'multi-select-info';
            info.innerHTML = `
                <div>${selectedCommits.length} commits selected</div>
                <div class="multi-select-actions">
                    <button onclick="compareSelectedCommits()">Compare</button>
                    <button onclick="clearSelection()">Clear</button>
                </div>
            `;
            document.body.appendChild(info);
        }
    }

    function showContextMenu(event, hash) {
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
        
        contextMenu.style.display = 'block';
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';

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

        // 移除之前的事件监听器
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

    function handleContextMenuAction(action, hash) {
        switch (action) {
            case 'copyHash':
                vscode.postMessage({ type: 'copyHash', hash });
                break;
            case 'cherryPick':
                vscode.postMessage({ type: 'cherryPick', hash });
                break;
            case 'revert':
                vscode.postMessage({ type: 'revert', hash });
                break;
            case 'squash':
                if (selectedCommits.length > 1) {
                    vscode.postMessage({ 
                        type: 'squashCommits', 
                        commits: selectedCommits 
                    });
                }
                break;
            case 'resetSoft':
                vscode.postMessage({ type: 'reset', hash, mode: 'soft' });
                break;
            case 'resetMixed':
                vscode.postMessage({ type: 'reset', hash, mode: 'mixed' });
                break;
            case 'resetHard':
                vscode.postMessage({ type: 'reset', hash, mode: 'hard' });
                break;
        }
    }

    function updateCommitDetails(data) {
        if (!data) {
            commitDetails.innerHTML = '<div class="placeholder">Failed to load commit details</div>';
            return;
        }

        const { commit, files } = data;
        
        // 确保更新当前选中的commit信息
        currentCommit = commit.hash;
        
        // 根据视图模式构建文件HTML
        let filesHtml;
        if (fileViewMode === 'tree') {
            const fileTree = buildFileTree(files);
            filesHtml = renderFileTree(fileTree, commit.hash);
        } else {
            filesHtml = renderFileList(files, commit.hash);
        }

        // 解析refs信息
        const refs = commit.refs ? parseRefs(commit.refs) : [];
        const refsHtml = refs.map(ref => `<span class="ref-tag">${ref}</span>`).join('');

        // 构建完整的详情HTML
        const detailsHtml = `
            <div class="details-header">
                <div class="details-hash">${escapeHtml(commit.hash)}</div>
                <div class="details-message">${escapeHtml(commit.message)}</div>
                <div class="details-author">${escapeHtml(commit.author)} &lt;${escapeHtml(commit.email)}&gt;</div>
                <div class="details-date">${formatDate(commit.date)}</div>
                ${refsHtml ? `<div class="details-refs">${refsHtml}</div>` : ''}
                ${commit.body ? `<div class="details-body">${escapeHtml(commit.body)}</div>` : ''}
            </div>
            <div class="file-changes">
                <h3>
                    Changed Files (${files.length})
                    <div class="file-view-controls">
                        <button class="view-toggle-btn" onclick="toggleFileViewMode()" title="${fileViewMode === 'tree' ? 'Switch to List View' : 'Switch to Tree View'}">
                            ${fileViewMode === 'tree' ? 
                                '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/></svg>' : 
                                '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1.5A1.5 1.5 0 0 1 2.5 0h3A1.5 1.5 0 0 1 7 1.5v3A1.5 1.5 0 0 1 5.5 6h-3A1.5 1.5 0 0 1 1 4.5v-3zM2.5 1a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 0h3A1.5 1.5 0 0 1 15 1.5v3A1.5 1.5 0 0 1 13.5 6h-3A1.5 1.5 0 0 1 8 4.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zM1 10.5A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 8 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3z"/></svg>'
                            }
                        </button>
                        ${files.length > 10 && fileViewMode === 'tree' ? '<button class="collapse-all-btn" onclick="toggleAllFolders()">Collapse All</button>' : ''}
                    </div>
                </h3>
                ${files.length > 0 ? filesHtml : '<div class="no-files">No files changed</div>'}
            </div>
        `;

        // 完全替换内容
        commitDetails.innerHTML = detailsHtml;
        
        // 添加事件监听器
        addFileEventListeners(commit.hash);
        
        console.log('Updated commit details for:', commit.hash.substring(0, 8), commit.message);
    }

    function buildFileTree(files) {
        const tree = {};
        
        files.forEach(file => {
            const parts = file.file.split('/');
            let current = tree;
            
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                
                if (i === parts.length - 1) {
                    // 这是文件
                    current[part] = {
                        type: 'file',
                        data: file
                    };
                } else {
                    // 这是目录
                    if (!current[part]) {
                        current[part] = {
                            type: 'directory',
                            children: {}
                        };
                    }
                    current = current[part].children;
                }
            }
        });
        
        return tree;
    }

    function renderFileTree(tree, commitHash, level = 0) {
        let html = '';
        const entries = Object.entries(tree);
        
        // 排序：目录在前，文件在后
        entries.sort((a, b) => {
            const [nameA, nodeA] = a;
            const [nameB, nodeB] = b;
            
            if (nodeA.type === 'directory' && nodeB.type === 'file') return -1;
            if (nodeA.type === 'file' && nodeB.type === 'directory') return 1;
            return nameA.localeCompare(nameB);
        });
        
        entries.forEach(([name, node]) => {
            if (node.type === 'directory') {
                const childrenHtml = renderFileTree(node.children, commitHash, level + 1);
                const childCount = Object.keys(node.children).length;
                const isCollapsed = level > 0 && childCount > 5; // 自动折叠大目录
                
                html += `
                    <div class="file-tree-folder" data-level="${level}">
                        <div class="folder-header" onclick="toggleFolder(this)">
                            <span class="folder-icon ${isCollapsed ? 'collapsed' : 'expanded'}">▼</span>
                            <span class="folder-name">${escapeHtml(name)}</span>
                            <span class="folder-count">(${childCount})</span>
                        </div>
                        <div class="folder-content" ${isCollapsed ? 'style="display: none;"' : ''}>
                            ${childrenHtml}
                        </div>
                    </div>
                `;
            } else {
                const file = node.data;
                html += `
                    <div class="file-tree-item" data-level="${level}" data-file="${escapeHtml(file.file)}" data-hash="${escapeHtml(commitHash)}">
                        <div class="file-info">
                            <span class="file-icon">📄</span>
                            <span class="file-name">${escapeHtml(name)}</span>
                            <div class="file-actions">
                                <button class="file-action-btn" title="View Diff" onclick="showFileDiff('${escapeHtml(commitHash)}', '${escapeHtml(file.file)}')">
                                    ⚡
                                </button>
                                <button class="file-action-btn" title="Open File" onclick="openFile('${escapeHtml(file.file)}')">
                                    📄
                                </button>
                                <button class="file-action-btn" title="File History" onclick="showFileHistory('${escapeHtml(file.file)}')">
                                    🕒
                                </button>
                                <button class="file-action-btn" title="View Online" onclick="viewFileOnline('${escapeHtml(commitHash)}', '${escapeHtml(file.file)}')">
                                    🌐
                                </button>
                            </div>
                        </div>
                        <div class="file-stats">
                            ${file.binary ? 'binary' : ''}
                            ${!file.binary ? `<span class="insertions">+${file.insertions}</span> <span class="deletions">-${file.deletions}</span>` : ''}
                        </div>
                    </div>
                `;
            }
        });
        
        return html;
    }

    function renderFileList(files, commitHash) {
        let html = '';
        
        files.forEach(file => {
            html += `
                <div class="file-item" data-file="${escapeHtml(file.file)}" data-hash="${escapeHtml(commitHash)}">
                    <div class="file-info">
                        <span class="file-icon">📄</span>
                        <span class="file-name">${escapeHtml(file.file)}</span>
                        <div class="file-actions">
                            <button class="file-action-btn" title="View Diff" onclick="showFileDiff('${escapeHtml(commitHash)}', '${escapeHtml(file.file)}')">
                                ⚡
                            </button>
                            <button class="file-action-btn" title="Open File" onclick="openFile('${escapeHtml(file.file)}')">
                                📄
                            </button>
                            <button class="file-action-btn" title="File History" onclick="showFileHistory('${escapeHtml(file.file)}')">
                                🕒
                            </button>
                            <button class="file-action-btn" title="View Online" onclick="viewFileOnline('${escapeHtml(commitHash)}', '${escapeHtml(file.file)}')">
                                🌐
                            </button>
                        </div>
                    </div>
                    <div class="file-stats">
                        ${file.binary ? 'binary' : ''}
                        ${!file.binary ? `<span class="insertions">+${file.insertions}</span> <span class="deletions">-${file.deletions}</span>` : ''}
                    </div>
                </div>
            `;
        });
        
        return html;
    }

    function addFileEventListeners(commitHash) {
        // 文件点击事件（点击文件名区域）
        const fileItems = commitDetails.querySelectorAll('.file-name');
        fileItems.forEach(fileItem => {
            fileItem.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileElement = fileItem.closest('[data-file]');
                const filePath = fileElement.dataset.file;
                showFileDiff(commitHash, filePath);
            });
        });
    }

    // 全局函数，供HTML onclick调用
    window.toggleFileViewMode = function() {
        fileViewMode = fileViewMode === 'tree' ? 'list' : 'tree';
        // 重新请求当前提交详情以刷新视图
        if (currentCommit) {
            vscode.postMessage({
                type: 'getCommitDetails',
                hash: currentCommit
            });
        }
    };

    // 全局函数，供HTML onclick调用
    window.toggleFolder = function(folderHeader) {
        const folderIcon = folderHeader.querySelector('.folder-icon');
        const folderContent = folderHeader.parentElement.querySelector('.folder-content');
        
        if (folderContent.style.display === 'none') {
            folderContent.style.display = 'block';
            folderIcon.classList.remove('collapsed');
            folderIcon.classList.add('expanded');
        } else {
            folderContent.style.display = 'none';
            folderIcon.classList.remove('expanded');
            folderIcon.classList.add('collapsed');
        }
    };

    window.toggleAllFolders = function() {
        const folders = commitDetails.querySelectorAll('.file-tree-folder');
        const isAnyExpanded = Array.from(folders).some(folder => 
            folder.querySelector('.folder-content').style.display !== 'none'
        );
        
        folders.forEach(folder => {
            const folderContent = folder.querySelector('.folder-content');
            const folderIcon = folder.querySelector('.folder-icon');
            
            if (isAnyExpanded) {
                folderContent.style.display = 'none';
                folderIcon.classList.remove('expanded');
                folderIcon.classList.add('collapsed');
            } else {
                folderContent.style.display = 'block';
                folderIcon.classList.remove('collapsed');
                folderIcon.classList.add('expanded');
            }
        });
    };

    window.showFileDiff = function(commitHash, filePath) {
        vscode.postMessage({
            type: 'showFileDiff',
            hash: commitHash,
            file: filePath
        });
    };

    window.openFile = function(filePath) {
        vscode.postMessage({
            type: 'openFile',
            file: filePath
        });
    };

    window.showFileHistory = function(filePath) {
        vscode.postMessage({
            type: 'showFileHistory',
            file: filePath
        });
    };

    window.viewFileOnline = function(commitHash, filePath) {
        vscode.postMessage({
            type: 'viewFileOnline',
            hash: commitHash,
            file: filePath
        });
    };

    function showCompareResult(data) {
        const { commits: compareCommits, changes } = data;
        
        const changesHtml = changes.map(file => `
            <div class="file-item">
                <div class="file-name">${escapeHtml(file.file)}</div>
                <div class="file-stats">
                    ${file.binary ? 'binary' : ''}
                    ${!file.binary ? `<span class="insertions">+${file.insertions}</span> <span class="deletions">-${file.deletions}</span>` : ''}
                </div>
            </div>
        `).join('');

        compareContent.innerHTML = `
            <div class="compare-commits">
                <div class="compare-commit">
                    <h4>From: ${compareCommits[0].substring(0, 8)}</h4>
                </div>
                <div class="compare-commit">
                    <h4>To: ${compareCommits[1].substring(0, 8)}</h4>
                </div>
            </div>
            <div class="file-changes">
                <h3>Changed Files (${changes.length})</h3>
                ${changesHtml}
            </div>
        `;

        comparePanel.style.display = 'block';
    }

    // 全局函数
    window.compareSelectedCommits = function() {
        if (selectedCommits.length === 2) {
            vscode.postMessage({
                type: 'compareCommits',
                hashes: selectedCommits
            });
        }
    };

    window.clearSelection = function() {
        selectedCommits = [];
        document.querySelectorAll('.commit-item').forEach(item => {
            item.classList.remove('multi-selected');
        });
        updateMultiSelectInfo();
    };

    // 工具函数
    function parseRefs(refs) {
        if (!refs) return [];
        return refs.split(', ').filter(ref => ref.trim());
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function jumpToHeadCommit(headCommit) {
        if (!headCommit) return;
        
        // 清除所有选择
        document.querySelectorAll('.commit-item').forEach(item => {
            item.classList.remove('selected', 'multi-selected');
        });
        
        // 找到HEAD提交并选中
        const headElement = document.querySelector(`[data-hash="${headCommit.hash}"]`);
        if (headElement) {
            headElement.classList.add('selected');
            headElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            selectedCommits = [headCommit.hash];
            currentCommit = headCommit.hash;
            
            // 获取提交详情
            vscode.postMessage({
                type: 'getCommitDetails',
                hash: headCommit.hash
            });
            
            updateMultiSelectInfo();
        }
    }

    function showError(message) {
        commitDetails.innerHTML = `<div class="placeholder" style="color: var(--vscode-errorForeground);">${escapeHtml(message)}</div>`;
    }

    // 初始化
    vscode.postMessage({ type: 'getBranches' });
    loadCommits(true);
})();