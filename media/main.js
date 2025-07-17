(function() {
    const vscode = acquireVsCodeApi();
    
    let commits = [];
    let branches = [];
    let selectedCommits = [];
    let currentCommit = null;

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
    branchSelect.addEventListener('change', (e) => {
        const branch = e.target.value;
        vscode.postMessage({
            type: 'getCommitHistory',
            branch: branch || undefined
        });
    });

    refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'getBranches' });
        vscode.postMessage({ type: 'getCommitHistory' });
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

    function updateBranches(branchData) {
        branches = branchData;
        branchSelect.innerHTML = '<option value="">All branches</option>';
        
        branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.name;
            option.textContent = branch.name + (branch.current ? ' (current)' : '');
            if (branch.current) {
                option.selected = true;
            }
            branchSelect.appendChild(option);
        });
    }

    function updateCommitHistory(commitData) {
        commits = commitData;
        selectedCommits = [];
        renderCommitList();
    }

    function renderCommitList() {
        commitList.innerHTML = '';
        
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
        
        // 构建文件变更HTML
        const filesHtml = files.map(file => `
            <div class="file-item clickable-file" data-file="${escapeHtml(file.file)}" data-hash="${escapeHtml(commit.hash)}">
                <div class="file-name">${escapeHtml(file.file)}</div>
                <div class="file-stats">
                    ${file.binary ? 'binary' : ''}
                    ${!file.binary ? `<span class="insertions">+${file.insertions}</span> <span class="deletions">-${file.deletions}</span>` : ''}
                </div>
            </div>
        `).join('');

        // 解析refs信息
        const refs = commit.refs ? parseRefs(commit.refs) : [];
        const refsHtml = refs.map(ref => `<span class="ref-tag">${ref}</span>`).join('');

        // 构建完整的详情HTML，确保每次都重新生成details-header
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
                <h3>Changed Files (${files.length})</h3>
                ${files.length > 0 ? filesHtml : '<div class="no-files">No files changed</div>'}
            </div>
        `;

        // 完全替换内容，确保details-header被正确更新
        commitDetails.innerHTML = detailsHtml;
        
        // 添加文件点击事件监听器
        const fileItems = commitDetails.querySelectorAll('.clickable-file');
        fileItems.forEach(fileItem => {
            fileItem.addEventListener('click', (e) => {
                e.stopPropagation();
                const filePath = fileItem.dataset.file;
                const commitHash = fileItem.dataset.hash;
                
                // 发送消息到扩展以显示文件差异
                vscode.postMessage({
                    type: 'showFileDiff',
                    hash: commitHash,
                    filePath: filePath
                });
            });
        });
        
        console.log('Updated commit details for:', commit.hash.substring(0, 8), commit.message);
    }

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
    vscode.postMessage({ type: 'getCommitHistory' });
})();