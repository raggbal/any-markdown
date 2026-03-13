/**
 * VSCode HostBridge — acquireVsCodeApi() をラップし、
 * editor.js が使う window.hostBridge インターフェースを提供する。
 *
 * webviewContent.ts により editor.js の前に注入される。
 */
(function() {
    const api = acquireVsCodeApi();

    window.hostBridge = {
        // ドキュメント操作
        syncContent: function(markdown) {
            api.postMessage({ type: 'edit', content: markdown });
        },
        save: function() {
            api.postMessage({ type: 'save' });
        },

        // フォーカス/編集状態
        reportEditingState: function(editing) {
            api.postMessage({ type: 'editingStateChanged', editing: editing });
        },
        reportFocus: function() {
            api.postMessage({ type: 'webviewFocus' });
        },
        reportBlur: function() {
            api.postMessage({ type: 'webviewBlur' });
        },

        // ホスト側 UI が必要な操作
        openLink: function(href) {
            api.postMessage({ type: 'openLink', href: href });
        },
        openLinkInTab: function(href) {
            api.postMessage({ type: 'openLinkInTab', href: href });
        },
        requestInsertLink: function(text) {
            api.postMessage({ type: 'insertLink', text: text });
        },
        requestInsertImage: function() {
            api.postMessage({ type: 'insertImage', position: 0 });
        },
        requestSetImageDir: function() {
            api.postMessage({ type: 'setImageDir' });
        },
        saveImageAndInsert: function(dataUrl, fileName) {
            api.postMessage({ type: 'saveImageAndInsert', dataUrl: dataUrl, fileName: fileName });
        },
        readAndInsertImage: function(filePath) {
            api.postMessage({ type: 'readAndInsertImage', filePath: filePath });
        },
        openInTextEditor: function() {
            api.postMessage({ type: 'openInTextEditor' });
        },
        sendToChat: function(startLine, endLine, selectedMarkdown) {
            api.postMessage({ type: 'sendToChat', startLine: startLine, endLine: endLine, selectedMarkdown: selectedMarkdown });
        },
        saveSidePanelFile: function(filePath, content) {
            api.postMessage({ type: 'saveSidePanelFile', filePath: filePath, content: content });
        },
        sidePanelOpenLink: function(href, sidePanelFilePath) {
            api.postMessage({ type: 'sidePanelOpenLink', href: href, sidePanelFilePath: sidePanelFilePath });
        },
        notifySidePanelClosed: function() {
            api.postMessage({ type: 'sidePanelClosed' });
        },

        // ホストからのメッセージ受信
        onMessage: function(handler) {
            window.addEventListener('message', function(e) {
                handler(e.data);
            });
        }
    };
})();
