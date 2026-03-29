/**
 * VSCode HostBridge — acquireVsCodeApi() をラップし、
 * editor.js が使う window.hostBridge インターフェースを提供する。
 *
 * webviewContent.ts により editor.js の前に注入される。
 * 共通メソッドは sidepanel-bridge-methods.js の __createSidePanelBridgeMethods() から取得。
 */
(function() {
    const api = acquireVsCodeApi();
    var postFn = function(msg) { api.postMessage(msg); };

    // 共通メソッド（サイドパネル・画像・リンク・フォーカス等）
    var shared = window.__createSidePanelBridgeMethods(postFn);

    window.hostBridge = Object.assign(shared, {
        // ドキュメント操作
        syncContent: function(markdown) {
            api.postMessage({ type: 'edit', content: markdown });
        },

        // フォーカス/編集状態
        reportEditingState: function(editing) {
            api.postMessage({ type: 'editingStateChanged', editing: editing });
        },

        // ホスト側 UI が必要な操作
        requestInsertLink: function(text) {
            api.postMessage({ type: 'insertLink', text: text });
        },
        openInTextEditor: function() {
            api.postMessage({ type: 'openInTextEditor' });
        },
        copyFilePath: function() {
            api.postMessage({ type: 'copyFilePath' });
        },

        // ページ管理
        createPageAtPath: function(relativePath) {
            api.postMessage({ type: 'createPageAtPath', relativePath: relativePath });
        },
        createPageAuto: function() {
            api.postMessage({ type: 'createPageAuto' });
        },
        updatePageH1: function(relativePath, h1Text) {
            api.postMessage({ type: 'updatePageH1', relativePath: relativePath, h1Text: h1Text });
        }
    });
})();
