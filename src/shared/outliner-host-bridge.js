/**
 * Outliner VSCode HostBridge — acquireVsCodeApi() をラップし、
 * outliner.js が使う window.outlinerHostBridge インターフェースを提供する。
 *
 * outlinerWebviewContent.ts により outliner.js の前に注入される。
 * 共通メソッドは sidepanel-bridge-methods.js の __createSidePanelBridgeMethods() から取得。
 */
(function() {
    var api = acquireVsCodeApi();
    var postFn = function(msg) { api.postMessage(msg); };

    // 共通メソッド（サイドパネル・画像・リンク・フォーカス等）
    var shared = window.__createSidePanelBridgeMethods(postFn);

    window.outlinerHostBridge = Object.assign(shared, {
        // データ同期
        syncData: function(jsonString) {
            api.postMessage({ type: 'syncData', content: jsonString });
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
        copyPageFile: function(sourcePageId, newPageId) {
            api.postMessage({ type: 'copyPageFile', sourcePageId: sourcePageId, newPageId: newPageId });
        },
        setPageDir: function() {
            api.postMessage({ type: 'setPageDir' });
        },

        // サイドパネル (ページ表示用)
        openPageInSidePanel: function(nodeId, pageId) {
            api.postMessage({ type: 'openPageInSidePanel', nodeId: nodeId, pageId: pageId });
        },

        // .outファイル操作
        openInTextEditor: function() {
            api.postMessage({ type: 'openInTextEditor' });
        },
        copyFilePath: function() {
            api.postMessage({ type: 'copyFilePath' });
        },

        // ページ管理 (サイドパネル内EditorInstanceから呼ばれる — outlinerでは未使用)
        createPageAtPath: function() { /* no-op in outliner */ },
        createPageAuto: function() { /* no-op in outliner */ },
        updatePageH1: function() { /* no-op in outliner */ }
    });
})();
