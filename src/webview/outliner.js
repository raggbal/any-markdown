/**
 * Outliner — アウトライナUI本体
 *
 * DOM レンダリング、キーハンドラ、折りたたみ制御を担当。
 * ページノードクリック時はホストに openPage を送信し、
 * VSCode が any-markdown.editor を ViewColumn.Beside で開く。
 * window.outlinerHostBridge 経由でホスト通信。
 */

// eslint-disable-next-line no-unused-vars
var Outliner = (function() {
    'use strict';

    var model;          // OutlinerModel instance
    var searchEngine;   // OutlinerSearch.SearchEngine instance
    var host;           // window.outlinerHostBridge
    var treeEl;         // .outliner-tree DOM element
    var searchInput;    // .outliner-search-input element
    var breadcrumbEl;   // .outliner-breadcrumb element
    var pageTitleEl;     // .outliner-page-title container
    var pageTitleInput;  // .outliner-page-title-input element

    var focusedNodeId = null;
    var currentScope = { type: 'document' };
    var currentSearchResult = null;  // Set<string> or null
    var searchFocusMode = false;     // true: マッチノード頂点+子のみ, false: ルートまで表示
    var pageDir = null;              // outファイル個別のpageDir設定
    var sidePanelWidthSetting = null; // outファイル個別のサイドパネル幅
    var pinnedTags = [];             // 固定タグ配列 (例: ['#TASK', '#TODO'])
    var searchModeToggleBtn = null;  // toggle button element
    var menuBtn = null;              // menu button element
    var undoBtn = null;              // undo button element
    var redoBtn = null;              // redo button element
    var contextMenuEl = null;

    var syncDebounceTimer = null;
    var SYNC_DEBOUNCE_MS = 1000;

    // --- Navigation history (Back/Forward) ---
    var navBackStack = [];
    var navForwardStack = [];
    var isNavigating = false;
    var MAX_NAV_HISTORY = 50;
    var navBackBtn = null;
    var navForwardBtn = null;

    // --- Daily Notes ---
    var isDailyNotes = false;
    var dailyNavBar = null;
    var dailyCurrentDate = null;  // YYYY-MM-DD

    // --- 複数ノード選択 ---
    var selectedNodeIds = new Set();    // 選択中のノードIDセット
    var selectionAnchorId = null;       // Shift選択の起点ノードID

    // --- Undo/Redo ---
    var undoStack = [];
    var redoStack = [];
    var MAX_UNDO = 200;
    var isUndoRedo = false;

    function saveSnapshot() {
        if (isUndoRedo) { return; }
        var snapshot = JSON.stringify(model.serialize());
        // 前回と同じなら保存しない
        if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshot) { return; }
        undoStack.push(snapshot);
        if (undoStack.length > MAX_UNDO) { undoStack.shift(); }
        redoStack.length = 0;
        updateUndoRedoButtons();
    }

    function undo() {
        if (undoStack.length === 0) { return; }
        // 現在の状態をredoに保存
        redoStack.push(JSON.stringify(model.serialize()));
        var snapshot = undoStack.pop();
        isUndoRedo = true;
        model = new OutlinerModel(JSON.parse(snapshot));
        searchEngine = new OutlinerSearch.SearchEngine(model);
        renderTree();
        if (focusedNodeId && model.getNode(focusedNodeId)) {
            focusNode(focusedNodeId);
        }
        syncToHostImmediate();
        isUndoRedo = false;
        updateUndoRedoButtons();
    }

    function redo() {
        if (redoStack.length === 0) { return; }
        undoStack.push(JSON.stringify(model.serialize()));
        var snapshot = redoStack.pop();
        isUndoRedo = true;
        model = new OutlinerModel(JSON.parse(snapshot));
        searchEngine = new OutlinerSearch.SearchEngine(model);
        renderTree();
        if (focusedNodeId && model.getNode(focusedNodeId)) {
            focusNode(focusedNodeId);
        }
        syncToHostImmediate();
        isUndoRedo = false;
        updateUndoRedoButtons();
    }

    // --- 初期化 ---

    var i18n = window.__outlinerMessages || {};

    // 検索モードアイコン (Lucide風SVG)
    var ICON_TREE_MODE = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/></svg>';
    var ICON_FOCUS_MODE = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
    var ICON_MENU = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
    var ICON_UNDO = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 0 1 3-7.7A9 9 0 0 1 21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3"/></svg>';
    var ICON_REDO = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 0 0-3-7.7A9 9 0 0 0 3 12a9 9 0 0 0 9 9 9 9 0 0 0 6.7-3"/></svg>';

    function init(data) {
        host = window.outlinerHostBridge;
        model = new OutlinerModel(data);
        searchEngine = new OutlinerSearch.SearchEngine(model);

        // JSONから検索モードを復元
        if (data && data.searchFocusMode) {
            searchFocusMode = true;
        }
        // JSONからpageDirを復元
        if (data && data.pageDir) {
            pageDir = data.pageDir;
        }
        // JSONからpinnedTagsを復元
        if (data && data.pinnedTags) {
            pinnedTags = data.pinnedTags;
        }

        treeEl = document.querySelector('.outliner-tree');
        searchInput = document.querySelector('.outliner-search-input');
        breadcrumbEl = document.querySelector('.outliner-breadcrumb');
        searchModeToggleBtn = document.querySelector('.outliner-search-mode-toggle');
        menuBtn = document.querySelector('.outliner-menu-btn');
        undoBtn = document.querySelector('.outliner-undo-btn');
        redoBtn = document.querySelector('.outliner-redo-btn');
        navBackBtn = document.querySelector('.outliner-nav-back-btn');
        navForwardBtn = document.querySelector('.outliner-nav-forward-btn');

        // ページタイトル
        pageTitleEl = document.querySelector('.outliner-page-title');
        pageTitleInput = document.querySelector('.outliner-page-title-input');
        if (pageTitleInput) {
            pageTitleInput.value = model.title || '';
            setupPageTitle();
        }

        // ボタンアイコン初期化
        if (searchModeToggleBtn) {
            updateSearchModeButton();
        }
        if (menuBtn) {
            menuBtn.innerHTML = ICON_MENU;
        }
        if (undoBtn) {
            undoBtn.innerHTML = ICON_UNDO;
        }
        if (redoBtn) {
            redoBtn.innerHTML = ICON_REDO;
        }

        renderTree();
        setupSearchBar();
        setupDailyNavBar();
        setupPinnedSettingsButton();
        updatePinnedTagBar();
        setupKeyHandlers();
        setupContextMenu();
        setupHostMessages();
        initSidePanel();

        // 初期スナップショット
        saveSnapshot();

        // 空の場合、最初のノードを追加
        if (model.rootIds.length === 0) {
            var firstNode = model.addNode(null, null, '');
            renderTree();
            focusNode(firstNode.id);
        } else {
            // 非空の場合、最初のノードにフォーカス
            // webviewが完全にレンダリングされるまで待つ
            setTimeout(function() {
                focusFirstVisibleNode();
            }, 100);
        }
    }

    // --- レンダリング ---

    function renderTree() {
        treeEl.innerHTML = '';
        updateBreadcrumb();

        if (model.rootIds.length === 0) {
            treeEl.innerHTML = '<div class="outliner-empty">' +
                '<div>' + (i18n.outlinerNoItems || 'No items yet') + '</div>' +
                '<div class="outliner-empty-hint">' + (i18n.outlinerAddHint || 'Press Enter to add an item') + '</div>' +
                '</div>';
            return;
        }

        // スコープ内で子ノードが0個の場合: ヘッダー + 空表示
        if (currentScope.type === 'subtree' && currentScope.rootId) {
            var scopeRootNode = model.getNode(currentScope.rootId);
            if (scopeRootNode && (!scopeRootNode.children || scopeRootNode.children.length === 0)) {
                // スコープヘッダーは表示
                var emptyHeaderEl = createNodeElement(scopeRootNode, 0, null);
                emptyHeaderEl.classList.add('is-scope-header');
                treeEl.appendChild(emptyHeaderEl);
                // 空メッセージ
                var emptyDiv = document.createElement('div');
                emptyDiv.className = 'outliner-empty outliner-scope-empty';
                emptyDiv.innerHTML = '<div>' + (i18n.outlinerNoItems || 'No items yet') + '</div>' +
                    '<div class="outliner-empty-hint">' + (i18n.outlinerAddHint || 'Press Enter to add an item') + '</div>';
                emptyDiv.tabIndex = 0;
                emptyDiv.addEventListener('keydown', function(ev) {
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        var newNode = model.addNodeAtStart(currentScope.rootId, '');
                        renderTree();
                        focusNodeAtStart(newNode.id);
                        scheduleSyncToHost();
                    }
                });
                emptyDiv.addEventListener('click', function() {
                    var newNode = model.addNodeAtStart(currentScope.rootId, '');
                    renderTree();
                    focusNodeAtStart(newNode.id);
                    scheduleSyncToHost();
                });
                treeEl.appendChild(emptyDiv);
                emptyDiv.focus();
                return;
            }
        }

        // 検索時のマッチIDをキャッシュ (renderInlineText内での再計算を避ける)
        var searchQuery = null;
        if (currentSearchResult && searchInput) {
            searchQuery = OutlinerSearch.parseQuery(searchInput.value || '');
        }

        var fragment = document.createDocumentFragment();

        if (searchFocusMode && currentSearchResult) {
            // フォーカスモード: マッチノードをフラットに頂点として表示
            renderFocusNodes(fragment, searchQuery);
        } else {
            var rootIds;
            if (currentScope.type === 'subtree' && currentScope.rootId) {
                // スコープヘッダー: スコープ対象ノードをバレットなしで表示
                var scopeNode = model.getNode(currentScope.rootId);
                if (scopeNode) {
                    var headerEl = createNodeElement(scopeNode, 0, searchQuery);
                    headerEl.classList.add('is-scope-header');
                    fragment.appendChild(headerEl);
                }
                // スコープ対象の子ノードをトップレベルとして表示
                rootIds = (scopeNode && scopeNode.children && scopeNode.children.length > 0)
                    ? scopeNode.children
                    : [];
            } else {
                rootIds = model.rootIds;
            }
            renderNodes(rootIds, fragment, 0, searchQuery);
        }
        treeEl.appendChild(fragment);
    }

    function renderNodes(nodeIds, parentEl, depth, searchQuery) {
        for (var i = 0; i < nodeIds.length; i++) {
            var nodeId = nodeIds[i];
            var node = model.getNode(nodeId);
            if (!node) { continue; }

            // 検索結果フィルタ
            if (currentSearchResult && !currentSearchResult.has(nodeId)) {
                continue;
            }

            var nodeEl = createNodeElement(node, depth, searchQuery);
            parentEl.appendChild(nodeEl);

            // 子ノード
            if (node.children && node.children.length > 0) {
                var childrenEl = document.createElement('div');
                childrenEl.className = 'outliner-children';
                childrenEl.dataset.parent = nodeId;
                if (node.collapsed && !currentSearchResult) {
                    childrenEl.classList.add('is-collapsed');
                }
                renderNodes(node.children, childrenEl, depth + 1, searchQuery);
                parentEl.appendChild(childrenEl);
            }
        }
    }

    /** フォーカスモード用: マッチノードの祖先パンくずを生成 */
    function createFocusAncestryBreadcrumb(nodeId) {
        var node = model.getNode(nodeId);
        if (!node || !node.parentId) return null;
        var ancestors = [];
        var cur = model.getNode(node.parentId);
        var stopId = (currentScope.type === 'subtree') ? currentScope.rootId : null;
        while (cur) {
            ancestors.unshift(cur);
            if (stopId && cur.id === stopId) break;
            cur = cur.parentId ? model.getNode(cur.parentId) : null;
        }
        if (ancestors.length === 0) return null;
        var breadcrumbEl = document.createElement('div');
        breadcrumbEl.className = 'outliner-focus-ancestry';
        for (var i = 0; i < ancestors.length; i++) {
            if (i > 0) {
                var sep = document.createElement('span');
                sep.className = 'outliner-focus-ancestry-sep';
                sep.textContent = ' \u203A ';
                breadcrumbEl.appendChild(sep);
            }
            var item = document.createElement('span');
            item.className = 'outliner-focus-ancestry-item';
            var text = (ancestors[i].text || '').replace(/[*_~`]+/g, '').slice(0, 30);
            item.textContent = text || '(empty)';
            item.title = ancestors[i].text || '';
            breadcrumbEl.appendChild(item);
        }
        return breadcrumbEl;
    }

    /** フォーカスモード: マッチノードを頂点として、その子孫のみ表示 */
    function renderFocusNodes(parentEl, searchQuery) {
        // マッチノード（子孫でも祖先でもなく、直接マッチしたもの）を検索で再判定
        var query = OutlinerSearch.parseQuery(searchInput.value || '');
        if (!query) { return; }
        // スコープを考慮した候補ノード（scope-in時はスコープ内のみ）
        var allNodeIds = (currentScope.type === 'subtree' && currentScope.rootId)
            ? [currentScope.rootId].concat(model.getDescendantIds(currentScope.rootId))
            : Object.keys(model.nodes);
        var directMatches = [];
        for (var i = 0; i < allNodeIds.length; i++) {
            var nid = allNodeIds[i];
            if (searchEngine._matches(nid, query)) {
                directMatches.push(nid);
            }
        }
        // 各マッチノードを頂点 (depth=0) として描画
        for (var m = 0; m < directMatches.length; m++) {
            var matchId = directMatches[m];
            var node = model.getNode(matchId);
            if (!node) { continue; }
            // 祖先パンくず表示（ノード要素の前）
            var ancestryEl = createFocusAncestryBreadcrumb(matchId);
            if (ancestryEl) {
                parentEl.appendChild(ancestryEl);
            }
            var nodeEl = createNodeElement(node, 0, searchQuery);
            parentEl.appendChild(nodeEl);
            // 子孫を通常描画 (フィルタなし、全子を表示)
            if (node.children && node.children.length > 0) {
                var childrenEl = document.createElement('div');
                childrenEl.className = 'outliner-children';
                childrenEl.dataset.parent = matchId;
                renderFocusChildren(node.children, childrenEl, 1, searchQuery);
                parentEl.appendChild(childrenEl);
            }
        }
    }

    /** フォーカスモード用: 子孫を全て表示 (検索フィルタなし) */
    function renderFocusChildren(nodeIds, parentEl, depth, searchQuery) {
        for (var i = 0; i < nodeIds.length; i++) {
            var nodeId = nodeIds[i];
            var node = model.getNode(nodeId);
            if (!node) { continue; }
            var nodeEl = createNodeElement(node, depth, searchQuery);
            parentEl.appendChild(nodeEl);
            if (node.children && node.children.length > 0) {
                var childrenEl = document.createElement('div');
                childrenEl.className = 'outliner-children';
                childrenEl.dataset.parent = nodeId;
                if (node.collapsed) {
                    childrenEl.classList.add('is-collapsed');
                }
                renderFocusChildren(node.children, childrenEl, depth + 1, searchQuery);
                parentEl.appendChild(childrenEl);
            }
        }
    }

    function createNodeElement(node, depth, searchQuery) {
        var el = document.createElement('div');
        el.className = 'outliner-node';
        el.dataset.id = node.id;
        el.dataset.depth = depth;
        if (node.checked !== null && node.checked !== undefined) {
            el.dataset.checked = String(node.checked);
        }
        if (focusedNodeId === node.id) {
            el.classList.add('is-focused');
        }
        // 直接マッチしたノードのみハイライト
        if (searchQuery && currentSearchResult && searchEngine._matches(node.id, searchQuery)) {
            el.classList.add('is-search-match');
        }

        // インデント
        var indentEl = document.createElement('div');
        indentEl.className = 'outliner-node-indent';
        indentEl.style.width = (depth * 24) + 'px';
        el.appendChild(indentEl);

        // Scope Inボタン（ホバー時に表示）
        var scopeBtn = document.createElement('div');
        scopeBtn.className = 'outliner-scope-btn';
        scopeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';
        scopeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            setScope({ type: 'subtree', rootId: node.id });
        });
        el.appendChild(scopeBtn);

        // バレット
        var bulletEl = document.createElement('div');
        bulletEl.className = 'outliner-bullet';
        var hasChildren = (node.children && node.children.length > 0);
        bulletEl.dataset.hasChildren = hasChildren;
        if (node.collapsed) {
            bulletEl.dataset.collapsed = 'true';
            if (hasChildren) {
                var countEl = document.createElement('span');
                countEl.className = 'outliner-child-count';
                countEl.textContent = String(node.children.length);
                bulletEl.appendChild(countEl);
            }
        }
        bulletEl.addEventListener('click', function(e) {
            if (e.altKey) {
                setScope({ type: 'subtree', rootId: node.id });
            } else {
                toggleCollapse(node.id);
            }
        });
        el.appendChild(bulletEl);

        // チェックボックス (タスクノード)
        if (node.checked !== null && node.checked !== undefined) {
            var cbWrap = document.createElement('div');
            cbWrap.className = 'outliner-checkbox';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!node.checked;
            cb.addEventListener('change', function() {
                saveSnapshot();
                node.checked = cb.checked;
                el.dataset.checked = String(cb.checked);
                scheduleSyncToHost();
            });
            cbWrap.appendChild(cb);
            el.appendChild(cbWrap);
        }

        // ページアイコン
        if (node.isPage) {
            var pageIcon = document.createElement('div');
            pageIcon.className = 'outliner-page-icon';
            pageIcon.textContent = '\uD83D\uDCC4'; // 📄
            pageIcon.addEventListener('click', function(e) {
                e.stopPropagation();
                openPage(node.id);
            });
            el.appendChild(pageIcon);
        }

        // テキスト
        var textEl = document.createElement('div');
        textEl.className = 'outliner-text';
        textEl.contentEditable = 'true';
        textEl.spellcheck = false;
        textEl.innerHTML = renderInlineText(node.text);
        textEl.dataset.nodeId = node.id;

        textEl.addEventListener('focus', function() {
            setFocusedNode(node.id);
            // 編集モードに切替: マーカーを生テキストで表示 (フォーマットは非適用)
            var sourceText = node.text || '';
            var renderedOff = getCursorOffset(textEl);
            textEl.innerHTML = renderEditingText(sourceText);
            if (renderedOff > 0) {
                var sourceOff = renderedOffsetToSource(sourceText, renderedOff);
                setCursorAtOffset(textEl, sourceOff);
            }
        });
        textEl.addEventListener('blur', function() {
            // 表示モードに切替: フルフォーマット適用
            textEl.innerHTML = renderInlineText(node.text || '');
        });

        textEl.addEventListener('mousedown', function(e) {
            if (e.shiftKey && focusedNodeId && focusedNodeId !== node.id) {
                // Shift+Click: 範囲選択
                e.preventDefault();
                if (!selectionAnchorId) { selectionAnchorId = focusedNodeId; }
                selectRange(selectionAnchorId, node.id);
            } else if (!e.shiftKey) {
                // 通常クリック: 選択クリア
                clearSelection();
            }
        });

        // タグダブルクリック検索
        textEl.addEventListener('dblclick', function(e) {
            var tag = e.target.closest('.outliner-tag');
            if (tag) {
                e.preventDefault();
                e.stopPropagation();
                pushNavState();
                isNavigating = true;
                searchInput.value = tag.textContent;
                executeSearch();
                isNavigating = false;
                updateNavButtons();
                searchInput.focus();
            }
        });

        var isComposing = false;
        textEl.addEventListener('compositionstart', function() { isComposing = true; });
        textEl.addEventListener('compositionend', function() {
            isComposing = false;
            // IME確定後に編集モード再描画 (タグのみ)
            var plainText = getPlainText(textEl);
            model.updateText(node.id, plainText);
            var off = getCursorOffset(textEl);
            textEl.innerHTML = renderEditingText(plainText);
            setCursorAtOffset(textEl, off);
            scheduleSyncToHost();
        });
        textEl.addEventListener('input', function() {
            var plainText = getPlainText(textEl);
            model.updateText(node.id, plainText);
            if (!isComposing) {
                // 編集モード再描画 (タグのみハイライト、マーカーは生表示)
                var off = getCursorOffset(textEl);
                textEl.innerHTML = renderEditingText(plainText);
                setCursorAtOffset(textEl, off);
            }
            scheduleSyncToHost();
        });

        textEl.addEventListener('paste', function(e) {
            handleNodePaste(e, node.id, textEl);
        });

        textEl.addEventListener('keydown', function(e) {
            handleNodeKeydown(e, node.id, textEl);
        });

        // コンテンツラッパー (テキスト + サブテキスト)
        var contentEl = document.createElement('div');
        contentEl.className = 'outliner-node-content';
        contentEl.appendChild(textEl);

        // サブテキスト
        var subtextEl = document.createElement('div');
        subtextEl.className = 'outliner-subtext';
        subtextEl.dataset.nodeId = node.id;
        if (node.subtext) {
            subtextEl.classList.add('has-content');
            subtextEl.textContent = getSubtextPreview(node.subtext);
        }

        subtextEl.addEventListener('focus', function() {
            // 編集モード: 全文表示
            subtextEl.classList.add('is-editing');
            subtextEl.classList.add('has-content');
            subtextEl.textContent = node.subtext || '';
        });

        subtextEl.addEventListener('blur', function() {
            // モデル更新
            var raw = getSubtextPlainText(subtextEl);
            model.updateSubtext(node.id, raw);
            // 省略表示に切替
            subtextEl.classList.remove('is-editing');
            if (raw) {
                subtextEl.classList.add('has-content');
                subtextEl.textContent = getSubtextPreview(raw);
            } else {
                subtextEl.classList.remove('has-content');
                subtextEl.textContent = '';
            }
            scheduleSyncToHost();
        });

        subtextEl.addEventListener('input', function() {
            // リアルタイムでモデル更新
            var raw = getSubtextPlainText(subtextEl);
            model.updateSubtext(node.id, raw);
            scheduleSyncToHost();
        });

        subtextEl.addEventListener('keydown', function(e) {
            handleSubtextKeydown(e, node.id, subtextEl, textEl);
        });

        contentEl.appendChild(subtextEl);
        el.appendChild(contentEl);
        return el;
    }

    /** contenteditable要素から改行を正規化してプレーンテキストを取得 */
    function getSubtextPlainText(element) {
        var result = '';
        var children = element.childNodes;
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.nodeType === 1 && child.tagName === 'BR') {
                result += '\n';
            } else if (child.nodeType === 3) {
                result += child.textContent;
            } else if (child.nodeType === 1) {
                // div等のブロック要素（ブラウザが挿入する場合がある）
                if (result.length > 0 && result[result.length - 1] !== '\n') {
                    result += '\n';
                }
                result += getSubtextPlainText(child);
            }
        }
        return result;
    }

    /** サブテキストの省略表示テキストを生成 */
    function getSubtextPreview(subtext) {
        if (!subtext) { return ''; }
        var firstLine = subtext.split('\n')[0];
        var hasMore = subtext.indexOf('\n') >= 0;
        return hasMore ? firstLine + ' ...' : firstLine;
    }

    /** プレーンテキストからインラインMarkdownをHTMLに変換 */
    function renderInlineText(text) {
        if (!text) { return ''; }

        // エスケープ
        var html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // インラインコード (先に処理してコード内を保護)
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 太字
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // 斜体 — **の一部である*にマッチしないよう lookbehind/lookahead を使用
        html = html.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>');

        // 取り消し線
        html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // リンク
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" title="$2">$1</a>');

        // タグ (#tag / @tag) — \w では日本語にマッチしないため Unicode プロパティを使用
        html = html.replace(/(?<![&#\w\p{L}])([#@][\w\p{L}][\w\p{L}-]*)/gu, '<span class="outliner-tag">$1</span>');

        // 末尾スペースをNBSPに変換 (contenteditableで末尾空白が描画されない問題を回避)
        html = html.replace(/ $/, '\u00A0');

        return html;
    }

    /**
     * ソーステキスト（マーカー付き）からマーカーを除去してレンダリング後テキストを返す。
     * renderInlineText と同じ正規表現順序で処理する。
     */
    function stripInlineMarkers(text) {
        if (!text) { return ''; }
        text = text.replace(/`([^`]+)`/g, '$1');
        text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
        text = text.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '$1');
        text = text.replace(/~~([^~]+)~~/g, '$1');
        return text;
    }

    /**
     * 編集モード用のテキストレンダリング。
     * マーカー(*、**、~~、`)はそのまま表示し、タグのみハイライトする。
     * textContent がソーステキストと一致するため、オフセット計算が安全。
     */
    function renderEditingText(text) {
        if (!text) { return ''; }
        var html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // タグのみハイライト (テキスト内容を変えないのでオフセットに影響なし)
        html = html.replace(/(?<![&#\w\p{L}])([#@][\w\p{L}][\w\p{L}-]*)/gu, '<span class="outliner-tag">$1</span>');
        // 末尾スペースをNBSPに変換
        html = html.replace(/ $/, '\u00A0');
        return html;
    }

    /**
     * レンダリング後テキストのオフセットをソーステキストのオフセットに変換する。
     * sourceText: マーカー付きテキスト, renderedOffset: マーカー除去後のオフセット
     */
    function renderedOffsetToSource(sourceText, renderedOffset) {
        var rendered = stripInlineMarkers(sourceText);
        var map = buildRenderedToSourceMap(sourceText, rendered);
        if (renderedOffset >= map.length) { return sourceText.length; }
        return map[renderedOffset];
    }

    /**
     * ソーステキストのオフセットをレンダリング後テキストのオフセットに変換する。
     */
    function sourceOffsetToRendered(sourceText, sourceOffset) {
        var rendered = stripInlineMarkers(sourceText);
        var map = buildRenderedToSourceMap(sourceText, rendered);
        // mapの中からsourceOffset以上の最初のエントリのインデックスを返す
        for (var i = 0; i < map.length; i++) {
            if (map[i] >= sourceOffset) { return i; }
        }
        return rendered.length;
    }

    /**
     * レンダリング後テキストの各位置がソーステキストのどの位置に対応するかのマップを構築。
     * map[renderedPos] = sourcePos
     */
    function buildRenderedToSourceMap(sourceText, renderedText) {
        var map = [];
        var si = 0;
        for (var ri = 0; ri < renderedText.length; ri++) {
            while (si < sourceText.length && sourceText[si] !== renderedText[ri]) {
                si++;
            }
            map.push(si);
            si++;
        }
        // 末尾位置
        map.push(sourceText.length);
        return map;
    }

    /** contenteditable からプレーンテキストを取得 (NBSPは通常スペースに正規化) */
    function getPlainText(el) {
        return (el.textContent || '').replace(/\u00A0/g, ' ');
    }

    /**
     * インラインフォーマット適用 (Cmd+B/I/E, Cmd+Shift+S)
     * テキスト選択中: 選択範囲をマーカーで囲む / すでに囲まれていたら除去
     * 選択なし: カーソル位置にマーカーペアを挿入してその間にカーソル配置
     */
    function applyInlineFormat(nodeId, textEl, marker) {
        var node = model.getNode(nodeId);
        if (!node) { return; }
        var text = node.text;
        var sel = window.getSelection();
        var off = getCursorOffset(textEl);

        if (sel && !sel.isCollapsed) {
            // 選択範囲あり (編集モードなのでオフセットはソーステキスト空間)
            var range = sel.getRangeAt(0);
            var preRange = range.cloneRange();
            preRange.selectNodeContents(textEl);
            preRange.setEnd(range.startContainer, range.startOffset);
            var startOff = preRange.toString().length;
            var endOff = startOff + range.toString().length;

            var selected = text.slice(startOff, endOff);
            var before = text.slice(0, startOff);
            var after = text.slice(endOff);

            // トグル: すでにマーカーで囲まれている場合は除去
            if (before.endsWith(marker) && after.startsWith(marker)) {
                // ケース1: マーカーが選択範囲の外側にある (例: **|text|**)
                var newText = before.slice(0, -marker.length) + selected + after.slice(marker.length);
                model.updateText(nodeId, newText);
                textEl.innerHTML = renderEditingText(newText);
                setCursorAtOffset(textEl, endOff - marker.length);
            } else if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length > 2 * marker.length) {
                // ケース2: マーカーが選択範囲の内側にある (例: |**text**| を選択してCmd+B)
                var stripped = selected.slice(marker.length, -marker.length);
                var newText1b = before + stripped + after;
                model.updateText(nodeId, newText1b);
                textEl.innerHTML = renderEditingText(newText1b);
                setCursorAtOffset(textEl, startOff + stripped.length);
            } else {
                var newText2 = before + marker + selected + marker + after;
                model.updateText(nodeId, newText2);
                textEl.innerHTML = renderEditingText(newText2);
                // カーソルを閉じマーカーの直後に配置
                setCursorAtOffset(textEl, endOff + 2 * marker.length);
            }
        } else {
            // 選択なし: マーカーペア挿入
            var newText3 = text.slice(0, off) + marker + marker + text.slice(off);
            model.updateText(nodeId, newText3);
            textEl.innerHTML = renderEditingText(newText3);
            setCursorAtOffset(textEl, off + marker.length);
        }
        scheduleSyncToHost();
    }

    // --- カーソル操作 ---

    function setCursorToEnd(el) {
        var range = document.createRange();
        var sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function setCursorToStart(el) {
        var range = document.createRange();
        var sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function setCursorAtOffset(el, offset) {
        var range = document.createRange();
        var sel = window.getSelection();
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        var textNode = walker.nextNode();
        if (!textNode) {
            range.selectNodeContents(el);
            range.collapse(true);
        } else {
            var pos = 0;
            do {
                var len = textNode.textContent.length;
                if (pos + len >= offset) {
                    range.setStart(textNode, offset - pos);
                    range.collapse(true);
                    break;
                }
                pos += len;
            } while ((textNode = walker.nextNode()));
            if (!textNode) {
                range.selectNodeContents(el);
                range.collapse(false);
            }
        }
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function getCursorOffset(el) {
        var sel = window.getSelection();
        if (!sel.rangeCount) { return 0; }
        var range = sel.getRangeAt(0);
        var preRange = range.cloneRange();
        preRange.selectNodeContents(el);
        preRange.setEnd(range.startContainer, range.startOffset);
        return preRange.toString().length;
    }

    // --- フォーカス管理 ---

    function setFocusedNode(nodeId) {
        if (focusedNodeId === nodeId) { return; }
        if (focusedNodeId) {
            var prevEl = treeEl.querySelector('.outliner-node[data-id="' + focusedNodeId + '"]');
            if (prevEl) {
                prevEl.classList.remove('is-focused');
                // 前ノードのsubtextをプレビュー表示に戻す
                var prevSubtext = prevEl.querySelector('.outliner-subtext');
                if (prevSubtext && !prevSubtext.classList.contains('is-editing')) {
                    var prevNode = model.getNode(focusedNodeId);
                    if (prevNode && prevNode.subtext) {
                        prevSubtext.textContent = getSubtextPreview(prevNode.subtext);
                    }
                }
            }
        }
        focusedNodeId = nodeId;
        var el = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"]');
        if (el) {
            el.classList.add('is-focused');
            // フォーカスしたノードのsubtextを全文表示
            var subtextEl = el.querySelector('.outliner-subtext');
            if (subtextEl && !subtextEl.classList.contains('is-editing')) {
                var focusNode = model.getNode(nodeId);
                if (focusNode && focusNode.subtext) {
                    subtextEl.textContent = focusNode.subtext;
                }
            }
        }
    }

    // --- 複数ノード選択管理 ---

    /** 選択をクリアしてDOM反映 */
    function clearSelection() {
        selectedNodeIds.forEach(function(id) {
            var el = treeEl.querySelector('.outliner-node[data-id="' + id + '"]');
            if (el) { el.classList.remove('is-selected'); }
        });
        selectedNodeIds.clear();
        selectionAnchorId = null;
    }

    /** DOMの選択ハイライトだけクリア (anchorはリセットしない) */
    function clearSelectionVisual() {
        selectedNodeIds.forEach(function(id) {
            var el = treeEl.querySelector('.outliner-node[data-id="' + id + '"]');
            if (el) { el.classList.remove('is-selected'); }
        });
        selectedNodeIds.clear();
    }

    /** 指定範囲のノードを選択 (fromId〜toId の表示順) */
    function selectRange(fromId, toId) {
        clearSelectionVisual();  // anchorを維持したままビジュアルだけクリア
        var flat = model.getFlattenedIds(true);
        var i1 = flat.indexOf(fromId);
        var i2 = flat.indexOf(toId);
        if (i1 < 0 || i2 < 0) { return; }
        var start = Math.min(i1, i2);
        var end = Math.max(i1, i2);
        for (var i = start; i <= end; i++) {
            selectedNodeIds.add(flat[i]);
            var el = treeEl.querySelector('.outliner-node[data-id="' + flat[i] + '"]');
            if (el) { el.classList.add('is-selected'); }
        }
    }

    /** 選択中ノードのテキストをインデント付きで取得 (表示順) */
    function getSelectedText() {
        var flat = model.getFlattenedIds(true);
        // 選択ノードの最小深さを求めて相対インデントにする
        var minDepth = Infinity;
        var selectedFlat = [];
        for (var i = 0; i < flat.length; i++) {
            if (selectedNodeIds.has(flat[i])) {
                var depth = model.getDepth(flat[i]);
                if (depth < minDepth) { minDepth = depth; }
                selectedFlat.push(flat[i]);
            }
        }
        var lines = [];
        for (var j = 0; j < selectedFlat.length; j++) {
            var node = model.getNode(selectedFlat[j]);
            if (!node) { continue; }
            var relDepth = model.getDepth(selectedFlat[j]) - minDepth;
            var indent = '';
            for (var k = 0; k < relDepth; k++) { indent += '\t'; }
            lines.push(indent + node.text);
        }
        return lines.join('\n');
    }

    /** 選択中ノードを削除 */
    function deleteSelectedNodes() {
        if (selectedNodeIds.size === 0) { return; }
        saveSnapshot();
        var flat = model.getFlattenedIds(true);
        // 最初の選択ノードの前のノードにフォーカスを戻す
        var firstIdx = -1;
        for (var i = 0; i < flat.length; i++) {
            if (selectedNodeIds.has(flat[i])) { firstIdx = i; break; }
        }
        var focusTarget = firstIdx > 0 ? flat[firstIdx - 1] : null;
        // 逆順で削除 (子→親の順)
        for (var j = flat.length - 1; j >= 0; j--) {
            if (selectedNodeIds.has(flat[j])) {
                model.removeNode(flat[j]);
            }
        }
        clearSelection();
        // スコープ対象ノードが削除された場合、ドキュメントスコープに戻す
        if (currentScope.type === 'subtree' && !model.getNode(currentScope.rootId)) {
            setScope({ type: 'document' });
        }
        renderTree();
        if (focusTarget && model.getNode(focusTarget)) {
            focusNode(focusTarget);
        } else if (model.rootIds.length > 0) {
            focusNode(model.rootIds[0]);
        }
        scheduleSyncToHost();
    }

    /** paste イベントハンドラ (keydownではなくpasteイベントで処理) */
    function handleNodePaste(e, nodeId, textEl) {
        var clipText = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
        if (!clipText) { return; }

        e.preventDefault();

        var node = model.getNode(nodeId);
        if (!node) { return; }

        // 複数選択時: 選択ノードを置換
        if (selectedNodeIds.size > 0) {
            saveSnapshot();
            var flat = model.getFlattenedIds(true);
            var firstIdx = -1;
            for (var fi = 0; fi < flat.length; fi++) {
                if (selectedNodeIds.has(flat[fi])) { firstIdx = fi; break; }
            }
            var insertParentId = null;
            var insertAfter = firstIdx > 0 ? flat[firstIdx - 1] : null;
            var firstSelected = flat[firstIdx];
            var firstSelNode = model.getNode(firstSelected);
            if (firstSelNode) { insertParentId = firstSelNode.parentId; }
            for (var di = flat.length - 1; di >= 0; di--) {
                if (selectedNodeIds.has(flat[di])) { model.removeNode(flat[di]); }
            }
            clearSelection();
            pasteNodesFromText(clipText, insertParentId, insertAfter);
            return;
        }

        // 単一行: 現在ノードのカーソル位置に挿入
        if (!clipText.includes('\n')) {
            saveSnapshot();
            var curOff = getCursorOffset(textEl);
            var curText = node.text || '';
            var newSingleText = curText.slice(0, curOff) + clipText + curText.slice(curOff);
            model.updateText(nodeId, newSingleText);
            textEl.innerHTML = renderEditingText(newSingleText);
            setCursorAtOffset(textEl, curOff + clipText.length);
            scheduleSyncToHost();
            return;
        }

        // 複数行: インデント構造を保持して一括挿入
        saveSnapshot();
        var currentText = (node.text || '').trim();

        if (currentText === '') {
            // 空ノード: 現在ノードを削除して、全行を pasteNodesFromText で挿入
            var parentId = node.parentId;
            // 同じ親の兄弟リストから直前のノードを探す
            var siblings = parentId ? (model.getNode(parentId).children || []) : model.rootIds;
            var sibIdx = siblings.indexOf(nodeId);
            var insertAfterForEmpty = sibIdx > 0 ? siblings[sibIdx - 1] : null;
            model.removeNode(nodeId);
            pasteNodesFromText(clipText, parentId, insertAfterForEmpty);
        } else {
            // テキストありノード: 現在ノードの後に全行を挿入
            pasteNodesFromText(clipText, node.parentId, nodeId);
        }
    }

    /** インデント付きテキストからノード階層を構築してモデルに追加 */
    function pasteNodesFromText(text, baseParentId, afterId) {
        var lines = text.split('\n');
        if (lines.length === 0) { return; }

        // 各行のインデントレベルを計算
        // 内部コピー形式はタブ区切り。外部ペースト(スペースのみ)にも対応。
        // タブの後のスペースはテキストの一部として扱う。
        var parsed = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var tabs = 0;
            var j = 0;
            var sawTab = false;
            while (j < line.length) {
                if (line[j] === '\t') { tabs++; j++; sawTab = true; }
                else if (line[j] === ' ' && !sawTab) {
                    // スペースのみの行（外部ペースト）: 2〜4スペースを1レベルとして扱う
                    var spaceCount = 0;
                    while (j < line.length && line[j] === ' ') { spaceCount++; j++; }
                    tabs += Math.max(1, Math.round(spaceCount / 2));
                }
                else { break; }
            }
            var content = line.substring(j);
            if (content === '' && i === lines.length - 1) { continue; } // 最終空行スキップ
            parsed.push({ level: tabs, text: content });
        }
        if (parsed.length === 0) { return; }

        // 最小レベルを0に正規化
        var minLevel = Infinity;
        for (var p = 0; p < parsed.length; p++) {
            if (parsed[p].level < minLevel) { minLevel = parsed[p].level; }
        }
        for (var q = 0; q < parsed.length; q++) {
            parsed[q].level -= minLevel;
        }

        // ツリー構造の正規化: 先頭行はlevel 0、各行は前行+1以下に制約
        // (先頭行がlevel 0でない場合、有効な親がなくツリーが壊れるため)
        if (parsed.length > 0 && parsed[0].level > 0) {
            var cap = 0;
            for (var r = 0; r < parsed.length; r++) {
                if (parsed[r].level > cap) {
                    parsed[r].level = cap;
                }
                cap = parsed[r].level + 1;
            }
        }

        // ノード作成 (レベルに応じて親子関係を設定)
        // levelToLastId[level] = そのレベルで最後に作成されたノードID
        var levelToLastId = {};
        var lastId = null;

        for (var n = 0; n < parsed.length; n++) {
            var level = parsed[n].level;
            var parentId = null;
            var after = null;

            if (level === 0) {
                // ベースレベル: 指定された親の子として追加
                parentId = baseParentId;
                after = (n === 0) ? afterId : levelToLastId[0] || afterId;
            } else {
                // 子レベル: 直近の (level-1) ノードの子として追加
                parentId = levelToLastId[level - 1] || baseParentId;
                after = null; // 親の子リスト末尾に追加
            }

            var newNode = model.addNode(parentId, after, parsed[n].text);
            levelToLastId[level] = newNode.id;
            lastId = newNode.id;
            // 深いレベルをクリア (新しい親が変わったため)
            for (var cl = level + 1; cl <= 10; cl++) {
                delete levelToLastId[cl];
            }
        }

        renderTree();
        if (lastId) { focusNode(lastId); }
        scheduleSyncToHost();
    }

    function focusNode(nodeId) {
        var nodeEl = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"]');
        if (!nodeEl) { return; }
        var textEl = nodeEl.querySelector('.outliner-text');
        if (textEl) {
            setFocusedNode(nodeId);
            textEl.focus();
            setCursorToEnd(textEl);
        }
    }

    function focusNodeAtStart(nodeId) {
        var nodeEl = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"]');
        if (!nodeEl) { return; }
        var textEl = nodeEl.querySelector('.outliner-text');
        if (textEl) {
            setFocusedNode(nodeId);
            textEl.focus();
            setCursorToStart(textEl);
        }
    }

    /** 表示されている最初のノードにフォーカス（先頭にカーソル） */
    function focusFirstVisibleNode() {
        var firstNodeEl = treeEl.querySelector('.outliner-node');
        if (firstNodeEl) {
            focusNodeElAtStart(firstNodeEl);
        }
    }

    /** DOM上で前のノード要素を取得（現在のDOM要素から探索、重複ID・collapsed対応） */
    function getDomPrevNodeEl(currentTextEl) {
        var currentNodeEl = currentTextEl.closest('.outliner-node');
        if (!currentNodeEl) { return null; }
        var allNodes = treeEl.querySelectorAll('.outliner-node');
        for (var i = 0; i < allNodes.length; i++) {
            if (allNodes[i] === currentNodeEl) {
                for (var j = i - 1; j >= 0; j--) {
                    if (!allNodes[j].closest('.is-collapsed')) { return allNodes[j]; }
                }
                return null;
            }
        }
        return null;
    }

    /** DOM上で次のノード要素を取得（現在のDOM要素から探索、重複ID・collapsed対応） */
    function getDomNextNodeEl(currentTextEl) {
        var currentNodeEl = currentTextEl.closest('.outliner-node');
        if (!currentNodeEl) { return null; }
        var allNodes = treeEl.querySelectorAll('.outliner-node');
        for (var i = 0; i < allNodes.length; i++) {
            if (allNodes[i] === currentNodeEl) {
                for (var j = i + 1; j < allNodes.length; j++) {
                    if (!allNodes[j].closest('.is-collapsed')) { return allNodes[j]; }
                }
                return null;
            }
        }
        return null;
    }

    /** DOM要素を直接フォーカス（重複ID問題を回避） */
    function focusNodeEl(nodeEl) {
        if (!nodeEl) { return; }
        var textEl = nodeEl.querySelector('.outliner-text');
        if (textEl) {
            var nodeId = nodeEl.dataset.id;
            if (nodeId) { setFocusedNode(nodeId); }
            textEl.focus();
            setCursorToEnd(textEl);
        }
    }

    /** DOM要素を直接フォーカス（先頭にカーソル、重複ID問題を回避） */
    function focusNodeElAtStart(nodeEl) {
        if (!nodeEl) { return; }
        var textEl = nodeEl.querySelector('.outliner-text');
        if (textEl) {
            var nodeId = nodeEl.dataset.id;
            if (nodeId) { setFocusedNode(nodeId); }
            textEl.focus();
            setCursorToStart(textEl);
        }
    }

    // --- キーハンドラ ---

    function handleNodeKeydown(e, nodeId, textEl) {
        // IME composing中は全てのキー操作を無視
        if (e.isComposing || e.keyCode === 229) { return; }

        var node = model.getNode(nodeId);
        if (!node) { return; }

        // スコープヘッダーノードかどうか判定
        var isScopeHeader = (currentScope.type === 'subtree' && currentScope.rootId === nodeId);

        var offset = getCursorOffset(textEl);
        var textLen = (textEl.textContent || '').length;
        var isAtStart = (offset === 0);
        var isAtEnd = (offset >= textLen);

        // 選択状態でShift/Ctrl/Meta以外のキーが押されたら選択をクリア
        // (ただし Shift+Arrow, Cmd+C/X/V/A, Backspace/Delete は除く)
        if (selectedNodeIds.size > 0 && !e.shiftKey && !e.metaKey && !e.ctrlKey
            && e.key !== 'Backspace' && e.key !== 'Delete') {
            clearSelection();
        }

        switch (e.key) {
            case 'Enter':
                // Cmd+Enter: ページを開く (ページノードのみ)
                if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    var pageNode = model.getNode(nodeId);
                    if (pageNode && pageNode.isPage) {
                        openPage(nodeId);
                    }
                    return;
                }
                e.preventDefault();
                // @page チェック (Enter確定時)
                if (model.checkPageTrigger(nodeId)) {
                    makePage(nodeId);
                    renderTree();
                    focusNode(nodeId);
                    scheduleSyncToHost();
                    return;
                }
                saveSnapshot();
                if (e.altKey) {
                    // Option+Enter: 子ノードとして追加 (既に子がいれば先頭に)
                    handleShiftEnter(node, textEl, offset);
                } else if (e.shiftKey) {
                    // Shift+Enter: サブテキスト追加/フォーカス
                    openSubtext(nodeId);
                } else if (isScopeHeader) {
                    // スコープヘッダー: Enterで子ノード追加（兄弟追加はスコープ外になるため）
                    handleScopeHeaderEnter(node, textEl, offset);
                } else {
                    handleEnter(node, textEl, offset);
                }
                break;

            case ' ':
                // タグspan内でSpaceを押した場合、spanの外に脱出+スペース挿入
                var sel = window.getSelection();
                if (sel.rangeCount) {
                    var r = sel.getRangeAt(0);
                    var tagSpan = r.startContainer.parentElement;
                    if (!tagSpan) { tagSpan = r.startContainer; }
                    if (tagSpan.classList && tagSpan.classList.contains('outliner-tag')) {
                        e.preventDefault();
                        // spanの直後にNBSP+通常スペースを挿入
                        // (末尾空白が描画されない問題を回避するためNBSPを使用)
                        var spaceNode = document.createTextNode('\u00A0');
                        tagSpan.parentNode.insertBefore(spaceNode, tagSpan.nextSibling);
                        var newRange = document.createRange();
                        newRange.setStart(spaceNode, 1);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        // モデルはNBSPを通常スペースとして保存
                        var updatedText = getPlainText(textEl).replace(/\u00A0/g, ' ');
                        model.updateText(nodeId, updatedText);
                        scheduleSyncToHost();
                        return;
                    }
                }
                // Space 確定時に @page チェック
                // デフォルト動作は許可 (preventDefault しない)
                setTimeout(function() {
                    var currentText = getPlainText(textEl);
                    model.updateText(nodeId, currentText);
                    if (model.checkPageTrigger(nodeId)) {
                        makePage(nodeId);
                        renderTree();
                        focusNode(nodeId);
                        scheduleSyncToHost();
                    }
                }, 0);
                break;

            case 'Backspace': {
                var bsSel = window.getSelection();
                var hasSelection = bsSel && !bsSel.isCollapsed;
                // スコープヘッダー: 先頭でのBackspace（親合流・削除）を禁止（選択範囲がある場合はテキスト削除を許可）
                if (isScopeHeader && isAtStart && !hasSelection) {
                    e.preventDefault();
                    break;
                }
                // 選択範囲がある場合: ブラウザのデフォルト動作（選択テキスト削除）に任せる
                // input イベントハンドラで getPlainText → model.updateText が自動同期
                if (hasSelection) {
                    saveSnapshot();
                    break;
                }
                // 以下は既存ロジック（カーソルのみの場合）
                // 先頭に空白がある場合: contenteditableでは先頭空白をBackspaceで消せないため
                // カーソルが先頭空白内(offset ≤ 空白長)にいればtrim処理
                var nodeText = node.text || '';
                var leadingSpaceLen = nodeText.length - nodeText.replace(/^\s+/, '').length;
                if (leadingSpaceLen > 0 && offset <= leadingSpaceLen) {
                    e.preventDefault();
                    saveSnapshot();
                    var trimmed = nodeText.replace(/^\s+/, '');
                    model.updateText(nodeId, trimmed);
                    textEl.innerHTML = renderEditingText(trimmed);
                    setCursorAtOffset(textEl, 0);
                    scheduleSyncToHost();
                } else if (isAtStart) {
                    e.preventDefault();
                    saveSnapshot();
                    handleBackspaceAtStart(node, textEl);
                }
                break;
            }

            case 'Tab':
                // スコープヘッダー: インデント変更を禁止
                if (isScopeHeader) {
                    e.preventDefault();
                    break;
                }
                e.preventDefault();
                if (e.shiftKey) {
                    // スコープルートの直接の子: デインデントするとスコープ外になるため禁止
                    if (currentScope.type === 'subtree' && currentScope.rootId && node.parentId === currentScope.rootId) {
                        break;
                    }
                    saveSnapshot();
                    handleShiftTab(node, textEl);
                } else {
                    saveSnapshot();
                    handleTab(node, textEl);
                }
                break;

            case 'ArrowUp':
                if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
                    // スコープヘッダー: 移動を禁止
                    if (isScopeHeader) { e.preventDefault(); break; }
                    e.preventDefault();
                    saveSnapshot();
                    if (model.moveUp(nodeId)) {
                        renderTree();
                        focusNode(nodeId);
                        scheduleSyncToHost();
                    }
                } else if (e.shiftKey) {
                    // Shift+↑: 複数ノード選択を上に拡張
                    e.preventDefault();
                    if (!selectionAnchorId) { selectionAnchorId = nodeId; }
                    var prevEl = getDomPrevNodeEl(textEl);
                    if (prevEl) {
                        var prevElId = prevEl.dataset.id;
                        if (prevElId) { selectRange(selectionAnchorId, prevElId); }
                        focusNodeEl(prevEl);
                    }
                } else {
                    e.preventDefault();
                    clearSelection();
                    var prevEl2 = getDomPrevNodeEl(textEl);
                    if (prevEl2) { focusNodeEl(prevEl2); }
                }
                break;

            case 'ArrowDown':
                if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
                    // スコープヘッダー: 移動を禁止
                    if (isScopeHeader) { e.preventDefault(); break; }
                    e.preventDefault();
                    saveSnapshot();
                    if (model.moveDown(nodeId)) {
                        renderTree();
                        focusNode(nodeId);
                        scheduleSyncToHost();
                    }
                } else if (e.shiftKey) {
                    // Shift+↓: 複数ノード選択を下に拡張
                    e.preventDefault();
                    if (!selectionAnchorId) { selectionAnchorId = nodeId; }
                    var nextEl = getDomNextNodeEl(textEl);
                    if (nextEl) {
                        var nextElId = nextEl.dataset.id;
                        if (nextElId) { selectRange(selectionAnchorId, nextElId); }
                        focusNodeEl(nextEl);
                    }
                } else {
                    e.preventDefault();
                    clearSelection();
                    var nextEl2 = getDomNextNodeEl(textEl);
                    if (nextEl2) { focusNodeEl(nextEl2); }
                }
                break;

            case 'ArrowLeft':
                if (isAtStart && node.children && node.children.length > 0 && !node.collapsed) {
                    e.preventDefault();
                    toggleCollapse(nodeId);
                }
                break;

            case 'ArrowRight':
                if (isAtEnd && node.collapsed) {
                    e.preventDefault();
                    toggleCollapse(nodeId);
                }
                break;

            case 'Escape':
                e.preventDefault();
                if (currentSearchResult) {
                    clearSearch();
                }
                break;

            case 'z':
                if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
                    e.preventDefault();
                    undo();
                    return;
                }
                if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
                    e.preventDefault();
                    redo();
                    return;
                }
                break;

            case 'y':
                if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    redo();
                    return;
                }
                break;
        }

        // 複数選択時の Backspace/Delete で選択ノードを削除
        if ((e.key === 'Backspace' || e.key === 'Delete') && selectedNodeIds.size > 0) {
            e.preventDefault();
            deleteSelectedNodes();
            return;
        }

        // Cmd+] スコープイン / Cmd+Shift+] スコープアウト (e.code で判定 — JISキーボード等で e.key が異なるため)
        if ((e.metaKey || e.ctrlKey) && (e.key === ']' || e.code === 'BracketRight')) {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
                setScope({ type: 'document' });
            } else {
                if (focusedNodeId) { setScope({ type: 'subtree', rootId: focusedNodeId }); }
            }
            return;
        }

        // その他ショートカット
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
            switch (e.key) {
                case 's':
                    e.preventDefault();
                    syncToHostImmediate();
                    host.save();
                    break;
                case 'f':
                    e.preventDefault();
                    searchInput.focus();
                    searchInput.select();
                    break;
                case '.':
                    e.preventDefault();
                    toggleCollapse(nodeId);
                    break;
                case 'c':
                    if (selectedNodeIds.size > 0) {
                        // 複数選択時はノードテキストをコピー
                        e.preventDefault();
                        navigator.clipboard.writeText(getSelectedText());
                    } else {
                        // 単一ノード: テキスト選択があればブラウザデフォルト、
                        // なければノード全体のテキストをコピー
                        var selC = window.getSelection();
                        if (!selC || selC.isCollapsed) {
                            e.preventDefault();
                            navigator.clipboard.writeText(node.text || '');
                        }
                    }
                    break;
                case 'x':
                    if (selectedNodeIds.size > 0) {
                        // 複数選択時はカット
                        e.preventDefault();
                        navigator.clipboard.writeText(getSelectedText());
                        deleteSelectedNodes();
                    } else {
                        // 単一ノード: テキスト選択があればブラウザデフォルト、
                        // なければノード全体をカット（空にする）
                        var selX = window.getSelection();
                        if (!selX || selX.isCollapsed) {
                            e.preventDefault();
                            navigator.clipboard.writeText(node.text || '');
                            saveSnapshot();
                            model.updateText(nodeId, '');
                            textEl.innerHTML = '';
                            scheduleSyncToHost();
                        }
                    }
                    break;
                // case 'v': paste イベントで処理するため keydown では不要
                case 'a':
                    // Cmd+A: 全ノード選択
                    e.preventDefault();
                    var allIds = model.getFlattenedIds(true);
                    if (allIds.length > 0) {
                        selectionAnchorId = allIds[0];
                        selectRange(allIds[0], allIds[allIds.length - 1]);
                    }
                    break;
                case 'b':
                    // Cmd+B: 太字 (stopPropagationでVSCodeのサイドバー切替を防止)
                    e.preventDefault();
                    e.stopPropagation();
                    applyInlineFormat(nodeId, textEl, '**');
                    return;
                case 'i':
                    // Cmd+I: 斜体
                    e.preventDefault();
                    e.stopPropagation();
                    applyInlineFormat(nodeId, textEl, '*');
                    return;
                case 'e':
                    // Cmd+E: インラインコード
                    e.preventDefault();
                    e.stopPropagation();
                    applyInlineFormat(nodeId, textEl, '`');
                    return;
            }
        }

        // Cmd+Shift ショートカット
        if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
            if (e.key === 's' || e.key === 'S') {
                // Cmd+Shift+S: 取り消し線
                e.preventDefault();
                e.stopPropagation();
                applyInlineFormat(nodeId, textEl, '~~');
                return;
            }
        }
    }

    function handleEnter(node, textEl, offset) {
        var text = node.text;
        var beforeText = text.slice(0, offset);
        var afterText = text.slice(offset);

        // タスクパターン検出: "- [ ] " or "- [x] "
        if (text.match(/^[-*+] \[[ xX]\] /)) {
            var taskText = text.replace(/^[-*+] \[[ xX]\] /, '');
            var isChecked = /^[-*+] \[[xX]\] /.test(text);
            model.updateText(node.id, taskText);
            node.checked = isChecked;
            renderTree();
            focusNode(node.id);
            scheduleSyncToHost();
            return;
        }

        // 現在のテキストを前半に更新
        model.updateText(node.id, beforeText);

        // 後半で新ノード作成
        var newNode;
        if (node.children && node.children.length > 0 && !node.collapsed) {
            // 子持ち＆展開中: 子リストの先頭に挿入
            newNode = model.addNodeAtStart(node.id, afterText);
        } else {
            newNode = model.addNode(node.parentId, node.id, afterText);
        }

        // タスクノードの継承
        if (node.checked !== null && node.checked !== undefined) {
            newNode.checked = false;
        }

        renderTree();
        focusNodeAtStart(newNode.id);
        scheduleSyncToHost();
    }

    /** スコープヘッダーでのEnter: 子ノードとして追加（兄弟追加はスコープ外になるため） */
    function handleScopeHeaderEnter(node, textEl, offset) {
        var text = node.text;
        var afterText = text.slice(offset);
        // ヘッダーテキストはカーソル位置までに更新
        model.updateText(node.id, text.slice(0, offset));
        // 子ノードの先頭に新ノード追加
        var newNode = model.addNodeAtStart(node.id, afterText);
        // タスクノード継承
        if (node.checked !== null && node.checked !== undefined) {
            newNode.checked = false;
        }
        renderTree();
        focusNodeAtStart(newNode.id);
        scheduleSyncToHost();
    }

    function handleShiftEnter(node, textEl, offset) {
        var text = node.text;
        var beforeText = text.slice(0, offset);
        var afterText = text.slice(offset);

        // 現在のテキストを前半に更新
        model.updateText(node.id, beforeText);

        // 子ノードとして先頭に追加
        var newNode = model.addNodeAtStart(node.id, afterText);

        // タスクノードの継承
        if (node.checked !== null && node.checked !== undefined) {
            newNode.checked = false;
        }

        // 折りたたまれている場合は展開
        if (node.collapsed) {
            node.collapsed = false;
        }

        renderTree();
        focusNodeAtStart(newNode.id);
        scheduleSyncToHost();
    }

    /** サブテキストを開いてフォーカス */
    function openSubtext(nodeId) {
        var nodeEl = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"]');
        if (!nodeEl) { return; }
        var subtextEl = nodeEl.querySelector('.outliner-subtext');
        if (!subtextEl) { return; }

        var node = model.getNode(nodeId);
        if (!node) { return; }

        // 編集モードに切替
        subtextEl.contentEditable = 'true';
        subtextEl.classList.add('is-editing');
        subtextEl.classList.add('has-content');
        subtextEl.textContent = node.subtext || '';
        subtextEl.focus();

        // カーソルを末尾に
        var range = document.createRange();
        var sel = window.getSelection();
        range.selectNodeContents(subtextEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /** サブテキストから抜ける */
    function closeSubtext(nodeId, subtextEl) {
        var node = model.getNode(nodeId);
        if (!node) { return; }

        // テキスト保存
        var raw = getSubtextPlainText(subtextEl);
        model.updateSubtext(nodeId, raw);

        // 編集モード解除 — ノードにフォーカスが残るので全文表示にする
        subtextEl.contentEditable = 'false';
        subtextEl.classList.remove('is-editing');
        if (raw) {
            subtextEl.classList.add('has-content');
            subtextEl.textContent = raw;  // 全文表示（フォーカスノードなので省略しない）
        } else {
            subtextEl.classList.remove('has-content');
            subtextEl.textContent = '';
        }
        scheduleSyncToHost();

        // メインテキストにフォーカス戻す
        focusNode(nodeId);
    }

    /** サブテキスト用キーハンドラ */
    function handleSubtextKeydown(e, nodeId, subtextEl, textEl) {
        if (e.isComposing || e.keyCode === 229) { return; }

        if (e.key === 'Enter' && e.shiftKey) {
            // Shift+Enter: サブテキストから抜ける
            e.preventDefault();
            closeSubtext(nodeId, subtextEl);
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            // Enter: サブテキスト内で改行 (デフォルト動作を許可)
            // ただし contenteditable の改行は insertLineBreak で処理
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            closeSubtext(nodeId, subtextEl);
            return;
        }

        // Cmd+S: 保存
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            var raw = getSubtextPlainText(subtextEl);
            model.updateSubtext(nodeId, raw);
            syncToHostImmediate();
            host.save();
        }
    }

    function handleBackspaceAtStart(node, textEl) {
        var prevId = model.getPreviousVisibleId(node.id);

        if (!prevId) {
            if ((node.text || '').length === 0 && model.rootIds.length > 1) {
                var nextId = model.getNextVisibleId(node.id);
                model.removeNode(node.id);
                if (currentScope.type === 'subtree' && !model.getNode(currentScope.rootId)) {
                    setScope({ type: 'document' });
                }
                renderTree();
                if (nextId) { focusNodeAtStart(nextId); }
                scheduleSyncToHost();
            }
            return;
        }

        var prevNode = model.getNode(prevId);
        if (!prevNode) { return; }

        if ((node.text || '').length === 0 && (!node.children || node.children.length === 0)) {
            model.removeNode(node.id);
            if (currentScope.type === 'subtree' && !model.getNode(currentScope.rootId)) {
                setScope({ type: 'document' });
            }
            renderTree();
            focusNode(prevId);
            scheduleSyncToHost();
        } else {
            var prevText = prevNode.text || '';
            var curText = node.text || '';
            var cursorPos = prevText.length;

            model.updateText(prevId, prevText + curText);

            // 子ノードを前のノードに移動
            if (node.children && node.children.length > 0) {
                for (var i = 0; i < node.children.length; i++) {
                    var childId = node.children[i];
                    model.nodes[childId].parentId = prevId;
                    prevNode.children.push(childId);
                }
            }

            model.removeNode(node.id);
            if (currentScope.type === 'subtree' && !model.getNode(currentScope.rootId)) {
                setScope({ type: 'document' });
            }
            renderTree();

            var prevNodeEl = treeEl.querySelector('.outliner-node[data-id="' + prevId + '"]');
            if (prevNodeEl) {
                var prevTextEl = prevNodeEl.querySelector('.outliner-text');
                if (prevTextEl) {
                    prevTextEl.focus();
                    setCursorAtOffset(prevTextEl, cursorPos);
                }
            }
            scheduleSyncToHost();
        }
    }

    function handleTab(node, textEl) {
        if (model.indentNode(node.id)) {
            var offset = getCursorOffset(textEl);
            renderTree();
            var nodeEl = treeEl.querySelector('.outliner-node[data-id="' + node.id + '"]');
            if (nodeEl) {
                var newTextEl = nodeEl.querySelector('.outliner-text');
                if (newTextEl) {
                    newTextEl.focus();
                    setCursorAtOffset(newTextEl, offset);
                }
            }
            scheduleSyncToHost();
        }
    }

    function handleShiftTab(node, textEl) {
        if (model.outdentNode(node.id)) {
            var offset = getCursorOffset(textEl);
            renderTree();
            var nodeEl = treeEl.querySelector('.outliner-node[data-id="' + node.id + '"]');
            if (nodeEl) {
                var newTextEl = nodeEl.querySelector('.outliner-text');
                if (newTextEl) {
                    newTextEl.focus();
                    setCursorAtOffset(newTextEl, offset);
                }
            }
            scheduleSyncToHost();
        }
    }

    // --- 折りたたみ ---

    function toggleCollapse(nodeId) {
        var node = model.getNode(nodeId);
        if (!node || !node.children || node.children.length === 0) { return; }

        node.collapsed = !node.collapsed;

        var childrenEl = treeEl.querySelector('.outliner-children[data-parent="' + nodeId + '"]');
        if (childrenEl) {
            if (node.collapsed) {
                childrenEl.classList.add('is-collapsed');
            } else {
                childrenEl.classList.remove('is-collapsed');
            }
        }

        var bulletEl = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"] .outliner-bullet');
        if (bulletEl) {
            if (node.collapsed) {
                bulletEl.dataset.collapsed = 'true';
            } else {
                delete bulletEl.dataset.collapsed;
            }
        }

        scheduleSyncToHost();
    }

    // --- ページ機能 ---

    function makePage(nodeId) {
        saveSnapshot();
        var pageId = model.makePage(nodeId);
        if (!pageId) { return; }

        host.makePage(nodeId, pageId, model.getNode(nodeId).text);
        renderTree();
        scheduleSyncToHost();
    }

    function removePage(nodeId) {
        saveSnapshot();
        var pageId = model.removePage(nodeId);
        if (pageId) {
            host.removePage(nodeId, pageId);
        }
        renderTree();
        scheduleSyncToHost();
    }

    /** ページノードクリック → ホストにサイドパネルで開くよう要求 */
    function openPage(nodeId) {
        var node = model.getNode(nodeId);
        if (!node || !node.isPage || !node.pageId) { return; }
        sidePanelOriginNodeId = nodeId;
        host.openPageInSidePanel(nodeId, node.pageId);
    }

    // --- ページタイトル ---

    function setupPageTitle() {
        var isComposing = false;
        pageTitleInput.addEventListener('compositionstart', function() {
            isComposing = true;
        });
        pageTitleInput.addEventListener('compositionend', function() {
            isComposing = false;
            model.title = pageTitleInput.value;
            scheduleSyncToHost();
        });
        pageTitleInput.addEventListener('input', function() {
            if (!isComposing) {
                model.title = pageTitleInput.value;
                scheduleSyncToHost();
            }
        });
        // Enterでツリーにフォーカス移動
        pageTitleInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                focusFirstVisibleNode();
            }
        });
    }

    // --- 検索 ---

    var searchClearBtn = null;

    function updateSearchClearButton() {
        if (searchClearBtn) {
            searchClearBtn.style.display = (searchInput && searchInput.value.length > 0) ? '' : 'none';
        }
    }

    function setupSearchBar() {
        if (!searchInput) { return; }

        // クリアボタン
        searchClearBtn = document.querySelector('.outliner-search-clear-btn');
        if (searchClearBtn) {
            searchClearBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
            searchClearBtn.addEventListener('click', function() {
                clearSearch();
                updatePinnedTagBar();
                updateSearchClearButton();
                if (focusedNodeId) { focusNode(focusedNodeId); }
            });
        }

        var debounceTimer = null;
        var isSearchComposing = false;

        searchInput.addEventListener('compositionstart', function() {
            isSearchComposing = true;
        });
        searchInput.addEventListener('compositionend', function() {
            isSearchComposing = false;
            clearTimeout(debounceTimer);
            executeSearch();
            updateSearchClearButton();
        });

        searchInput.addEventListener('input', function() {
            if (isSearchComposing) return;
            updatePinnedTagBar();
            updateSearchClearButton();
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
                executeSearch();
            }, 200);
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                clearSearch();
                if (focusedNodeId) { focusNode(focusedNodeId); }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentSearchResult && currentSearchResult.size > 0) {
                    var firstMatch = currentSearchResult.values().next().value;
                    focusNode(firstMatch);
                }
            }
        });

        // 検索モード切替ボタン
        if (searchModeToggleBtn) {
            searchModeToggleBtn.addEventListener('click', function() {
                pushNavState();
                isNavigating = true;
                searchFocusMode = !searchFocusMode;
                updateSearchModeButton();
                if (searchInput.value.trim()) {
                    executeSearch();
                }
                isNavigating = false;
                updateNavButtons();
                scheduleSyncToHost();
            });
        }

        // メニューボタン
        if (menuBtn) {
            menuBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleMenuDropdown();
            });
        }

        // Undo/Redo ボタン
        if (undoBtn) {
            undoBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
            undoBtn.addEventListener('click', function() { undo(); });
        }
        if (redoBtn) {
            redoBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
            redoBtn.addEventListener('click', function() { redo(); });
        }

        // Navigation Back/Forward ボタン
        if (navBackBtn) {
            navBackBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
            navBackBtn.addEventListener('click', function() { navigateBack(); });
        }
        if (navForwardBtn) {
            navForwardBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
            navForwardBtn.addEventListener('click', function() { navigateForward(); });
        }
    }

    function toggleMenuDropdown() {
        var existing = document.querySelector('.outliner-menu-dropdown');
        if (existing) {
            existing.remove();
            return;
        }
        var dropdown = document.createElement('div');
        dropdown.className = 'outliner-menu-dropdown';

        // Notes mode ではpageDirが自動管理のため Set page directory を非表示
        if (!document.querySelector('.notes-layout')) {
            var setPageDirItem = document.createElement('button');
            setPageDirItem.className = 'menu-item';
            setPageDirItem.textContent = i18n.outlinerSetPageDir || 'Set page directory...';
            setPageDirItem.addEventListener('click', function() {
                dropdown.remove();
                host.setPageDir();
            });
            dropdown.appendChild(setPageDirItem);
        }

        // 検索バーを基準に配置
        var searchBar = document.querySelector('.outliner-search-bar');
        searchBar.style.position = 'relative';
        searchBar.appendChild(dropdown);

        // 外側クリックで閉じる
        setTimeout(function() {
            document.addEventListener('click', function closeMenu() {
                dropdown.remove();
                document.removeEventListener('click', closeMenu);
            }, { once: true });
        }, 0);
    }

    // --- 固定タグ設定ダイアログ ---

    function openPinnedTagsDialog() {
        // オーバーレイ
        var overlay = document.createElement('div');
        overlay.className = 'pinned-tags-overlay';

        // ダイアログ
        var dialog = document.createElement('div');
        dialog.className = 'pinned-tags-dialog';

        // ヘッダー
        var header = document.createElement('div');
        header.className = 'pinned-tags-dialog-header';
        var title = document.createElement('span');
        title.textContent = i18n.outlinerPinnedTags || 'Pinned Tags';
        var closeBtn = document.createElement('button');
        closeBtn.className = 'pinned-tags-close';
        closeBtn.textContent = '\u00d7';
        closeBtn.addEventListener('click', function() { overlay.remove(); });
        header.appendChild(title);
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        // タグリスト
        var listEl = document.createElement('div');
        listEl.className = 'pinned-tags-list';
        dialog.appendChild(listEl);

        var dragSrcIdx = null;

        function renderTagList() {
            listEl.innerHTML = '';
            for (var i = 0; i < pinnedTags.length; i++) {
                (function(idx) {
                    var row = document.createElement('div');
                    row.className = 'pinned-tag-row';
                    row.draggable = true;
                    row.dataset.idx = idx;

                    // ドラッグハンドル
                    var handle = document.createElement('span');
                    handle.className = 'pinned-tag-drag-handle';
                    handle.textContent = '\u2261'; // ≡ (hamburger)

                    var input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'pinned-tag-input';
                    input.value = pinnedTags[idx];
                    input.addEventListener('change', function() {
                        var val = input.value.trim();
                        if (!val) {
                            pinnedTags.splice(idx, 1);
                            renderTagList();
                        } else {
                            if (val.charAt(0) !== '#') { val = '#' + val; }
                            pinnedTags[idx] = val;
                        }
                        updatePinnedTagBar();
                        syncToHostImmediate();
                    });
                    var delBtn = document.createElement('button');
                    delBtn.className = 'pinned-tag-delete';
                    delBtn.textContent = '\u00d7';
                    delBtn.addEventListener('click', function() {
                        pinnedTags.splice(idx, 1);
                        renderTagList();
                        updatePinnedTagBar();
                        syncToHostImmediate();
                    });

                    // D&D イベント
                    row.addEventListener('dragstart', function(e) {
                        dragSrcIdx = idx;
                        row.classList.add('is-dragging');
                        e.dataTransfer.effectAllowed = 'move';
                    });
                    row.addEventListener('dragend', function() {
                        row.classList.remove('is-dragging');
                        dragSrcIdx = null;
                        // ドロップインジケーターを全クリア
                        var rows = listEl.querySelectorAll('.pinned-tag-row');
                        for (var r = 0; r < rows.length; r++) {
                            rows[r].classList.remove('drag-over-above', 'drag-over-below');
                        }
                    });
                    row.addEventListener('dragover', function(e) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        // ドロップ位置インジケーター
                        var rect = row.getBoundingClientRect();
                        var midY = rect.top + rect.height / 2;
                        var rows = listEl.querySelectorAll('.pinned-tag-row');
                        for (var r = 0; r < rows.length; r++) {
                            rows[r].classList.remove('drag-over-above', 'drag-over-below');
                        }
                        if (e.clientY < midY) {
                            row.classList.add('drag-over-above');
                        } else {
                            row.classList.add('drag-over-below');
                        }
                    });
                    row.addEventListener('dragleave', function() {
                        row.classList.remove('drag-over-above', 'drag-over-below');
                    });
                    row.addEventListener('drop', function(e) {
                        e.preventDefault();
                        row.classList.remove('drag-over-above', 'drag-over-below');
                        if (dragSrcIdx === null || dragSrcIdx === idx) return;
                        // 挿入位置を計算
                        var rect = row.getBoundingClientRect();
                        var midY = rect.top + rect.height / 2;
                        var targetIdx = e.clientY < midY ? idx : idx + 1;
                        // 配列を並べ替え
                        var tag = pinnedTags.splice(dragSrcIdx, 1)[0];
                        if (dragSrcIdx < targetIdx) { targetIdx--; }
                        pinnedTags.splice(targetIdx, 0, tag);
                        dragSrcIdx = null;
                        renderTagList();
                        updatePinnedTagBar();
                        syncToHostImmediate();
                    });

                    row.appendChild(handle);
                    row.appendChild(input);
                    row.appendChild(delBtn);
                    listEl.appendChild(row);
                })(i);
            }
        }
        renderTagList();

        // 追加行
        var addRow = document.createElement('div');
        addRow.className = 'pinned-tags-add-row';
        var addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.className = 'pinned-tag-add-input';
        addInput.placeholder = '#tagname';
        var addBtn = document.createElement('button');
        addBtn.className = 'pinned-tag-add-btn';
        addBtn.textContent = 'Add';

        function addTag() {
            var val = addInput.value.trim();
            if (!val) { return; }
            if (val.charAt(0) !== '#') { val = '#' + val; }
            // 重複チェック
            for (var j = 0; j < pinnedTags.length; j++) {
                if (pinnedTags[j] === val) { addInput.value = ''; return; }
            }
            pinnedTags.push(val);
            addInput.value = '';
            renderTagList();
            updatePinnedTagBar();
            syncToHostImmediate();
        }

        addBtn.addEventListener('click', addTag);
        addInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); addTag(); }
        });
        addRow.appendChild(addInput);
        addRow.appendChild(addBtn);
        dialog.appendChild(addRow);

        // オーバーレイクリックで閉じる
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) { overlay.remove(); }
        });

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        addInput.focus();
    }

    function executeSearch() {
        pushNavState();
        var queryStr = searchInput.value.trim();
        if (!queryStr) {
            clearSearch();
            return;
        }
        var query = OutlinerSearch.parseQuery(queryStr);
        currentSearchResult = searchEngine.search(query, currentScope, { focusMode: searchFocusMode });
        expandCollapsedParentsForSearch();
        renderTree();
    }

    /** 検索結果にマッチした子孫を持つ折り畳み親を自動展開（展開しっぱなし） */
    function expandCollapsedParentsForSearch() {
        if (!currentSearchResult) return;
        currentSearchResult.forEach(function(nodeId) {
            var node = model.getNode(nodeId);
            if (!node) return;
            var current = node;
            while (current && current.parentId) {
                var parent = model.getNode(current.parentId);
                if (parent && parent.collapsed) {
                    parent.collapsed = false;
                }
                current = parent;
            }
        });
    }

    function clearSearch() {
        pushNavState();
        searchInput.value = '';
        currentSearchResult = null;
        renderTree();
        updateSearchClearButton();
    }

    function updateSearchModeButton() {
        if (!searchModeToggleBtn) { return; }
        searchModeToggleBtn.innerHTML = searchFocusMode ? ICON_FOCUS_MODE : ICON_TREE_MODE;
        searchModeToggleBtn.title = searchFocusMode
            ? (i18n.outlinerFocusMode || 'Focus mode: matched node + children only')
            : (i18n.outlinerTreeMode || 'Tree mode: show ancestors to root');
    }

    function updateUndoRedoButtons() {
        if (undoBtn) {
            undoBtn.disabled = (undoStack.length === 0);
        }
        if (redoBtn) {
            redoBtn.disabled = (redoStack.length === 0);
        }
    }

    // --- Navigation history ---
    function getCurrentNavState() {
        return {
            searchText: searchInput ? searchInput.value : '',
            searchFocusMode: searchFocusMode,
            scope: currentScope.type === 'subtree'
                ? { type: 'subtree', rootId: currentScope.rootId }
                : { type: 'document' }
        };
    }

    function pushNavState() {
        if (isNavigating) return;
        var entry = getCurrentNavState();
        if (navBackStack.length > 0) {
            var last = navBackStack[navBackStack.length - 1];
            if (last.searchText === entry.searchText &&
                last.searchFocusMode === entry.searchFocusMode &&
                last.scope.type === entry.scope.type &&
                last.scope.rootId === entry.scope.rootId) {
                return;
            }
        }
        navBackStack.push(entry);
        if (navBackStack.length > MAX_NAV_HISTORY) {
            navBackStack.shift();
        }
        navForwardStack.length = 0;
        updateNavButtons();
    }

    function navigateBack() {
        if (navBackStack.length === 0) return;
        navForwardStack.push(getCurrentNavState());
        var entry = navBackStack.pop();
        isNavigating = true;
        restoreNavState(entry);
        isNavigating = false;
        updateNavButtons();
    }

    function navigateForward() {
        if (navForwardStack.length === 0) return;
        navBackStack.push(getCurrentNavState());
        var entry = navForwardStack.pop();
        isNavigating = true;
        restoreNavState(entry);
        isNavigating = false;
        updateNavButtons();
    }

    function restoreNavState(entry) {
        // 1. スコープ復元
        if (entry.scope.type === 'subtree' && entry.scope.rootId) {
            if (model.getNode(entry.scope.rootId)) {
                currentScope = { type: 'subtree', rootId: entry.scope.rootId };
            } else {
                currentScope = { type: 'document' };
            }
        } else {
            currentScope = { type: 'document' };
        }
        updateBreadcrumb();
        // 2. 検索モード復元
        searchFocusMode = entry.searchFocusMode;
        updateSearchModeButton();
        // 3. 検索テキスト復元
        if (searchInput) {
            searchInput.value = entry.searchText;
        }
        // 4. 検索実行 or クリア
        if (entry.searchText.trim()) {
            var query = OutlinerSearch.parseQuery(entry.searchText);
            currentSearchResult = searchEngine.search(query, currentScope, { focusMode: searchFocusMode });
            expandCollapsedParentsForSearch();
        } else {
            currentSearchResult = null;
        }
        // 5. ツリー再描画
        renderTree();
        updatePinnedTagBar();
        updateSearchClearButton();
    }

    function updateNavButtons() {
        if (navBackBtn) { navBackBtn.disabled = (navBackStack.length === 0); }
        if (navForwardBtn) { navForwardBtn.disabled = (navForwardStack.length === 0); }
    }

    function setScope(scope) {
        pushNavState();
        var previousRootId = (currentScope.type === 'subtree') ? currentScope.rootId : null;
        currentScope = scope;
        updateBreadcrumb();
        if (searchInput.value.trim()) { executeSearch(); }
        renderTree();
        // scope out時は直前のscopeノードにカーソルを移動
        if (previousRootId && previousRootId !== scope.rootId) {
            var targetEl = treeEl.querySelector('.outliner-node[data-id="' + previousRootId + '"]');
            if (targetEl) {
                focusNodeElAtStart(targetEl);
                targetEl.scrollIntoView({ block: 'nearest' });
                return;
            }
        }
        // scope-in時: スコープヘッダーの末尾にカーソル
        if (currentScope.type === 'subtree' && currentScope.rootId) {
            focusNode(currentScope.rootId);
        } else {
            focusFirstVisibleNode();
        }
    }

    function jumpToAndHighlightNode(nodeId) {
        var node = model.getNode(nodeId);
        if (!node) return;

        // scope をリセット
        if (currentScope.type === 'subtree') {
            currentScope = { type: 'document' };
            updateBreadcrumb();
        }

        // 親ノードを展開
        var parent = model.getParent(nodeId);
        while (parent) {
            if (parent.collapsed) {
                parent.collapsed = false;
            }
            parent = model.getParent(parent.id);
        }

        renderTree();

        var el = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"]');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('outliner-search-jump-highlight');
            setTimeout(function() {
                el.classList.remove('outliner-search-jump-highlight');
            }, 2000);
        }
        focusNode(nodeId);
    }

    function updateBreadcrumb() {
        if (!breadcrumbEl) { return; }
        breadcrumbEl.innerHTML = '';
        if (currentScope.type === 'document') {
            breadcrumbEl.classList.remove('is-visible');
            return;
        }
        breadcrumbEl.classList.add('is-visible');

        // 祖先チェーンを構築 (rootから現在のスコープノードまで)
        var ancestors = [];
        var cur = model.getNode(currentScope.rootId);
        while (cur) {
            ancestors.unshift(cur);
            cur = cur.parentId ? model.getNode(cur.parentId) : null;
        }

        // TOP ボタン（先頭）
        var topBtn = document.createElement('span');
        topBtn.className = 'outliner-breadcrumb-top';
        topBtn.textContent = i18n.outlinerTop || 'TOP';
        topBtn.addEventListener('click', function() {
            setScope({ type: 'document' });
        });
        breadcrumbEl.appendChild(topBtn);

        // パンくずアイテムを生成
        for (var i = 0; i < ancestors.length; i++) {
            var sep = document.createElement('span');
            sep.className = 'outliner-breadcrumb-separator';
            sep.textContent = '›';
            breadcrumbEl.appendChild(sep);
            var item = document.createElement('span');
            item.className = 'outliner-breadcrumb-item';
            var nodeText = ancestors[i].text || '';
            // インラインマーカーを除去して表示
            item.textContent = nodeText.replace(/[*_~`]+/g, '').slice(0, 30) || '(empty)';
            item.title = nodeText;
            item.dataset.nodeId = ancestors[i].id;
            item.addEventListener('click', (function(nid) {
                return function() {
                    setScope({ type: 'subtree', rootId: nid });
                };
            })(ancestors[i].id));
            breadcrumbEl.appendChild(item);
        }
    }

    // --- コンテキストメニュー ---

    function setupContextMenu() {
        document.addEventListener('contextmenu', function(e) {
            var nodeEl = e.target.closest('.outliner-node');
            if (!nodeEl) {
                hideContextMenu();
                return;
            }
            e.preventDefault();
            showContextMenu(nodeEl.dataset.id, e.clientX, e.clientY);
        });

        document.addEventListener('click', function(e) {
            if (contextMenuEl && !contextMenuEl.contains(e.target)) {
                hideContextMenu();
            }
        });
    }

    function showContextMenu(nodeId, x, y) {
        hideContextMenu();
        var node = model.getNode(nodeId);
        if (!node) { return; }

        contextMenuEl = document.createElement('div');
        contextMenuEl.className = 'outliner-context-menu';
        contextMenuEl.style.left = x + 'px';
        contextMenuEl.style.top = y + 'px';

        if (node.isPage) {
            addMenuItem(contextMenuEl, i18n.outlinerRemovePage || 'Remove Page', function() {
                removePage(nodeId);
                hideContextMenu();
            });
            addMenuItem(contextMenuEl, i18n.outlinerOpenPage || 'Open Page', function() {
                openPage(nodeId);
                hideContextMenu();
            });
        } else {
            addMenuItem(contextMenuEl, i18n.outlinerMakePage || 'Make Page', function() {
                makePage(nodeId);
                hideContextMenu();
            });
        }

        addMenuSeparator(contextMenuEl);

        if (node.checked !== null && node.checked !== undefined) {
            addMenuItem(contextMenuEl, i18n.outlinerRemoveCheckbox || 'Remove Checkbox', function() {
                saveSnapshot();
                node.checked = null;
                renderTree();
                focusNode(nodeId);
                scheduleSyncToHost();
                hideContextMenu();
            });
        } else {
            addMenuItem(contextMenuEl, i18n.outlinerAddCheckbox || 'Add Checkbox', function() {
                saveSnapshot();
                node.checked = false;
                renderTree();
                focusNode(nodeId);
                scheduleSyncToHost();
                hideContextMenu();
            });
        }

        addMenuSeparator(contextMenuEl);

        // サブテキスト
        var subtextLabel = (node.subtext) ? (i18n.outlinerEditSubtext || 'Edit Subtext') : (i18n.outlinerAddSubtext || 'Add Subtext');
        addMenuItem(contextMenuEl, subtextLabel, function() {
            hideContextMenu();
            openSubtext(nodeId);
        });

        addMenuSeparator(contextMenuEl);

        // スコープ
        addMenuItem(contextMenuEl, i18n.outlinerScope || 'Scope', function() {
            setScope({ type: 'subtree', rootId: nodeId });
            hideContextMenu();
        });
        if (currentScope.type !== 'document') {
            addMenuItem(contextMenuEl, i18n.outlinerClearScope || 'Clear Scope', function() {
                setScope({ type: 'document' });
                hideContextMenu();
            });
        }

        addMenuSeparator(contextMenuEl);

        addMenuItem(contextMenuEl, i18n.outlinerMoveUp || 'Move Up', function() {
            saveSnapshot();
            if (model.moveUp(nodeId)) {
                renderTree();
                focusNode(nodeId);
                scheduleSyncToHost();
            }
            hideContextMenu();
        });
        addMenuItem(contextMenuEl, i18n.outlinerMoveDown || 'Move Down', function() {
            saveSnapshot();
            if (model.moveDown(nodeId)) {
                renderTree();
                focusNode(nodeId);
                scheduleSyncToHost();
            }
            hideContextMenu();
        });

        addMenuSeparator(contextMenuEl);

        // スコープヘッダーノードは削除不可
        var isCtxScopeHeader = (currentScope.type === 'subtree' && currentScope.rootId === nodeId);
        if (!isCtxScopeHeader) {
            addMenuItem(contextMenuEl, i18n.outlinerDelete || 'Delete', function() {
                saveSnapshot();
                var nextId = model.getNextVisibleId(nodeId) || model.getPreviousVisibleId(nodeId);
                model.removeNode(nodeId);
                if (currentScope.type === 'subtree' && !model.getNode(currentScope.rootId)) {
                    setScope({ type: 'document' });
                }
                renderTree();
                if (nextId && model.getNode(nextId)) { focusNode(nextId); }
                scheduleSyncToHost();
                hideContextMenu();
            });
        }

        document.body.appendChild(contextMenuEl);

        var rect = contextMenuEl.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenuEl.style.left = (window.innerWidth - rect.width - 8) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            contextMenuEl.style.top = (window.innerHeight - rect.height - 8) + 'px';
        }
    }

    function addMenuItem(parent, text, handler) {
        var item = document.createElement('div');
        item.className = 'outliner-context-menu-item';
        item.textContent = text;
        item.addEventListener('click', handler);
        parent.appendChild(item);
    }

    function addMenuSeparator(parent) {
        var sep = document.createElement('div');
        sep.className = 'outliner-context-menu-separator';
        parent.appendChild(sep);
    }

    function hideContextMenu() {
        if (contextMenuEl) {
            contextMenuEl.remove();
            contextMenuEl = null;
        }
    }

    // --- サイドパネル (editor.js の EditorInstance / SidePanelHostBridge を使用) ---

    var sidePanelEl = null;
    var sidePanelFilename = null;
    var sidePanelClose = null;
    var sidePanelOverlay = null;
    var sidePanelIframeContainer = null;
    var sidePanelSidebar = null;
    var sidePanelTocEl = null;
    var sidePanelOpenOutlineBtn = null;
    var sidePanelSidebarCloseBtn = null;
    var sidePanelImageDirEl = null;
    var sidePanelImageDirPath = null;
    var sidePanelImageDirSource = null;
    var sidePanelImageDirBtn = null;
    var sidePanelInstance = null;
    var sidePanelHostBridge = null;
    var sidePanelFilePath = null;
    var sidePanelOriginNodeId = null;  // サイドパネルを開いたノードID（閉じた時にフォーカスを戻す）
    var sidePanelTocVisible = true;
    var sidePanelExpanded = false;
    var sidePanelImagePending = false;

    function initSidePanel() {
        sidePanelEl = document.querySelector('.side-panel');
        sidePanelFilename = document.querySelector('.side-panel-filename');
        sidePanelClose = document.querySelector('.side-panel-close');
        sidePanelOverlay = document.querySelector('.side-panel-overlay');
        sidePanelIframeContainer = document.querySelector('.side-panel-iframe-container');
        sidePanelSidebar = document.querySelector('.side-panel-sidebar');
        sidePanelTocEl = document.querySelector('.side-panel-toc');
        sidePanelOpenOutlineBtn = document.querySelector('.side-panel-outline-btn');
        sidePanelSidebarCloseBtn = document.querySelector('#sidePanelSidebarClose');
        sidePanelImageDirEl = document.querySelector('.side-panel-imagedir');
        sidePanelImageDirPath = document.querySelector('#sidePanelImageDirPath');
        sidePanelImageDirSource = document.querySelector('#sidePanelImageDirSource');
        sidePanelImageDirBtn = document.querySelector('#sidePanelImageDirBtn');

        if (sidePanelClose) {
            sidePanelClose.addEventListener('click', closeSidePanel);
        }
        if (sidePanelOverlay) {
            sidePanelOverlay.addEventListener('click', closeSidePanel);
        }

        // Expand toggle
        var sidePanelExpandBtn = document.querySelector('.side-panel-expand');
        if (sidePanelExpandBtn) {
            sidePanelExpandBtn.addEventListener('click', function() {
                sidePanelExpanded = !sidePanelExpanded;
                if (sidePanelExpanded) {
                    sidePanelEl.classList.add('expanded');
                    sidePanelExpandBtn.classList.add('active');
                    sidePanelEl.style.width = '';
                    sidePanelEl.style.maxWidth = '';
                } else {
                    sidePanelEl.classList.remove('expanded');
                    sidePanelExpandBtn.classList.remove('active');
                    if (sidePanelWidthSetting) {
                        sidePanelEl.style.width = sidePanelWidthSetting + 'px';
                        sidePanelEl.style.maxWidth = sidePanelWidthSetting + 'px';
                    } else {
                        sidePanelEl.style.width = '';
                        sidePanelEl.style.maxWidth = '';
                    }
                }
            });
        }

        // Side panel resize
        setupSidePanelResize();

        // Open in tab
        var sidePanelOpenTabBtn = document.querySelector('.side-panel-open-tab');
        if (sidePanelOpenTabBtn) {
            sidePanelOpenTabBtn.addEventListener('click', function() {
                if (sidePanelFilePath) {
                    host.openLinkInTab(sidePanelFilePath);
                    closeSidePanelImmediate();
                }
            });
        }

        // Outline sidebar open/close
        if (sidePanelOpenOutlineBtn) {
            sidePanelOpenOutlineBtn.addEventListener('click', function() {
                if (!sidePanelTocEl || sidePanelTocEl.children.length === 0) { return; }
                sidePanelTocVisible = true;
                openSidePanelSidebar();
            });
        }
        if (sidePanelSidebarCloseBtn) {
            sidePanelSidebarCloseBtn.addEventListener('click', function() {
                sidePanelTocVisible = false;
                closeSidePanelSidebar();
            });
        }

        // ESC to close side panel
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidePanelEl && sidePanelEl.classList.contains('open')) {
                e.preventDefault();
                e.stopPropagation();
                closeSidePanel();
            }
        });
    }

    function setupSidePanelResize() {
        var spResizeHandle = document.getElementById('sidePanelResizeHandle');
        if (!spResizeHandle || !sidePanelEl) return;

        var spResizing = false;
        var spStartX = 0;
        var spStartWidth = 0;

        spResizeHandle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            spResizing = true;
            spStartX = e.clientX;
            spStartWidth = sidePanelEl.offsetWidth;
            spResizeHandle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            sidePanelEl.classList.remove('expanded');
            sidePanelExpanded = false;
            var iframes = sidePanelEl.querySelectorAll('iframe');
            iframes.forEach(function(f) { f.style.pointerEvents = 'none'; });

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
        });

        function onMove(e) {
            if (!spResizing) return;
            var delta = spStartX - e.clientX;
            var newWidth = spStartWidth + delta;
            var maxW = (sidePanelEl.parentElement || document.body).offsetWidth * 0.95;
            newWidth = Math.max(320, Math.min(newWidth, maxW));
            sidePanelEl.style.width = newWidth + 'px';
            sidePanelEl.style.maxWidth = newWidth + 'px';
        }

        function onEnd() {
            if (!spResizing) return;
            spResizing = false;
            spResizeHandle.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            var iframes = sidePanelEl.querySelectorAll('iframe');
            iframes.forEach(function(f) { f.style.pointerEvents = ''; });
            sidePanelWidthSetting = sidePanelEl.offsetWidth;
            syncToHostImmediate();
        }
    }

    function openSidePanel(markdown, filePath, fileName, toc, spDocumentBaseUri) {
        if (sidePanelInstance) {
            closeSidePanelImmediate();
        }
        sidePanelFilePath = filePath;
        if (sidePanelFilename) { sidePanelFilename.textContent = fileName; }

        // Create EditorInstance container and instance
        var spContainer = window.EditorInstance.createSidePanelContainer();
        if (sidePanelIframeContainer) {
            sidePanelIframeContainer.innerHTML = '';
            sidePanelIframeContainer.appendChild(spContainer);
        }

        var LUCIDE_ICONS = window.__editorUtils ? window.__editorUtils.LUCIDE_ICONS : {};
        var escapeHtml = window.__editorUtils ? window.__editorUtils.escapeHtml : function(s) { return s; };

        sidePanelHostBridge = new window.SidePanelHostBridge(host, filePath, {
            onTocUpdate: updateSidePanelTocFromMarkdown,
            onImageRequest: function() { sidePanelImagePending = true; }
        });

        sidePanelInstance = new window.EditorInstance(spContainer, sidePanelHostBridge, {
            initialContent: markdown,
            documentBaseUri: spDocumentBaseUri || '',
            isSidePanel: true
        });

        // Setup header buttons (undo/redo/source)
        if (sidePanelEl) {
            var header = sidePanelEl.querySelector('.side-panel-header');
            if (header) {
                header.querySelectorAll('button[data-action]').forEach(function(btn) {
                    var icon = LUCIDE_ICONS[btn.dataset.action];
                    if (icon) { btn.innerHTML = icon; }
                });
                var undoBtn = header.querySelector('[data-action="undo"]');
                var redoBtn = header.querySelector('[data-action="redo"]');
                var sourceBtn = header.querySelector('[data-action="source"]');

                if (undoBtn) { undoBtn.addEventListener('click', function() { if (sidePanelInstance) sidePanelInstance._undo(); }); }
                if (redoBtn) { redoBtn.addEventListener('click', function() { if (sidePanelInstance) sidePanelInstance._redo(); }); }
                if (sourceBtn) { sourceBtn.addEventListener('click', function() { if (sidePanelInstance) sidePanelInstance._toggleSourceMode(); }); }

                sidePanelInstance._setUndoUpdateCallback(function(undoDisabled, redoDisabled) {
                    if (undoBtn) { undoBtn.disabled = undoDisabled; undoBtn.style.opacity = undoDisabled ? '0.3' : '1'; }
                    if (redoBtn) { redoBtn.disabled = redoDisabled; redoBtn.style.opacity = redoDisabled ? '0.3' : '1'; }
                });
                if (undoBtn) { undoBtn.disabled = true; undoBtn.style.opacity = '0.3'; }
                if (redoBtn) { redoBtn.disabled = true; redoBtn.style.opacity = '0.3'; }
            }
        }

        // Render TOC
        renderSidePanelToc(toc);

        // Setup image dir display
        setupSidePanelImageDir();

        // Apply saved width
        if (sidePanelWidthSetting && sidePanelEl) {
            sidePanelEl.style.width = sidePanelWidthSetting + 'px';
            sidePanelEl.style.maxWidth = sidePanelWidthSetting + 'px';
        }

        // Show panel with animation
        if (sidePanelEl) { sidePanelEl.style.display = 'flex'; }
        if (sidePanelOverlay) { sidePanelOverlay.style.display = 'block'; }
        requestAnimationFrame(function() {
            if (sidePanelEl) { sidePanelEl.classList.add('open'); }
            if (sidePanelOverlay) { sidePanelOverlay.classList.add('open'); }
        });
    }

    function closeSidePanel() {
        if (sidePanelEl) { sidePanelEl.classList.remove('open'); }
        if (sidePanelOverlay) { sidePanelOverlay.classList.remove('open'); }
        setTimeout(function() { closeSidePanelImmediate(); }, 200);
    }

    function closeSidePanelImmediate() {
        if (sidePanelEl) { sidePanelEl.style.display = 'none'; }
        if (sidePanelOverlay) { sidePanelOverlay.style.display = 'none'; }
        if (sidePanelExpanded) {
            if (sidePanelEl) { sidePanelEl.classList.remove('expanded'); }
            sidePanelExpanded = false;
            var expandBtn = document.querySelector('.side-panel-expand');
            if (expandBtn) { expandBtn.classList.remove('active'); }
        }
        if (sidePanelInstance) {
            sidePanelInstance.destroy();
            sidePanelInstance = null;
        }
        sidePanelHostBridge = null;
        if (sidePanelIframeContainer) { sidePanelIframeContainer.innerHTML = ''; }
        sidePanelFilePath = null;
        host.notifySidePanelClosed();
        if (sidePanelOriginNodeId) {
            focusNode(sidePanelOriginNodeId);
            sidePanelOriginNodeId = null;
        } else {
            focusFirstVisibleNode();
        }
    }

    function renderSidePanelToc(toc) {
        if (!sidePanelTocEl) { return; }
        var escapeHtml = window.__editorUtils ? window.__editorUtils.escapeHtml : function(s) { return s; };
        if (toc && toc.length > 0) {
            sidePanelTocEl.innerHTML = toc.map(function(item) {
                return '<a class="side-panel-toc-item" data-level="' + item.level +
                    '" data-anchor="' + escapeHtml(item.anchor) + '" title="' + escapeHtml(item.text) + '">' +
                    escapeHtml(item.text) + '</a>';
            }).join('');
            bindSidePanelTocClicks();
            if (sidePanelTocVisible) { openSidePanelSidebar(); }
        } else {
            sidePanelTocEl.innerHTML = '';
            closeSidePanelSidebar();
        }
    }

    function bindSidePanelTocClicks() {
        if (!sidePanelTocEl) { return; }
        sidePanelTocEl.querySelectorAll('.side-panel-toc-item').forEach(function(item) {
            item.addEventListener('click', function() {
                var anchor = item.dataset.anchor;
                if (sidePanelHostBridge) {
                    sidePanelHostBridge._sendMessage({ type: 'scrollToAnchor', anchor: anchor });
                }
                sidePanelTocEl.querySelectorAll('.side-panel-toc-item').forEach(function(i) {
                    i.classList.remove('active');
                });
                item.classList.add('active');
            });
        });
    }

    function updateSidePanelTocFromMarkdown(markdown) {
        if (!sidePanelTocEl) { return; }
        var lines = markdown.split('\n');
        var toc = [];
        var inCodeBlock = false;
        for (var k = 0; k < lines.length; k++) {
            var line = lines[k];
            if (line.startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
            if (inCodeBlock) { continue; }
            var match = line.match(/^(#{1,2})\s+(.+)$/);
            if (match) {
                var text = match[2].trim();
                var anchor = text.toLowerCase()
                    .replace(/[^\w\s\u3000-\u9fff\u{20000}-\u{2fa1f}\-]/gu, '')
                    .replace(/\s+/g, '-');
                toc.push({ level: match[1].length, text: text, anchor: anchor });
            }
        }
        renderSidePanelToc(toc);
    }

    function setupSidePanelImageDir() {
        if (sidePanelImageDirBtn) {
            sidePanelImageDirBtn.onclick = function() {
                if (sidePanelHostBridge) { sidePanelHostBridge.requestSetImageDir(); }
            };
        }
        host.getSidePanelImageDir(sidePanelFilePath);
    }

    function updateSidePanelImageDir(displayPath, source) {
        if (sidePanelImageDirPath) {
            sidePanelImageDirPath.textContent = displayPath || '';
            sidePanelImageDirPath.title = displayPath || '';
        }
        if (sidePanelImageDirSource) {
            var labels = {
                file: i18n.imageDirSourceFile || 'File',
                settings: i18n.imageDirSourceSettings || 'Settings',
                'default': i18n.imageDirSourceDefault || 'Default'
            };
            sidePanelImageDirSource.textContent = labels[source] || source || '';
        }
    }

    function openSidePanelSidebar() {
        if (sidePanelSidebar) { sidePanelSidebar.classList.add('visible'); }
        if (sidePanelOpenOutlineBtn) { sidePanelOpenOutlineBtn.classList.add('hidden'); }
    }

    function closeSidePanelSidebar() {
        if (sidePanelSidebar) { sidePanelSidebar.classList.remove('visible'); }
        if (sidePanelOpenOutlineBtn) { sidePanelOpenOutlineBtn.classList.remove('hidden'); }
    }

    // --- ホスト通信 ---

    function scheduleSyncToHost() {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = setTimeout(function() {
            syncToHostImmediate();
        }, SYNC_DEBOUNCE_MS);
    }

    function syncToHostImmediate() {
        clearTimeout(syncDebounceTimer);
        var data = model.serialize();
        data.searchFocusMode = searchFocusMode;
        if (pageDir) { data.pageDir = pageDir; }
        if (sidePanelWidthSetting) { data.sidePanelWidth = sidePanelWidthSetting; }
        if (pinnedTags && pinnedTags.length > 0) { data.pinnedTags = pinnedTags; }
        host.syncData(JSON.stringify(data, null, 2));
    }

    // --- 固定タグバー & Daily Notes ナビバー (統合) ---

    function updatePinnedTagBar() {
        var bar = document.querySelector('.outliner-pinned-nav-bar');
        if (!bar) return;

        // 固定タグボタン生成
        var tagsArea = bar.querySelector('.outliner-pinned-tags-area');
        if (tagsArea) {
            tagsArea.innerHTML = '';
            for (var i = 0; i < pinnedTags.length; i++) {
                var btn = document.createElement('button');
                btn.className = 'outliner-pinned-tag-btn';
                btn.textContent = pinnedTags[i];
                btn.dataset.tag = pinnedTags[i];
                if (isTagInSearchText(searchInput ? searchInput.value.trim() : '', pinnedTags[i])) {
                    btn.classList.add('is-active');
                }
                btn.addEventListener('click', handlePinnedTagClick);
                tagsArea.appendChild(btn);
            }
        }

        // Daily Nav表示制御
        var dailyArea = bar.querySelector('.outliner-daily-nav-area');
        if (dailyArea) {
            dailyArea.style.display = isDailyNotes ? 'flex' : 'none';
        }

    }

    /** 検索テキスト内にタグがトークンとして含まれているか判定 */
    function isTagInSearchText(text, tag) {
        if (!text || !tag) return false;
        var tokens = text.split(/\s+/);
        for (var i = 0; i < tokens.length; i++) {
            if (tokens[i] === tag) return true;
        }
        return false;
    }

    /** 検索テキストからタグトークンを除去（前後のスペースも整理） */
    function removeTagFromSearchText(text, tag) {
        if (!text || !tag) return '';
        var tokens = text.split(/\s+/);
        var result = [];
        for (var i = 0; i < tokens.length; i++) {
            if (tokens[i] !== tag) {
                result.push(tokens[i]);
            }
        }
        return result.join(' ');
    }

    function handlePinnedTagClick(e) {
        var tag = e.currentTarget.dataset.tag;

        pushNavState();
        isNavigating = true;

        var currentText = searchInput ? searchInput.value.trim() : '';
        var isActive = isTagInSearchText(currentText, tag);

        if (isActive) {
            // OFF: 検索テキストからタグを除去
            var newText = removeTagFromSearchText(currentText, tag);
            searchInput.value = newText;
            if (newText.trim()) {
                executeSearch();
            } else {
                clearSearch();
            }
        } else {
            // ON: scope out + フォーカスモード + タグ追記
            if (currentScope.type === 'subtree') {
                currentScope = { type: 'document' };
                updateBreadcrumb();
            }
            if (!searchFocusMode) {
                searchFocusMode = true;
                updateSearchModeButton();
            }
            if (currentText) {
                searchInput.value = currentText + ' ' + tag;
            } else {
                searchInput.value = tag;
            }
            executeSearch();
        }

        updatePinnedTagBar();
        updateSearchClearButton();
        isNavigating = false;
        updateNavButtons();
    }

    function setupPinnedSettingsButton() {
        var pinnedSettingsBtn = document.querySelector('.outliner-pinned-settings-btn');
        if (pinnedSettingsBtn) {
            pinnedSettingsBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
            pinnedSettingsBtn.addEventListener('click', function() {
                openPinnedTagsDialog();
            });
        }
    }

    function setupDailyNavBar() {
        dailyNavBar = document.querySelector('.outliner-pinned-nav-bar');
        if (!dailyNavBar) return;

        var todayBtn = document.getElementById('dailyNavToday');
        var prevBtn = document.getElementById('dailyNavPrev');
        var nextBtn = document.getElementById('dailyNavNext');
        var calendarBtn = document.getElementById('dailyNavCalendar');
        var pickerEl = document.getElementById('dailyNavPicker');
        var pickerMonth = new Date();

        if (todayBtn) todayBtn.addEventListener('click', function() {
            dailyCurrentDate = null;
            host.postDailyNotes('notesOpenDailyNotes');
        });
        if (prevBtn) prevBtn.addEventListener('click', function() {
            host.postDailyNotes('notesNavigateDailyNotes', -1, dailyCurrentDate);
        });
        if (nextBtn) nextBtn.addEventListener('click', function() {
            host.postDailyNotes('notesNavigateDailyNotes', 1, dailyCurrentDate);
        });

        if (calendarBtn && pickerEl) {
            calendarBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                pickerEl.style.display = pickerEl.style.display === 'none' ? '' : 'none';
                if (pickerEl.style.display !== 'none') {
                    if (dailyCurrentDate) {
                        pickerMonth = new Date(dailyCurrentDate);
                    } else {
                        pickerMonth = new Date();
                    }
                    renderDailyPicker();
                }
            });

            document.addEventListener('click', function() {
                if (pickerEl) pickerEl.style.display = 'none';
            });
            pickerEl.addEventListener('click', function(e) { e.stopPropagation(); });

            var prevMonthBtn = document.getElementById('dailyPickerPrevMonth');
            var nextMonthBtn = document.getElementById('dailyPickerNextMonth');
            if (prevMonthBtn) prevMonthBtn.addEventListener('click', function() {
                pickerMonth.setMonth(pickerMonth.getMonth() - 1);
                renderDailyPicker();
            });
            if (nextMonthBtn) nextMonthBtn.addEventListener('click', function() {
                pickerMonth.setMonth(pickerMonth.getMonth() + 1);
                renderDailyPicker();
            });
        }

        function renderDailyPicker() {
            var titleEl = document.getElementById('dailyPickerTitle');
            var gridEl = document.getElementById('dailyPickerGrid');
            if (!titleEl || !gridEl) return;

            var y = pickerMonth.getFullYear();
            var m = pickerMonth.getMonth();
            titleEl.textContent = y + '-' + String(m + 1).padStart(2, '0');
            gridEl.innerHTML = '';

            var firstDay = new Date(y, m, 1).getDay();
            var daysInMonth = new Date(y, m + 1, 0).getDate();
            var today = new Date();

            for (var i = 0; i < firstDay; i++) {
                var empty = document.createElement('span');
                empty.className = 'outliner-daily-picker-empty';
                gridEl.appendChild(empty);
            }
            for (var d = 1; d <= daysInMonth; d++) {
                var cell = document.createElement('button');
                cell.className = 'outliner-daily-picker-day';
                cell.textContent = String(d);
                var dateStr = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                if (dateStr === dailyCurrentDate) cell.classList.add('selected');
                if (y === today.getFullYear() && m === today.getMonth() && d === today.getDate()) {
                    cell.classList.add('today');
                }
                cell.dataset.date = dateStr;
                cell.addEventListener('click', function() {
                    pickerEl.style.display = 'none';
                    host.postDailyNotes('notesNavigateToDate', this.dataset.date);
                });
                gridEl.appendChild(cell);
            }
        }
    }

    function setupHostMessages() {
        host.onMessage(function(msg) {
            switch (msg.type) {
                case 'updateData':
                    var savedFocus = focusedNodeId;
                    model = new OutlinerModel(msg.data);
                    searchEngine = new OutlinerSearch.SearchEngine(model);
                    pageDir = msg.data.pageDir || null;
                    sidePanelWidthSetting = msg.data.sidePanelWidth || null;
                    pinnedTags = msg.data.pinnedTags || [];
                    // モデルが入れ替わったのでundo/redoスタックをクリア
                    // (別ファイルのスナップショットでundo→データ上書きを防止)
                    undoStack.length = 0;
                    redoStack.length = 0;
                    updateUndoRedoButtons();
                    // Daily Notes 表示切替
                    isDailyNotes = !!msg.isDailyNotes;
                    updatePinnedTagBar();
                    // Notes モードのファイル切替時: 検索・スコープをリセット
                    // fileChangeId はNotes用のupdateDataにのみ存在する
                    // 単体.outの外部変更検知（outlinerProvider.ts）ではfileChangeIdがないためリセットしない
                    if (msg.fileChangeId !== undefined) {
                        navBackStack.length = 0;
                        navForwardStack.length = 0;
                        updateNavButtons();
                        if (searchInput) {
                            searchInput.value = '';
                        }
                        currentSearchResult = null;
                        currentScope = { type: 'document' };
                        updateBreadcrumb();
                        updatePinnedTagBar(); // タグのis-activeをリセット
                    }
                    if (pageTitleInput && document.activeElement !== pageTitleInput) {
                        pageTitleInput.value = model.title || '';
                    }
                    // 空の場合、初期ノードを追加（init()と同じ処理）
                    if (model.rootIds.length === 0) {
                        var firstNode = model.addNode(null, null, '');
                        renderTree();
                        focusNode(firstNode.id);
                        syncData();
                    } else {
                        renderTree();
                        if (savedFocus && model.getNode(savedFocus)) {
                            focusNode(savedFocus);
                        }
                    }
                    // Daily Notes 等: 特定ノードに scope in
                    if (msg.scopeToNodeId) {
                        setTimeout(function() {
                            var scopeTarget = model.getNode(msg.scopeToNodeId);
                            if (scopeTarget) {
                                setScope({ type: 'subtree', rootId: msg.scopeToNodeId });
                            }
                        }, 50);
                    }
                    // dailyCurrentDate を scopeToNodeId のノード階層から復元
                    if (msg.scopeToNodeId && isDailyNotes) {
                        var dayNode = model.getNode(msg.scopeToNodeId);
                        if (dayNode) {
                            var monthNode = model.getParent(msg.scopeToNodeId);
                            var yearNode = monthNode ? model.getParent(monthNode.id) : null;
                            if (yearNode && monthNode) {
                                dailyCurrentDate = yearNode.text + '-' +
                                    String(monthNode.text).padStart(2, '0') + '-' +
                                    String(dayNode.text).padStart(2, '0');
                            }
                        }
                    }
                    // 検索結果ジャンプ: 特定ノードにスクロール+ハイライト
                    if (msg.jumpToNodeId) {
                        setTimeout(function() {
                            jumpToAndHighlightNode(msg.jumpToNodeId);
                        }, 100);
                    }
                    break;

                case 'pageCreated':
                    var pageNode = model.getNode(msg.nodeId);
                    if (pageNode) {
                        renderTree();
                        focusNode(msg.nodeId);
                    }
                    break;

                case 'pageDirChanged':
                    pageDir = msg.pageDir || null;
                    break;

                // --- サイドパネル関連メッセージ ---
                case 'openSidePanel':
                    openSidePanel(msg.markdown, msg.filePath, msg.fileName, msg.toc, msg.documentBaseUri);
                    break;

                case 'sidePanelMessage':
                    if (sidePanelHostBridge) {
                        sidePanelHostBridge._sendMessage(msg.data);
                    }
                    break;

                case 'scrollToLine':
                    if (sidePanelHostBridge) {
                        sidePanelHostBridge._sendMessage({ type: 'scrollToLine', lineNumber: msg.lineNumber });
                    }
                    break;

                case 'sidePanelImageDirStatus':
                    updateSidePanelImageDir(msg.displayPath, msg.source);
                    break;

                case 'sidePanelSetImageDir':
                    updateSidePanelImageDir(msg.displayPath, msg.source);
                    break;

                case 'insertImageHtml':
                    if (sidePanelInstance && sidePanelHostBridge) {
                        sidePanelHostBridge._sendMessage({
                            type: 'insertImageHtml',
                            markdownPath: msg.markdownPath,
                            displayUri: msg.displayUri,
                            dataUri: msg.dataUri
                        });
                    }
                    break;

                case 'scopeIn':
                    if (focusedNodeId) { setScope({ type: 'subtree', rootId: focusedNodeId }); }
                    break;

                case 'scopeOut':
                    setScope({ type: 'document' });
                    break;
            }
        });
    }

    // --- グローバルキーハンドラ ---

    function setupKeyHandlers() {
        document.addEventListener('keydown', function(e) {
            // グローバル Cmd+] スコープイン / Cmd+Shift+] スコープアウト (ノード内keydownで未処理の場合)
            if ((e.metaKey || e.ctrlKey) && (e.key === ']' || e.code === 'BracketRight')) {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) {
                    setScope({ type: 'document' });
                } else {
                    if (focusedNodeId) { setScope({ type: 'subtree', rootId: focusedNodeId }); }
                }
                return;
            }
            // Ctrl/Cmd+N: 新規ノード
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                saveSnapshot();
                var newNode = model.addNode(null, model.rootIds[model.rootIds.length - 1], '');
                renderTree();
                focusNode(newNode.id);
                scheduleSyncToHost();
            }
            // グローバル Undo/Redo (検索バーフォーカス時も動作)
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                // ノード内keydownで処理済みの場合はスキップ
                if (document.activeElement && document.activeElement.classList.contains('outliner-text')) { return; }
                e.preventDefault();
                undo();
            }
            if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
                if (document.activeElement && document.activeElement.classList.contains('outliner-text')) { return; }
                e.preventDefault();
                redo();
            }
        });
    }

    // --- Public API ---

    return {
        init: init,
        getModel: function() { return model; },
        flushSync: function() { if (model) syncToHostImmediate(); },
        resetSearchAndScope: function() {
            if (searchInput) searchInput.value = '';
            currentSearchResult = null;
            currentScope = { type: 'document' };
            if (typeof updateBreadcrumb === 'function') updateBreadcrumb();
            if (typeof renderTree === 'function') renderTree();
        }
    };
})();
