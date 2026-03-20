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
        removePage: function(nodeId) {
            api.postMessage({ type: 'removePage', nodeId: nodeId });
        },

        // サイドパネル (ページ表示用)
        saveSidePanelFile: function(filePath, content) {
            api.postMessage({ type: 'saveSidePanelFile', filePath: filePath, content: content });
        },
        notifySidePanelClosed: function() {
            api.postMessage({ type: 'sidePanelClosed' });
        },

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
