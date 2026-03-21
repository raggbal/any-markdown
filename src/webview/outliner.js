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

    var focusedNodeId = null;
    var currentScope = { type: 'document' };
    var currentSearchResult = null;  // Set<string> or null
    var searchFocusMode = false;     // true: マッチノード頂点+子のみ, false: ルートまで表示
    var searchModeToggleBtn = null;  // toggle button element
    var contextMenuEl = null;

    var syncDebounceTimer = null;
    var SYNC_DEBOUNCE_MS = 1000;

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

    var i18n = window.__outlinerMessages || {};

    // 検索モードアイコン (Lucide風SVG)
    var ICON_TREE_MODE = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/></svg>';
    var ICON_FOCUS_MODE = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';

    function init(data) {
        host = window.outlinerHostBridge;
        model = new OutlinerModel(data);
        searchEngine = new OutlinerSearch.SearchEngine(model);

        // JSONから検索モードを復元
        if (data && data.searchFocusMode) {
            searchFocusMode = true;
        }

        treeEl = document.querySelector('.outliner-tree');
        searchInput = document.querySelector('.outliner-search-input');
        breadcrumbEl = document.querySelector('.outliner-breadcrumb');
        searchModeToggleBtn = document.querySelector('.outliner-search-mode-toggle');

        // ボタンアイコン初期化
        if (searchModeToggleBtn) {
            updateSearchModeButton();
        }

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
        updateBreadcrumb();

        if (model.rootIds.length === 0) {
            treeEl.innerHTML = '<div class="outliner-empty">' +
                '<div>' + (i18n.outlinerNoItems || 'No items yet') + '</div>' +
                '<div class="outliner-empty-hint">' + (i18n.outlinerAddHint || 'Press Enter to add an item') + '</div>' +
                '</div>';
            return;
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
                rootIds = [currentScope.rootId];
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

    /** フォーカスモード: マッチノードを頂点として、その子孫のみ表示 */
    function renderFocusNodes(parentEl, searchQuery) {
        // マッチノード（子孫でも祖先でもなく、直接マッチしたもの）を検索で再判定
        var query = OutlinerSearch.parseQuery(searchInput.value || '');
        if (!query) { return; }
        var allNodeIds = Object.keys(model.nodes);
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
                searchInput.value = tag.textContent;
                executeSearch();
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
            var raw = subtextEl.textContent || '';
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
            var raw = subtextEl.textContent || '';
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
            if (prevEl) { prevEl.classList.remove('is-focused'); }
        }
        focusedNodeId = nodeId;
        var el = treeEl.querySelector('.outliner-node[data-id="' + nodeId + '"]');
        if (el) { el.classList.add('is-focused'); }
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

        // 選択状態でShift/Ctrl/Meta以外のキーが押されたら選択をクリア
        // (ただし Shift+Arrow, Cmd+C/X/V/A, Backspace/Delete は除く)
        if (selectedNodeIds.size > 0 && !e.shiftKey && !e.metaKey && !e.ctrlKey
            && e.key !== 'Backspace' && e.key !== 'Delete') {
            clearSelection();
        }

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
                if (e.altKey) {
                    // Option+Enter: 子ノードとして追加 (既に子がいれば先頭に)
                    handleShiftEnter(node, textEl, offset);
                } else if (e.shiftKey) {
                    // Shift+Enter: サブテキスト追加/フォーカス
                    openSubtext(nodeId);
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

            case 'Backspace':
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
                } else if (e.shiftKey) {
                    // Shift+↑: 複数ノード選択を上に拡張
                    e.preventDefault();
                    if (!selectionAnchorId) { selectionAnchorId = nodeId; }
                    var prevId = model.getPreviousVisibleId(nodeId);
                    if (prevId) {
                        selectRange(selectionAnchorId, prevId);
                        focusNode(prevId);
                    }
                } else {
                    e.preventDefault();
                    clearSelection();
                    var prevId2 = model.getPreviousVisibleId(nodeId);
                    if (prevId2) { focusNode(prevId2); }
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
                } else if (e.shiftKey) {
                    // Shift+↓: 複数ノード選択を下に拡張
                    e.preventDefault();
                    if (!selectionAnchorId) { selectionAnchorId = nodeId; }
                    var nextId = model.getNextVisibleId(nodeId);
                    if (nextId) {
                        selectRange(selectionAnchorId, nextId);
                        focusNode(nextId);
                    }
                } else {
                    e.preventDefault();
                    clearSelection();
                    var nextId2 = model.getNextVisibleId(nodeId);
                    if (nextId2) { focusNode(nextId2); }
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

        // Cmd+]/[ スコープ操作 (e.code で判定 — JISキーボード等で e.key が異なるため)
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
            if (e.key === ']' || e.code === 'BracketRight') {
                e.preventDefault();
                e.stopPropagation();
                if (focusedNodeId) { setScope({ type: 'subtree', rootId: focusedNodeId }); }
                return;
            }
            if (e.key === '[' || e.code === 'BracketLeft') {
                e.preventDefault();
                e.stopPropagation();
                setScope({ type: 'document' });
                return;
            }
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
        var raw = subtextEl.textContent || '';
        model.updateSubtext(nodeId, raw);

        // 省略表示に切替
        subtextEl.contentEditable = 'false';
        subtextEl.classList.remove('is-editing');
        if (raw) {
            subtextEl.classList.add('has-content');
            subtextEl.textContent = getSubtextPreview(raw);
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
            var raw = subtextEl.textContent || '';
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

        // 検索モード切替ボタン
        if (searchModeToggleBtn) {
            searchModeToggleBtn.addEventListener('click', function() {
                searchFocusMode = !searchFocusMode;
                updateSearchModeButton();
                if (searchInput.value.trim()) {
                    executeSearch();
                }
                scheduleSyncToHost();
            });
        }
    }

    function executeSearch() {
        var queryStr = searchInput.value.trim();
        if (!queryStr) {
            clearSearch();
            return;
        }
        var query = OutlinerSearch.parseQuery(queryStr);
        currentSearchResult = searchEngine.search(query, currentScope, { focusMode: searchFocusMode });
        renderTree();
    }

    function clearSearch() {
        searchInput.value = '';
        currentSearchResult = null;
        renderTree();
    }

    function updateSearchModeButton() {
        if (!searchModeToggleBtn) { return; }
        searchModeToggleBtn.innerHTML = searchFocusMode ? ICON_FOCUS_MODE : ICON_TREE_MODE;
        searchModeToggleBtn.title = searchFocusMode
            ? (i18n.outlinerFocusMode || 'Focus mode: matched node + children only')
            : (i18n.outlinerTreeMode || 'Tree mode: show ancestors to root');
    }

    function setScope(scope) {
        currentScope = scope;
        updateBreadcrumb();
        if (searchInput.value.trim()) { executeSearch(); }
        renderTree();
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
        data.searchFocusMode = searchFocusMode;
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
            // グローバル Cmd+]/[ スコープ操作 (ノード内keydownで未処理の場合)
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
                if (e.key === ']' || e.code === 'BracketRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (focusedNodeId) { setScope({ type: 'subtree', rootId: focusedNodeId }); }
                    return;
                }
                if (e.key === '[' || e.code === 'BracketLeft') {
                    e.preventDefault();
                    e.stopPropagation();
                    setScope({ type: 'document' });
                    return;
                }
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
        getModel: function() { return model; }
    };
})();
