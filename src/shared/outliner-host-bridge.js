/**
 * Outliner VSCode HostBridge — acquireVsCodeApi() をラップし、
 * outliner.js が使う window.outlinerHostBridge インターフェースを提供する。
 *
 * outlinerWebviewContent.ts により outliner.js の前に注入される。
 */
(function() {
    var api = acquireVsCodeApi();

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
})();
