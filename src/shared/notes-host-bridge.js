/**
 * Notes VSCode HostBridge — acquireVsCodeApi() をラップし、
 * outliner.js が使う window.outlinerHostBridge と
 * notes-file-panel.js が使う window.notesHostBridge の両方を提供する。
 *
 * notesWebviewContent.ts により outliner.js の前に注入される。
 */
(function() {
    var api = acquireVsCodeApi();

    // ── outliner.js 用ブリッジ (既存 outliner-host-bridge.js と同一インターフェース) ──
    window.outlinerHostBridge = {
        // データ同期
        syncData: function(jsonString) {
            api.postMessage({ type: 'syncData', content: jsonString });
        },

        // 保存
        save: function() {
            api.postMessage({ type: 'save' });
        },

        // ページ操作
        makePage: function(nodeId, pageId, title) {
            api.postMessage({ type: 'makePage', nodeId: nodeId, pageId: pageId, title: title });
        },
        openPage: function(nodeId, pageId) {
            api.postMessage({ type: 'openPage', nodeId: nodeId, pageId: pageId });
        },
        removePage: function(nodeId, pageId) {
            api.postMessage({ type: 'removePage', nodeId: nodeId, pageId: pageId });
        },
        setPageDir: function() {
            api.postMessage({ type: 'setPageDir' });
        },

        // サイドパネル (ページ表示用)
        openPageInSidePanel: function(nodeId, pageId) {
            api.postMessage({ type: 'openPageInSidePanel', nodeId: nodeId, pageId: pageId });
        },
        saveSidePanelFile: function(filePath, content) {
            api.postMessage({ type: 'saveSidePanelFile', filePath: filePath, content: content });
        },
        notifySidePanelClosed: function() {
            api.postMessage({ type: 'sidePanelClosed' });
        },
        sidePanelOpenLink: function(href, sidePanelFilePath) {
            api.postMessage({ type: 'sidePanelOpenLink', href: href, sidePanelFilePath: sidePanelFilePath });
        },
        openLinkInTab: function(href) {
            api.postMessage({ type: 'openLinkInTab', href: href });
        },
        getSidePanelImageDir: function(sidePanelFilePath) {
            api.postMessage({ type: 'getSidePanelImageDir', sidePanelFilePath: sidePanelFilePath });
        },
        requestInsertImage: function(sidePanelFilePath) {
            api.postMessage({ type: 'insertImage', position: 0, sidePanelFilePath: sidePanelFilePath });
        },
        requestSetImageDir: function(sidePanelFilePath) {
            api.postMessage({ type: 'setImageDir', sidePanelFilePath: sidePanelFilePath });
        },
        saveImageAndInsert: function(dataUrl, fileName, sidePanelFilePath) {
            api.postMessage({ type: 'saveImageAndInsert', dataUrl: dataUrl, fileName: fileName, sidePanelFilePath: sidePanelFilePath });
        },
        readAndInsertImage: function(filePath, sidePanelFilePath) {
            api.postMessage({ type: 'readAndInsertImage', filePath: filePath, sidePanelFilePath: sidePanelFilePath });
        },
        searchFiles: function(query) {
            api.postMessage({ type: 'searchFiles', query: query });
        },

        // ページ管理 (サイドパネル内EditorInstanceから呼ばれる — outlinerでは未使用)
        createPageAtPath: function() { /* no-op in outliner */ },
        createPageAuto: function() { /* no-op in outliner */ },
        updatePageH1: function() { /* no-op in outliner */ },

        // リンク
        openLink: function(href) {
            api.postMessage({ type: 'openLink', href: href });
        },

        // フォーカス
        reportFocus: function() {
            api.postMessage({ type: 'webviewFocus' });
        },
        reportBlur: function() {
            api.postMessage({ type: 'webviewBlur' });
        },

        // ホストからのメッセージ受信
        onMessage: function(handler) {
            window.addEventListener('message', function(e) {
                handler(e.data);
            });
        }
    };

    // ── notes-file-panel.js 用ブリッジ ──
    window.notesHostBridge = {
        openFile: function(filePath) {
            api.postMessage({ type: 'notesOpenFile', filePath: filePath });
        },
        createFile: function(title) {
            api.postMessage({ type: 'notesCreateFile', title: title });
        },
        deleteFile: function(filePath) {
            api.postMessage({ type: 'notesDeleteFile', filePath: filePath });
        },
        renameTitle: function(filePath, newTitle) {
            api.postMessage({ type: 'notesRenameTitle', filePath: filePath, newTitle: newTitle });
        },
        togglePanel: function(collapsed) {
            api.postMessage({ type: 'notesTogglePanel', collapsed: collapsed });
        },
        onFileListChanged: function(handler) {
            // Handled via outlinerHostBridge.onMessage — listen for notesFileListChanged
            window.addEventListener('message', function(e) {
                if (e.data && e.data.type === 'notesFileListChanged') {
                    handler(e.data.fileList, e.data.currentFile);
                }
            });
        }
    };
})();
