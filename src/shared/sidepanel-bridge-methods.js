/**
 * サイドパネル共通ブリッジメソッド
 *
 * 全エディタ（Markdown / Outliner / Notes）のホストブリッジで共通のメソッドを生成する。
 * 各ブリッジの IIFE 内で Object.assign() により統合する。
 *
 * 使い方:
 *   var _sp = window.__createSidePanelBridgeMethods(function(msg) { api.postMessage(msg); });
 *   window.outlinerHostBridge = Object.assign({ ...固有メソッド... }, _sp);
 */
window.__createSidePanelBridgeMethods = function(postFn) {
    return {
        // 保存
        save: function() {
            postFn({ type: 'save' });
        },

        // リンク
        openLink: function(href) {
            postFn({ type: 'openLink', href: href });
        },
        openLinkInTab: function(href) {
            postFn({ type: 'openLinkInTab', href: href });
        },

        // フォーカス
        reportFocus: function() {
            postFn({ type: 'webviewFocus' });
        },
        reportBlur: function() {
            postFn({ type: 'webviewBlur' });
        },

        // 検索
        searchFiles: function(query) {
            postFn({ type: 'searchFiles', query: query });
        },

        // サイドパネル操作
        saveSidePanelFile: function(filePath, content) {
            postFn({ type: 'saveSidePanelFile', filePath: filePath, content: content });
        },
        sidePanelOpenLink: function(href, sidePanelFilePath) {
            postFn({ type: 'sidePanelOpenLink', href: href, sidePanelFilePath: sidePanelFilePath });
        },
        notifySidePanelClosed: function() {
            postFn({ type: 'sidePanelClosed' });
        },
        sidePanelOpenInTextEditor: function(sidePanelFilePath) {
            postFn({ type: 'sidePanelOpenInTextEditor', sidePanelFilePath: sidePanelFilePath });
        },
        getSidePanelImageDir: function(sidePanelFilePath) {
            postFn({ type: 'getSidePanelImageDir', sidePanelFilePath: sidePanelFilePath });
        },

        // 画像
        requestInsertImage: function(sidePanelFilePath) {
            postFn({ type: 'insertImage', position: 0, sidePanelFilePath: sidePanelFilePath });
        },
        requestSetImageDir: function(sidePanelFilePath) {
            postFn({ type: 'setImageDir', sidePanelFilePath: sidePanelFilePath });
        },
        saveImageAndInsert: function(dataUrl, fileName, sidePanelFilePath) {
            postFn({ type: 'saveImageAndInsert', dataUrl: dataUrl, fileName: fileName, sidePanelFilePath: sidePanelFilePath });
        },
        readAndInsertImage: function(filePath, sidePanelFilePath) {
            postFn({ type: 'readAndInsertImage', filePath: filePath, sidePanelFilePath: sidePanelFilePath });
        },

        // sendToChat
        sendToChat: function(startLine, endLine, selectedMarkdown, sidePanelFilePath) {
            postFn({ type: 'sendToChat', startLine: startLine, endLine: endLine, selectedMarkdown: selectedMarkdown, sidePanelFilePath: sidePanelFilePath });
        },

        // メッセージ受信
        onMessage: function(handler) {
            window.addEventListener('message', function(e) {
                handler(e.data);
            });
        }
    };
};
