'use strict';

/**
 * Notes 左ファイルパネル — webview 内で動作する UI コントローラ
 * VSCode / Electron 共通
 *
 * 使い方:
 *   notesFilePanel.init(bridge, fileList, currentFile)
 *
 * bridge インターフェース:
 *   openFile(filePath), createFile(title), deleteFile(filePath),
 *   renameTitle(filePath, newTitle), togglePanel(collapsed),
 *   onFileListChanged(handler)
 */
var notesFilePanel = (function() {
    var bridge = null;
    var fileList = [];
    var currentFile = null;
    var listEl = null;
    var panelEl = null;
    var contextMenu = null;

    function renderList(files, activeFilePath) {
        if (!listEl) return;
        listEl.innerHTML = '';
        if (files.length === 0) {
            listEl.innerHTML = '<div class="file-panel-empty">No outlines yet.<br>Click + to create one.</div>';
            return;
        }
        files.forEach(function(f) {
            var item = document.createElement('div');
            item.className = 'file-panel-item' + (f.filePath === activeFilePath ? ' active' : '');
            item.textContent = f.title || 'Untitled';
            item.title = f.filePath;
            item.dataset.filePath = f.filePath;
            item.addEventListener('click', function() {
                if (f.filePath !== currentFile) {
                    bridge.openFile(f.filePath);
                }
            });
            item.addEventListener('dblclick', function(e) {
                e.stopPropagation();
                startRename(item, f);
            });
            item.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                showContextMenu(e, f);
            });
            listEl.appendChild(item);
        });
    }

    function startRename(itemEl, file) {
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

    function showContextMenu(e, file) {
        closeContextMenu();
        contextMenu = document.createElement('div');
        contextMenu.className = 'file-panel-context-menu';
        contextMenu.style.left = e.clientX + 'px';
        contextMenu.style.top = e.clientY + 'px';

        var renameItem = document.createElement('div');
        renameItem.className = 'file-panel-context-item';
        renameItem.textContent = 'Rename';
        renameItem.addEventListener('click', function() {
            closeContextMenu();
            var itemEl = listEl.querySelector('[data-file-path="' + CSS.escape(file.filePath) + '"]');
            if (itemEl) startRename(itemEl, file);
        });

        var deleteItem = document.createElement('div');
        deleteItem.className = 'file-panel-context-item danger';
        deleteItem.textContent = 'Delete';
        deleteItem.addEventListener('click', function() {
            closeContextMenu();
            bridge.deleteFile(file.filePath);
        });

        contextMenu.appendChild(renameItem);
        contextMenu.appendChild(deleteItem);
        document.body.appendChild(contextMenu);

        setTimeout(function() {
            document.addEventListener('click', closeContextMenu, { once: true });
        }, 0);
    }

    function closeContextMenu() {
        if (contextMenu && contextMenu.parentNode) {
            contextMenu.parentNode.removeChild(contextMenu);
            contextMenu = null;
        }
    }

    function init(noteBridge, initialFileList, initialCurrentFile) {
        bridge = noteBridge;
        fileList = initialFileList || [];
        currentFile = initialCurrentFile || null;

        listEl = document.getElementById('notesFileList');
        panelEl = document.getElementById('notesFilePanel');
        var addBtn = document.getElementById('filePanelAdd');
        var collapseBtn = document.getElementById('filePanelCollapse');
        var toggleBtn = document.getElementById('notesPanelToggleBtn');

        if (addBtn) {
            addBtn.addEventListener('click', function() {
                var inputRow = document.createElement('div');
                inputRow.className = 'file-panel-item active';
                var input = document.createElement('input');
                input.className = 'file-panel-rename-input';
                input.type = 'text';
                input.value = '';
                input.placeholder = 'Enter title...';
                inputRow.appendChild(input);
                listEl.insertBefore(inputRow, listEl.firstChild);
                input.focus();
                var done = false;
                function finish() {
                    if (done) return;
                    done = true;
                    var val = input.value.trim();
                    if (inputRow.parentNode) inputRow.parentNode.removeChild(inputRow);
                    if (val) {
                        bridge.createFile(val);
                    }
                }
                input.addEventListener('blur', finish);
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') { finish(); }
                    if (e.key === 'Escape') { done = true; if (inputRow.parentNode) inputRow.parentNode.removeChild(inputRow); }
                });
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

        // Listen for file list updates
        if (bridge.onFileListChanged) {
            bridge.onFileListChanged(function(newList, newCurrentFile) {
                fileList = newList;
                if (newCurrentFile) currentFile = newCurrentFile;
                renderList(fileList, currentFile);
            });
        }

        // Initial render
        renderList(fileList, currentFile);
    }

    return { init: init };
})();

// Export for both browser (global) and CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { notesFilePanel: notesFilePanel };
}
