"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
/**
 * Preload script: contextBridge で window.hostBridge を公開
 * editor.js が期待する HostBridge インターフェースをそのまま提供
 */
electron_1.contextBridge.exposeInMainWorld('hostBridge', {
    syncContent: (markdown) => electron_1.ipcRenderer.send('sync-content', markdown),
    save: () => electron_1.ipcRenderer.send('save'),
    reportEditingState: (editing) => electron_1.ipcRenderer.send('editing-state', editing),
    reportFocus: () => electron_1.ipcRenderer.send('focus'),
    reportBlur: () => electron_1.ipcRenderer.send('blur'),
    openLink: (href) => electron_1.ipcRenderer.send('open-link', href),
    requestInsertLink: (text) => electron_1.ipcRenderer.send('insert-link', text),
    requestInsertImage: () => electron_1.ipcRenderer.send('insert-image'),
    requestSetImageDir: () => electron_1.ipcRenderer.send('set-image-dir'),
    saveImageAndInsert: (dataUrl, fileName) => electron_1.ipcRenderer.send('save-image', dataUrl, fileName),
    readAndInsertImage: (filePath) => electron_1.ipcRenderer.send('read-insert-image', filePath),
    openInTextEditor: () => electron_1.ipcRenderer.send('open-in-text-editor'),
    copyFilePath: () => electron_1.ipcRenderer.send('copy-file-path'),
    sendToChat: () => { },
    onMessage: (handler) => {
        electron_1.ipcRenderer.on('host-message', (_event, message) => handler(message));
    },
});
//# sourceMappingURL=preload.js.map