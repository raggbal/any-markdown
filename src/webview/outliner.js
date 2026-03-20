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
    var scopeBadge;     // .outliner-scope-badge element

    var focusedNodeId = null;
    var currentScope = { type: 'document' };
    var currentSearchResult = null;  // Set<string> or null
    var contextMenuEl = null;

    var syncDebounceTimer = null;
    var SYNC_DEBOUNCE_MS = 1000;

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
    }

    // --- 初期化 ---

    function init(data) {
        host = window.outlinerHostBridge;
        model = new OutlinerModel(data);
        searchEngine = new OutlinerSearch.SearchEngine(model);

        treeEl = document.querySelector('.outliner-tree');
        searchInput = document.querySelector('.outliner-search-input');
        scopeBadge = document.querySelector('.outliner-scope-badge');

        renderTree();
        setupSearchBar();
        setupKeyHandlers();
        setupContextMenu();
        setupHostMessages();

        // 初期スナップショット
        saveSnapshot();

        // 空の場合、最初のノードを追加
        if (model.rootIds.length === 0) {
            var firstNode = model.addNode(null, null, '');
            renderTree();
            focusNode(firstNode.id);
        }
    }

    // --- レンダリング ---

    function renderTree() {
        treeEl.innerHTML = '';

        if (model.rootIds.length === 0) {
            treeEl.innerHTML = '<div class="outliner-empty">' +
                '<div>No items yet</div>' +
                '<div class="outliner-empty-hint">Press Enter to add an item</div>' +
                '</div>';
            return;
        }

        // 検索時のマッチIDをキャッシュ (renderInlineText内での再計算を避ける)
        var searchQuery = null;
        if (currentSearchResult && searchInput) {
            searchQuery = OutlinerSearch.parseQuery(searchInput.value || '');
        }

        var fragment = document.createDocumentFragment();
        var rootIds;
        if (currentScope.type === 'subtree' && currentScope.rootId) {
            rootIds = [currentScope.rootId];
        } else {
            rootIds = model.rootIds;
        }
        renderNodes(rootIds, fragment, 0, searchQuery);
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
        });

        var isComposing = false;
        textEl.addEventListener('compositionstart', function() { isComposing = true; });
        textEl.addEventListener('compositionend', function() {
            isComposing = false;
            // IME確定後にインライン再描画
            var plainText = getPlainText(textEl);
            model.updateText(node.id, plainText);
            var off = getCursorOffset(textEl);
            textEl.innerHTML = renderInlineText(plainText);
            setCursorAtOffset(textEl, off);
            scheduleSyncToHost();
        });
        textEl.addEventListener('input', function() {
            var plainText = getPlainText(textEl);
            model.updateText(node.id, plainText);
            if (!isComposing) {
                // インライン装飾をリアルタイム再描画 (カーソル位置を保持)
                var off = getCursorOffset(textEl);
                textEl.innerHTML = renderInlineText(plainText);
                setCursorAtOffset(textEl, off);
            }
            scheduleSyncToHost();
        });

        textEl.addEventListener('keydown', function(e) {
            handleNodeKeydown(e, node.id, textEl);
        });

        el.appendChild(textEl);
        return el;
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

        // 斜体
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // 取り消し線
        html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // リンク
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" title="$2">$1</a>');

        // タグ (#tag / @tag)
        html = html.replace(/(?<!\w)([#@]\w[\w-]*)/g, '<span class="outliner-tag">$1</span>');

        // 末尾スペースをNBSPに変換 (contenteditableで末尾空白が描画されない問題を回避)
        html = html.replace(/ $/, '\u00A0');

        return html;
    }

    /** contenteditable からプレーンテキストを取得 (NBSPは通常スペースに正規化) */
    function getPlainText(el) {
        return (el.textContent || '').replace(/\u00A0/g, ' ');
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
            if (prevEl) { prevEl.classList.remove('is-focused'); }
        }
        focusedNodeId = nodeId;
        var el = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"]');
        if (el) { el.classList.add('is-focused'); }
    }

    function focusNode(nodeId) {
        var nodeEl = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"]');
        if (!nodeEl) { return; }
        var textEl = nodeEl.querySelector('.outliner-text');
        if (textEl) {
            textEl.focus();
            setCursorToEnd(textEl);
        }
    }

    function focusNodeAtStart(nodeId) {
        var nodeEl = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"]');
        if (!nodeEl) { return; }
        var textEl = nodeEl.querySelector('.outliner-text');
        if (textEl) {
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

        var offset = getCursorOffset(textEl);
        var textLen = (textEl.textContent || '').length;
        var isAtStart = (offset === 0);
        var isAtEnd = (offset >= textLen);

        switch (e.key) {
            case 'Enter':
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
                handleEnter(node, textEl, offset);
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

            case 'Backspace':
                if (isAtStart) {
                    e.preventDefault();
                    saveSnapshot();
                    handleBackspaceAtStart(node, textEl);
                }
                break;

            case 'Tab':
                e.preventDefault();
                saveSnapshot();
                if (e.shiftKey) {
                    handleShiftTab(node, textEl);
                } else {
                    handleTab(node, textEl);
                }
                break;

            case 'ArrowUp':
                if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
                    e.preventDefault();
                    saveSnapshot();
                    if (model.moveUp(nodeId)) {
                        renderTree();
                        focusNode(nodeId);
                        scheduleSyncToHost();
                    }
                } else if (!e.shiftKey) {
                    e.preventDefault();
                    var prevId = model.getPreviousVisibleId(nodeId);
                    if (prevId) { focusNode(prevId); }
                }
                break;

            case 'ArrowDown':
                if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
                    e.preventDefault();
                    saveSnapshot();
                    if (model.moveDown(nodeId)) {
                        renderTree();
                        focusNode(nodeId);
                        scheduleSyncToHost();
                    }
                } else if (!e.shiftKey) {
                    e.preventDefault();
                    var nextId = model.getNextVisibleId(nodeId);
                    if (nextId) { focusNode(nextId); }
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
                } else if (currentScope.type !== 'document') {
                    setScope({ type: 'document' });
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

    function handleBackspaceAtStart(node, textEl) {
        var prevId = model.getPreviousVisibleId(node.id);

        if (!prevId) {
            if ((node.text || '').length === 0 && model.rootIds.length > 1) {
                var nextId = model.getNextVisibleId(node.id);
                model.removeNode(node.id);
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
        model.removePage(nodeId);
        renderTree();
        scheduleSyncToHost();
    }

    /** ページノードクリック → ホストに openPage 送信 → VSCode が any-markdown.editor を Beside で開く */
    function openPage(nodeId) {
        var node = model.getNode(nodeId);
        if (!node || !node.isPage || !node.pageId) { return; }
        host.openPage(nodeId, node.pageId);
    }

    // --- 検索 ---

    function setupSearchBar() {
        if (!searchInput) { return; }

        var debounceTimer = null;
        searchInput.addEventListener('input', function() {
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
    }

    function executeSearch() {
        var queryStr = searchInput.value.trim();
        if (!queryStr) {
            clearSearch();
            return;
        }
        var query = OutlinerSearch.parseQuery(queryStr);
        currentSearchResult = searchEngine.search(query, currentScope);
        renderTree();
    }

    function clearSearch() {
        searchInput.value = '';
        currentSearchResult = null;
        currentScope = { type: 'document' };
        scopeBadge.textContent = '';
        renderTree();
    }

    function setScope(scope) {
        currentScope = scope;
        if (scope.type === 'subtree') {
            var rootNode = model.getNode(scope.rootId);
            scopeBadge.textContent = 'scope: ' + (rootNode ? rootNode.text.slice(0, 20) : 'subtree');
        } else {
            scopeBadge.textContent = '';
        }
        if (searchInput.value.trim()) { executeSearch(); }
        renderTree();
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
            addMenuItem(contextMenuEl, 'Remove Page', function() {
                removePage(nodeId);
                hideContextMenu();
            });
            addMenuItem(contextMenuEl, 'Open Page', function() {
                openPage(nodeId);
                hideContextMenu();
            });
        } else {
            addMenuItem(contextMenuEl, 'Make Page', function() {
                makePage(nodeId);
                hideContextMenu();
            });
        }

        addMenuSeparator(contextMenuEl);

        if (node.checked !== null && node.checked !== undefined) {
            addMenuItem(contextMenuEl, 'Remove Checkbox', function() {
                saveSnapshot();
                node.checked = null;
                renderTree();
                focusNode(nodeId);
                scheduleSyncToHost();
                hideContextMenu();
            });
        } else {
            addMenuItem(contextMenuEl, 'Add Checkbox', function() {
                saveSnapshot();
                node.checked = false;
                renderTree();
                focusNode(nodeId);
                scheduleSyncToHost();
                hideContextMenu();
            });
        }

        addMenuSeparator(contextMenuEl);

        addMenuItem(contextMenuEl, 'Move Up', function() {
            saveSnapshot();
            if (model.moveUp(nodeId)) {
                renderTree();
                focusNode(nodeId);
                scheduleSyncToHost();
            }
            hideContextMenu();
        });
        addMenuItem(contextMenuEl, 'Move Down', function() {
            saveSnapshot();
            if (model.moveDown(nodeId)) {
                renderTree();
                focusNode(nodeId);
                scheduleSyncToHost();
            }
            hideContextMenu();
        });

        addMenuSeparator(contextMenuEl);

        addMenuItem(contextMenuEl, 'Delete', function() {
            saveSnapshot();
            var nextId = model.getNextVisibleId(nodeId) || model.getPreviousVisibleId(nodeId);
            model.removeNode(nodeId);
            renderTree();
            if (nextId) { focusNode(nextId); }
            scheduleSyncToHost();
            hideContextMenu();
        });

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
        host.syncData(JSON.stringify(data, null, 2));
    }

    function setupHostMessages() {
        host.onMessage(function(msg) {
            switch (msg.type) {
                case 'loadData':
                    model = new OutlinerModel(msg.data);
                    searchEngine = new OutlinerSearch.SearchEngine(model);
                    renderTree();
                    if (model.rootIds.length > 0) {
                        focusNode(model.rootIds[0]);
                    }
                    break;

                case 'updateData':
                    var savedFocus = focusedNodeId;
                    model = new OutlinerModel(msg.data);
                    searchEngine = new OutlinerSearch.SearchEngine(model);
                    renderTree();
                    if (savedFocus && model.getNode(savedFocus)) {
                        focusNode(savedFocus);
                    }
                    break;

                case 'pageCreated':
                    var pageNode = model.getNode(msg.nodeId);
                    if (pageNode) {
                        renderTree();
                        focusNode(msg.nodeId);
                    }
                    break;
            }
        });
    }

    // --- グローバルキーハンドラ ---

    function setupKeyHandlers() {
        document.addEventListener('keydown', function(e) {
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
        getModel: function() { return model; }
    };
})();
