/**
 * Test HostBridge — テスト環境用のモック実装。
 *
 * test/build-standalone.js により editor.js の前に注入される。
 * window.__testApi.messages に送信メッセージを記録する。
 * window.__hostMessageHandler でホスト→エディタのメッセージを送信できる。
 */
(function() {
    window.__testApi = {
        messages: [],
        ready: false,
        getMarkdown: null,
        getHtml: null,
        setMarkdown: null
    };

    window.hostBridge = {
        // ドキュメント操作
        syncContent: function(markdown) {
            window.__testApi.messages.push({ type: 'edit', content: markdown });
        },
        save: function() {
            window.__testApi.messages.push({ type: 'save' });
        },

        // フォーカス/編集状態
        reportEditingState: function(editing) {
            window.__testApi.messages.push({ type: 'editingStateChanged', editing: editing });
        },
        reportFocus: function() {
            window.__testApi.messages.push({ type: 'webviewFocus' });
        },
        reportBlur: function() {
            window.__testApi.messages.push({ type: 'webviewBlur' });
        },

        // ホスト側 UI が必要な操作
        openLink: function(href) {
            window.__testApi.messages.push({ type: 'openLink', href: href });
        },
        requestInsertLink: function(text) {
            window.__testApi.messages.push({ type: 'insertLink', text: text });
        },
        requestInsertImage: function() {
            window.__testApi.messages.push({ type: 'insertImage', position: 0 });
        },
        requestSetImageDir: function() {
            window.__testApi.messages.push({ type: 'setImageDir' });
        },
        saveImageAndInsert: function(dataUrl, fileName) {
            window.__testApi.messages.push({ type: 'saveImageAndInsert', dataUrl: dataUrl, fileName: fileName });
        },
        readAndInsertImage: function(filePath) {
            window.__testApi.messages.push({ type: 'readAndInsertImage', filePath: filePath });
        },
        openInTextEditor: function() {
            window.__testApi.messages.push({ type: 'openInTextEditor' });
        },
        sendToChat: function(startLine, endLine, selectedMarkdown) {
            window.__testApi.messages.push({ type: 'sendToChat', startLine: startLine, endLine: endLine, selectedMarkdown: selectedMarkdown });
        },

        // ホストからのメッセージ受信
        onMessage: function(handler) {
            window.__hostMessageHandler = handler;
        }
    };
})();
