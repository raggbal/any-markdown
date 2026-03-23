'use strict';

/**
 * Notes 左ファイルパネル — webview 内で動作する UI コントローラ
 * VSCode / Electron 共通
 *
 * ツリー表示（フォルダ + ファイル）、D&D による並び替え・移動をサポート
 *
 * 使い方:
 *   notesFilePanel.init(bridge, fileList, currentFile, structure)
 *
 * bridge インターフェース:
 *   openFile(filePath), createFile(title, parentId), deleteFile(filePath),
 *   renameTitle(filePath, newTitle), togglePanel(collapsed),
 *   createFolder(title, parentId), deleteFolder(folderId),
 *   renameFolder(folderId, newTitle), toggleFolder(folderId),
 *   moveItem(itemId, targetParentId, index),
 *   onFileListChanged(handler)
 */
var notesFilePanel = (function() {
    var bridge = null;
    var fileList = [];
    var currentFile = null;
    var structure = null;
    var listEl = null;
    var panelEl = null;
    var contextMenu = null;

    // D&D state (module-scope, VSCode webview の dataTransfer 制限回避)
    var dragItemId = null;
    var dragItemType = null; // 'file' or 'folder'
    var dropIndicator = null;

    // SVG icons
    var ICON_FILE = '<svg class="file-panel-item-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>';
    var ICON_FOLDER = '<svg class="file-panel-folder-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
    var ICON_CHEVRON = '<svg class="file-panel-folder-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

    // ── ファイルマップ構築 ──

    function buildFileMap(files) {
        var map = {};
        files.forEach(function(f) {
            var id = f.id || f.filePath.replace(/^.*[/\\]/, '').replace(/\.out$/, '');
            map[id] = f;
        });
        return map;
    }

    // ── ツリーレンダリング ──

    function renderTree() {
        if (!listEl) return;
        listEl.innerHTML = '';

        if (!structure || !structure.rootIds || structure.rootIds.length === 0) {
            // フラットリストフォールバック
            if (fileList.length === 0) {
                listEl.innerHTML = '<div class="file-panel-empty">No outlines yet.<br>Click + to create one.</div>';
                return;
            }
            fileList.forEach(function(f) {
                listEl.appendChild(createFileElement(f, null));
            });
            return;
        }

        var fileMap = buildFileMap(fileList);
        renderIds(structure.rootIds, listEl, fileMap, null);

        if (listEl.children.length === 0) {
            listEl.innerHTML = '<div class="file-panel-empty">No outlines yet.<br>Click + to create one.</div>';
        }
    }

    function renderIds(ids, containerEl, fileMap, parentId) {
        ids.forEach(function(id) {
            var item = structure.items[id];
            if (!item) return;

            if (item.type === 'folder') {
                containerEl.appendChild(createFolderElement(item, fileMap, parentId));
            } else if (item.type === 'file') {
                var fileEntry = fileMap[id];
                if (fileEntry) {
                    containerEl.appendChild(createFileElement(fileEntry, parentId));
                }
            }
        });
    }

    function createFileElement(f, parentId) {
        var item = document.createElement('div');
        item.className = 'file-panel-item' + (f.filePath === currentFile ? ' active' : '');
        item.dataset.filePath = f.filePath;
        item.dataset.itemId = f.id || f.filePath.replace(/^.*[/\\]/, '').replace(/\.out$/, '');
        item.dataset.itemType = 'file';
        if (parentId) item.dataset.parentId = parentId;
        item.draggable = true;

        item.innerHTML = ICON_FILE + '<span class="file-panel-item-title">' + escapeHtml(f.title || 'Untitled') + '</span>';

        item.addEventListener('click', function() {
            if (f.filePath !== currentFile) {
                bridge.openFile(f.filePath);
            }
        });
        item.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            startRenameFile(item, f);
        });
        item.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            showFileContextMenu(e, f);
        });

        // D&D
        setupDragSource(item);
        setupDropTarget(item);

        return item;
    }

    function createFolderElement(folder, fileMap, parentId) {
        var wrapper = document.createElement('div');
        wrapper.className = 'file-panel-folder' + (folder.collapsed ? ' collapsed' : '');
        wrapper.dataset.folderId = folder.id;
        wrapper.dataset.itemId = folder.id;
        wrapper.dataset.itemType = 'folder';
        if (parentId) wrapper.dataset.parentId = parentId;

        var header = document.createElement('div');
        header.className = 'file-panel-folder-header';
        header.draggable = true;
        header.innerHTML = ICON_CHEVRON + ICON_FOLDER +
            '<span class="file-panel-folder-title">' + escapeHtml(folder.title || 'Untitled') + '</span>';

        // クリックで展開/折りたたみ
        header.addEventListener('click', function() {
            bridge.toggleFolder(folder.id);
        });
        header.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            startRenameFolder(header, folder);
        });
        header.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            showFolderContextMenu(e, folder);
        });

        // D&D（ヘッダーがドラッグソース、フォルダ全体がドロップターゲット）
        setupDragSource(header);
        setupDropTarget(header);

        wrapper.appendChild(header);

        var children = document.createElement('div');
        children.className = 'file-panel-folder-children';
        renderIds(folder.childIds || [], children, fileMap, folder.id);
        wrapper.appendChild(children);

        // フォルダの子エリアもドロップターゲット
        setupFolderChildrenDrop(children, folder.id);

        return wrapper;
    }

    // ── リネーム ──

    function startRenameFile(itemEl, file) {
        var titleSpan = itemEl.querySelector('.file-panel-item-title');
        if (!titleSpan) { startRenameLegacy(itemEl, file); return; }

        var input = document.createElement('input');
        input.className = 'file-panel-rename-input';
        input.value = file.title || '';
        input.type = 'text';

        var originalHtml = titleSpan.innerHTML;
        titleSpan.innerHTML = '';
        titleSpan.appendChild(input);
        input.focus();
        input.select();

        var done = false;
        function finish() {
            if (done) return;
            done = true;
            var val = input.value.trim();
            if (val && val !== file.title) {
                bridge.renameTitle(file.filePath, val);
            } else {
                titleSpan.innerHTML = originalHtml;
            }
        }
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { finish(); }
            if (e.key === 'Escape') { done = true; titleSpan.innerHTML = originalHtml; }
        });
    }

    function startRenameLegacy(itemEl, file) {
        var input = document.createElement('input');
        input.className = 'file-panel-rename-input';
        input.value = file.title || '';
        input.type = 'text';
        itemEl.textContent = '';
        itemEl.appendChild(input);
        input.focus();
        input.select();
        var done = false;
        function finish() {
            if (done) return;
            done = true;
            var val = input.value.trim();
            if (val && val !== file.title) {
                bridge.renameTitle(file.filePath, val);
            } else {
                itemEl.textContent = file.title || 'Untitled';
            }
        }
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { finish(); }
            if (e.key === 'Escape') { done = true; itemEl.textContent = file.title || 'Untitled'; }
        });
    }

    function startRenameFolder(headerEl, folder) {
        var titleSpan = headerEl.querySelector('.file-panel-folder-title');
        if (!titleSpan) return;

        var input = document.createElement('input');
        input.className = 'file-panel-rename-input';
        input.value = folder.title || '';
        input.type = 'text';

        var originalHtml = titleSpan.innerHTML;
        titleSpan.innerHTML = '';
        titleSpan.appendChild(input);
        input.focus();
        input.select();

        var done = false;
        function finish() {
            if (done) return;
            done = true;
            var val = input.value.trim();
            if (val && val !== folder.title) {
                bridge.renameFolder(folder.id, val);
            } else {
                titleSpan.innerHTML = originalHtml;
            }
        }
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', function(e) {
            e.stopPropagation();
            if (e.key === 'Enter') { finish(); }
            if (e.key === 'Escape') { done = true; titleSpan.innerHTML = originalHtml; }
        });
    }

    // ── コンテキストメニュー ──

    function showFileContextMenu(e, file) {
        closeContextMenu();
        contextMenu = document.createElement('div');
        contextMenu.className = 'file-panel-context-menu';
        contextMenu.style.left = e.clientX + 'px';
        contextMenu.style.top = e.clientY + 'px';

        addContextItem(contextMenu, 'Rename', function() {
            closeContextMenu();
            var itemEl = listEl.querySelector('[data-file-path="' + CSS.escape(file.filePath) + '"]');
            if (itemEl) startRenameFile(itemEl, file);
        });
        addContextItem(contextMenu, 'Delete', function() {
            closeContextMenu();
            bridge.deleteFile(file.filePath);
        }, true);

        document.body.appendChild(contextMenu);
        setTimeout(function() { document.addEventListener('click', closeContextMenu, { once: true }); }, 0);
    }

    function showFolderContextMenu(e, folder) {
        closeContextMenu();
        contextMenu = document.createElement('div');
        contextMenu.className = 'file-panel-context-menu';
        contextMenu.style.left = e.clientX + 'px';
        contextMenu.style.top = e.clientY + 'px';

        addContextItem(contextMenu, 'New Outline here', function() {
            closeContextMenu();
            promptNewFile(folder.id);
        });
        addContextItem(contextMenu, 'New Subfolder', function() {
            closeContextMenu();
            promptNewFolder(folder.id);
        });
        addContextItem(contextMenu, 'Rename', function() {
            closeContextMenu();
            var folderEl = listEl.querySelector('[data-folder-id="' + CSS.escape(folder.id) + '"]');
            if (folderEl) {
                var header = folderEl.querySelector('.file-panel-folder-header');
                if (header) startRenameFolder(header, folder);
            }
        });
        addContextItem(contextMenu, 'Delete Folder', function() {
            closeContextMenu();
            bridge.deleteFolder(folder.id);
        }, true);

        document.body.appendChild(contextMenu);
        setTimeout(function() { document.addEventListener('click', closeContextMenu, { once: true }); }, 0);
    }

    function addContextItem(menu, label, onClick, danger) {
        var item = document.createElement('div');
        item.className = 'file-panel-context-item' + (danger ? ' danger' : '');
        item.textContent = label;
        item.addEventListener('click', onClick);
        menu.appendChild(item);
    }

    function closeContextMenu() {
        if (contextMenu && contextMenu.parentNode) {
            contextMenu.parentNode.removeChild(contextMenu);
            contextMenu = null;
        }
    }

    // ── Drag & Drop ──

    function setupDragSource(el) {
        el.addEventListener('dragstart', function(e) {
            var target = el.closest('[data-item-id]') || el;
            dragItemId = target.dataset.itemId;
            dragItemType = target.dataset.itemType;
            e.dataTransfer.effectAllowed = 'move';
            // テキストを設定（VSCode webview互換）
            try { e.dataTransfer.setData('text/plain', dragItemId); } catch(err) { /* ignore */ }
            // ドラッグ中のスタイル
            setTimeout(function() { target.style.opacity = '0.4'; }, 0);
        });

        el.addEventListener('dragend', function() {
            var target = el.closest('[data-item-id]') || el;
            target.style.opacity = '';
            dragItemId = null;
            dragItemType = null;
            removeDropIndicator();
            clearAllDragOver();
        });
    }

    function setupDropTarget(el) {
        el.addEventListener('dragover', function(e) {
            if (!dragItemId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            clearAllDragOver();
            removeDropIndicator();

            var target = el.closest('[data-item-id]') || el;
            if (target.dataset.itemId === dragItemId) return;

            // フォルダヘッダーの場合: 上半分=前に挿入、中央=中に入れる、下半分=後に挿入
            // ファイルの場合: 上半分=前に挿入、下半分=後に挿入
            var rect = target.getBoundingClientRect();
            var y = e.clientY - rect.top;
            var ratio = y / rect.height;

            if (target.dataset.itemType === 'folder' || target.classList.contains('file-panel-folder-header')) {
                var folderWrapper = target.closest('.file-panel-folder') || target;
                if (ratio < 0.25) {
                    showDropLine(target, 'before');
                } else if (ratio > 0.75) {
                    showDropLine(target, 'after');
                } else {
                    // フォルダの中にドロップ
                    target.classList.add('file-panel-drag-over');
                }
            } else {
                if (ratio < 0.5) {
                    showDropLine(target, 'before');
                } else {
                    showDropLine(target, 'after');
                }
            }
        });

        el.addEventListener('dragleave', function(e) {
            var target = el.closest('[data-item-id]') || el;
            target.classList.remove('file-panel-drag-over');
        });

        el.addEventListener('drop', function(e) {
            e.preventDefault();
            if (!dragItemId) return;

            clearAllDragOver();
            removeDropIndicator();

            var target = el.closest('[data-item-id]') || el;
            if (target.dataset.itemId === dragItemId) return;

            var rect = target.getBoundingClientRect();
            var y = e.clientY - rect.top;
            var ratio = y / rect.height;

            var targetId = target.dataset.itemId;
            var targetType = target.dataset.itemType;
            var targetParentId = target.dataset.parentId || null;

            // フォルダヘッダーの中央にドロップ → フォルダ内に移動
            if ((targetType === 'folder' || target.classList.contains('file-panel-folder-header')) && ratio >= 0.25 && ratio <= 0.75) {
                var folderId = target.dataset.folderId || targetId;
                // 循環チェック: 自分自身のフォルダの中にはドロップしない
                if (dragItemType === 'folder' && folderId === dragItemId) return;
                bridge.moveItem(dragItemId, folderId, 0);
                return;
            }

            // 前/後に挿入
            var parentId = targetParentId;
            var siblingIds = getChildIdsOfParent(parentId);
            var targetIndex = siblingIds.indexOf(targetId);
            if (targetIndex === -1) targetIndex = siblingIds.length;

            var insertIndex;
            if ((targetType === 'folder' || target.classList.contains('file-panel-folder-header')) ? ratio < 0.25 : ratio < 0.5) {
                insertIndex = targetIndex;
            } else {
                insertIndex = targetIndex + 1;
            }

            // 同じ親内の移動でドラッグ元が前にある場合、インデックス調整
            var dragCurrentParent = findParentIdOf(dragItemId);
            if (dragCurrentParent === parentId) {
                var dragCurrentIndex = siblingIds.indexOf(dragItemId);
                if (dragCurrentIndex !== -1 && dragCurrentIndex < insertIndex) {
                    insertIndex--;
                }
            }

            bridge.moveItem(dragItemId, parentId, insertIndex);
        });
    }

    function setupFolderChildrenDrop(childrenEl, folderId) {
        childrenEl.addEventListener('dragover', function(e) {
            if (!dragItemId) return;
            // 子要素がハンドルしない空エリアのみ
            if (e.target === childrenEl || e.target.className === 'file-panel-folder-children') {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                clearAllDragOver();
                childrenEl.classList.add('file-panel-drag-over');
            }
        });
        childrenEl.addEventListener('dragleave', function() {
            childrenEl.classList.remove('file-panel-drag-over');
        });
        childrenEl.addEventListener('drop', function(e) {
            if (e.target !== childrenEl && e.target.className !== 'file-panel-folder-children') return;
            e.preventDefault();
            if (!dragItemId) return;
            clearAllDragOver();
            // フォルダ末尾に追加
            var childIds = getChildIdsOfParent(folderId);
            bridge.moveItem(dragItemId, folderId, childIds.length);
        });
    }

    function showDropLine(refEl, position) {
        removeDropIndicator();
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'file-panel-drop-line';
        if (position === 'before') {
            refEl.parentNode.insertBefore(dropIndicator, refEl);
        } else {
            refEl.parentNode.insertBefore(dropIndicator, refEl.nextSibling);
        }
    }

    function removeDropIndicator() {
        if (dropIndicator && dropIndicator.parentNode) {
            dropIndicator.parentNode.removeChild(dropIndicator);
        }
        dropIndicator = null;
    }

    function clearAllDragOver() {
        var els = listEl.querySelectorAll('.file-panel-drag-over');
        for (var i = 0; i < els.length; i++) {
            els[i].classList.remove('file-panel-drag-over');
        }
    }

    // ── ヘルパー ──

    function getChildIdsOfParent(parentId) {
        if (!structure) return [];
        if (!parentId) return structure.rootIds || [];
        var item = structure.items[parentId];
        if (item && item.type === 'folder') return item.childIds || [];
        return [];
    }

    function findParentIdOf(itemId) {
        if (!structure) return null;
        if (structure.rootIds && structure.rootIds.indexOf(itemId) !== -1) return null;
        for (var id in structure.items) {
            var item = structure.items[id];
            if (item.type === 'folder' && item.childIds && item.childIds.indexOf(itemId) !== -1) {
                return id;
            }
        }
        return null;
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── 新規作成プロンプト ──

    function promptNewFile(parentId) {
        var inputRow = document.createElement('div');
        inputRow.className = 'file-panel-item active';
        var input = document.createElement('input');
        input.className = 'file-panel-rename-input';
        input.type = 'text';
        input.value = '';
        input.placeholder = 'Enter title...';
        inputRow.appendChild(input);

        // 親フォルダ内に挿入
        if (parentId) {
            var folderEl = listEl.querySelector('[data-folder-id="' + CSS.escape(parentId) + '"]');
            if (folderEl) {
                var childrenEl = folderEl.querySelector('.file-panel-folder-children');
                if (childrenEl) {
                    childrenEl.insertBefore(inputRow, childrenEl.firstChild);
                } else {
                    listEl.insertBefore(inputRow, listEl.firstChild);
                }
            } else {
                listEl.insertBefore(inputRow, listEl.firstChild);
            }
        } else {
            listEl.insertBefore(inputRow, listEl.firstChild);
        }
        input.focus();

        var done = false;
        function finish() {
            if (done) return;
            done = true;
            var val = input.value.trim();
            if (inputRow.parentNode) inputRow.parentNode.removeChild(inputRow);
            if (val) {
                bridge.createFile(val, parentId || null);
            }
        }
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { finish(); }
            if (e.key === 'Escape') { done = true; if (inputRow.parentNode) inputRow.parentNode.removeChild(inputRow); }
        });
    }

    function promptNewFolder(parentId) {
        var inputRow = document.createElement('div');
        inputRow.className = 'file-panel-folder-header';
        inputRow.style.margin = '1px 4px';
        var input = document.createElement('input');
        input.className = 'file-panel-rename-input';
        input.type = 'text';
        input.value = '';
        input.placeholder = 'Folder name...';
        inputRow.appendChild(input);

        if (parentId) {
            var folderEl = listEl.querySelector('[data-folder-id="' + CSS.escape(parentId) + '"]');
            if (folderEl) {
                var childrenEl = folderEl.querySelector('.file-panel-folder-children');
                if (childrenEl) {
                    childrenEl.insertBefore(inputRow, childrenEl.firstChild);
                } else {
                    listEl.insertBefore(inputRow, listEl.firstChild);
                }
            } else {
                listEl.insertBefore(inputRow, listEl.firstChild);
            }
        } else {
            listEl.insertBefore(inputRow, listEl.firstChild);
        }
        input.focus();

        var done = false;
        function finish() {
            if (done) return;
            done = true;
            var val = input.value.trim();
            if (inputRow.parentNode) inputRow.parentNode.removeChild(inputRow);
            if (val) {
                bridge.createFolder(val, parentId || null);
            }
        }
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { finish(); }
            if (e.key === 'Escape') { done = true; if (inputRow.parentNode) inputRow.parentNode.removeChild(inputRow); }
        });
    }

    // ── 初期化 ──

    function init(noteBridge, initialFileList, initialCurrentFile, initialStructure) {
        bridge = noteBridge;
        fileList = initialFileList || [];
        currentFile = initialCurrentFile || null;
        structure = initialStructure || null;

        listEl = document.getElementById('notesFileList');
        panelEl = document.getElementById('notesFilePanel');
        var addBtn = document.getElementById('filePanelAdd');
        var addFolderBtn = document.getElementById('filePanelAddFolder');
        var collapseBtn = document.getElementById('filePanelCollapse');
        var toggleBtn = document.getElementById('notesPanelToggleBtn');

        if (addBtn) {
            addBtn.addEventListener('click', function() {
                promptNewFile(null);
            });
        }

        if (addFolderBtn) {
            addFolderBtn.addEventListener('click', function() {
                promptNewFolder(null);
            });
        }

        if (collapseBtn) {
            collapseBtn.addEventListener('click', function() {
                if (panelEl) panelEl.classList.add('collapsed');
                bridge.togglePanel(true);
            });
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', function() {
                if (panelEl) panelEl.classList.remove('collapsed');
                bridge.togglePanel(false);
            });
        }

        // Listen for file list + structure updates
        if (bridge.onFileListChanged) {
            bridge.onFileListChanged(function(newList, newCurrentFile, newStructure) {
                fileList = newList;
                if (newCurrentFile) currentFile = newCurrentFile;
                if (newStructure) structure = newStructure;
                renderTree();
            });
        }

        // ルートエリアへのD&D（アイテム間の空白部分）
        if (listEl) {
            listEl.addEventListener('dragover', function(e) {
                if (!dragItemId) return;
                // 子要素が既にハンドルしている場合はスキップ
                if (e.target !== listEl) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });
            listEl.addEventListener('drop', function(e) {
                if (e.target !== listEl) return;
                e.preventDefault();
                if (!dragItemId) return;
                clearAllDragOver();
                removeDropIndicator();
                // ルート末尾に追加
                var rootIds = structure ? structure.rootIds : [];
                bridge.moveItem(dragItemId, null, rootIds.length);
            });
        }

        // Initial render
        renderTree();
    }

    return { init: init };
})();

// Export for both browser (global) and CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { notesFilePanel: notesFilePanel };
}
