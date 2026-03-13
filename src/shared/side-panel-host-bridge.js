/**
 * Side Panel HostBridge — iframe 内で動作し、parent.postMessage 経由で
 * メインwebviewにメッセージを中継する。
 *
 * メインwebviewの editor.js が iframe からのメッセージを受信し、
 * VSCode 拡張側に転送する。
 */
(function() {
    var SP_SOURCE = 'sidePanel';

    function post(data) {
        data.source = SP_SOURCE;
        parent.postMessage(data, '*');
    }

    window.hostBridge = {
        // ドキュメント操作
        syncContent: function(markdown) {
            post({ type: 'edit', content: markdown });
        },
        save: function() {
            post({ type: 'save' });
        },

        // フォーカス/編集状態
        reportEditingState: function(editing) {
            // サイドパネルでは不要だが互換性のために空実装
        },
        reportFocus: function() {},
        reportBlur: function() {},

        // ホスト側 UI が必要な操作
        openLink: function(href) {
            post({ type: 'openLink', href: href });
        },
        openLinkInTab: function(href) {
            post({ type: 'openLinkInTab', href: href });
        },
        requestInsertLink: function(text) {
            post({ type: 'insertLink', text: text });
        },
        requestInsertImage: function() {
            post({ type: 'insertImage', position: 0 });
        },
        requestSetImageDir: function() {
            post({ type: 'setImageDir' });
        },
        saveImageAndInsert: function(dataUrl, fileName) {
            post({ type: 'saveImageAndInsert', dataUrl: dataUrl, fileName: fileName });
        },
        readAndInsertImage: function(filePath) {
            post({ type: 'readAndInsertImage', filePath: filePath });
        },
        openInTextEditor: function() {
            // サイドパネルでは無効
        },
        sendToChat: function(startLine, endLine, selectedMarkdown) {
            // サイドパネルでは無効
        },
        saveSidePanelFile: function(filePath, content) {
            // サイドパネル自体なので不要
        },

        searchFiles: function(query) {
            post({ type: 'searchFiles', query: query });
        },
        createPageAtPath: function(relativePath) {
            post({ type: 'createPageAtPath', relativePath: relativePath });
        },
        createPageAuto: function() {
            post({ type: 'createPageAuto' });
        },
        updatePageH1: function(relativePath, h1Text) {
            post({ type: 'updatePageH1', relativePath: relativePath, h1Text: h1Text });
        },

        // ホストからのメッセージ受信
        onMessage: function(handler) {
            window.addEventListener('message', function(e) {
                if (e.data && e.data.source !== SP_SOURCE) {
                    handler(e.data);
                }
            });
        }
    };
})();
