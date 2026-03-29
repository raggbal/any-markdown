/**
 * Test HostBridge — テスト環境用のモック実装。
 *
 * test/build-standalone.js により editor.js の前に注入される。
 * window.__testApi.messages に送信メッセージを記録する。
 * window.__hostMessageHandler でホスト→エディタのメッセージを送信できる。
 *
 * 共通メソッドは sidepanel-bridge-methods.js の __createSidePanelBridgeMethods() から取得。
 */
(function() {
    window.__testApi = {
        messages: [],
        ready: false,
        getMarkdown: null,
        getHtml: null,
        setMarkdown: null
    };

    var postFn = function(msg) { window.__testApi.messages.push(msg); };

    // 共通メソッド（サイドパネル・画像・リンク・フォーカス等）
    var shared = window.__createSidePanelBridgeMethods(postFn);

    window.hostBridge = Object.assign(shared, {
        // ドキュメント操作
        syncContent: function(markdown) {
            window.__testApi.messages.push({ type: 'edit', content: markdown });
        },

        // フォーカス/編集状態
        reportEditingState: function(editing) {
            window.__testApi.messages.push({ type: 'editingStateChanged', editing: editing });
        },

        // ホスト側 UI が必要な操作
        requestInsertLink: function(text) {
            window.__testApi.messages.push({ type: 'insertLink', text: text });
        },
        openInTextEditor: function() {
            window.__testApi.messages.push({ type: 'openInTextEditor' });
        },
        copyFilePath: function() {
            window.__testApi.messages.push({ type: 'copyFilePath' });
        },

        // ページ管理
        createPageAtPath: function(relativePath) {
            window.__testApi.messages.push({ type: 'createPageAtPath', relativePath: relativePath });
        },
        createPageAuto: function() {
            window.__testApi.messages.push({ type: 'createPageAuto' });
        },
        updatePageH1: function(relativePath, h1Text) {
            window.__testApi.messages.push({ type: 'updatePageH1', relativePath: relativePath, h1Text: h1Text });
        },

        // ホストからのメッセージ受信（テスト用: window.__hostMessageHandler に設定）
        onMessage: function(handler) {
            window.__hostMessageHandler = handler;
        }
    });
})();
